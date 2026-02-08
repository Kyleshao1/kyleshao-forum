import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import crypto from "crypto";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors());

const {
  PORT = 4000,
  JWT_SECRET = "dev-secret",
  DB_HOST,
  DB_PORT = 4000,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  SMTP_HOST,
  SMTP_PORT = 587,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM
} = process.env;

if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.warn("Missing DB env vars. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.");
}

const mailer = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
    })
  : null;

async function sendResetEmail(to, token) {
  if (!mailer) return;
  const from = SMTP_FROM || SMTP_USER || "no-reply@example.com";
  const subject = "论坛密码重置码";
  const text = `你的重置码：${token}\n有效期 1 小时。`;
  await mailer.sendMail({ from, to, subject, text });
}

const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: true
  }
});

const nowSql = () => new Date().toISOString().slice(0, 19).replace("T", " ");

async function ensureTables() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(64) UNIQUE NOT NULL,
        pass_hash VARCHAR(255) NOT NULL,
        bio TEXT,
        signature VARCHAR(255),
        vitality INT NOT NULL DEFAULT 0,
        last_vitality_at DATETIME,
        last_decay_at DATETIME,
        is_admin TINYINT NOT NULL DEFAULT 0,
        is_superadmin TINYINT NOT NULL DEFAULT 0,
        banned TINYINT NOT NULL DEFAULT 0,
        mute TINYINT NOT NULL DEFAULT 0,
        ban_pm TINYINT NOT NULL DEFAULT 0,
        ban_like TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        title VARCHAR(200) NOT NULL,
        content_md TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        deleted TINYINT NOT NULL DEFAULT 0,
        pinned TINYINT NOT NULL DEFAULT 0,
        like_count INT NOT NULL DEFAULT 0,
        useful_count INT NOT NULL DEFAULT 0,
        downvote_count INT NOT NULL DEFAULT 0,
        reply_count INT NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    try {
      await conn.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned TINYINT NOT NULL DEFAULT 0");
    } catch {}
    await conn.query(`
      CREATE TABLE IF NOT EXISTS replies (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        post_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        content_md TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        deleted TINYINT NOT NULL DEFAULT 0,
        like_count INT NOT NULL DEFAULT 0,
        useful_count INT NOT NULL DEFAULT 0,
        downvote_count INT NOT NULL DEFAULT 0,
        FOREIGN KEY (post_id) REFERENCES posts(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS post_likes (
        user_id BIGINT NOT NULL,
        post_id BIGINT NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (user_id, post_id)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS post_useful (
        user_id BIGINT NOT NULL,
        post_id BIGINT NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (user_id, post_id)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS post_downvotes (
        user_id BIGINT NOT NULL,
        post_id BIGINT NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (user_id, post_id)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS reply_likes (
        user_id BIGINT NOT NULL,
        reply_id BIGINT NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (user_id, reply_id)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS reply_useful (
        user_id BIGINT NOT NULL,
        reply_id BIGINT NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (user_id, reply_id)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS reply_downvotes (
        user_id BIGINT NOT NULL,
        reply_id BIGINT NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (user_id, reply_id)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS follows (
        follower_id BIGINT NOT NULL,
        following_id BIGINT NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (follower_id, following_id)
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        from_id BIGINT NOT NULL,
        to_id BIGINT NOT NULL,
        content_md TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        read_at DATETIME
      )
    `);
    try {
      await conn.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by_from TINYINT NOT NULL DEFAULT 0");
    } catch {}
    try {
      await conn.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by_to TINYINT NOT NULL DEFAULT 0");
    } catch {}
    await conn.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        title VARCHAR(200) NOT NULL,
        content_md TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS warnings (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        admin_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        reason TEXT NOT NULL,
        created_at DATETIME NOT NULL
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS moderation_logs (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        actor_id BIGINT NOT NULL,
        target_user_id BIGINT,
        type VARCHAR(20) NOT NULL,
        action VARCHAR(50) NOT NULL,
        detail TEXT,
        created_at DATETIME NOT NULL
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        token VARCHAR(128) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL,
        UNIQUE KEY uniq_token (token)
      )
    `);
  } finally {
    conn.release();
  }
}

function signToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
}

async function getUserById(id) {
  const [rows] = await pool.query("SELECT * FROM users WHERE id=?", [id]);
  return rows[0];
}

function badgeFromVitality(v, isAdmin) {
  if (isAdmin) {
    return { label: "管理员", color: "#7a3cff" };
  }
  if (v >= 601) return { label: "热爱者", color: "linear-gradient(90deg,#ff7a18,#af002d,#319197)" };
  if (v >= 501) return { label: "狂热者", color: "#e50914" };
  if (v >= 401) return { label: "奉献者", color: "#ff7a00" };
  if (v >= 301) return { label: "贡献者", color: "#f2c94c" };
  if (v >= 201) return { label: "活跃者", color: "#27ae60" };
  if (v >= 101) return { label: "参与者", color: "#2d9cdb" };
  if (v >= 1) return { label: "初学者", color: "#9aa0a6" };
  return { label: "初学者", color: "#9aa0a6" };
}

async function applyDecayIfNeeded(user) {
  if (!user || user.is_admin || user.is_superadmin) return user;
  if (!user.last_vitality_at) return user;
  const last = new Date(user.last_vitality_at);
  const lastDecay = user.last_decay_at ? new Date(user.last_decay_at) : last;
  const now = new Date();
  const diffMs = now - lastDecay;
  const weeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  if (weeks <= 0) return user;
  const newVitality = Math.max(0, user.vitality - weeks);
  await pool.query("UPDATE users SET vitality=?, last_decay_at=? WHERE id=?", [
    newVitality,
    nowSql(),
    user.id
  ]);
  user.vitality = newVitality;
  user.last_decay_at = nowSql();
  return user;
}

async function addVitality(userId, delta) {
  const user = await getUserById(userId);
  if (!user || user.is_admin || user.is_superadmin) return;
  const newVitality = Math.max(0, user.vitality + delta);
  await pool.query(
    "UPDATE users SET vitality=?, last_vitality_at=? WHERE id=?",
    [newVitality, nowSql(), userId]
  );
}

async function sendReportToSuperadmin(adminId, content) {
  const [rows] = await pool.query("SELECT id FROM users WHERE is_superadmin=1 ORDER BY id ASC LIMIT 1");
  if (!rows[0]) return;
  const toId = rows[0].id;
  await pool.query(
    "INSERT INTO messages (from_id,to_id,content_md,created_at) VALUES (?,?,?,?)",
    [adminId, toId, content, nowSql()]
  );
}

async function logModeration({ actorId, targetUserId = null, type, action, detail }) {
  await pool.query(
    "INSERT INTO moderation_logs (actor_id, target_user_id, type, action, detail, created_at) VALUES (?,?,?,?,?,?)",
    [actorId, targetUserId, type, action, detail || null, nowSql()]
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.userId = data.id;
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
}

async function requireAdmin(req, res, next) {
  const user = await getUserById(req.userId);
  if (!user || (!user.is_admin && !user.is_superadmin)) {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

async function requireSuperadmin(req, res, next) {
  const user = await getUserById(req.userId);
  if (!user || !user.is_superadmin) {
    return res.status(403).json({ error: "Superadmin only" });
  }
  next();
}

app.get("/health", async (req, res) => {
  res.json({ ok: true });
});

app.post("/auth/register", async (req, res) => {
  const { email, username, password } = req.body || {};
  if (!email || !username || !password) return res.status(400).json({ error: "Missing fields" });
  const pass_hash = await bcrypt.hash(password, 10);
  const [countRows] = await pool.query("SELECT COUNT(*) as c FROM users");
  const isFirst = countRows[0].c === 0;
  const created_at = nowSql();
  try {
    const [result] = await pool.query(
      "INSERT INTO users (email, username, pass_hash, created_at, is_admin, is_superadmin, last_vitality_at) VALUES (?,?,?,?,?,?,?)",
      [email, username, pass_hash, created_at, isFirst ? 1 : 0, isFirst ? 1 : 0, created_at]
    );
    const user = { id: result.insertId };
    const token = signToken(user);
    res.json({ token });
  } catch (e) {
    res.status(400).json({ error: "Email or username already exists" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const identifier = (email || "").trim();
  if (!identifier || !password) return res.status(400).json({ error: "Missing fields" });
  let [rows] = await pool.query("SELECT * FROM users WHERE email=?", [identifier]);
  if (!rows[0]) {
    [rows] = await pool.query("SELECT * FROM users WHERE username=?", [identifier]);
  }
  const user = rows[0];
  if (!user) return res.status(400).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, user.pass_hash);
  if (!ok) return res.status(400).json({ error: "Invalid credentials" });
  if (user.banned) return res.status(403).json({ error: "Account banned" });
  const token = signToken(user);
  res.json({ token });
});

app.post("/auth/forgot", async (req, res) => {
  const { email } = req.body || {};
  const identifier = (email || "").trim();
  if (!identifier) return res.status(400).json({ error: "Missing email" });
  const [rows] = await pool.query("SELECT * FROM users WHERE email=?", [identifier]);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "User not found" });
  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await pool.query(
    "INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at) VALUES (?,?,?,?)",
    [user.id, token, expires.toISOString().slice(0, 19).replace("T", " "), nowSql()]
  );
  if (mailer) {
    try {
      await sendResetEmail(user.email, token);
    } catch (e) {
      return res.status(500).json({ error: "Failed to send email" });
    }
  }
  res.json({ ok: true, expires_at: expires.toISOString(), email_sent: !!mailer, token: mailer ? undefined : token });
});

app.post("/auth/reset", async (req, res) => {
  const { email, token, new_password } = req.body || {};
  const identifier = (email || "").trim();
  if (!identifier || !token || !new_password) return res.status(400).json({ error: "Missing fields" });
  const [users] = await pool.query("SELECT * FROM users WHERE email=?", [identifier]);
  const user = users[0];
  if (!user) return res.status(404).json({ error: "User not found" });
  const [tokens] = await pool.query(
    "SELECT * FROM password_reset_tokens WHERE user_id=? AND token=? ORDER BY created_at DESC LIMIT 1",
    [user.id, token]
  );
  const row = tokens[0];
  if (!row) return res.status(400).json({ error: "Invalid token" });
  if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: "Token expired" });
  const pass_hash = await bcrypt.hash(new_password, 10);
  await pool.query("UPDATE users SET pass_hash=? WHERE id=?", [pass_hash, user.id]);
  await pool.query("DELETE FROM password_reset_tokens WHERE user_id=?", [user.id]);
  res.json({ ok: true });
});

app.get("/me", auth, async (req, res) => {
  let user = await getUserById(req.userId);
  if (!user) return res.status(404).json({ error: "Not found" });
  user = await applyDecayIfNeeded(user);
  const badge = badgeFromVitality(user.is_admin || user.is_superadmin ? 9999 : user.vitality, user.is_admin || user.is_superadmin);
  res.json({
    id: user.id,
    email: user.email,
    username: user.username,
    bio: user.bio,
    signature: user.signature,
    vitality: user.is_admin || user.is_superadmin ? "∞" : user.vitality,
    badge,
    is_admin: !!user.is_admin,
    is_superadmin: !!user.is_superadmin
  });
});

app.patch("/me", auth, async (req, res) => {
  const { bio, signature } = req.body || {};
  await pool.query("UPDATE users SET bio=?, signature=? WHERE id=?", [bio || null, signature || null, req.userId]);
  res.json({ ok: true });
});

app.get("/users/:id", auth, async (req, res) => {
  let user = await getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  user = await applyDecayIfNeeded(user);
  const [followers] = await pool.query("SELECT COUNT(*) c FROM follows WHERE following_id=?", [user.id]);
  const [following] = await pool.query("SELECT COUNT(*) c FROM follows WHERE follower_id=?", [user.id]);
  const [isFollowingRows] = await pool.query("SELECT 1 FROM follows WHERE follower_id=? AND following_id=?", [req.userId, user.id]);
  const [postCount] = await pool.query("SELECT COUNT(*) c FROM posts WHERE user_id=? AND deleted=0", [user.id]);
  const [replyCount] = await pool.query("SELECT COUNT(*) c FROM replies WHERE user_id=? AND deleted=0", [user.id]);
  const [usefulCount] = await pool.query(
    "SELECT SUM(useful_count) as c FROM posts WHERE user_id=? AND deleted=0",
    [user.id]
  );
  const [usefulCountReplies] = await pool.query(
    "SELECT SUM(useful_count) as c FROM replies WHERE user_id=? AND deleted=0",
    [user.id]
  );
  const totalUseful = (usefulCount[0].c || 0) + (usefulCountReplies[0].c || 0);
  const badge = badgeFromVitality(user.is_admin || user.is_superadmin ? 9999 : user.vitality, user.is_admin || user.is_superadmin);
  res.json({
    id: user.id,
    username: user.username,
    bio: user.bio,
    signature: user.signature,
    vitality: user.is_admin || user.is_superadmin ? "∞" : user.vitality,
    badge,
    followers: followers[0].c,
    following: following[0].c,
    is_following: !!isFollowingRows[0],
    posts: postCount[0].c,
    replies: replyCount[0].c,
    useful: totalUseful
  });
});

app.get("/users/:id/followers", auth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT u.id, u.username, u.vitality, u.is_admin, u.is_superadmin FROM follows f JOIN users u ON f.follower_id=u.id WHERE f.following_id=? ORDER BY f.created_at DESC LIMIT 200",
    [req.params.id]
  );
  const mapped = rows.map((u) => ({ ...u, badge: badgeFromVitality(u.is_admin || u.is_superadmin ? 9999 : u.vitality, u.is_admin || u.is_superadmin) }));
  res.json(mapped);
});

app.get("/users/:id/following", auth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT u.id, u.username, u.vitality, u.is_admin, u.is_superadmin FROM follows f JOIN users u ON f.following_id=u.id WHERE f.follower_id=? ORDER BY f.created_at DESC LIMIT 200",
    [req.params.id]
  );
  const mapped = rows.map((u) => ({ ...u, badge: badgeFromVitality(u.is_admin || u.is_superadmin ? 9999 : u.vitality, u.is_admin || u.is_superadmin) }));
  res.json(mapped);
});

app.get("/users/:id/posts", auth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT p.*, u.username, u.is_admin, u.is_superadmin, u.vitality FROM posts p JOIN users u ON p.user_id=u.id WHERE p.user_id=? AND p.deleted=0 ORDER BY p.created_at DESC LIMIT 200",
    [req.params.id]
  );
  const mapped = rows.map((r) => ({
    ...r,
    badge: badgeFromVitality(r.is_admin || r.is_superadmin ? 9999 : r.vitality, r.is_admin || r.is_superadmin)
  }));
  res.json(mapped);
});

app.post("/posts", auth, async (req, res) => {
  const { title, content_md } = req.body || {};
  if (!title || !content_md) return res.status(400).json({ error: "Missing fields" });
  const user = await getUserById(req.userId);
  if (user.banned) return res.status(403).json({ error: "Banned" });
  const created_at = nowSql();
  const [result] = await pool.query(
    "INSERT INTO posts (user_id,title,content_md,created_at,updated_at) VALUES (?,?,?,?,?)",
    [req.userId, title, content_md, created_at, created_at]
  );
  await addVitality(req.userId, 2);
  res.json({ id: result.insertId });
});

app.get("/posts", auth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT p.*, u.username, u.is_admin, u.is_superadmin, u.vitality FROM posts p JOIN users u ON p.user_id=u.id WHERE p.deleted=0 ORDER BY p.pinned DESC, p.created_at DESC LIMIT 200"
  );
  const mapped = rows.map((r) => {
    const badge = badgeFromVitality(r.is_admin || r.is_superadmin ? 9999 : r.vitality, r.is_admin || r.is_superadmin);
    return {
      ...r,
      badge
    };
  });
  res.json(mapped);
});

app.get("/posts/:id", auth, async (req, res) => {
  const [posts] = await pool.query(
    "SELECT p.*, u.username, u.is_admin, u.is_superadmin, u.vitality FROM posts p JOIN users u ON p.user_id=u.id WHERE p.id=?",
    [req.params.id]
  );
  if (!posts[0] || posts[0].deleted) return res.status(404).json({ error: "Not found" });
  const post = posts[0];
  const [replies] = await pool.query(
    "SELECT r.*, u.username, u.is_admin, u.is_superadmin, u.vitality FROM replies r JOIN users u ON r.user_id=u.id WHERE r.post_id=? AND r.deleted=0 ORDER BY r.created_at ASC",
    [req.params.id]
  );
  post.badge = badgeFromVitality(post.is_admin || post.is_superadmin ? 9999 : post.vitality, post.is_admin || post.is_superadmin);
  const mappedReplies = replies.map((r) => ({
    ...r,
    badge: badgeFromVitality(r.is_admin || r.is_superadmin ? 9999 : r.vitality, r.is_admin || r.is_superadmin)
  }));
  res.json({ post, replies: mappedReplies });
});

app.post("/posts/:id/pin", auth, requireAdmin, async (req, res) => {
  const postId = Number(req.params.id);
  const { pinned } = req.body || {};
  await pool.query("UPDATE posts SET pinned=? WHERE id=?", [pinned ? 1 : 0, postId]);
  const [rows] = await pool.query("SELECT user_id FROM posts WHERE id=?", [postId]);
  const targetUserId = rows[0] ? rows[0].user_id : null;
  await logModeration({
    actorId: req.userId,
    targetUserId,
    type: "reward",
    action: pinned ? "pin_post" : "unpin_post",
    detail: `post_id=${postId}`
  });
  res.json({ ok: true });
});

app.patch("/posts/:id", auth, async (req, res) => {
  const postId = Number(req.params.id);
  const { title, content_md } = req.body || {};
  if (!title || !content_md) return res.status(400).json({ error: "Missing fields" });
  const user = await getUserById(req.userId);
  const [rows] = await pool.query("SELECT * FROM posts WHERE id=?", [postId]);
  const post = rows[0];
  if (!post || post.deleted) return res.status(404).json({ error: "Not found" });
  const isOwner = post.user_id === req.userId;
  const isAdmin = user.is_admin || user.is_superadmin;
  if (!isOwner && !isAdmin) return res.status(403).json({ error: "Forbidden" });
  await pool.query("UPDATE posts SET title=?, content_md=?, updated_at=? WHERE id=?", [
    title,
    content_md,
    nowSql(),
    postId
  ]);
  res.json({ ok: true });
});

app.delete("/posts/:id", auth, async (req, res) => {
  const postId = Number(req.params.id);
  const user = await getUserById(req.userId);
  const [rows] = await pool.query("SELECT * FROM posts WHERE id=?", [postId]);
  const post = rows[0];
  if (!post || post.deleted) return res.status(404).json({ error: "Not found" });
  const isOwner = post.user_id === req.userId;
  const isAdmin = user.is_admin || user.is_superadmin;
  if (!isOwner && !isAdmin) return res.status(403).json({ error: "Forbidden" });
  await pool.query("UPDATE posts SET deleted=1 WHERE id=?", [postId]);
  if (isAdmin && !isOwner) {
    await sendReportToSuperadmin(req.userId, `管理员删除帖子 #${postId}`);
    await logModeration({
      actorId: req.userId,
      targetUserId: post.user_id,
      type: "penalty",
      action: "delete_post",
      detail: `post_id=${postId}`
    });
  }
  res.json({ ok: true });
});

