// ============================================================
// 星河班 · 操行银行  后端 API（Cloudflare Workers + D1）
// 说明：本地开发目前用 js/store.js 的 localStorage 模式；
//       部署到 Cloudflare 时，把 store.js 的 apiBase 指向本 Worker。
// ============================================================

// 密码哈希 —— Cloudflare Workers 无原生 Node crypto 的 bcrypt，
// 这里用 Web Crypto (SHA-256 + 加盐)，纯 JS 安全可用。
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function genSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// 新密码统一加盐存储（与前端 store.js 完全一致）：`<32位盐hex>.<64位摘要hex>`
async function hashPassword(password) {
  const s = String(password == null ? "" : password);
  return genSalt() + "." + (await sha256hex(s));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function uid(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// ---- 令牌签名 ----
// 安全令牌 = "<id>.<签名字符串>"，用 Worker 密钥 AUTH_SECRET 做 HMAC-SHA256 签名。
// 未设置 AUTH_SECRET 时退化为旧的 base64(id)（仅限过渡期，强烈建议在 Cloudflare 配置密钥后即完成升级）。
const IS_HASH_RE = /^[0-9a-f]{64}$/i;
let _authSecret = ""; // 由 fetch 入口根据 env 设置

function setAuthSecret(env) {
  _authSecret = (env && env.AUTH_SECRET) ? String(env.AUTH_SECRET) : "";
}

function legacyToken(id) {
  try { return btoa(id); } catch (e) { return id; }
}

async function hmacHex(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signToken(id) {
  if (!_authSecret) return legacyToken(id);
  const sig = await hmacHex(id, _authSecret);
  return id + "." + sig;
}

async function verifyToken(token) {
  if (!token) return null;
  let id = null;
  if (_authSecret) {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const cand = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!cand || !sig) return null;
    if (sig.toLowerCase() !== (await hmacHex(cand, _authSecret))) return null; // 签名不符，拒绝
    id = cand;
  } else {
    try { id = atob(token); } catch (e) { return null; }
  }
  return id || null;
}

// 校验密码，返回：true(已加盐且匹配) / 新哈希(需升级为加盐) / null(密码错)。
// 兼容：新加盐 `盐.摘要`、旧 SHA-256(64hex)、以及最早期明文。
const SALTED_RE = /^[0-9a-f]{32}\.[0-9a-f]{64}$/i;
async function checkPassword(plain, stored) {
  stored = String(stored == null ? "" : stored);
  if (SALTED_RE.test(stored)) {
    const salt = stored.slice(0, 32), dg = stored.slice(33);
    return (await sha256hex(salt + String(plain))).toLowerCase() === dg.toLowerCase() ? true : null;
  }
  if (IS_HASH_RE.test(stored)) {
    return (await sha256hex(String(plain))).toLowerCase() === stored.toLowerCase() ? hashPassword(String(plain)) : null;
  }
  if (String(plain) === stored) return hashPassword(String(plain)); // 旧明文 → 升级加盐
  return null;
}

// ---- R2 图片：上传(base64 解为二进制) 与 读取 ----
// 未绑定 BUCKET 时返回 R2_OFF，前端自动回退为 base64 内嵌存储，因而安全降级、不破坏现有数据。
async function uploadFile(request, env) {
  if (!env.BUCKET) return { ok: false, code: "R2_OFF", msg: "R2 存储未绑定" };
  const { data, ext, mime } = await request.json();
  if (!data) return { ok: false, msg: "缺少图片数据" };
  let bytes;
  try { bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)); } catch (e) { return { ok: false, msg: "图片编码错误" }; }
  if (!bytes.length) return { ok: false, msg: "图片为空" };
  const key = "img/" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + "." + (ext || "jpg");
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime || "image/jpeg" } });
  return { ok: true, key };
}

