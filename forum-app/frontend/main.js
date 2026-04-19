import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";

const rootEl = document.getElementById("root");
const root = createRoot(rootEl);

const API_DEFAULT = window.__API_BASE__ || "http://localhost:4000";

const oauthParams = new URLSearchParams(window.location.search);
const oauthToken = oauthParams.get("token");
if (oauthToken) {
  localStorage.setItem("token", oauthToken);
  if (oauthParams.get("merge") === "1") {
    alert("检测到同名账号，已自动合并。");
  }
  const nextUrl = window.location.pathname + window.location.hash;
  history.replaceState(null, "", nextUrl);
}

function useHashRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const onHash = () => setRoute(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [route, (r) => (location.hash = r)];
}

function apiFetch(path, options = {}) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_DEFAULT}${path}`, { ...options, headers }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "请求失败");
    return data;
  });
}

function Markdown({ content }) {
  useEffect(() => {
    renderMathInElement(rootEl, { delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false }
    ]});
  });
  const rawHtml = useMemo(() => marked.parse(content || ""), [content]);
  const html = useMemo(() => linkifyMentions(rawHtml), [rawHtml]);
  return React.createElement("div", { className: "markdown", dangerouslySetInnerHTML: { __html: html } });
}

function Badge({ badge }) {
  if (!badge) return null;
  const style = badge.color.startsWith("linear")
    ? { backgroundImage: badge.color }
    : { background: badge.color };
  return React.createElement("span", { className: "badge", style }, badge.label);
}

function AuthorLink({ id, name }) {
  return React.createElement("a", { href: `#/user/${id}` }, name);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightText(text, keyword) {
  const q = (keyword || "").trim();
  if (!q) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(safe, "gi");
  return escaped.replace(re, (m) => `<mark>${m}</mark>`);
}

function linkifyMentions(html) {
  if (!html) return html;
  const parts = html.split(/(<[^>]+>)/g);
  let inCode = 0;
  let inPre = 0;
  let inAnchor = 0;
  const re = /(^|[^A-Za-z0-9_.\-\u4e00-\u9fa5])@([A-Za-z0-9_.\-\u4e00-\u9fa5]{2,32})/g;
  return parts.map((part) => {
    if (!part) return part;
    if (part.startsWith("<")) {
      const endTag = part.match(/^<\s*\/\s*([a-z0-9]+)/i);
      const startTag = part.match(/^<\s*([a-z0-9]+)/i);
      const tag = (endTag || startTag)?.[1]?.toLowerCase();
      if (tag === "code") {
        if (endTag) inCode = Math.max(0, inCode - 1);
        else inCode += 1;
      }
      if (tag === "pre") {
        if (endTag) inPre = Math.max(0, inPre - 1);
        else inPre += 1;
      }
      if (tag === "a") {
        if (endTag) inAnchor = Math.max(0, inAnchor - 1);
        else inAnchor += 1;
      }
      return part;
    }
    if (inCode || inPre || inAnchor) return part;
    return part.replace(re, (m, prefix, name) => {
      const href = `#/u/${encodeURIComponent(name)}`;
      return `${prefix}<a class="mention" href="${href}">@${name}</a>`;
    });
  }).join("");
}

function useBoards() {
  const [boards, setBoards] = useState([]);
  const load = async () => {
    try {
      const data = await apiFetch("/boards");
      setBoards(data);
    } catch (e) {
      setBoards([]);
    }
  };
  useEffect(() => { load(); }, []);
  return { boards, reload: load };
}