app.post("/posts/:id/replies", auth, async (req, res) => {
  const { content_md } = req.body || {};
  if (!content_md) return res.status(400).json({ error: "Missing content" });
  const user = await getUserById(req.userId);
  if (user.banned || user.mute) return res.status(403).json({ error: "Muted" });
  const created_at = nowSql();
  await pool.query(
    "INSERT INTO replies (post_id,user_id,content_md,created_at) VALUES (?,?,?,?)",
    [req.params.id, req.userId, content_md, created_at]
  );
  await pool.query("UPDATE posts SET reply_count=reply_count+1 WHERE id=?", [req.params.id]);
  await addVitality(req.userId, 1);
  res.json({ ok: true });
});

app.delete("/replies/:id", auth, async (req, res) => {
  const replyId = Number(req.params.id);
  const user = await getUserById(req.userId);
  const [rows] = await pool.query("SELECT * FROM replies WHERE id=?", [replyId]);
  const reply = rows[0];
  if (!reply || reply.deleted) return res.status(404).json({ error: "Not found" });
  const isOwner = reply.user_id === req.userId;
  const isAdmin = user.is_admin || user.is_superadmin;
  if (!isOwner && !isAdmin) return res.status(403).json({ error: "Forbidden" });
  await pool.query("UPDATE replies SET deleted=1 WHERE id=?", [replyId]);
  if (isAdmin && !isOwner) {
    await sendReportToSuperadmin(req.userId, `管理员删除回复 #${replyId}`);
    await logModeration({
      actorId: req.userId,
      targetUserId: reply.user_id,
      type: "penalty",
      action: "delete_reply",
      detail: `reply_id=${replyId}`
    });
  }
  res.json({ ok: true });
});