async function servePhoto(path, env) {
  if (!env.BUCKET) return json({ ok: false, msg: "R2 存储未绑定" }, 404);
  const key = path.slice("/photos/".length);
  const obj = await env.BUCKET.get(key);
  if (!obj) return json({ ok: false, msg: "图片不存在" }, 404);
  const headers = {
    "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  return new Response(obj.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, "");
    setAuthSecret(env); // 每次请求按当前 env 刷新密钥，便于瞬时切换状态
    const method = request.method;

    // 简化 CORS
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      let result;
      const auth = await authenticate(request, env);

      // 公开接口
      if (path === "/login" && method === "POST") result = await doLogin(request, env);
      else if (path === "/docs/login" && method === "POST") result = await docsLogin(request, env);
      else if (path === "/docs/register" && method === "POST") result = await docsRegister(request, env);
      else if (path === "/leaderboard" && method === "GET") result = leaderboard(env);
      else if (path === "/docs" && method === "GET") result = await getDocs(request, env);
      else if (path === "/docs/bootstrap" && method === "POST") result = await docsBootstrap(request, env);
      // R2 图片（公开读取）
      else if (path.indexOf("/photos/") === 0 && method === "GET") result = await servePhoto(path, env);
      // 需登录
      else if (!auth) return json({ ok: false, msg: "未登录或登录已过期" }, 401);
      else {
        switch (true) {
          case path === "/upload" && method === "POST": result = await uploadFile(request, env); break;
          case path === "/me" && method === "GET": result = me(auth); break;
          case path === "/me/update" && method === "POST": result = await updateMe(request, env, auth); break;
          case path === "/change-password" && method === "POST": result = await changePassword(request, env, auth); break;
          case path === "/delta" && method === "POST": result = await applyDelta(request, env, auth); break;
          case path === "/undo" && method === "POST": result = await undoLast(env, auth); break;
          case path === "/redeem" && method === "POST": result = await applyRedeem(request, env, auth); break;
          case path === "/redeem/review" && method === "POST": result = await reviewRedeem(request, env, auth); break;
          case path === "/redeem/offline" && method === "POST": result = await offlineDeduct(request, env, auth); break;
          case path === "/my/ledger" && method === "GET": result = myLedger(env, auth); break;
          case path === "/my/redeems" && method === "GET": result = myRedeems(env, auth); break;
          case path === "/meta" && method === "GET": result = await getMeta(env); break;
          case path === "/docs" && method === "PUT": result = await putDocs(request, env, auth); break;
          case path === "/docs/reset" && method === "POST": result = await docsReset(request, env, auth); break;
          default: result = json({ ok: false, msg: "接口不存在" }, 404);
        }
      }
      const res = result instanceof Response ? result : json(result);
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (e) {
      return json({ ok: false, msg: "服务器错误：" + e.message }, 500);
    }
  },
};

// ---- 认证：Authorization: Bearer <token>，token = 签名令牌（id.HMAC-SHA256(id)）----
// 用户身份以 docs 表的 users 文档为唯一数据源（与前端一致），
// 因此后端登录校验也直接查 docs，避免维护两份用户表。
async function authenticate(request, env) {
  const h = request.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const id = await verifyToken(token);
  if (!id) return null;
  const row = await env.DB.prepare("SELECT value FROM docs WHERE key = 'users'").first();
  if (!row) return null;
  let users;
  try { users = JSON.parse(row.value); } catch (e) { return null; }
  const u = users.find((x) => x.id === id);
  return u ? { id: u.id, name: u.name, role: u.role } : null;
}

// 以前端 docs 用户文档为唯一数据源的登录，签发不可伪造的签名令牌。
async function docsLogin(request, env) {
  const { account, password } = await request.json();
  if (!account || !password) return { ok: false, msg: "请填写账号和密码" };
  const row = await env.DB.prepare("SELECT value FROM docs WHERE key = 'users'").first();
  if (!row) return { ok: false, msg: "数据未初始化" };
  let users;
  try { users = JSON.parse(row.value); } catch (e) { return { ok: false, msg: "用户数据损坏" }; }
  const u = users.find((x) => x.account === account);
  if (!u) return { ok: false, msg: "账号不存在" };
  const pwRes = await checkPassword(password, u.password);
  if (!pwRes) return { ok: false, msg: "密码错误" };
  if (u.status === "pending") return { ok: false, msg: "该账号待班主任审核，通过后方可登录" };
  if (u.status === "rejected") return { ok: false, msg: "该注册申请未通过审核" };
  // 旧明文 / 旧 SHA-256 升级为加盐哈希；已加盐且匹配（pwRes===true）则无需写库
  if (pwRes !== true && pwRes !== u.password) {
    u.password = pwRes;
    await env.DB.prepare(
      "INSERT OR REPLACE INTO docs (key, value, updated_at) VALUES ('users', ?, datetime('now'))"
    ).bind(JSON.stringify(users)).run();
  }
  return { ok: true, token: await signToken(u.id), user: { id: u.id, name: u.name, role: u.role, mustChange: !!u.mustChange } };
}

