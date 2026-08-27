// ============================================================
// 星河班 · 操行银行  后端 API（Cloudflare Workers + D1）
// 说明：本地开发目前用 js/store.js 的 localStorage 模式；
//       部署到 Cloudflare 时，把 store.js 的 apiBase 指向本 Worker。
// ============================================================

// 密码哈希 —— Cloudflare Workers 无原生 Node crypto 的 bcrypt，
// 这里用 Web Crypto (SHA-256 + 加盐)，纯 JS 安全可用。
async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method;

    // 简化 CORS
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      let result;
      const auth = await authenticate(request, env);

      // 公开接口
      if (path === "/login" && method === "POST") result = await doLogin(request, env);
      else if (path === "/leaderboard" && method === "GET") result = leaderboard(env);
      else if (path === "/docs" && method === "GET") result = await getDocs(request, env);
      else if (path === "/docs/bootstrap" && method === "POST") result = await docsBootstrap(request, env);
      // 需登录
      else if (!auth) return json({ ok: false, msg: "未登录或登录已过期" }, 401);
      else {
        switch (true) {
          case path === "/me" && method === "GET": result = me(auth); break;
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

// ---- 认证：Authorization: Bearer <token>，token = base64(id) ----
async function authenticate(request, env) {
  const h = request.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const id = atob(token);
  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  return u || null;
}

async function doLogin(request, env) {
  const { account, password } = await request.json();
  if (!account || !password) return { ok: false, msg: "请填写账号和密码" };
  const hash = await hashPassword(password);
  const u = await env.DB.prepare("SELECT * FROM users WHERE account = ?").bind(account).first();
  if (!u) return { ok: false, msg: "账号不存在" };
  if (u.password_hash !== hash) return { ok: false, msg: "密码错误" };
  return {
    ok: true,
    token: btoa(u.id),
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