app.post("/posts/:id/like", auth, async (req, res) => {
  const user = await getUserById(req.userId);
  if (user.ban_like) return res.status(403).json({ error: "Likes disabled" });
  const postId = req.params.id;
  const [exists] = await pool.query("SELECT 1 FROM post_likes WHERE user_id=? AND post_id=?", [req.userId, postId]);
  if (exists[0]) return res.json({ ok: true });
  await pool.query("INSERT INTO post_likes (user_id,post_id,created_at) VALUES (?,?,?)", [req.userId, postId, nowSql()]);
  await pool.query("UPDATE posts SET like_count=like_count+1 WHERE id=?", [postId]);
  const [postRows] = await pool.query("SELECT user_id FROM posts WHERE id=?", [postId]);
  if (postRows[0]) await addVitality(postRows[0].user_id, 2);
  res.json({ ok: true });
});

app.post("/posts/:id/unlike", auth, async (req, res) => {
  const postId = req.params.id;
  const [exists] = await pool.query("SELECT 1 FROM post_likes WHERE user_id=? AND post_id=?", [req.userId, postId]);
  if (!exists[0]) return res.json({ ok: true });
  await pool.query("DELETE FROM post_likes WHERE user_id=? AND post_id=?", [req.userId, postId]);
  await pool.query("UPDATE posts SET like_count=GREATEST(like_count-1,0) WHERE id=?", [postId]);
  res.json({ ok: true });
});