// 公开注册：家长 / 访客申请账号（进入待审核）。
// 未登录也可调用，仅允许追加 status=pending 的 parent/guest 到 users 文档，绝不改他人数据。
async function docsRegister(request, env) {
  const body = await request.json();
  const role = body.role === "parent" ? "parent" : "guest";
  const name = String(body.name || "").trim();
  const account = String(body.account || "").trim();
  const password = String(body.password || "");
  if (!name || !account) return { ok: false, msg: "请填写姓名和登录账号" };
  // 只接受哈希（加盐或旧 SHA-256），绝不以明文入库
  if (!IS_HASH_RE.test(password) && !SALTED_RE.test(password)) return { ok: false, msg: "密码格式错误，请刷新重试" };

  const row = await env.DB.prepare("SELECT value FROM docs WHERE key = 'users'").first();
  let users = [];
  if (row) { try { users = JSON.parse(row.value); } catch (e) { return { ok: false, msg: "用户数据损坏" }; } }
  if (users.find((u) => u.account === account)) return { ok: false, msg: "该账号已被使用，请更换" };
  if (role === "parent") {
    if (!body.studentId || !body.studentName) return { ok: false, msg: "请选择要关联的学生" };
    if (!users.find((u) => u.id === body.studentId)) return { ok: false, msg: "关联的学生不存在" };
  }
  const contact = body.contact && typeof body.contact === "object" ? body.contact : { qq: "", email: "", phone: "" };
  const newU = {
    id: uid(role === "parent" ? "par" : "gst"),
    name, account, password, role, status: "pending",
    studentId: body.studentId || "", studentName: body.studentName || "",
    registerTs: new Date().toISOString(), score: 0,
    nickname: "", nickPending: "", avatar: "",
    department: "", departmentRole: "",
    contact, bio: "", personalImages: [], badges: [], groupId: "", mustChange: false,
  };
  users.push(newU);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO docs (key, value, updated_at) VALUES ('users', ?, datetime('now'))"
  ).bind(JSON.stringify(users)).run();
  return { ok: true, id: newU.id };
}

async function doLogin(request, env) {
  const { account, password } = await request.json();
  if (!account || !password) return { ok: false, msg: "请填写账号和密码" };
  const u = await env.DB.prepare("SELECT * FROM users WHERE account = ?").bind(account).first();
  if (!u) return { ok: false, msg: "账号不存在" };
  if ((await checkPassword(password, u.password_hash)) === null) return { ok: false, msg: "密码错误" };
  return {
    ok: true,
    token: await signToken(u.id),
    user: { id: u.id, name: u.name, role: u.role, mustChange: !!u.must_change },
  };
}

function me(auth) {
  return { ok: true, user: { id: auth.id, name: auth.name, role: auth.role, mustChange: !!auth.must_change, score: auth.score } };
}

async function changePassword(request, env, auth) {
  const { password } = await request.json();
  if (!password || password.length < 4) return { ok: false, msg: "密码至少 4 位" };
  const hash = await hashPassword(password);
  await env.DB.prepare("UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?").bind(hash, auth.id).run();
  return { ok: true };
}

