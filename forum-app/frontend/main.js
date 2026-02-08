import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";

const rootEl = document.getElementById("root");
const root = createRoot(rootEl);

const API_DEFAULT = window.__API_BASE__ || "http://localhost:4000";

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
    if (!r.ok) throw new Error(data.error || "Request failed");
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
  const html = useMemo(() => marked.parse(content || ""), [content]);
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

function Feed({ go }) {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setError("");
      const data = await apiFetch("/posts");
      setPosts(data);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  return React.createElement("div", { className: "grid" },
    React.createElement("div", { className: "list" },
      error && React.createElement("div", { className: "card" }, error),
      posts.map((p) => React.createElement("div", { key: p.id, className: "card" },
        React.createElement("div", { className: "row" },
          React.createElement("div", { className: "title" }, p.title),
          React.createElement(Badge, { badge: p.badge })
        ),
        React.createElement("div", { className: "post-meta muted mini" },
          React.createElement(AuthorLink, { id: p.user_id, name: `${p.username} (ID:${p.user_id})` }),
          (p.pinned ? " · 置顶" : "") + " · 回复 " + p.reply_count + " · 赞 " + p.like_count + " · 有用 " + p.useful_count
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
        React.createElement("div", { className: "title" }, "API 地址"),
        React.createElement("div", { className: "muted mini" }, "当前：" + API_DEFAULT),
        React.createElement("div", { className: "muted mini" }, "此地址仅由站点发布者设置。")
      )
    )
  );
}

function NewPost({ go }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);

  const submit = async () => {
    try {
      const data = await apiFetch("/posts", { method: "POST", body: JSON.stringify({ title, content_md: content }) });
      go(`/post/${data.id}`);
    } catch (e) {
      setError(e.message);
    }
  };

  return React.createElement("div", { className: "card" },
    React.createElement("div", { className: "title" }, "发布新帖"),
    React.createElement("div", { className: "list" },
      React.createElement("input", { placeholder: "标题", value: title, onChange: (e) => setTitle(e.target.value) }),
      React.createElement("textarea", { placeholder: "支持 Markdown 与 LaTeX：例如 $E=mc^2$", value: content, onChange: (e) => setContent(e.target.value) }),
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
  const [replyPreview, setReplyPreview] = useState(false);

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
    await apiFetch(`/posts/${id}`, { method: "PATCH", body: JSON.stringify({ title: editTitle, content_md: editContent }) });
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
        React.createElement(AuthorLink, { id: data.post.user_id, name: `${data.post.username} (ID:${data.post.user_id})` }),
        data.post.pinned ? " · 置顶" : ""
      ),
      editing
        ? React.createElement("div", { className: "list" },
            React.createElement("input", { value: editTitle, onChange: (e) => setEditTitle(e.target.value) }),
            React.createElement("textarea", { value: editContent, onChange: (e) => setEditContent(e.target.value) }),
            React.createElement("div", { className: "row" },
              React.createElement("button", { className: "btn", onClick: saveEdit }, "保存修改"),
              React.createElement("button", { className: "btn ghost", onClick: () => setEditing(false) }, "取消")
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
        React.createElement(AuthorLink, { id: r.user_id, name: `${r.username} (ID:${r.user_id})` }),
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
      React.createElement("input", { placeholder: "个性签名", value: signature, onChange: (e) => setSignature(e.target.value) }),
      React.createElement("textarea", { placeholder: "个人简介", value: bio, onChange: (e) => setBio(e.target.value) }),
      React.createElement("button", { className: "btn", onClick: save }, "保存")
    )
  );
}

function UserProfile({ id }) {
  const [user, setUser] = useState(null);

  const load = async () => {
    const data = await apiFetch(`/users/${id}`);
    setUser(data);
  };

  useEffect(() => { load(); }, [id]);

  if (!user) return React.createElement("div", { className: "card" }, "加载中...");
  return React.createElement("div", { className: "card" },
    React.createElement("div", { className: "title" }, "用户主页"),
    React.createElement("div", { className: "list" },
      React.createElement("div", null, `用户ID：${user.id}`),
      React.createElement("div", null, `用户名：${user.username}`),
      React.createElement("div", null, `活力值：${user.vitality}`),
      React.createElement(Badge, { badge: user.badge }),
      React.createElement("div", null, `关注：${user.following} · 粉丝：${user.followers}`),
      React.createElement("div", null, `发帖：${user.posts} · 回复：${user.replies} · 被标记有用：${user.useful}`),
      React.createElement("div", null, `个性签名：${user.signature || ""}`),
      React.createElement("div", null, `个人简介：${user.bio || ""}`)
    )
  );
}

function Messages() {
  const [list, setList] = useState([]);
  const [toId, setToId] = useState("");
  const [content, setContent] = useState("");

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
          React.createElement(AuthorLink, { id: m.from_id, name: `${m.from_name} (ID:${m.from_id})` })
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
      list.map((t) => React.createElement("div", { key: t.id, className: "card" },
        React.createElement("div", { className: "row" },
          React.createElement("strong", null, t.title),
          React.createElement("span", { className: "muted mini" }, t.status)
        ),
        React.createElement("div", { className: "muted mini" },
          "工单ID: " + t.id + " · 作者 ",
          t.username
            ? React.createElement(AuthorLink, { id: t.user_id, name: `${t.username} (ID:${t.user_id})` })
            : React.createElement(AuthorLink, { id: t.user_id, name: `ID:${t.user_id}` })
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
          React.createElement("button", { className: "btn", onClick: submit }, editingId ? "保存" : "提交"),
          editingId && React.createElement("button", {
            className: "btn ghost",
            onClick: () => {
              setEditingId(null);
              setTitle("");
              setContent("");
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
          React.createElement(AuthorLink, { id: l.actor_id, name: `${l.actor_name || "ID"} (ID:${l.actor_id})` })
        ),
        l.target_user_id && React.createElement("div", null,
          "对象：",
          React.createElement(AuthorLink, { id: l.target_user_id, name: `${l.target_name || "ID"} (ID:${l.target_user_id})` })
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
  if (route.startsWith("/user/")) {
    const id = route.split("/")[2];
    return React.createElement(UserProfile, { id });
  }
  if (route === "/new") return React.createElement(NewPost, { go });
  if (route === "/me") return React.createElement(Profile);
  if (route === "/messages") return React.createElement(Messages);
  if (route === "/tickets") return React.createElement(Tickets);
  if (route === "/ostracism") return React.createElement(Ostracism);
  if (route === "/admin") return React.createElement(AdminPanel);
  return React.createElement(Feed, { go });
}

root.render(React.createElement(App));