app.post("/posts/:id/useful", auth, async (req, res) => {
  const postId = req.params.id;
  const [exists] = await pool.query("SELECT 1 FROM post_useful WHERE user_id=? AND post_id=?", [req.userId, postId]);
  if (exists[0]) return res.json({ ok: true });
  await pool.query("INSERT INTO post_useful (user_id,post_id,created_at) VALUES (?,?,?)", [req.userId, postId, nowSql()]);
  await pool.query("UPDATE posts SET useful_count=useful_count+1 WHERE id=?", [postId]);
  const [postRows] = await pool.query("SELECT user_id FROM posts WHERE id=?", [postId]);
  if (postRows[0]) await addVitality(postRows[0].user_id, 5);
  res.json({ ok: true });
});

app.post("/posts/:id/downvote", auth, async (req, res) => {
  const postId = req.params.id;
  const [exists] = await pool.query("SELECT 1 FROM post_downvotes WHERE user_id=? AND post_id=?", [req.userId, postId]);
  if (exists[0]) return res.json({ ok: true });
  await pool.query("INSERT INTO post_downvotes (user_id,post_id,created_at) VALUES (?,?,?)", [req.userId, postId, nowSql()]);
  await pool.query("UPDATE posts SET downvote_count=downvote_count+1 WHERE id=?", [postId]);
  const [postRows] = await pool.query("SELECT user_id FROM posts WHERE id=?", [postId]);
  if (postRows[0]) await addVitality(postRows[0].user_id, -2);
  res.json({ ok: true });
});