// 用户仅可更新自己的个人字段（头像/昵称申请/简介/简介图/联系方式）。
// 不整表覆盖 users（普通同学无法写全表），却能确保个人数据持久化、不会丢失。
async function updateMe(request, env, auth) {
  const body = await request.json();
  const allowed = {};
  if (body.avatar !== undefined) allowed.avatar = String(body.avatar);
  if (body.nickPending !== undefined) allowed.nickPending = String(body.nickPending).slice(0, 12);
  if (body.bio !== undefined) allowed.bio = String(body.bio).slice(0, 120);
  if (body.contact !== undefined) allowed.contact = body.contact && typeof body.contact === "object" ? body.contact : {};
  if (Array.isArray(body.personalImages)) {
    allowed.personalImages = body.personalImages.slice(0, 12).map((it) =>
      typeof it === "string" ? { src: it, ts: new Date().toISOString() } : it
    );
  }
  // 仅允许用户更新自己的密码（哈希）与首次改密标记；绝不允许改 role/score 等
  // 密码哈希既可能是旧无盐 SHA-256(64hex)，也可能是新加盐 `盐.摘要`(32hex.64hex)
  if (body.password !== undefined && (/^[0-9a-f]{64}$/i.test(body.password) || SALTED_RE.test(body.password))) allowed.password = body.password;
  if (body.mustChange !== undefined) allowed.mustChange = !!body.mustChange;

  const row = await env.DB.prepare("SELECT value FROM docs WHERE key = 'users'").first();
  let users = [];
  if (row) { try { users = JSON.parse(row.value); } catch (e) { return json({ ok: false, msg: "用户数据损坏" }, 500); } }
  const idx = users.findIndex((u) => u.id === auth.id);
  if (idx < 0) return { ok: false, msg: "用户不存在" };
  users[idx] = Object.assign({}, users[idx], allowed);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO docs (key, value, updated_at) VALUES ('users', ?, datetime('now'))"
  ).bind(JSON.stringify(users)).run();
  return { ok: true };
}

async function leaderboard(env) {
  const rows = await env.DB.prepare("SELECT id, name, score FROM users WHERE role = 'student' ORDER BY score DESC").all();
  let rank = 0, prev = null;
  const list = rows.results.map((u, i) => {
    if (prev === null || u.score !== prev) rank = i + 1;
    prev = u.score;
    return { id: u.id, name: u.name, score: u.score, rank };
  });
  const meta = await env.DB.prepare("SELECT value FROM meta WHERE key = 'last'").first();
  let last = null, operator = "—";
  if (meta) { try { const m = JSON.parse(meta.value); last = m.ts; operator = m.operator; } catch (e) {} }
  return { ok: true, list, last, operator };
}

function canEdit(role) { return ["teacher", "admin", "monitor"].includes(role); }

async function applyDelta(request, env, auth) {
  if (!canEdit(auth.role)) return { ok: false, msg: "无权限修改分数" };
  const { studentId, delta, reason } = await request.json();
  const d = Math.round(Number(delta) * 100) / 100;
  if (!studentId || isNaN(d) || d === 0) return { ok: false, msg: "参数无效" };

  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").bind(studentId).first();
  if (!u) return { ok: false, msg: "目标学生不存在" };
  const after = Math.round((u.score + d) * 100) / 100;

  await env.DB.batch([
    env.DB.prepare("UPDATE users SET score = ? WHERE id = ?").bind(after, studentId),
    env.DB.prepare("INSERT INTO ledger (id, uid, name, delta, after, reason, operator, operator_role) VALUES (?,?,?,?,?,?,?,?)")
      .bind(uid("led"), studentId, u.name, d, after, reason || "手动调整", auth.name, auth.role),
  ]);
  await setMeta(env, auth);
  return { ok: true };
}

async function undoLast(env, auth) {
  if (!canEdit(auth.role)) return { ok: false, msg: "无权限" };
  const last = await env.DB.prepare("SELECT * FROM ledger ORDER BY rowid DESC LIMIT 1").first();
  if (!last) return { ok: false, msg: "没有可撤销的记录" };
  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(last.uid).first();
  const after = u ? Math.round((u.score - last.delta) * 100) / 100 : 0;
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET score = ? WHERE id = ?").bind(after, last.uid),
    env.DB.prepare("DELETE FROM ledger WHERE id = ?").bind(last.id),
    env.DB.prepare("INSERT INTO ledger (id, uid, name, delta, after, reason, operator, operator_role) VALUES (?,?,?,?,?,?,?,?)")
      .bind(uid("led"), last.uid, last.name, -last.delta, after, "撤销：" + last.reason + "（冲红）", auth.name, auth.role),
  ]);
  await setMeta(env, auth);
  return { ok: true };
}