function AuthPanel({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetInfo, setResetInfo] = useState("");

  const submit = async () => {
    try {
      setError("");
      if (mode === "forgot") {
        const data = await apiFetch("/auth/forgot", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
        if (data.email_sent) {
          setResetInfo("重置码已发送到邮箱，请查收。");
        } else if (data.token) {
          setResetInfo(`重置码已生成：${data.token}`);
          setResetToken(data.token);
        } else {
          setResetInfo("重置码已生成。");
        }
        return;
      }
      const payload = mode === "login"
        ? { email: email.trim(), password: password }
        : { email: email.trim(), username: username.trim(), password: password };
      const data = await apiFetch(`/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
      localStorage.setItem("token", data.token);
      onAuthed();
    } catch (e) {
      setError(e.message);
    }
  };

  const doReset = async () => {
    try {
      setError("");
      await apiFetch("/auth/reset", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          token: resetToken.trim(),
          new_password: resetPassword
        })
      });
      setResetInfo("密码已重置，请登录");
      setMode("login");
      setResetPassword("");
    } catch (e) {
      setError(e.message);
    }
  };

  return React.createElement("div", { className: "card" },
    React.createElement("div", { className: "title" },
      mode === "login" ? "登录" : mode === "register" ? "注册" : "忘记密码"
    ),
    React.createElement("div", { className: "list" },
      React.createElement("input", { placeholder: mode === "login" ? "邮箱或用户名" : "邮箱", value: email, onChange: (e) => setEmail(e.target.value) }),
      mode === "register" && React.createElement("input", { placeholder: "用户名", value: username, onChange: (e) => setUsername(e.target.value) }),
      mode !== "forgot" && React.createElement("input", { type: "password", placeholder: "密码", value: password, onChange: (e) => setPassword(e.target.value) }),
      mode === "forgot" && React.createElement("input", { placeholder: "重置码", value: resetToken, onChange: (e) => setResetToken(e.target.value) }),
      mode === "forgot" && React.createElement("input", { type: "password", placeholder: "新密码", value: resetPassword, onChange: (e) => setResetPassword(e.target.value) }),
      resetInfo && React.createElement("div", { className: "muted" }, resetInfo),
      error && React.createElement("div", { className: "muted" }, error),
      mode === "forgot"
        ? React.createElement("div", { className: "row" },
            React.createElement("button", { className: "btn ghost", onClick: submit }, "获取重置码"),
            React.createElement("button", { className: "btn", onClick: doReset }, "重置密码")
          )
        : React.createElement("button", { className: "btn", onClick: submit }, mode === "login" ? "登录" : "注册"),
      React.createElement("button", { className: "btn ghost", onClick: () => setMode(mode === "login" ? "register" : "login") },
        mode === "login" ? "没有账号？注册" : "已有账号？登录"
      ),
      React.createElement("button", { className: "btn ghost", onClick: () => setMode("forgot") }, "忘记密码")
    )
  );
}

function Feed({ go, me }) {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [boardName, setBoardName] = useState("");
  const [boardFilter, setBoardFilter] = useState("");
  const { boards, reload: reloadBoards } = useBoards();

  const load = async (opts = {}) => {
    try {
      setError("");
      const boardId = opts.boardId ?? boardFilter;
      const qs = boardId ? `?board_id=${encodeURIComponent(boardId)}` : "";
      const data = await apiFetch(`/posts${qs}`);
      setPosts(data);
    } catch (e) {
      setError(e.message);
    }
  };

  const search = async () => {
    try {
      const q = query.trim();
      if (!q) return load();
      const data = await apiFetch(`/posts/search?q=${encodeURIComponent(q)}`);
      setPosts(data);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, [boardFilter]);

  const createBoard = async () => {
    const name = boardName.trim();
    if (!name) return;
    await apiFetch("/boards", { method: "POST", body: JSON.stringify({ name }) });
    setBoardName("");
    reloadBoards();
  };

  const deleteBoard = async (id) => {
    await apiFetch(`/boards/${id}`, { method: "DELETE" });
    reloadBoards();
    load();
  };

  return React.createElement("div", { className: "grid" },
    React.createElement("div", { className: "list" },
      error && React.createElement("div", { className: "card" }, error),
      posts.map((p) => React.createElement("div", { key: p.id, className: "card" },
        React.createElement("div", { className: "row" },
          React.createElement("div", {
            className: "title",
            dangerouslySetInnerHTML: { __html: highlightText(p.title, query) }
          }),
          React.createElement(Badge, { badge: p.badge })
        ),
        React.createElement("div", { className: "post-meta muted mini" },
          React.createElement(AuthorLink, { id: p.user_id, name: `${p.username}（编号:${p.user_id}）` }),
          (p.pinned ? " · 置顶" : "") + (p.board_name ? ` · 板块 ${p.board_name}` : "") + " · 回复 " + p.reply_count + " · 赞 " + p.like_count + " · 有用 " + p.useful_count
        ),
        React.createElement("div", { className: "right" },
          React.createElement("button", { className: "btn ghost", onClick: () => go(`/post/${p.id}`) }, "查看")
        )
      ))
    ),
    React.createElement("div", { className: "list" },
      React.createElement("div", { className: "card" },
        React.createElement("div", { className: "title" }, "快速入口"),
        React.createElement("div", { className: "list" },
          React.createElement("button", { className: "btn", onClick: () => go("/new") }, "发帖"),
          React.createElement("button", { className: "btn ghost", onClick: load }, "刷新")
        )
      ),
      React.createElement("div", { className: "card" },
        React.createElement("div", { className: "title" }, "搜索帖子"),
        React.createElement("div", { className: "list" },
          React.createElement("input", { placeholder: "关键词", value: query, onChange: (e) => setQuery(e.target.value) }),
          React.createElement("div", { className: "row" },
            React.createElement("button", { className: "btn", onClick: search }, "搜索"),
            React.createElement("button", { className: "btn ghost", onClick: load }, "清空")
          )
        )
      ),
      React.createElement("div", { className: "card" },
        React.createElement("div", { className: "title" }, "API 地址"),
        React.createElement("div", { className: "muted mini" }, "当前：" + API_DEFAULT),
        React.createElement("div", { className: "muted mini" }, "此地址仅由站点发布者设置。")
      ),
      React.createElement("div", { className: "card" },
        React.createElement("div", { className: "title" }, "板块"),
        React.createElement("div", { className: "list" },
          React.createElement("input", { placeholder: "新板块名称", value: boardName, onChange: (e) => setBoardName(e.target.value) }),
          React.createElement("button", { className: "btn", onClick: createBoard }, "创建板块"),
          React.createElement("button", { className: "btn ghost", onClick: () => setBoardFilter("") }, "全部板块"),
          boards.length === 0
            ? React.createElement("div", { className: "muted mini" }, "暂无板块")
            : boards.map((b) => React.createElement("div", { key: b.id, className: "row" },
                React.createElement("button", { className: "btn ghost", onClick: () => setBoardFilter(String(b.id)) }, b.name),
                me && (me.is_admin || me.is_superadmin) && React.createElement("button", { className: "btn ghost", onClick: () => deleteBoard(b.id) }, "删除")
              ))
        )
      )
    )
  );
}

function NewPost({ go }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [boardId, setBoardId] = useState("");
  const [protect, setProtect] = useState(false);
  const [postPassword, setPostPassword] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiMd, setAiMd] = useState("");
  const { boards } = useBoards();

  useEffect(() => {
    if (!boardId && boards.length > 0) {
      const def = boards.find((b) => b.name === "站务板") || boards[0];
      setBoardId(String(def.id));
    }
  }, [boards, boardId]);

  const submit = async () => {
    try {
      if (protect && !postPassword.trim()) {
        setError("已开启密码保护，请设置访问密码。");
        return;
      }
      const payload = {
        title,
        content_md: content,
        board_id: Number(boardId) || undefined,
        password_enabled: protect,
        password: protect ? postPassword : undefined
      };
      const data = await apiFetch("/posts", { method: "POST", body: JSON.stringify(payload) });
      go(`/post/${data.id}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const askAi = async () => {
    const q = aiQuestion.trim();
    if (!q) return;
    try {
      setAiLoading(true);
      setAiError("");
      const data = await apiFetch("/ai/minimax", {
        method: "POST",
        body: JSON.stringify({ question: q, title, content_md: content })
      });
      setAiMd(data.markdown || "");
    } catch (e) {
      setAiError(e.message);
      setAiMd("");
    } finally {
      setAiLoading(false);
    }
  };

  const applyAi = () => {
    if (content.trim() && !confirm("将用 AI 结果覆盖当前编辑内容，确定？")) return;
    setContent(aiMd);
    setAiMd("");
  };

  return React.createElement("div", { className: "card" },
    React.createElement("div", { className: "title" }, "发布新帖"),
    React.createElement("div", { className: "list" },
      React.createElement("input", { placeholder: "标题", value: title, onChange: (e) => setTitle(e.target.value) }),
      React.createElement("select", { value: boardId, onChange: (e) => setBoardId(e.target.value) },
        boards.map((b) => React.createElement("option", { key: b.id, value: b.id }, b.name))
      ),
      React.createElement("textarea", { placeholder: "支持 Markdown 与 LaTeX：例如 $E=mc^2$", value: content, onChange: (e) => setContent(e.target.value) }),
      React.createElement("div", { className: "card" },
        React.createElement("div", { className: "title" }, "访问密码"),
        React.createElement("div", { className: "row" },
          React.createElement("label", { className: "muted mini" },
            React.createElement("input", {
              type: "checkbox",
              checked: protect,
              onChange: (e) => setProtect(e.target.checked),
              style: { width: "auto", marginRight: 8 }
            }),
            "开启密码保护"
          )
        ),
        protect && React.createElement("input", {
          type: "password",
          placeholder: "设置访问密码（访问帖子时需要输入）",
          value: postPassword,
          onChange: (e) => setPostPassword(e.target.value)
        })
      ),
      React.createElement("div", { className: "card" },
        React.createElement("div", { className: "title" }, "AI 帮写（MiniMax）"),
        React.createElement("div", { className: "muted mini" }, "把你的问题写给 AI，它会返回可直接发帖的 Markdown。"),
        React.createElement("div", { className: "list" },
          React.createElement("input", {
            placeholder: "例如：帮我把下面内容写成一篇结构清晰的求助帖/评测帖…",
            value: aiQuestion,
            onChange: (e) => setAiQuestion(e.target.value)
          }),
          React.createElement("div", { className: "row" },
            React.createElement("button", { className: "btn", onClick: askAi, disabled: aiLoading || !aiQuestion.trim() }, aiLoading ? "AI 生成中..." : "询问 AI")
          ),
          aiError && React.createElement("div", { className: "muted" }, aiError),
          aiMd && React.createElement("div", { className: "card" },
            React.createElement("div", { className: "muted mini" }, "AI 回复预览"),
            React.createElement(Markdown, { content: aiMd }),
            React.createElement("div", { className: "row" },
              React.createElement("button", { className: "btn", onClick: applyAi }, "应用到编辑框"),
              React.createElement("button", { className: "btn ghost", onClick: () => setAiMd("") }, "拒绝")
            )
          )
        )
      ),
      React.createElement("div", { className: "row" },
        React.createElement("button", { className: "btn ghost", onClick: () => setPreview(!preview) }, preview ? "关闭预览" : "预览")
      ),
      preview && React.createElement("div", { className: "card" },
        React.createElement("div", { className: "muted mini" }, "预览"),
        React.createElement(Markdown, { content })
      ),
      error && React.createElement("div", { className: "muted" }, error),
      React.createElement("button", { className: "btn", onClick: submit }, "发布")
    )
  );
}

function PostDetail({ id, go, me }) {
  const [data, setData] = useState(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editBoardId, setEditBoardId] = useState("");
  const [editPreview, setEditPreview] = useState(false);
  const [replyPreview, setReplyPreview] = useState(false);
  const { boards } = useBoards();

  const load = async () => {
    try {
      setError("");
      const d = await apiFetch(`/posts/${id}`);
      setData(d);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (data) {
      setEditTitle(data.post.title);
      setEditContent(data.post.content_md);
      setEditBoardId(String(data.post.board_id || ""));
    }
  }, [data]);

  const act = async (path) => {
    await apiFetch(path, { method: "POST" });
    load();
  };

  const submitReply = async () => {
    await apiFetch(`/posts/${id}/replies`, { method: "POST", body: JSON.stringify({ content_md: reply }) });
    setReply("");
    load();
  };

  const deletePost = async () => {
    await apiFetch(`/posts/${id}`, { method: "DELETE" });
    go("/");
  };

  const deleteReply = async (replyId) => {
    await apiFetch(`/replies/${replyId}`, { method: "DELETE" });
    load();
  };

  const saveEdit = async () => {
    await apiFetch(`/posts/${id}`, { method: "PATCH", body: JSON.stringify({ title: editTitle, content_md: editContent, board_id: Number(editBoardId) || undefined }) });
    setEditing(false);
    load();
  };

  const togglePin = async () => {
    await apiFetch(`/posts/${id}/pin`, { method: "POST", body: JSON.stringify({ pinned: !data.post.pinned }) });
    load();
  };

  if (!data) return React.createElement("div", { className: "card" }, error || "加载中...");
  const canDeletePost = me && (me.id === data.post.user_id || me.is_admin || me.is_superadmin);
  const canEditPost = canDeletePost;
  const canPin = me && (me.is_admin || me.is_superadmin);
  return React.createElement("div", { className: "list" },
    React.createElement("div", { className: "card" },
      React.createElement("div", { className: "row" },
        React.createElement("div", { className: "title" }, data.post.title),
        React.createElement(Badge, { badge: data.post.badge })
      ),
      React.createElement("div", { className: "post-meta muted mini" },
        React.createElement(AuthorLink, { id: data.post.user_id, name: `${data.post.username}（编号:${data.post.user_id}）` }),
        (data.post.pinned ? " · 置顶" : "") + (data.post.board_name ? ` · 板块 ${data.post.board_name}` : "")
      ),
      editing
        ? React.createElement("div", { className: "list" },
            React.createElement("input", { value: editTitle, onChange: (e) => setEditTitle(e.target.value) }),
            React.createElement("select", { value: editBoardId, onChange: (e) => setEditBoardId(e.target.value) },
              boards.map((b) => React.createElement("option", { key: b.id, value: b.id }, b.name))
            ),
            React.createElement("textarea", { value: editContent, onChange: (e) => setEditContent(e.target.value) }),
            React.createElement("div", { className: "row" },
              React.createElement("button", { className: "btn ghost", onClick: () => setEditPreview(!editPreview) }, editPreview ? "关闭预览" : "预览"),
              React.createElement("button", { className: "btn", onClick: saveEdit }, "保存修改"),
              React.createElement("button", { className: "btn ghost", onClick: () => setEditing(false) }, "取消")
            ),
            editPreview && React.createElement("div", { className: "card" },
              React.createElement("div", { className: "muted mini" }, "预览"),
              React.createElement(Markdown, { content: editContent })
            )
          )
        : React.createElement(Markdown, { content: data.post.content_md }),
      React.createElement("div", { className: "row" },
        React.createElement("button", { className: "btn ghost", onClick: () => act(`/posts/${id}/like`) }, `点赞 ${data.post.like_count}`),
        React.createElement("button", { className: "btn ghost", onClick: () => act(`/posts/${id}/useful`) }, `有用 ${data.post.useful_count}`),
        React.createElement("button", { className: "btn ghost", onClick: () => act(`/posts/${id}/downvote`) }, `点踩 ${data.post.downvote_count}`),
        canEditPost && !editing && React.createElement("button", { className: "btn ghost", onClick: () => setEditing(true) }, "编辑帖子"),
        canPin && React.createElement("button", { className: "btn ghost", onClick: togglePin }, data.post.pinned ? "取消置顶" : "置顶"),
        canDeletePost && React.createElement("button", { className: "btn ghost", onClick: deletePost }, "删除帖子")
      )
    ),
    React.createElement("div", { className: "card" },
      React.createElement("div", { className: "title" }, "回复"),
      React.createElement("div", { className: "list" },
        React.createElement("textarea", { placeholder: "写下你的回复", value: reply, onChange: (e) => setReply(e.target.value) }),
        React.createElement("div", { className: "row" },
          React.createElement("button", { className: "btn ghost", onClick: () => setReplyPreview(!replyPreview) }, replyPreview ? "关闭预览" : "预览")
        ),
        replyPreview && React.createElement("div", { className: "card" },
          React.createElement("div", { className: "muted mini" }, "预览"),
          React.createElement(Markdown, { content: reply })
        ),
        React.createElement("button", { className: "btn", onClick: submitReply }, "发送回复")
      )
    ),
    data.replies.map((r) => {
      const canDeleteReply = me && (me.id === r.user_id || me.is_admin || me.is_superadmin);
      return React.createElement("div", { key: r.id, className: "card" },
      React.createElement("div", { className: "post-meta" },
        React.createElement(AuthorLink, { id: r.user_id, name: `${r.username}（编号:${r.user_id}）` }),
        React.createElement(Badge, { badge: r.badge })
      ),
      React.createElement(Markdown, { content: r.content_md }),
      React.createElement("div", { className: "row" },
        React.createElement("button", { className: "btn ghost", onClick: () => act(`/replies/${r.id}/like`) }, `点赞 ${r.like_count}`),
        React.createElement("button", { className: "btn ghost", onClick: () => act(`/replies/${r.id}/useful`) }, `有用 ${r.useful_count}`),
        React.createElement("button", { className: "btn ghost", onClick: () => act(`/replies/${r.id}/downvote`) }, `点踩 ${r.downvote_count}`),
        canDeleteReply && React.createElement("button", { className: "btn ghost", onClick: () => deleteReply(r.id) }, "删除回复")
      )
    );
    })
  );
}

function Profile() {
  const [me, setMe] = useState(null);
  const [bio, setBio] = useState("");
  const [signature, setSignature] = useState("");
  const [preview, setPreview] = useState(false);

  const load = async () => {
    const data = await apiFetch("/me");
    setMe(data);
    setBio(data.bio || "");
    setSignature(data.signature || "");
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    await apiFetch("/me", { method: "PATCH", body: JSON.stringify({ bio, signature }) });
    load();
  };

  if (!me) return React.createElement("div", { className: "card" }, "加载中...");
  return React.createElement("div", { className: "card" },
    React.createElement("div", { className: "title" }, "个人信息"),
    React.createElement("div", { className: "list" },
      React.createElement("div", null, `用户ID：${me.id}`),
      React.createElement("div", null, `用户名：${me.username}`),
      React.createElement("div", null, `活力值：${me.vitality}`),
      React.createElement(Badge, { badge: me.badge }),
      React.createElement("div", { className: "row" },
        React.createElement("button", { className: "btn ghost", onClick: () => setPreview(!preview) }, preview ? "关闭预览" : "预览")
      ),
      React.createElement("input", { placeholder: "个性签名", value: signature, onChange: (e) => setSignature(e.target.value) }),
      React.createElement("textarea", { placeholder: "个人简介", value: bio, onChange: (e) => setBio(e.target.value) }),
      preview && React.createElement("div", { className: "card" },
        React.createElement("div", { className: "muted mini" }, "预览 · 个性签名"),
        React.createElement(Markdown, { content: signature || "" }),
        React.createElement("div", { className: "muted mini" }, "预览 · 个人简介"),
        React.createElement(Markdown, { content: bio || "" })
      ),
      React.createElement("button", { className: "btn", onClick: save }, "保存")
    )
  );
}

function UserProfile({ id }) {
  const [user, setUser] = useState(null);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [posts, setPosts] = useState([]);

  const load = async () => {
    const data = await apiFetch(`/users/${id}`);
    setUser(data);
    const f1 = await apiFetch(`/users/${id}/followers`);
    const f2 = await apiFetch(`/users/${id}/following`);
    const p = await apiFetch(`/users/${id}/posts`);
    setFollowers(f1);
    setFollowing(f2);
    setPosts(p);
  };

  useEffect(() => { load(); }, [id]);

  const toggleFollow = async () => {
    if (!user) return;
    if (user.is_following) {
      await apiFetch(`/users/${id}/unfollow`, { method: "POST" });
    } else {
      await apiFetch(`/users/${id}/follow`, { method: "POST" });
    }
    load();
  };

  if (!user) return React.createElement("div", { className: "card" }, "加载中...");
  return React.createElement("div", { className: "card" },
    React.createElement("div", { className: "title" }, "用户主页"),
    React.createElement("div", { className: "list" },
      React.createElement("div", null, `用户ID：${user.id}`),
      React.createElement("div", null, `用户名：${user.username}`),
      React.createElement("div", null, `活力值：${user.vitality}`),
      React.createElement(Badge, { badge: user.badge }),
      React.createElement("button", { className: "btn ghost", onClick: toggleFollow }, user.is_following ? "取消关注" : "关注"),
      React.createElement("div", null, `关注：${user.following} · 粉丝：${user.followers}`),
      React.createElement("div", null, `发帖：${user.posts} · 回复：${user.replies} · 被标记有用：${user.useful}`),
      React.createElement("div", { className: "muted mini" }, "个性签名"),
      React.createElement(Markdown, { content: user.signature || "" }),
      React.createElement("div", { className: "muted mini" }, "个人简介"),
      React.createElement(Markdown, { content: user.bio || "" }),
      React.createElement("div", { className: "title" }, "关注的人"),
      following.length === 0
        ? React.createElement("div", { className: "muted mini" }, "暂无")
        : React.createElement("div", { className: "list" },
            following.map((u) => React.createElement("div", { key: u.id, className: "card" },
              React.createElement(AuthorLink, { id: u.id, name: `${u.username}（编号:${u.id}）` }),
              React.createElement(Badge, { badge: u.badge })
            ))
          ),
      React.createElement("div", { className: "title" }, "粉丝"),
      followers.length === 0
        ? React.createElement("div", { className: "muted mini" }, "暂无")
        : React.createElement("div", { className: "list" },
            followers.map((u) => React.createElement("div", { key: u.id, className: "card" },
              React.createElement(AuthorLink, { id: u.id, name: `${u.username}（编号:${u.id}）` }),
              React.createElement(Badge, { badge: u.badge })
            ))
          ),
      React.createElement("div", { className: "title" }, "发布的帖子"),
      posts.length === 0
        ? React.createElement("div", { className: "muted mini" }, "暂无")
        : React.createElement("div", { className: "list" },
            posts.map((p) => React.createElement("div", { key: p.id, className: "card" },
              React.createElement("div", { className: "row" },
                React.createElement("div", { className: "title" }, p.title),
                React.createElement(Badge, { badge: p.badge })
              ),
              React.createElement("div", { className: "post-meta muted mini" },
                React.createElement(AuthorLink, { id: p.user_id, name: `${p.username}（编号:${p.user_id}）` }),
                (p.pinned ? " · 置顶" : "") + (p.board_name ? ` · 板块 ${p.board_name}` : "") + " · 回复 " + p.reply_count + " · 赞 " + p.like_count + " · 有用 " + p.useful_count
              ),
              React.createElement("div", { className: "right" },
                React.createElement("button", { className: "btn ghost", onClick: () => (location.hash = `#/post/${p.id}`) }, "查看")
              )
            ))
          )
    )
  );
}

function Messages() {
  const [list, setList] = useState([]);
  const [toId, setToId] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);

  const load = async () => {
    const data = await apiFetch("/messages");
    setList(data);
  };

  useEffect(() => { load(); }, []);

  const send = async () => {
    await apiFetch("/messages", { method: "POST", body: JSON.stringify({ to_id: Number(toId), content_md: content }) });
    setContent("");
    load();
  };

  const remove = async (id) => {
    await apiFetch(`/messages/${id}`, { method: "DELETE" });
    load();
  };

  return React.createElement("div", { className: "grid" },
    React.createElement("div", { className: "list" },
      list.map((m) => React.createElement("div", { key: m.id, className: "card" },
        React.createElement("div", { className: "muted mini" },
          "来自 ",
          React.createElement(AuthorLink, { id: m.from_id, name: `${m.from_name}（编号:${m.from_id}）` })
        ),
        React.createElement(Markdown, { content: m.content_md }),
        React.createElement("div", { className: "row" },
          React.createElement("button", { className: "btn ghost", onClick: () => remove(m.id) }, "删除私信")
        )
      ))
    ),
    React.createElement("div", { className: "card" },
      React.createElement("div", { className: "title" }, "发送私信"),
      React.createElement("div", { className: "list" },
        React.createElement("input", { placeholder: "对方用户ID", value: toId, onChange: (e) => setToId(e.target.value) }),
        React.createElement("textarea", { placeholder: "内容", value: content, onChange: (e) => setContent(e.target.value) }),
        React.createElement("div", { className: "row" },
          React.createElement("button", { className: "btn ghost", onClick: () => setPreview(!preview) }, preview ? "关闭预览" : "预览")
        ),
        preview && React.createElement("div", { className: "card" },
          React.createElement("div", { className: "muted mini" }, "预览"),
          React.createElement(Markdown, { content })
        ),
        React.createElement("button", { className: "btn", onClick: send }, "发送")
      )
    )
  );
}

function Tickets() {
  const [list, setList] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [me, setMe] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(false);

  const load = async () => {
    const data = await apiFetch("/tickets");
    setList(data);
  };

  useEffect(() => {
    load();
    apiFetch("/me").then(setMe).catch(() => {});
  }, []);

  const submit = async () => {
    if (editingId) {
      await apiFetch(`/tickets/${editingId}`, { method: "PATCH", body: JSON.stringify({ title, content_md: content }) });
      setEditingId(null);
    } else {
      await apiFetch("/tickets", { method: "POST", body: JSON.stringify({ title, content_md: content }) });
    }
    setTitle("");
    setContent("");
    load();
  };

  const search = async () => {
    try {
      const q = query.trim();
      if (!q) return load();
      const data = await apiFetch(`/tickets/search?q=${encodeURIComponent(q)}`);
      setList(data);
    } catch (e) {
      // reuse list area to show error via console; keep UI stable
      console.error(e);
    }
  };

  const setStatus = async (id, status) => {
    await apiFetch(`/tickets/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  };

  const deleteTicket = async (id) => {
    await apiFetch(`/tickets/${id}`, { method: "DELETE" });
    load();
  };

  return React.createElement("div", { className: "grid" },
    React.createElement("div", { className: "list" },
      React.createElement("div", { className: "card" },
        React.createElement("div", { className: "title" }, "搜索工单"),
        React.createElement("div", { className: "list" },
          React.createElement("input", { placeholder: "关键词", value: query, onChange: (e) => setQuery(e.target.value) }),
          React.createElement("div", { className: "row" },
            React.createElement("button", { className: "btn", onClick: search }, "搜索"),
            React.createElement("button", { className: "btn ghost", onClick: load }, "清空")
          )
        )
      ),
      list.map((t) => React.createElement("div", { key: t.id, className: "card" },
        React.createElement("div", { className: "row" },
          React.createElement("strong", {
            dangerouslySetInnerHTML: { __html: highlightText(t.title, query) }
          }),
          React.createElement("span", { className: "muted mini" }, t.status)
        ),
        React.createElement("div", { className: "muted mini" },
          "工单编号: " + t.id + " · 作者 ",
          t.username
            ? React.createElement(AuthorLink, { id: t.user_id, name: `${t.username}（编号:${t.user_id}）` })
            : React.createElement(AuthorLink, { id: t.user_id, name: `编号:${t.user_id}` })
        ),
        React.createElement(Markdown, { content: t.content_md }),
        me && me.id === t.user_id && React.createElement("div", { className: "row" },
          React.createElement("button", {
            className: "btn ghost",
            onClick: () => {
              setEditingId(t.id);
              setTitle(t.title);
              setContent(t.content_md);
            }
          }, "编辑")
        ),
        me && me.is_superadmin && React.createElement("div", { className: "row" },
          React.createElement("button", { className: "btn ghost", onClick: () => setStatus(t.id, "pending") }, "挂起"),
          React.createElement("button", { className: "btn ghost", onClick: () => setStatus(t.id, "closed") }, "关闭"),
          React.createElement("button", { className: "btn ghost", onClick: () => setStatus(t.id, "done") }, "完成"),
          React.createElement("button", { className: "btn ghost", onClick: () => deleteTicket(t.id) }, "删除")
        )
      ))
    ),
    React.createElement("div", { className: "card" },
      React.createElement("div", { className: "title" }, editingId ? "编辑工单" : "提交工单"),
      React.createElement("div", { className: "list" },
        React.createElement("input", { placeholder: "标题", value: title, onChange: (e) => setTitle(e.target.value) }),
        React.createElement("textarea", { placeholder: "问题描述", value: content, onChange: (e) => setContent(e.target.value) }),
        React.createElement("div", { className: "row" },
          React.createElement("button", { className: "btn ghost", onClick: () => setPreview(!preview) }, preview ? "关闭预览" : "预览")
        ),
        preview && React.createElement("div", { className: "card" },
          React.createElement("div", { className: "muted mini" }, "预览"),
          React.createElement(Markdown, { content: content || "" })
        ),
        React.createElement("div", { className: "row" },
          React.createElement("button", { className: "btn", onClick: submit }, editingId ? "保存" : "提交"),
          editingId && React.createElement("button", {
            className: "btn ghost",
            onClick: () => {
              setEditingId(null);
              setTitle("");
              setContent("");
              setPreview(false);
            }
          }, "取消")
        )
      )
    )
  );
}

function Ostracism() {
  const [logs, setLogs] = useState([]);
  const load = async () => {
    const data = await apiFetch("/moderation/logs");
    setLogs(data);
  };
  useEffect(() => { load(); }, []);
  return React.createElement("div", { className: "card" },
    React.createElement("div", { className: "title" }, "陶片放逐（最近20条）"),
    React.createElement("div", { className: "list" },
      logs.map((l) => React.createElement("div", { key: l.id, className: "card" },
        React.createElement("div", { className: "muted mini" },
          `${l.type === "reward" ? "奖励" : "处罚"} · ${l.action} · ${l.created_at}`
        ),
        React.createElement("div", null,
          "执行人：",
          React.createElement(AuthorLink, { id: l.actor_id, name: `${l.actor_name || "编号"}（编号:${l.actor_id}）` })
        ),
        l.target_user_id && React.createElement("div", null,
          "对象：",
          React.createElement(AuthorLink, { id: l.target_user_id, name: `${l.target_name || "编号"}（编号:${l.target_user_id}）` })
        ),
        l.detail && React.createElement("div", { className: "muted mini" }, l.detail)
      ))
    )
  );
}

function AdminPanel() {
  const [userId, setUserId] = useState("");
  const [postId, setPostId] = useState("");
  const [replyId, setReplyId] = useState("");
  const [reason, setReason] = useState("");

  const action = async (path, payload) => {
    await apiFetch(path, { method: "POST", body: JSON.stringify(payload) });
    alert("操作成功");
  };

  return React.createElement("div", { className: "card" },
    React.createElement("div", { className: "title" }, "管理员操作"),
    React.createElement("div", { className: "list" },
      React.createElement("input", { placeholder: "用户ID", value: userId, onChange: (e) => setUserId(e.target.value) }),
      React.createElement("input", { placeholder: "帖子ID", value: postId, onChange: (e) => setPostId(e.target.value) }),
      React.createElement("input", { placeholder: "回复ID", value: replyId, onChange: (e) => setReplyId(e.target.value) }),
      React.createElement("textarea", { placeholder: "原因", value: reason, onChange: (e) => setReason(e.target.value) }),
      React.createElement("div", { className: "row" },
        React.createElement("button", { className: "btn ghost", onClick: () => action("/admin/warn", { user_id: Number(userId), reason }) }, "警告"),
        React.createElement("button", { className: "btn ghost", onClick: () => action("/admin/mute", { user_id: Number(userId), mute: true }) }, "禁言"),
        React.createElement("button", { className: "btn ghost", onClick: () => action("/admin/mute", { user_id: Number(userId), mute: false }) }, "解禁言"),
        React.createElement("button", { className: "btn ghost", onClick: () => action("/admin/ban", { user_id: Number(userId), banned: true }) }, "封禁"),
        React.createElement("button", { className: "btn ghost", onClick: () => action("/admin/ban", { user_id: Number(userId), banned: false }) }, "解封"),
        React.createElement("button", { className: "btn ghost", onClick: () => action("/admin/ban-pm", { user_id: Number(userId), ban_pm: true }) }, "禁私信"),
        React.createElement("button", { className: "btn ghost", onClick: () => action("/admin/ban-like", { user_id: Number(userId), ban_like: true }) }, "禁点赞"),
        React.createElement("button", { className: "btn ghost", onClick: () => action("/admin/delete-post", { post_id: Number(postId) }) }, "删帖"),
        React.createElement("button", { className: "btn ghost", onClick: () => action("/admin/delete-reply", { reply_id: Number(replyId) }) }, "删回复"),
        React.createElement("button", { className: "btn ghost", onClick: () => action("/admin/promote", { user_id: Number(userId), is_admin: true }) }, "设为管理员"),
        React.createElement("button", { className: "btn ghost", onClick: () => action("/admin/demote", { user_id: Number(userId), is_admin: false }) }, "取消管理员")
      )
    )
  );
}

function UserByName({ username, go }) {
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    apiFetch(`/users/by-username/${encodeURIComponent(username)}`).then((data) => {
      if (!active) return;
      go(`/user/${data.id}`);
    }).catch((e) => {
      if (!active) return;
      setError(e.message || "未找到用户");
    });
    return () => { active = false; };
  }, [username, go]);

  if (error) {
    return React.createElement("div", { className: "card" },
      React.createElement("div", { className: "title" }, "无法打开用户"),
      React.createElement("div", { className: "muted" }, error)
    );
  }
  return React.createElement("div", { className: "card" }, "正在跳转...");
}

function NotFound({ go }) {
  return React.createElement("div", { className: "card" },
    React.createElement("div", { className: "title" }, "页面未找到"),
    React.createElement("div", { className: "muted" }, "你访问的地址不存在或已被移除。"),
    React.createElement("div", { className: "row" },
      React.createElement("button", { className: "btn", onClick: () => go("/") }, "返回首页")
    )
  );
}

function App() {
  const [route, go] = useHashRoute();
  const [authed, setAuthed] = useState(!!localStorage.getItem("token"));
  const [me, setMe] = useState(null);

  useEffect(() => {
    const logoutBtn = document.getElementById("logout");
    const userPill = document.getElementById("user-pill");
    logoutBtn.onclick = () => {
      localStorage.removeItem("token");
      setAuthed(false);
      userPill.textContent = "未登录";
    };
  }, []);

  useEffect(() => {
    const pill = document.getElementById("user-pill");
    if (!authed) {
      pill.textContent = "未登录";
      setMe(null);
      return;
    }
    apiFetch("/me").then((data) => {
      setMe(data);
      pill.textContent = `${data.username} · ${data.badge.label}`;
    }).catch(() => {
      pill.textContent = "未登录";
      localStorage.removeItem("token");
      setAuthed(false);
      setMe(null);
    });
  }, [authed]);

  if (!authed) return React.createElement(AuthPanel, { onAuthed: () => setAuthed(true) });

  if (route.startsWith("/post/")) {
    const id = route.split("/")[2];
    return React.createElement(PostDetail, { id, go, me });
  }
  if (route.startsWith("/u/")) {
    const username = decodeURIComponent(route.split("/")[2] || "");
    return React.createElement(UserByName, { username, go });
  }
  if (route.startsWith("/user/")) {
    const id = route.split("/")[2];
    return React.createElement(UserProfile, { id });
  }
  if (route === "/" || route === "") return React.createElement(Feed, { go, me });
  if (route === "/new") return React.createElement(NewPost, { go });
  if (route === "/me") return React.createElement(Profile);
  if (route === "/messages") return React.createElement(Messages);
  if (route === "/tickets") return React.createElement(Tickets);
  if (route === "/ostracism") return React.createElement(Ostracism);
  if (route === "/admin") return React.createElement(AdminPanel);
  return React.createElement(NotFound, { go });
}

root.render(React.createElement(App));