app.post("/replies/:id/like", auth, async (req, res) => {
  const user = await getUserById(req.userId);
  if (user.ban_like) return res.status(403).json({ error: "Likes disabled" });
  const replyId = req.params.id;
  const [exists] = await pool.query("SELECT 1 FROM reply_likes WHERE user_id=? AND reply_id=?", [req.userId, replyId]);
  if (exists[0]) return res.json({ ok: true });
  await pool.query("INSERT INTO reply_likes (user_id,reply_id,created_at) VALUES (?,?,?)", [req.userId, replyId, nowSql()]);
  await pool.query("UPDATE replies SET like_count=like_count+1 WHERE id=?", [replyId]);
  const [rows] = await pool.query("SELECT user_id FROM replies WHERE id=?", [replyId]);
  if (rows[0]) await addVitality(rows[0].user_id, 2);
  res.json({ ok: true });
});

app.post("/replies/:id/useful", auth, async (req, res) => {
  const replyId = req.params.id;
  const [exists] = await pool.query("SELECT 1 FROM reply_useful WHERE user_id=? AND reply_id=?", [req.userId, replyId]);
  if (exists[0]) return res.json({ ok: true });
  await pool.query("INSERT INTO reply_useful (user_id,reply_id,created_at) VALUES (?,?,?)", [req.userId, replyId, nowSql()]);
  await pool.query("UPDATE replies SET useful_count=useful_count+1 WHERE id=?", [replyId]);
  const [rows] = await pool.query("SELECT user_id FROM replies WHERE id=?", [replyId]);
  if (rows[0]) await addVitality(rows[0].user_id, 5);
  res.json({ ok: true });
});