async function applyRedeem(request, env, auth) {
  if (auth.role !== "student") return { ok: false, msg: "只有学生可申请兑换" };
  const { item, cost } = await request.json();
  const c = Math.round(Number(cost) * 100) / 100;
  if (!item || isNaN(c) || c <= 0) return { ok: false, msg: "参数无效" };
  await env.DB.prepare("INSERT INTO redeems (id, uid, name, item, cost, status) VALUES (?,?,?,?,?, 'pending')")
    .bind(uid("rd"), auth.id, auth.name, item, c).run();
  return { ok: true };
}

async function reviewRedeem(request, env, auth) {
  if (!canEdit(auth.role)) return { ok: false, msg: "无权限审批" };
  const { redeemId, approve, reason } = await request.json();
  const rd = await env.DB.prepare("SELECT * FROM redeems WHERE id = ?").bind(redeemId).first();
  if (!rd) return { ok: false, msg: "兑换单不存在" };
  if (rd.status !== "pending") return { ok: false, msg: "该单已处理" };

  const status = approve ? "approved" : "rejected";
  if (approve) {
    const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(rd.uid).first();
    const after = Math.round((u.score - rd.cost) * 100) / 100;
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET score = ? WHERE id = ?").bind(after, rd.uid),
      env.DB.prepare("INSERT INTO ledger (id, uid, name, delta, after, reason, operator, operator_role) VALUES (?,?,?,?,?,?,?,?)")
        .bind(uid("led"), rd.uid, rd.name, -rd.cost, after, "兑换扣分：" + rd.item, auth.name, auth.role),
      env.DB.prepare("UPDATE redeems SET status = ?, approve_ts = datetime('now'), operator = ?, reason = ? WHERE id = ?")
        .bind(status, auth.name, reason || (approve ? "兑换成功" : "兑换被拒"), redeemId),
    ]);
  } else {
    await env.DB.prepare("UPDATE redeems SET status = ?, approve_ts = datetime('now'), operator = ?, reason = ? WHERE id = ?")
      .bind(status, auth.name, reason || "兑换被拒", redeemId).run();
  }
  await setMeta(env, auth);
  return { ok: true };
}

async function offlineDeduct(request, env, auth) {
  if (!canEdit(auth.role)) return { ok: false, msg: "无权限" };
  const { studentId, item, cost, reason } = await request.json();
  const c = Math.round(Number(cost) * 100) / 100;
  if (!studentId || isNaN(c) || c <= 0) return { ok: false, msg: "参数无效" };
  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").bind(studentId).first();
  if (!u) return { ok: false, msg: "学生不存在" };
  const after = Math.round((u.score - c) * 100) / 100;
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET score = ? WHERE id = ?").bind(after, studentId),
    env.DB.prepare("INSERT INTO ledger (id, uid, name, delta, after, reason, operator, operator_role) VALUES (?,?,?,?,?,?,?,?)")
      .bind(uid("led"), studentId, u.name, -c, after, reason || ("线下兑换：" + (item || "奖品")), auth.name, auth.role),
    env.DB.prepare("INSERT INTO redeems (id, uid, name, item, cost, status, approve_ts, operator) VALUES (?,?,?,?,?, 'approved', datetime('now'), ?)")
      .bind(uid("rd"), studentId, u.name, item || "线下兑换", c, auth.name),
  ]);
  await setMeta(env, auth);
  return { ok: true };
}

async function myLedger(env, auth) {
  const rows = await env.DB.prepare("SELECT * FROM ledger WHERE uid = ? ORDER BY rowid DESC").bind(auth.id).all();
  return { ok: true, list: rows.results };
}

async function myRedeems(env, auth) {
  const rows = await env.DB.prepare("SELECT * FROM redeems WHERE uid = ? ORDER BY rowid DESC").bind(auth.id).all();
  return { ok: true, list: rows.results };
}