app.post("/replies/:id/downvote", auth, async (req, res) => {
  const replyId = req.params.id;
  const [exists] = await pool.query("SELECT 1 FROM reply_downvotes WHERE user_id=? AND reply_id=?", [req.userId, replyId]);
  if (exists[0]) return res.json({ ok: true });
  await pool.query("INSERT INTO reply_downvotes (user_id,reply_id,created_at) VALUES (?,?,?)", [req.userId, replyId, nowSql()]);
  await pool.query("UPDATE replies SET downvote_count=downvote_count+1 WHERE id=?", [replyId]);
  const [rows] = await pool.query("SELECT user_id FROM replies WHERE id=?", [replyId]);
  if (rows[0]) await addVitality(rows[0].user_id, -2);
  res.json({ ok: true });
});

app.post("/users/:id/follow", auth, async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) return res.status(400).json({ error: "Cannot follow self" });
  const [exists] = await pool.query("SELECT 1 FROM follows WHERE follower_id=? AND following_id=?", [req.userId, targetId]);
  if (exists[0]) return res.json({ ok: true });
  await pool.query("INSERT INTO follows (follower_id,following_id,created_at) VALUES (?,?,?)", [req.userId, targetId, nowSql()]);
  await addVitality(targetId, 5);
  res.json({ ok: true });
});

app.post("/users/:id/unfollow", auth, async (req, res) => {
  const targetId = Number(req.params.id);
  const [exists] = await pool.query("SELECT 1 FROM follows WHERE follower_id=? AND following_id=?", [req.userId, targetId]);
  if (!exists[0]) return res.json({ ok: true });
  await pool.query("DELETE FROM follows WHERE follower_id=? AND following_id=?", [req.userId, targetId]);
  await addVitality(targetId, -5);
  res.json({ ok: true });
});

app.post("/messages", auth, async (req, res) => {
  const { to_id, content_md } = req.body || {};
  if (!to_id || !content_md) return res.status(400).json({ error: "Missing fields" });
  const user = await getUserById(req.userId);
  if (user.ban_pm) return res.status(403).json({ error: "PM disabled" });
  await pool.query(
    "INSERT INTO messages (from_id,to_id,content_md,created_at) VALUES (?,?,?,?)",
    [req.userId, to_id, content_md, nowSql()]
  );
  res.json({ ok: true });
});

app.get("/messages", auth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT m.*, u.username AS from_name FROM messages m JOIN users u ON m.from_id=u.id WHERE m.to_id=? AND (m.deleted_by_to=0 OR m.deleted_by_to IS NULL) ORDER BY m.created_at DESC LIMIT 200",
    [req.userId]
  );
  res.json(rows);
});