async function getMeta(env) {
  const meta = await env.DB.prepare("SELECT value FROM meta WHERE key = 'last'").first();
  if (!meta) return { ok: true, last: null, operator: "—" };
  try { const m = JSON.parse(meta.value); return { ok: true, last: m.ts, operator: m.operator }; }
  catch (e) { return { ok: true, last: null, operator: "—" }; }
}

async function setMeta(env, auth) {
  await env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last', ?)")
    .bind(JSON.stringify({ ts: new Date().toISOString(), operator: auth.name })).run();
}

// ============================================================
// 通用文档仓库：每个功能一份完整 JSON 文档
// GET /api/docs?keys=a,b   拉取指定文档（未存则返回 null）
// PUT /api/docs            整包保存 { key: value }（body 内传 perms 控制覆盖权限）
// POST /api/docs/bootstrap 首启一次性导入（种子；须带 seed 校验值，只能成功一次）
// POST /api/docs/reset     清空并重建种子（仅 admin/superadmin）
// ============================================================
function safeJson(v, fallback) {
  try { return JSON.parse(v); } catch (e) { return fallback; }
}

function isSuper(role) { return role === "admin" || role === "superadmin"; }

async function getDocs(request, env) {
  const url = new URL(request.url);
  const keys = (url.searchParams.get("keys") || "").split(",").filter(Boolean);
  const out = {};
  if (keys.length) {
    const rows = await env.DB.prepare(
      "SELECT key, value FROM docs WHERE key IN (" + keys.map(() => "?").join(",") + ")"
    ).bind(...keys).all();
    rows.results.forEach((r) => { out[r.key] = safeJson(r.value, null); });
  }
  return { ok: true, docs: out };
}

async function putDocs(request, env, auth) {
  // 覆盖权限：body.perms 里 key -> 'any'（登录即可写）| 'super'（仅管理）
  const body = await request.json();
  const docs = body.docs || {};
  const perms = body.perms || {};
  const names = Object.keys(docs);
  if (!names.length) return { ok: false, msg: "没有要保存的内容" };
  const canSuper = isSuper(auth.role);
  const batch = [];
  names.forEach((k) => {
    const p = perms[k] === "super" ? "super" : "any";
    if (p === "super" && !canSuper) return;
    batch.push(
      env.DB.prepare("INSERT OR REPLACE INTO docs (key, value, updated_at) VALUES (?, ?, datetime('now'))")
        .bind(k, JSON.stringify(docs[k]))
    );
  });
  if (!batch.length) return { ok: false, msg: "没有权限写入这些内容" };
  await env.DB.batch(batch);
  return { ok: true, saved: batch.length };
}

async function docsBootstrap(request, env) {
  const body = await request.json();
  if (body.seed !== "xinghe-2026-seed") return json({ ok: false, msg: "校验失败" }, 403);
  const docs = body.docs || {};
  const names = Object.keys(docs);
  if (!names.length) return { ok: false, msg: "没有内容" };
  // 已存在则拒绝，避免覆盖线上数据
  const existing = await env.DB.prepare(
    "SELECT key FROM docs WHERE key IN (" + names.map(() => "?").join(",") + ")"
  ).bind(...names).first();
  if (existing) return json({ ok: false, msg: "已初始化过，请勿重复导入" }, 409);
  const batch = names.map((k) =>
    env.DB.prepare("INSERT INTO docs (key, value, updated_at) VALUES (?, ?, datetime('now'))")
      .bind(k, JSON.stringify(docs[k]))
  );
  await env.DB.batch(batch);
  return { ok: true, imported: batch.length };
}

async function docsReset(request, env, auth) {
  if (!isSuper(auth.role)) return { ok: false, msg: "无权限" };
  const body = await request.json();
  if (body.seed !== "xinghe-2026-seed") return { ok: false, msg: "校验失败" };
  const docs = body.docs || {};
  const names = Object.keys(docs);
  const batch = [
    env.DB.prepare("DELETE FROM docs"),
  ].concat(names.map((k) =>
    env.DB.prepare("INSERT INTO docs (key, value, updated_at) VALUES (?, ?, datetime('now'))")
      .bind(k, JSON.stringify(docs[k]))
  ));
  await env.DB.batch(batch);
  return { ok: true, reset: names.length };
}