app.delete("/messages/:id", auth, async (req, res) => {
  const msgId = Number(req.params.id);
  const [rows] = await pool.query("SELECT * FROM messages WHERE id=?", [msgId]);
  const msg = rows[0];
  if (!msg) return res.status(404).json({ error: "Not found" });
  if (msg.to_id !== req.userId && msg.from_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

  if (msg.to_id === req.userId) {
    await pool.query("UPDATE messages SET deleted_by_to=1 WHERE id=?", [msgId]);
  }
  if (msg.from_id === req.userId) {
    await pool.query("UPDATE messages SET deleted_by_from=1 WHERE id=?", [msgId]);
  }
  const [after] = await pool.query("SELECT deleted_by_from, deleted_by_to FROM messages WHERE id=?", [msgId]);
  if (after[0] && after[0].deleted_by_from && after[0].deleted_by_to) {
    await pool.query("DELETE FROM messages WHERE id=?", [msgId]);
  }
  res.json({ ok: true });
});

app.post("/tickets", auth, async (req, res) => {
  const { title, content_md } = req.body || {};
  if (!title || !content_md) return res.status(400).json({ error: "Missing fields" });
  const created_at = nowSql();
  await pool.query(
    "INSERT INTO tickets (user_id,title,content_md,status,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    [req.userId, title, content_md, "open", created_at, created_at]
  );
  res.json({ ok: true });
});

app.get("/tickets", auth, async (req, res) => {
  const user = await getUserById(req.userId);
  if (user.is_superadmin) {
    const [rows] = await pool.query("SELECT t.*, u.username FROM tickets t JOIN users u ON t.user_id=u.id ORDER BY t.updated_at DESC LIMIT 200");
    return res.json(rows);
  }
  const [rows] = await pool.query("SELECT * FROM tickets WHERE user_id=? ORDER BY updated_at DESC", [req.userId]);
  res.json(rows);
});

app.patch("/tickets/:id/status", auth, requireSuperadmin, async (req, res) => {
  const { status } = req.body || {};
  const allowed = ["open", "pending", "closed", "done"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
  await pool.query("UPDATE tickets SET status=?, updated_at=? WHERE id=?", [status, nowSql(), req.params.id]);
  res.json({ ok: true });
});

app.patch("/tickets/:id", auth, async (req, res) => {
  const { title, content_md } = req.body || {};
  if (!title || !content_md) return res.status(400).json({ error: "Missing fields" });
  const [rows] = await pool.query("SELECT * FROM tickets WHERE id=?", [req.params.id]);
  const ticket = rows[0];
  if (!ticket) return res.status(404).json({ error: "Not found" });
  if (ticket.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });
  await pool.query("UPDATE tickets SET title=?, content_md=?, updated_at=? WHERE id=?", [
    title,
    content_md,
    nowSql(),
    req.params.id
  ]);
  res.json({ ok: true });
});

app.delete("/tickets/:id", auth, requireSuperadmin, async (req, res) => {
  await pool.query("DELETE FROM tickets WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

app.get("/moderation/logs", auth, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT l.*, a.username AS actor_name, t.username AS target_name
    FROM moderation_logs l
    LEFT JOIN users a ON l.actor_id=a.id
    LEFT JOIN users t ON l.target_user_id=t.id
    ORDER BY l.created_at DESC
    LIMIT 20
  `);
  res.json(rows);
});

app.post("/admin/warn", auth, requireAdmin, async (req, res) => {
  const { user_id, reason } = req.body || {};
  if (!user_id || !reason) return res.status(400).json({ error: "Missing fields" });
  await pool.query("INSERT INTO warnings (admin_id,user_id,reason,created_at) VALUES (?,?,?,?)", [req.userId, user_id, reason, nowSql()]);
  await sendReportToSuperadmin(req.userId, `管理员警告用户 #${user_id}: ${reason}`);
  await logModeration({ actorId: req.userId, targetUserId: user_id, type: "penalty", action: "warn", detail: reason });
  res.json({ ok: true });
});

app.post("/admin/mute", auth, requireAdmin, async (req, res) => {
  const { user_id, mute } = req.body || {};
  await pool.query("UPDATE users SET mute=? WHERE id=?", [mute ? 1 : 0, user_id]);
  await sendReportToSuperadmin(req.userId, `管理员修改禁言 用户 #${user_id}: ${mute ? "禁言" : "解除"}`);
  await logModeration({
    actorId: req.userId,
    targetUserId: user_id,
    type: mute ? "penalty" : "reward",
    action: mute ? "mute" : "unmute",
    detail: ""
  });
  res.json({ ok: true });
});

app.post("/admin/ban-pm", auth, requireAdmin, async (req, res) => {
  const { user_id, ban_pm } = req.body || {};
  await pool.query("UPDATE users SET ban_pm=? WHERE id=?", [ban_pm ? 1 : 0, user_id]);
  await sendReportToSuperadmin(req.userId, `管理员修改禁私信 用户 #${user_id}: ${ban_pm ? "禁" : "解除"}`);
  await logModeration({
    actorId: req.userId,
    targetUserId: user_id,
    type: ban_pm ? "penalty" : "reward",
    action: ban_pm ? "ban_pm" : "unban_pm",
    detail: ""
  });
  res.json({ ok: true });
});

app.post("/admin/ban-like", auth, requireAdmin, async (req, res) => {
  const { user_id, ban_like } = req.body || {};
  await pool.query("UPDATE users SET ban_like=? WHERE id=?", [ban_like ? 1 : 0, user_id]);
  await sendReportToSuperadmin(req.userId, `管理员修改禁点赞 用户 #${user_id}: ${ban_like ? "禁" : "解除"}`);
  await logModeration({
    actorId: req.userId,
    targetUserId: user_id,
    type: ban_like ? "penalty" : "reward",
    action: ban_like ? "ban_like" : "unban_like",
    detail: ""
  });
  res.json({ ok: true });
});

app.post("/admin/ban", auth, requireAdmin, async (req, res) => {
  const { user_id, banned } = req.body || {};
  await pool.query("UPDATE users SET banned=? WHERE id=?", [banned ? 1 : 0, user_id]);
  await sendReportToSuperadmin(req.userId, `管理员封禁用户 #${user_id}: ${banned ? "封禁" : "解除"}`);
  await logModeration({
    actorId: req.userId,
    targetUserId: user_id,
    type: banned ? "penalty" : "reward",
    action: banned ? "ban" : "unban",
    detail: ""
  });
  res.json({ ok: true });
});

app.post("/admin/delete-post", auth, requireAdmin, async (req, res) => {
  const { post_id } = req.body || {};
  const [rows] = await pool.query("SELECT user_id FROM posts WHERE id=?", [post_id]);
  await pool.query("UPDATE posts SET deleted=1 WHERE id=?", [post_id]);
  await sendReportToSuperadmin(req.userId, `管理员删除帖子 #${post_id}`);
  if (rows[0]) {
    await logModeration({
      actorId: req.userId,
      targetUserId: rows[0].user_id,
      type: "penalty",
      action: "delete_post",
      detail: `post_id=${post_id}`
    });
  }
  res.json({ ok: true });
});

app.post("/admin/delete-reply", auth, requireAdmin, async (req, res) => {
  const { reply_id } = req.body || {};
  const [rows] = await pool.query("SELECT user_id FROM replies WHERE id=?", [reply_id]);
  await pool.query("UPDATE replies SET deleted=1 WHERE id=?", [reply_id]);
  await sendReportToSuperadmin(req.userId, `管理员删除回复 #${reply_id}`);
  if (rows[0]) {
    await logModeration({
      actorId: req.userId,
      targetUserId: rows[0].user_id,
      type: "penalty",
      action: "delete_reply",
      detail: `reply_id=${reply_id}`
    });
  }
  res.json({ ok: true });
});

app.post("/admin/promote", auth, requireSuperadmin, async (req, res) => {
  const { user_id, is_admin } = req.body || {};
  await pool.query("UPDATE users SET is_admin=? WHERE id=?", [is_admin ? 1 : 0, user_id]);
  await logModeration({
    actorId: req.userId,
    targetUserId: user_id,
    type: "reward",
    action: "promote_admin",
    detail: ""
  });
  res.json({ ok: true });
});

app.post("/admin/demote", auth, requireSuperadmin, async (req, res) => {
  const { user_id, is_admin } = req.body || {};
  await pool.query("UPDATE users SET is_admin=? WHERE id=?", [is_admin ? 1 : 0, user_id]);
  await logModeration({
    actorId: req.userId,
    targetUserId: user_id,
    type: "penalty",
    action: "demote_admin",
    detail: ""
  });
  res.json({ ok: true });
});

app.post("/admin/delete-account", auth, requireAdmin, async (req, res) => {
  const { user_id } = req.body || {};
  const user = await getUserById(user_id);
  if (!user || user.is_superadmin) return res.status(400).json({ error: "Cannot delete" });
  await pool.query("UPDATE users SET banned=1 WHERE id=?", [user_id]);
  await sendReportToSuperadmin(req.userId, `管理员封禁账号 #${user_id}`);
  await logModeration({
    actorId: req.userId,
    targetUserId: user_id,
    type: "penalty",
    action: "ban_account",
    detail: ""
  });
  res.json({ ok: true });
});

app.listen(PORT, async () => {
  await ensureTables();
  console.log(`API running on ${PORT}`);
});
