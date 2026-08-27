/* ============================================================
   星河班 · 操行银行 数据引擎（Store）
   - 本地模式：localStorage 持久化，可直接运行
   - 以后部署 Cloudflare 时，把 STORE.apiBase 指向 Worker 地址
     即可切换为后端 API 模式（无需改页面逻辑）
   ============================================================ */

const STORE = (function () {
  // —— 部署配置 ——
  // 本地开发：null（用 localStorage）。
  // 上线：填后端 Worker 地址（已绑定自定义域名，国内可直接访问）
  const apiBase = "https://xinghe-api.tenyearmc.top/api";

  // 后端模式下的会话 / 同步标记
  const TOKEN_KEY = "xh_api_token";
  const SYNC_KEY = "xh_sync_ready";

  const KEY = {
    users: "xh_users",
    ledger: "xh_ledger",
    redeems: "xh_redeems",
    meta: "xh_meta",
    session: "xh_session",
    news: "xh_news",
    media: "xh_media",
    reports: "xh_reports",      // 纪检：匿名举报
    cases: "xh_cases",          // 纪检：案件公示
    articles: "xh_articles",    // 编辑部：新闻/小报
    meds: "xh_meds",            // 医疗部：公告
    albums: "xh_albums",        // 宣传部：相册
    notices: "xh_notices",      // 通知公告
    duty: "xh_duty",            // 值日表
    wall: "xh_wall",            // 悄悄话墙
    votes: "xh_votes",          // 投票/问卷
    groups: "xh_groups",        // 小组
    stars: "xh_stars",          // 周之星/月之星
    wishes: "xh_wishes",        // 心愿/兑换目标
    signups: "xh_signups",      // 活动接龙/报名
    licenses: "xh_licenses",    // 市场监督管理局：营业执照
    products: "xh_products",    // 商店：商品
    treasury: "xh_treasury",    // 商店：公共池（老师商品积分流入）
    orders: "xh_orders",        // 商店：订单记录
    logs: "xh_logs",            // 管理员操作日志
    gallery: "xh_gallery",      // 公开相册：成员/家长共同上传
    seedVer: "xh_seed_ver",
  };

  const SEED_VERSION = 8; // 数据版本：改动种子结构时 +1，触发重新初始化（8：部署前彻底清空测试数据）
  const DEFAULT_PWD = "123456";

  /* ---------- 部门配置 ---------- */
  const DEPTS = {
    xuanchuan: { name: "宣传部", title: "相册管理", desc: "班级照片采集与发布", page: "department.html?dept=xuanchuan" },
    jiwei:     { name: "纪检部", title: "纪检公示", desc: "近期案件处理结果公示", page: "department.html?dept=jiwei" },
    bianji:    { name: "编辑部", title: "新闻 · 星河小报", desc: "班级报纸发布与新闻", page: "department.html?dept=bianji" },
    yiliao:    { name: "医疗部", title: "医疗公告", desc: "健康与医疗通知发布", page: "department.html?dept=yiliao" },
    shichang:  { name: "市场监督管理局", title: "市场监督管理局", desc: "营业执照审批 · 商店监管", page: "shop.html" },
  };

  function isDeptMember(u, dept) { return !!(u && u.department === dept && (u.departmentRole === "member" || u.departmentRole === "minister")); }
  function isMinister(u, dept) { return !!(u && u.department === dept && u.departmentRole === "minister"); }

  // 部门成员可编辑（草稿）：班主任/超管 或 本部门成员/部长
  function canEditDept(dept) {
    const s = getSession(); if (!s) return false;
    if (isSuperAdmin(s.role)) return true;
    const u = findById(s.id); return isDeptMember(u, dept);
  }
  // 可发布/删除（需部长确认）：班主任/超管 或 本部门部长
  function canApproveDept(dept) {
    const s = getSession(); if (!s) return false;
    if (isSuperAdmin(s.role)) return true;
    const u = findById(s.id); return isMinister(u, dept);
  }

  /* ---------- 本地后端模拟（Cloudflare 部署后替换为 fetch） ---------- */
  // 本地写入底层：仅写 localStorage，不做任何同步（供同步引擎内部使用）
  function lsWrite(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  // 数据写入入口：远程模式下写数据键后自动推送到服务端
  function lsSet(k, v) {
    lsWrite(k, v);
    if (isRemote() && k !== KEY.session && k !== KEY.seedVer) {
      dirtyKeys.add(k);
      pushDocs();
    }
  }
  function lsGet(k, def) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }

  /* ---------- 远程模式（Cloudflare Worker + D1） ---------- */
  // 写路径(seed.xxx)：带 STORE.xxx = y 的写函数（如 users, news, gallery…）
  // 写入后需 resyncDocs() 把所有可写文档从服务端拉回本地，保持多人同步。
  function isRemote() { return !!apiBase; }
  function apiToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setApiToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  // 向服务端换取不可伪造的签名令牌（id.HMAC-SHA256(id)，密钥在 Worker 侧）。
  // 成功即存；离线或未配置密钥时回退为旧 base64(id)，保证可用但不承诺防伪。
  async function fetchSignedToken(account, password) {
    try {
      const r = await fetch(apiBase + "/docs/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: account, password: password }),
      });
      const d = await r.json();
      if (d && d.ok && d.token) return d.token;
    } catch (e) { /* 网络失败走回退 */ }
    return null;
  }

  // 把本地数据推送到服务端；未登录或非写权限会静默跳过（下次同步再补）。
  // 仅推送“本会话内实际修改过”的数据键（dirty），避免登录时把陈旧的本地快照
  // 覆盖掉其他同学在服务端的最新数据。
  const dirtyKeys = new Set();
  async function pushDocs() {
    if (!isRemote()) return;
    const token = apiToken();
    if (!token) return;
    if (!dirtyKeys.size) return;
    const keys = [...dirtyKeys];
    const docs = {};
    const perms = {};
    keys.forEach((k) => {
      if (k === "seedVer" || k === "session") return;
      const v = lsGet(KEY[k], null);
      if (v === null) return;
      if (k === "users") {
        // 用户表含积分/角色：仅计分权限角色（教师/班委/管理）可覆盖，防普通同学篡改全班数据
        const s = getSession();
        const canScore = s && ["teacher", "admin", "monitor", "superadmin"].indexOf(s.role) >= 0;
        docs[k] = v;
        perms[k] = canScore ? "any" : "super";
      } else { docs[k] = v; perms[k] = "any"; }
    });
    if (!Object.keys(docs).length) return;
    try {
      await fetch(apiBase + "/docs", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ docs, perms }),
      });
      keys.forEach((k) => dirtyKeys.delete(k));
    } catch (e) { /* 网络失败时静默保留 dirty，下次再试 */ }
  }

  // 把服务端可写文档全部拉回本地，并做同步后的标记与刷新。
  let syncing = null;
  async function resyncDocs() {
    if (!isRemote()) return;
    if (syncing) return syncing;
    syncing = (async () => {
      try {
        const token = apiToken();
        const resp = await fetch(apiBase + "/docs?keys=" + encodeURIComponent(
          Object.keys(KEY).filter((k) => k !== "seedVer" && k !== "session").join(",")
        ), { headers: token ? { Authorization: "Bearer " + token } : {} });
        const data = await resp.json();
        if (data && data.ok && data.docs) {
          Object.keys(data.docs).forEach((k) => {
            let v = data.docs[k];
            if (v === null || typeof v === "undefined") return;
            // 用户表合并：保留当前登录用户本人的本地个人数据（头像/简介/个人图/联系方式/未审昵称申请），
            // 避免服务端拉取把本地刚改过、尚未同步的内容覆盖掉，确保重登不丢数据。
            if (k === "users") v = mergeUsersOnSync(v);
            // 登录页在无 token 时也需要用户表来完成客户端校验，故始终拉取
            lsWrite(KEY[k] || k, v); // 用底层写入，避免触发 pushDocs 造成循环推送
          });
        }
        try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch (e) {}
      } catch (e) { /* 服务端不可用时保持本地 */ }
      finally { syncing = null; }
    })();
    return syncing;
  }

  // 把当前用户的个人字段单独推送到服务端（头像/昵称申请/简介/个人图/联系方式）。
  // 普通同学无法整表写 users，走 /me/update 只更新自己的字段，防止重登后个人数据丢失。
  async function pushMe(patch) {
    if (!isRemote()) return;
    const token = apiToken();
    if (!token) return;
    try {
      await fetch(apiBase + "/me/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(patch),
      });
    } catch (e) { /* 网络失败时静默，下次再试 */ }
  }

  // 服务端用户表合并：仅对“当前登录用户”合并其本人可编辑、且只由本人修改的字段，
  // 其余用户与字段一律以服务端为准，避免覆盖他人或管理员的数据。
  function mergeUsersOnSync(serverUsers) {
    if (!Array.isArray(serverUsers)) return serverUsers;
    const s = getSession();
    const localUsers = lsGet(KEY.users, []);
    if (!s || !Array.isArray(localUsers)) return serverUsers;
    const li = localUsers.findIndex((u) => u && u.id === s.id);
    if (li < 0) return serverUsers;
    const local = localUsers[li] || {};
    const si = serverUsers.findIndex((u) => u && u.id === s.id);
    if (si < 0) return serverUsers;
    const server = serverUsers[si];
    if (local.avatar) server.avatar = local.avatar;
    if (local.bio) server.bio = local.bio;
    if (local.contact && Object.values(local.contact).some(Boolean)) server.contact = local.contact;
    if (Array.isArray(local.personalImages) && local.personalImages.length) server.personalImages = local.personalImages;
    if (local.nickPending) server.nickPending = local.nickPending; // 未审昵称申请本地优先
    if (!server.nickname && local.nickname) server.nickname = local.nickname; // 服务端无昵称时保留本地
    if (!server.password && local.password) server.password = local.password;
    if (local.mustChange === true) server.mustChange = true;
    serverUsers[si] = server;
    return serverUsers;
  }
  function lastSyncedAt() { try { return Number(localStorage.getItem(SYNC_KEY) || 0); } catch (e) { return 0; } }
  function syncReady() { return lastSyncedAt() > 0; }
  async function waitSync(ms) {
    if (!isRemote()) return;
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 2500)) {
      if (syncReady()) return;
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  /* ---------- 工具 ---------- */
  function now() { return new Date().toISOString(); }
  function uid(prefix) { return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8); }
  function fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function fmtMoney(v) {
    v = Number(v) || 0;
    const neg = v < 0;
    const a = Math.abs(v).toFixed(2);
    return neg ? "-" + a : a;
  }

  /* ---------- 密码哈希（SHA-256，绝不存明文） ---------- */
  // 与后端 worker.js 的 hashPassword 保持一致（64 位小写 hex），便于前后端互通。
  async function hashPassword(pw) {
    const s = String(pw == null ? "" : pw);
    try {
      if (typeof crypto !== "undefined" && crypto.subtle) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) { /* 退到同步兜底 */ }
    // 极旧 / 非安全上下文兜底：保证不漏明文。正常部署(https/localhost)不会走到这里。
    return syncHashFallback(s);
  }
  // 同步兜底哈希（仅在本机无 Web Crypto 时使用，防控明文）
  function syncHashFallback(s) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2, 33) ^ c;
    }
    return "sync-" + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }
  // 判断数据库中密码是否已是哈希（而非旧明文）
  function isHashed(pw) {
    return typeof pw === "string" && (/^[0-9a-f]{64}$/i.test(pw) || /^sync-/.test(pw));
  }

  /* ---------- 初始化种子 ---------- */
  async function ensureSeeded() {
    // 远程模式（部署后端）：本地不再自我初始化，只等待服务端同步
    if (isRemote()) {
      await remoteBootstrap();
      await resyncDocs();
      return;
    }
    // 版本迁移：种子结构变化时，清除旧数据重新初始化
    if (Number(lsGet(KEY.seedVer, 0)) !== SEED_VERSION) {
      [
        KEY.users, KEY.ledger, KEY.redeems, KEY.meta, KEY.news, KEY.media,
        KEY.reports, KEY.cases, KEY.articles, KEY.meds, KEY.albums, KEY.notices, KEY.duty,
        KEY.wall, KEY.votes, KEY.groups,
        KEY.stars, KEY.wishes, KEY.signups, KEY.licenses, KEY.products,
        KEY.treasury, KEY.orders, KEY.logs, KEY.gallery,
      ].forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(KEY.seedVer, String(SEED_VERSION));
    }
    if (lsGet(KEY.users, null)) return;
    const [students, teachers] = await Promise.all([
      fetch("data/students.json").then((r) => r.json()),
      fetch("data/teachers.json").then((r) => r.json()),
    ]);
    // 统一用哈希存初始密码，绝不落明文
    const defHash = await hashPassword(DEFAULT_PWD);
    const users = [];
    students.forEach((s, i) => {
      users.push({
        id: "stu-" + i,
        name: s.name,
        account: s.account,
        password: defHash,
        role: s.superadmin ? "superadmin" : "student",
        score: s.score,
        nickname: "",
        nickPending: "",
        avatar: "",
        department: "",
        departmentRole: "",
        contact: { qq: "", email: "", phone: "" },
        bio: "",
        personalImages: [],
        badges: [],
        groupId: "",
        mustChange: true,
      });
    });
    teachers.forEach((t, i) => {
      users.push({
        id: "tea-" + i,
        name: t.name,
        account: t.account,
        password: defHash,
        role: t.head ? "admin" : "teacher",
        subject: t.subject,
        score: 0,
        nickname: "",
        nickPending: "",
        avatar: "",
        department: "",
        departmentRole: "",
        contact: { qq: "", email: "", phone: "" },
        bio: "",
        personalImages: [],
        badges: [],
        groupId: "",
        mustChange: true,
      });
    });
    lsSet(KEY.users, users);
    lsSet(KEY.ledger, []);
    lsSet(KEY.redeems, []);
    lsSet(KEY.news, []);
    lsSet(KEY.media, []);
    lsSet(KEY.reports, []);
    lsSet(KEY.cases, []);
    lsSet(KEY.articles, []);
    lsSet(KEY.meds, []);
    lsSet(KEY.notices, []);
    lsSet(KEY.duty, []);
    lsSet(KEY.wall, []);
    lsSet(KEY.votes, []);
    lsSet(KEY.stars, []);
    lsSet(KEY.wishes, []);
    lsSet(KEY.signups, []);
    lsSet(KEY.licenses, []);
    lsSet(KEY.products, []);
    lsSet(KEY.treasury, []);
    lsSet(KEY.orders, []);

    // 小组：来自《7.1班分组.xlsx》核对后分组（仅第一~七组，第八组以表为准暂不导入）
    const groupData = [
      { leader: "柴丽欣",   members: ["何汶锦", "刘慕辰", "陈劲豪", "周廷翰", "赵晨雅", "汤程杰"] },
      { leader: "李张涵",   members: ["李雨婷", "郑翀", "张芝清", "谢沂萱", "李文芳"] },
      { leader: "李欣桐",   members: ["孙明远", "吴优", "梁书宁", "韦尚轩", "马睿瞳", "吴亦翾"] },
      { leader: "李俊娴",   members: ["吴明慧", "洪晨竣", "付楚珵", "邹奕宁", "郑雨嘉"] },
      { leader: "杨骐羽",   members: ["王翼航", "杨萌", "杨雯瑶", "赵翌旭", "杨馨", "杨天泽"] },
      { leader: "康寇佳琦", members: ["王煜滢", "单立安", "陈天和", "李静苒", "焦柔溪", "宋晟睿"] },
      { leader: "闫熙曼",   members: ["徐开萍", "许文昊", "云健凌", "何兆轩", "徐立凡", "关茗心"] },
    ];
    const groups = groupData.map((g, i) => {
      const id = "grp-" + (i + 1);
      const lead = users.find((u) => u.name === g.leader);
      if (lead) { lead.groupId = id; }
      const members = g.members
        .map((mn) => { const u = users.find((x) => x.name === mn); if (u) { u.groupId = id; } return u ? { id: u.id, name: u.name } : null; })
        .filter(Boolean);
      return {
        id: id,
        name: "第" + (i + 1) + "组",
        leaderId: lead ? lead.id : null,
        leaderName: g.leader,
        members: members,
        note: "组长：" + g.leader,
      };
    });
    lsSet(KEY.groups, groups);

    // 宣传部相册：从 image/class 静态目录导入 107 张已发布照片
    const photos = [];
    for (let i = 1; i <= 107; i++) {
      const n = String(i).padStart(2, "0");
      photos.push({ src: "image/class/" + n + ".jpg", caption: "班级掠影", status: "published" });
    }
    lsSet(KEY.albums, [{
      id: uid("alb"),
      name: "班级风采掠影",
      author: "系统",
      createdTs: now(),
      photos,
      status: "published",
    }]);

    lsSet(KEY.meta, { lastUpdate: now(), lastOperator: "系统初始化" });
  }

  /* ---------- 远程首启：把本地种子一次性导入 D1（只成功一次） ---------- */
  // 部署后首个访问者（任意人）触发；若已被导入过则跳过，改为拉取服务端数据。
  async function remoteBootstrap() {
    const marker = lsGet(KEY.seedVer, 0);
    if (marker) return; // 本地已初始化过（或已同步过），不重复导入
    try {
      // 复用本地种子逻辑生成一遍种子文档（与 ensureSeeded 本地分支一致）
      const seed = await buildSeedDocs();
      const resp = await fetch(apiBase + "/docs/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: "xinghe-2026-seed", docs: seed }),
      });
      const data = await resp.json();
      if (data && data.ok) {
        Object.keys(seed).forEach((k) => lsSet(KEY[k], seed[k]));
      }
      // 无论导入成功(首启)还是 409(已存在)，都写标记，避免重复尝试
      lsSet(KEY.seedVer, String(SEED_VERSION));
    } catch (e) { /* 网络失败则保持本地，下次再试 */ }
  }

  // 生成一份与本地种子一致的文档集合（users 直接读 data/*.json 数据文件）。
  async function buildSeedDocs() {
    const [students, teachers] = await Promise.all([
      fetch("data/students.json").then((r) => r.json()),
      fetch("data/teachers.json").then((r) => r.json()),
    ]);
    // 初始密码统一存为哈希，绝不落明文
    const defHash = await hashPassword(DEFAULT_PWD);
    const users = [];
    students.forEach((s, i) => {
      users.push({
        id: "stu-" + i, name: s.name, account: s.account, password: defHash,
        role: s.superadmin ? "superadmin" : "student", score: s.score,
        nickname: "", nickPending: "", avatar: "", department: "", departmentRole: "",
        contact: { qq: "", email: "", phone: "" }, bio: "", personalImages: [], badges: [],
        groupId: "", mustChange: true,
      });
    });
    teachers.forEach((t, i) => {
      users.push({
        id: "tea-" + i, name: t.name, account: t.account, password: defHash,
        role: t.head ? "admin" : "teacher", subject: t.subject, score: 0,
        nickname: "", nickPending: "", avatar: "", department: "", departmentRole: "",
        contact: { qq: "", email: "", phone: "" }, bio: "", personalImages: [], badges: [],
        groupId: "", mustChange: true,
      });
    });
    const photos = [];
    for (let i = 1; i <= 107; i++) {
      const n = String(i).padStart(2, "0");
      photos.push({ src: "image/class/" + n + ".jpg", caption: "班级掠影", status: "published" });
    }
    // 小组：与本地种子一致
    const groupData = [
      { leader: "柴丽欣",   members: ["何汶锦", "刘慕辰", "陈劲豪", "周廷翰", "赵晨雅", "汤程杰"] },
      { leader: "李张涵",   members: ["李雨婷", "郑翀", "张芝清", "谢沂萱", "李文芳"] },
      { leader: "李欣桐",   members: ["孙明远", "吴优", "梁书宁", "韦尚轩", "马睿瞳", "吴亦翾"] },
      { leader: "李俊娴",   members: ["吴明慧", "洪晨竣", "付楚珵", "邹奕宁", "郑雨嘉"] },
      { leader: "杨骐羽",   members: ["王翼航", "杨萌", "杨雯瑶", "赵翌旭", "杨馨", "杨天泽"] },
      { leader: "康寇佳琦", members: ["王煜滢", "单立安", "陈天和", "李静苒", "焦柔溪", "宋晟睿"] },
      { leader: "闫熙曼",   members: ["徐开萍", "许文昊", "云健凌", "何兆轩", "徐立凡", "关茗心"] },
    ];
    const groups = groupData.map((g, i) => {
      const id = "grp-" + (i + 1);
      const lead = users.find((u) => u.name === g.leader);
      if (lead) { lead.groupId = id; }
      const members = g.members
        .map((mn) => { const u = users.find((x) => x.name === mn); if (u) { u.groupId = id; } return u ? { id: u.id, name: u.name } : null; })
        .filter(Boolean);
      return {
        id, name: "第" + (i + 1) + "组",
        leaderId: lead ? lead.id : null, leaderName: g.leader,
        members, note: "组长：" + g.leader,
      };
    });
    return {
      users,
      groups,
      ledger: [],
      redeems: [],
      news: [],
      media: [],
      reports: [],
      cases: [],
      articles: [],
      meds: [],
      notices: [],
      duty: [],
      wall: [],
      votes: [],
      stars: [],
      wishes: [],
      signups: [],
      licenses: [],
      products: [],
      treasury: [],
      orders: [],
      albums: [{ id: uid("alb"), name: "班级风采掠影", author: "系统", createdTs: now(), photos, status: "published" }],
      meta: { lastUpdate: now(), lastOperator: "系统初始化" },
    };
  }

  /* ---------- 数据读取 ---------- */
  function getUsers() { return lsGet(KEY.users, []); }
  function getLedger() { return lsGet(KEY.ledger, []); }
  function getRedeems() { return lsGet(KEY.redeems, []); }
  function getMeta() { return lsGet(KEY.meta, { lastUpdate: null, lastOperator: "—" }); }
  function getSession() { return lsGet(KEY.session, null); }

  function saveUsers(u) { lsSet(KEY.users, u); }
  function saveLedger(l) { lsSet(KEY.ledger, l); }
  function saveRedeems(r) { lsSet(KEY.redeems, r); }
  function saveMeta(m) { lsSet(KEY.meta, m); }

  function findByAccount(account) {
    return getUsers().find((u) => u.account === account);
  }
  function findById(id) {
    return getUsers().find((u) => u.id === id);
  }

  /* ---------- 认证 ---------- */
  async function login(account, password) {
    const users = getUsers();
    const u = users.find((x) => x.account === account);
    if (!u) return { ok: false, msg: "账号不存在" };
    let upgraded = false;
    // 已哈希：比对哈希；旧明文：兼容比对，成功后自动升级为哈希存储
    if (isHashed(u.password)) {
      if ((await hashPassword(password)) !== u.password) return { ok: false, msg: "密码错误" };
    } else {
      if (u.password !== password) return { ok: false, msg: "密码错误" };
      u.password = await hashPassword(password); // 明文 → 哈希升级
      saveUsers(users);
      upgraded = true;
    }
    if (u.status === "pending") return { ok: false, msg: "该账号待班主任审核，通过后方可登录" };
    if (u.status === "rejected") return { ok: false, msg: "该注册申请未通过审核" };
    const session = {
      id: u.id, account: u.account, name: u.name, role: u.role,
      nickname: u.nickname, avatar: u.avatar, mustChange: u.mustChange,
    };
    lsSet(KEY.session, session);
    // 远程模式：向服务端换取签名令牌；换取失败回退 base64(id)
    if (isRemote()) {
      let token = await fetchSignedToken(u.account, password);
      if (!token) { try { token = btoa(u.id); } catch (e) { token = ""; } }
      setApiToken(token);
      if (upgraded) pushMe({ password: u.password, mustChange: u.mustChange }); // 明文升级后的哈希推到服务端
      pushDocs(); // 把本会话内修改过的数据推送到服务端
      resyncDocs();
    }
    return { ok: true, user: session };
  }
  function logout() {
    localStorage.removeItem(KEY.session);
    setApiToken("");
    dirtyKeys.clear();
  }

  function refreshSession() {
    const s = getSession();
    if (!s) return null;
    const u = findById(s.id);
    if (!u) return null;
    const nu = {
      id: u.id, account: u.account, name: u.name, role: u.role,
      nickname: u.nickname, avatar: u.avatar, mustChange: u.mustChange,
    };
    lsSet(KEY.session, nu);
    return nu;
  }

  /* ---------- 家长 / 访客注册（需班主任审核） ---------- */
  // 生成家长/访客的默认用户骨架
  function mkMember(role, name, account, password, extra) {
    const u = {
      id: uid(role === "parent" ? "par" : "gst"),
      name: String(name || "").trim(),
      account: String(account || "").trim(),
      password: String(password || ""),
      role: role,
      status: "pending",
      studentId: "",
      studentName: "",
      registerTs: now(),
      score: 0,
      nickname: "", nickPending: "", avatar: "",
      department: "", departmentRole: "",
      contact: { qq: "", email: "", phone: "" },
      bio: "", personalImages: [], badges: [], groupId: "",
      mustChange: false,
    };
    if (extra) Object.assign(u, extra);
    return u;
  }
  // 注册（家长/访客）
  async function register(payload) {
    const role = payload.role === "parent" ? "parent" : "guest";
    const name = String(payload.name || "").trim();
    const account = String(payload.account || "").trim();
    const password = String(payload.password || "");
    if (!name) return { ok: false, msg: "请填写姓名" };
    if (!account) return { ok: false, msg: "请填写登录账号" };
    if (password.length < 4) return { ok: false, msg: "密码至少 4 位" };
    if (findByAccount(account)) return { ok: false, msg: "该账号已被使用，请更换" };

    const pwdHash = await hashPassword(password); // 只存哈希，不存明文
    const users = getUsers();
    if (role === "parent") {
      const sid = payload.studentId;
      const child = users.find((x) => x.id === sid);
      if (!child) return { ok: false, msg: "请选择要关联的学生" };
      users.push(mkMember("parent", name, account, pwdHash, { studentId: child.id, studentName: child.name, contact: { qq: "", email: "", phone: account } }));
    } else {
      users.push(mkMember("guest", name, account, pwdHash));
    }
    saveUsers(users);
    return { ok: true, msg: "注册申请已提交，请等待班主任审核" };
  }
  // 待审核注册列表
  function pendingRegistrations() {
    return getUsers().filter((u) => u.role === "parent" || u.role === "guest");
  }
  // 审核注册申请
  function reviewRegister(uid, approve) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "仅班主任/超管可审核" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u || (u.role !== "parent" && u.role !== "guest")) return { ok: false, msg: "该用户不存在或非注册用户" };
    u.status = approve ? "approved" : "rejected";
    saveUsers(users);
    logAction(approve ? "通过注册" : "驳回注册", (u.role === "parent" ? "家长" : "访客") + " " + u.name + "（账号 " + u.account + "）");
    return { ok: true };
  }
  // 家长：获取自己关联的孩子
  function myChild() {
    const s = getSession();
    if (!s || s.role !== "parent") return null;
    const u = findById(s.id);
    if (!u || !u.studentId) return null;
    return findById(u.studentId);
  }

  async function changePassword(newPwd) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.password = await hashPassword(newPwd); // 只存哈希
    u.mustChange = false;
    saveUsers(users);
    pushMe({ password: u.password, mustChange: false });
    s.mustChange = false;
    lsSet(KEY.session, s);
    return { ok: true };
  }

  // 跳过首次改密（保留原密码，仅清除强制标记）
  function skipPasswordChange() {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.mustChange = false;
    saveUsers(users);
    pushMe({ mustChange: false });
    s.mustChange = false;
    lsSet(KEY.session, s);
    return { ok: true };
  }

  /* ---------- 权限 ---------- */
  // 可编辑操行银行：教师/班委/管理员/超级管理员
  function canEditRole(role) { return ["teacher", "admin", "monitor", "superadmin"].includes(role); }
  // 超级管理员（可进后台）：admin（班主任）与 superadmin（陈劲豪）
  function isSuperAdmin(role) { return role === "admin" || role === "superadmin"; }
  // 管理员级别（用于操作日志查看权限）：超管=3 班主任=2 教师/班委=1 其余=0
  function roleRank(role) {
    if (role === "superadmin") return 3;
    if (role === "admin") return 2;
    if (role === "teacher" || role === "monitor") return 1;
    return 0;
  }

  /* ---------- 管理员操作日志 ---------- */
  function logAction(action, detail) {
    const s = getSession();
    if (!s) return;
    const logs = lsGet(KEY.logs, []);
    logs.push({
      id: uid("log"), ts: now(),
      operator: s.name, operatorRole: s.role, operatorRank: roleRank(s.role),
      action: action || "操作", detail: detail || "",
    });
    if (logs.length > 600) logs.splice(0, logs.length - 600);
    lsSet(KEY.logs, logs);
  }
  // 读取日志（最新在前）。查看权限：仅班主任/超管（最高级管理员）
  function getLogs() {
    const s = getSession();
    if (!s || !isSuperAdmin(s.role)) return { ok: false, msg: "仅最高级管理员可查看操作日志" };
    const logs = lsGet(KEY.logs, []).slice().reverse();
    return { ok: true, list: logs };
  }
  // 清空日志（仅超级管理员本人）
  function clearLogs() {
    const s = getSession();
    if (!s || s.role !== "superadmin") return { ok: false, msg: "仅超级管理员可清空操作日志" };
    lsSet(KEY.logs, []);
    return { ok: true };
  }

  /* ---------- 排行榜（含排名、并列同名次、最后更新时间） ---------- */
  function leaderboard() {
    const users = getUsers().filter((u) => u.role === "student" || u.role === "superadmin");
    const sorted = [...users].sort((a, b) => b.score - a.score);
    let rank = 0, prev = null;
    sorted.forEach((u, i) => {
      if (prev === null || u.score !== prev) rank = i + 1;
      u.rank = rank;
      prev = u.score;
    });
    return sorted;
  }

  // 显示名（昵称优先，其次真实姓名）
  function displayName(u) { return u?.nickname || u?.name || ""; }

  /* ---------- 分数更新（教师/班委/管理，即时生效+可撤销） ---------- */
  function applyDelta(studentId, delta, reason, category) {
    const op = getSession();
    if (!op) return { ok: false, msg: "未登录" };
    if (!canEditRole(op.role)) return { ok: false, msg: "无权限修改分数" };
    if (!studentId || !delta) return { ok: false, msg: "参数不完整" };

    const users = getUsers();
    const u = users.find((x) => x.id === studentId);
    if (!u || (u.role !== "student" && u.role !== "superadmin")) return { ok: false, msg: "目标学生不存在" };

    const dNum = Math.round(Number(delta) * 100) / 100;
    if (isNaN(dNum) || dNum === 0) return { ok: false, msg: "变动值无效" };
    const cat = ["学习", "纪律", "卫生", "仪容仪表", "考勤", "综合素质", "其它"].indexOf(category) >= 0 ? category : "";

    u.score = Math.round((u.score + dNum) * 100) / 100;

    const ledger = getLedger();
    const rec = {
      id: uid("led"), uid: u.id, name: u.name,
      delta: dNum, after: u.score, reason: reason || "手动调整",
      category: cat, operator: op.name, operatorRole: op.role, ts: now(),
    };
    ledger.push(rec);

    saveUsers(users);
    saveLedger(ledger);
    setMeta(op.name);
    logAction((dNum > 0 ? "增加" : "扣除") + "操行分", u.name + " " + (dNum > 0 ? "+" : "") + dNum + " 分 → " + u.score + " 分（" + (cat || "未分类") + " · " + (reason || "手动调整") + "）");
    return { ok: true, record: rec };
  }

  /* ---------- 撤销最近一次分数变动 ---------- */
  function undoLast() {
    const op = getSession();
    if (!op) return { ok: false, msg: "未登录" };
    if (!canEditRole(op.role)) return { ok: false, msg: "无权限" };

    const ledger = getLedger();
    if (!ledger.length) return { ok: false, msg: "没有可撤销的记录" };
    const last = ledger.pop();

    const users = getUsers();
    const u = users.find((x) => x.id === last.uid);
    if (u) {
      u.score = Math.round((u.score - last.delta) * 100) / 100;
    }
    const rec = {
      id: uid("led"), uid: last.uid, name: last.name,
      delta: -last.delta, after: u ? u.score : 0,
      reason: "撤销：" + last.reason + "（冲红）",
      operator: op.name, operatorRole: op.role, ts: now(),
    };
    ledger.push(rec);

    saveUsers(users);
    saveLedger(ledger);
    setMeta(op.name);
    logAction("撤销加分", last.name + "，内容：" + last.reason);
    return { ok: true, undone: last, record: rec };
  }

  function setMeta(operator) {
    saveMeta({ lastUpdate: now(), lastOperator: operator });
  }

  /* ---------- 兑换 ---------- */
  // 学生自助申请
  function applyRedeem(item, cost) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    if (s.role !== "student" && s.role !== "superadmin") return { ok: false, msg: "只有学生可申请兑换" };
    if (!item || !cost) return { ok: false, msg: "请填写兑换项目和所需积分" };
    const costNum = Math.round(Number(cost) * 100) / 100;
    if (isNaN(costNum) || costNum <= 0) return { ok: false, msg: "积分值无效" };

    const redeems = getRedeems();
    redeems.push({
      id: uid("rd"), uid: s.id, name: s.name, item, cost: costNum,
      status: "pending", applyTs: now(), approveTs: null, operator: null, reason: null,
    });
    saveRedeems(redeems);
    return { ok: true };
  }

  // 审批（通过则扣分；拒绝仅标记）
  function reviewRedeem(redeemId, approve, reason) {
    const op = getSession();
    if (!op) return { ok: false, msg: "未登录" };
    if (!canEditRole(op.role)) return { ok: false, msg: "无权限审批" };

    const redeems = getRedeems();
    const rd = redeems.find((x) => x.id === redeemId);
    if (!rd) return { ok: false, msg: "兑换单不存在" };
    if (rd.status !== "pending") return { ok: false, msg: "该单已处理" };

    rd.status = approve ? "approved" : "rejected";
    rd.approveTs = now();
    rd.operator = op.name;
    rd.reason = reason || (approve ? "兑换成功" : "兑换被拒");

    if (approve) {
      const users = getUsers();
      const u = users.find((x) => x.id === rd.uid);
      if (!u) return { ok: false, msg: "学生不存在" };
      u.score = Math.round((u.score - rd.cost) * 100) / 100;
      saveUsers(users);

      const ledger = getLedger();
      ledger.push({
        id: uid("led"), uid: u.id, name: u.name,
        delta: -rd.cost, after: u.score, reason: "兑换扣分：" + rd.item,
        operator: op.name, operatorRole: op.role, ts: now(),
      });
      saveLedger(ledger);
      setMeta(op.name);
    }
    saveRedeems(redeems);
    logAction(approve ? "批准兑换" : "驳回兑换", "学生 " + rd.name + " 兑换 " + rd.item + "（" + rd.cost + " 分）");
    return { ok: true, redeem: rd };
  }

  // 线下直接扣分（老师直接操作，等价于 applyDelta 负值，但语义更明确）
  function offlineDeduct(studentId, item, cost, reason) {
    const op = getSession();
    if (!op) return { ok: false, msg: "未登录" };
    if (!canEditRole(op.role)) return { ok: false, msg: "无权限" };
    const costNum = Math.round(Number(cost) * 100) / 100;
    if (!studentId || !costNum || costNum <= 0) return { ok: false, msg: "参数不完整" };

    const users = getUsers();
    const u = users.find((x) => x.id === studentId);
    if (!u) return { ok: false, msg: "学生不存在" };
    u.score = Math.round((u.score - costNum) * 100) / 100;
    saveUsers(users);

    const ledger = getLedger();
    ledger.push({
      id: uid("led"), uid: u.id, name: u.name,
      delta: -costNum, after: u.score, reason: reason || ("线下兑换：" + (item || "奖品")),
      operator: op.name, operatorRole: op.role, ts: now(),
    });
    saveLedger(ledger);
    setMeta(op.name);
    return { ok: true };
  }

  /* ---------- 查询 ---------- */
  function myLedger() {
    const s = getSession();
    if (!s) return [];
    return getLedger().filter((r) => r.uid === s.id).slice().reverse();
  }
  function myRedeems() {
    const s = getSession();
    if (!s) return [];
    return getRedeems().filter((r) => r.uid === s.id).slice().reverse();
  }

  /* ---------- 昵称（需管理员审核） ---------- */
  function requestNickname(nick) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    const nickStr = String(nick || "").trim();
    if (!nickStr) return { ok: false, msg: "昵称不能为空" };
    if (nickStr.length > 12) return { ok: false, msg: "昵称请在 12 字以内" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.nickPending = nickStr;
    saveUsers(users);
    pushMe({ nickPending: nickStr });
    return { ok: true };
  }

  function reviewNickname(uid, approve) {
    const op = getSession();
    if (!op) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(op.role)) return { ok: false, msg: "无审核权限" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    if (approve) {
      u.nickname = u.nickPending;
      u.nickPending = "";
    } else {
      u.nickPending = "";
    }
    saveUsers(users);
    return { ok: true };
  }

  function pendingNicknames() {
    return getUsers().filter((u) => u.nickPending).map((u) => ({
      id: u.id, name: u.name, nickPending: u.nickPending, currentNick: u.nickname || u.name,
    }));
  }

  /* ---------- 头像（本地演示：存 base64；上线走 R2） ---------- */
  function setAvatar(dataUrl) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    if (!dataUrl || !String(dataUrl).startsWith("data:image")) return { ok: false, msg: "图片无效" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.avatar = dataUrl;
    saveUsers(users);
    pushMe({ avatar: dataUrl });
    refreshSession();
    return { ok: true };
  }

  /* ---------- 管理员：用户管理 ---------- */
  function adminListUsers() {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    return { ok: true, list: getUsers() };
  }
  function adminUpdateRole(uid, newRole) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    const valid = ["student", "teacher", "monitor", "admin", "superadmin", "parent", "guest"];
    if (!valid.includes(newRole)) return { ok: false, msg: "角色无效" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.role = newRole;
    saveUsers(users);
    logAction("调整角色", u.name + " → " + newRole);
    return { ok: true };
  }
  // 班主任/超管：分配部门与部门职务
  function adminUpdateDept(uid, department, departmentRole) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    const depts = Object.keys(DEPTS);
    u.department = depts.includes(department) ? department : "";
    u.departmentRole = u.department ? (["member", "minister"].includes(departmentRole) ? departmentRole : "member") : "";
    saveUsers(users);
    logAction("分配部门", u.name + " → " + (u.department ? (DEPTS[u.department]?.name || u.department) + "·" + (u.departmentRole === "minister" ? "部长" : "成员") : "无部门"));
    return { ok: true };
  }
  // 当前会话用户归属的部门页（普通同学无部门则返回 null）
  function myDepartment() {
    const s = getSession(); if (!s) return null;
    const u = findById(s.id);
    if (!u || !u.department || (u.departmentRole !== "member" && u.departmentRole !== "minister")) return null;
    return { id: u.department, ...DEPTS[u.department], role: u.departmentRole };
  }
  function adminResetPassword(uid) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    // 重置为默认密码的哈希
    hashPassword(DEFAULT_PWD).then((h) => {
      u.password = h;
      u.mustChange = true;
      saveUsers(users);
    });
    logAction("重置密码", u.name + "（重置为初始密码）");
    return { ok: true };
  }

  /* ---------- 管理员：新闻管理 ---------- */
  function getNews() { return lsGet(KEY.news, []); }
  function saveNews(list) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    lsSet(KEY.news, list);
    return { ok: true };
  }
  function addNews(item) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    if (!item || !item.title || !item.content) return { ok: false, msg: "标题与内容不能为空" };
    const list = getNews();
    list.unshift({ id: uid("news"), title: item.title, content: item.content, date: item.date || now(), ts: now() });
    lsSet(KEY.news, list);
    return { ok: true, list };
  }
  function deleteNews(id) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    lsSet(KEY.news, getNews().filter((n) => n.id !== id));
    return { ok: true };
  }

  /* ---------- 管理员：媒体/相册管理 ---------- */
  function getMedia() { return lsGet(KEY.media, []); }
  function addMedia(item) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    if (!item || !item.src) return { ok: false, msg: "图片不能为空" };
    const list = getMedia();
    list.unshift({ id: uid("media"), src: item.src, caption: item.caption || "", album: item.album || "班级风采", ts: now() });
    lsSet(KEY.media, list);
    return { ok: true, list };
  }
  function deleteMedia(id) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    lsSet(KEY.media, getMedia().filter((m) => m.id !== id));
    return { ok: true };
  }

  /* ============================================================
     用户中心：联系方式 / 简介 / 个人图片
     ============================================================ */
  function updateProfile({ contact, bio }) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    if (contact) {
      u.contact = u.contact || { qq: "", email: "", phone: "" };
      if (contact.qq !== undefined) u.contact.qq = String(contact.qq);
      if (contact.email !== undefined) u.contact.email = String(contact.email);
      if (contact.phone !== undefined) u.contact.phone = String(contact.phone);
    }
    if (bio !== undefined) u.bio = String(bio || "").slice(0, 120);
    saveUsers(users);
    pushMe({ contact: u.contact, bio: u.bio });
    refreshSession();
    return { ok: true };
  }

  function addPersonalImage(dataUrl) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!dataUrl || !String(dataUrl).startsWith("data:image")) return { ok: false, msg: "图片无效" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.personalImages = u.personalImages || [];
    if (u.personalImages.length >= 12) return { ok: false, msg: "最多上传 12 张" };
    u.personalImages.push({ src: dataUrl, ts: now() });
    saveUsers(users);
    pushMe({ personalImages: u.personalImages });
    return { ok: true };
  }
  function deletePersonalImage(index) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u || !u.personalImages) return { ok: false, msg: "用户不存在" };
    u.personalImages.splice(Number(index), 1);
    saveUsers(users);
    pushMe({ personalImages: u.personalImages });
    return { ok: true };
  }

  /* ============================================================
     部门内容通用流（案件公示/编辑部文章/医疗公告）
     status: draft → pending(待部长审核) → published
     普通成员：新建/编辑草稿、提交审核；部长/超管：直接发布、审核通过/驳回、删除
     ============================================================ */
  const DEPT_STORE_KEYS = {
    jiwei: KEY.cases,
    bianji: KEY.articles,
    yiliao: KEY.meds,
  };
  function getDeptItems(deptId) {
    const k = DEPT_STORE_KEYS[deptId];
    return k ? lsGet(k, []) : [];
  }
  function saveDeptItems(deptId, list) { lsSet(DEPT_STORE_KEYS[deptId], list); }

  function deptItem(deptId, id) { return getDeptItems(deptId).find((x) => x.id === id); }

  // 新建（草稿 / 有权限则直接发布）
  function addDeptItem(deptId, fields) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditDept(deptId)) return { ok: false, msg: "你不属于该部门，无法操作" };
    const direct = canApproveDept(deptId);
    const item = {
      id: uid("dpt"),
      dept: deptId,
      ...fields,
      status: direct ? "published" : "pending",
      authorId: s.id,
      author: s.name,
      authorName: s.nickname || s.name,
      createdTs: now(),
      reviewTs: direct ? now() : null,
      reviewer: direct ? s.name : null,
    };
    const list = getDeptItems(deptId);
    list.unshift(item);
    saveDeptItems(deptId, list);
    return { ok: true, item, msg: direct ? "已直接发布" : "已保存草稿并提交部长审核" };
  }

  // 编辑草稿（仅本人或超管）
  function updateDeptItem(deptId, id, fields) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditDept(deptId)) return { ok: false, msg: "无编辑权限" };
    const list = getDeptItems(deptId);
    const item = list.find((x) => x.id === id);
    if (!item) return { ok: false, msg: "内容不存在" };
    if (item.authorId !== s.id && !isSuperAdmin(s.role)) return { ok: false, msg: "仅作者本人可编辑" };
    Object.keys(fields).forEach((k2) => { if (k2 !== "status" && k2 !== "id" && k2 !== "dept") item[k2] = fields[k2]; });
    item.status = canApproveDept(deptId) ? "published" : "pending";
    item.reviewTs = canApproveDept(deptId) ? now() : null;
    item.reviewer = canApproveDept(deptId) ? s.name : item.reviewer;
    saveDeptItems(deptId, list);
    return { ok: true, msg: item.status === "published" ? "已更新并发布" : "已更新并重新提交审核" };
  }

  // 审核：部长/超管 通过或驳回
  function reviewDeptItem(deptId, id, approve) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canApproveDept(deptId)) return { ok: false, msg: "需要部长权限才能审核" };
    const list = getDeptItems(deptId);
    const item = list.find((x) => x.id === id);
    if (!item) return { ok: false, msg: "内容不存在" };
    if (approve) { item.status = "published"; item.reviewTs = now(); item.reviewer = s.name; }
    else { item.status = "rejected"; item.reviewTs = now(); item.reviewer = s.name; }
    saveDeptItems(deptId, list);
    return { ok: true };
  }
  // 删除（需部长/超管）
  function deleteDeptItem(deptId, id) {
    if (!canApproveDept(deptId)) return { ok: false, msg: "需要部长权限才能删除" };
    saveDeptItems(deptId, getDeptItems(deptId).filter((x) => x.id !== id));
    return { ok: true };
  }

  /* ============================================================
     纪检：匿名举报（全站登录用户可提交，仅纪检成员可见）
     ============================================================ */
  function myReports() { return lsGet(KEY.reports, []); }
  function submitReport(fields) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    if (!fields || (!fields.target && !fields.detail)) return { ok: false, msg: "请填写涉案人员或案情经过至少一项" };
    const list = myReports();
    list.unshift({
      id: uid("rep"), ts: now(),
      target: fields.target || "",       // 涉案人员
      detail: fields.detail || "",       // 案情经过
      evidence: fields.evidence || [],   // 图片佐证
      other: fields.other || "",         // 其他说明
      reporter: "",                      // 匿名，不记录身份
      status: "open",
    });
    saveReport(list);
    return { ok: true };
  }
  function saveReport(list) { lsSet(KEY.reports, list); }
  // 纪检成员将某举报标记为已受理/归档
  function markReport(id, status) {
    if (!canEditDept("jiwei")) return { ok: false, msg: "仅纪检部可处理" };
    const list = myReports();
    const r = list.find((x) => x.id === id);
    if (r) { r.status = status || "closed"; }
    saveReport(list);
    return { ok: true };
  }

  /* ============================================================
     宣传部：相册（后台传相册；部长/超管发布删除）
     ============================================================ */
  function getAlbums() { return lsGet(KEY.albums, []); }
  function saveAlbums(list) { lsSet(KEY.albums, list); }
  function addAlbum(name) {
    if (!canEditDept("xuanchuan")) return { ok: false, msg: "无宣传部权限" };
    if (!name) return { ok: false, msg: "请输入相册名称" };
    const list = getAlbums();
    list.unshift({ id: uid("alb"), name, author: getSession().name, createdTs: now(), photos: [], status: canApproveDept("xuanchuan") ? "published" : "pending" });
    saveAlbums(list);
    return { ok: true };
  }
  function addAlbumPhoto(albumId, dataUrl, caption) {
    if (!canEditDept("xuanchuan")) return { ok: false, msg: "无宣传部权限" };
    const list = getAlbums();
    const a = list.find((x) => x.id === albumId);
    if (!a) return { ok: false, msg: "相册不存在" };
    a.photos.push({ src: dataUrl, caption: caption || "", status: canApproveDept("xuanchuan") ? "published" : "pending", ts: now() });
    saveAlbums(list);
    return { ok: true };
  }
  function reviewAlbumPhoto(albumId, photoIndex, approve) {
    if (!canApproveDept("xuanchuan")) return { ok: false, msg: "需部长权限" };
    const list = getAlbums();
    const a = list.find((x) => x.id === albumId);
    if (!a) return { ok: false, msg: "相册不存在" };
    const p = a.photos[Number(photoIndex)];
    if (p) p.status = approve ? "published" : "rejected";
    saveAlbums(list);
    return { ok: true };
  }
  function deleteAlbumPhoto(albumId, photoIndex) {
    if (!canApproveDept("xuanchuan")) return { ok: false, msg: "需部长权限" };
    const list = getAlbums();
    const a = list.find((x) => x.id === albumId);
    if (a) a.photos.splice(Number(photoIndex), 1);
    saveAlbums(list);
    return { ok: true };
  }
  function deleteAlbum(albumId) {
    if (!canApproveDept("xuanchuan")) return { ok: false, msg: "需部长权限" };
    saveAlbums(getAlbums().filter((x) => x.id !== albumId));
    return { ok: true };
  }
  // 全部已发布照片（相册页展示）
  function allPublishedPhotos() {
    const out = [];
    getAlbums().forEach((a) => a.photos.forEach((p) => { if (p.status === "published") out.push({ src: p.src, caption: p.caption, album: a.name }); }));
    return out;
  }

  /* ---------- 公开相册（成员 / 家长共同上传） ---------- */
  function galleryGet() { return lsGet(KEY.gallery, { albums: [], photos: [] }); }
  function gallerySave(g) { lsSet(KEY.gallery, g); }
  // 可上传：登录且非访客（本班成员 + 家长）
  function canUploadGallery() {
    const s = getSession();
    if (!s) return false;
    return s.role !== "guest";
  }
  function galleryCreateAlbum(name) {
    if (!canUploadGallery()) return { ok: false, msg: "请先登录（本班成员或家长可上传）" };
    name = String(name || "").trim();
    if (!name) return { ok: false, msg: "请输入相册名称" };
    const s = getSession();
    const g = galleryGet();
    if (g.albums.some((a) => a.name === name)) return { ok: false, msg: "已存在同名相册" };
    g.albums.unshift({ id: uid("gal"), name, authorId: s.id, authorName: s.nickname || s.name, ts: now() });
    gallerySave(g);
    return { ok: true, albumId: g.albums[0].id };
  }
  function galleryUpload(albumId, dataUrl, name) {
    if (!canUploadGallery()) return { ok: false, msg: "请先登录（本班成员或家长可上传）" };
    const s = getSession();
    const g = galleryGet();
    if (!g.albums.some((x) => x.id === albumId)) return { ok: false, msg: "相册不存在" };
    g.photos.push({ id: uid("gp"), albumId, name: name || "未命名", src: dataUrl, uploaderId: s.id, uploaderName: s.nickname || s.name, ts: now() });
    gallerySave(g);
    return { ok: true };
  }
  function galleryCanManage(photo) {
    const s = getSession();
    if (!s) return false;
    if (isSuperAdmin(s.role) || s.role === "admin") return true;
    return !!(photo && photo.uploaderId === s.id);
  }
  function galleryRename(photoId, newName) {
    newName = String(newName || "").trim();
    if (!newName) return { ok: false, msg: "请输入名称" };
    const g = galleryGet();
    const p = g.photos.find((x) => x.id === photoId);
    if (!p) return { ok: false, msg: "照片不存在" };
    if (!galleryCanManage(p)) return { ok: false, msg: "仅上传者或管理员可修改" };
    p.name = newName;
    gallerySave(g);
    return { ok: true };
  }
  function galleryDeletePhoto(photoId) {
    const g = galleryGet();
    const p = g.photos.find((x) => x.id === photoId);
    if (!p) return { ok: false, msg: "照片不存在" };
    if (!galleryCanManage(p)) return { ok: false, msg: "仅上传者或管理员可删除" };
    g.photos = g.photos.filter((x) => x.id !== photoId);
    gallerySave(g);
    return { ok: true };
  }
  function galleryDeleteAlbum(albumId) {
    const s = getSession();
    if (!s) return { ok: false, msg: "请先登录" };
    if (!(isSuperAdmin(s.role) || s.role === "admin")) return { ok: false, msg: "仅管理员可删除相册" };
    const g = galleryGet();
    g.albums = g.albums.filter((a) => a.id !== albumId);
    g.photos = g.photos.filter((p) => p.albumId !== albumId);
    gallerySave(g);
    return { ok: true };
  }

  /* ============================================================
     通知公告：班主任/超管发布，所有人可见
     ============================================================ */
  function getNotices() { return lsGet(KEY.notices, []); }
  function addNotice(title, content) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(s.role)) return { ok: false, msg: "仅班主任/超管可发布通知" };
    if (!title || !content) return { ok: false, msg: "标题与内容不能为空" };
    const list = getNotices();
    list.unshift({ id: uid("nt"), title, content, author: s.name, ts: now() });
    lsSet(KEY.notices, list);
    return { ok: true, list };
  }
  function deleteNotice(id) {
    if (!isSuperAdmin(getSession()?.role)) return { ok: false, msg: "无权限" };
    lsSet(KEY.notices, getNotices().filter((n) => n.id !== id));
    return { ok: true };
  }

  /* ============================================================
     值日表：班委及以上可维护，所有人可见
     ============================================================ */
  function getDuty() { return lsGet(KEY.duty, []); }
  function addDutyShift(row) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditRole(s.role)) return { ok: false, msg: "无权限维护值日表" };
    if (!row || !row.date || !row.group) return { ok: false, msg: "日期与值日小组不能为空" };
    const list = getDuty();
    list.push({ id: uid("du"), date: row.date, group: row.group, members: row.members || [], note: row.note || "", ts: now() });
    lsSet(KEY.duty, list.sort((a, b) => String(a.date).localeCompare(String(b.date))));
    return { ok: true };
  }
  function deleteDutyShift(id) {
    if (!canEditRole(getSession()?.role)) return { ok: false, msg: "无权限" };
    lsSet(KEY.duty, getDuty().filter((d) => d.id !== id));
    return { ok: true };
  }

  /* ============================================================
     勋章/称号：班主任/超管手动授予
     ============================================================ */
  function grantBadge(uid, name) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(s.role)) return { ok: false, msg: "仅班主任/超管可授予" };
    const n = String(name || "").trim(); if (!n) return { ok: false, msg: "称号不能为空" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.badges = u.badges || [];
    if (u.badges.some((b) => b.name === n)) return { ok: false, msg: "已授予该称号" };
    u.badges.push({ id: uid("bdg"), name: n, grantBy: s.name, ts: now() });
    saveUsers(users);
    if (u.id === s.id) refreshSession();
    return { ok: true };
  }
  function revokeBadge(uid, badgeId) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(s.role)) return { ok: false, msg: "仅班主任/超管可撤销" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.badges = (u.badges || []).filter((b) => b.id !== badgeId);
    saveUsers(users);
    if (u.id === s.id) refreshSession();
    return { ok: true };
  }

  /* ============================================================
     小组：组长已登记，组员开学后补充
     ============================================================ */
  function getGroups() { return lsGet(KEY.groups, []); }
  function saveGroups(list) { lsSet(KEY.groups, list); }
  // 管理员/班委：把某同学加入某小组（或移除）
  function setUserGroup(uid, groupId) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(s.role) && s.role !== "monitor") return { ok: false, msg: "无权限" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    const groups = getGroups();
    // 从原有小组中移除
    groups.forEach((g) => { g.members = g.members.filter((m) => m.id !== uid); if (g.leaderId === uid) g.leaderId = null; });
    if (groupId) {
      const g = groups.find((x) => x.id === groupId);
      if (!g) return { ok: false, msg: "小组不存在" };
      if (g.leaderId !== uid && !g.members.some((m) => m.id === uid)) g.members.push({ id: uid, name: u.name });
    }
    u.groupId = groupId || "";
    saveGroups(groups);
    saveUsers(users);
    return { ok: true };
  }
  // 小组积分统计（组长+组员）
  function groupStats() {
    const users = getUsers();
    return getGroups().map((g) => {
      const ids = [g.leaderId].concat(g.members.map((m) => m.id)).filter(Boolean);
      let sum = 0;
      ids.forEach((id) => { const u = users.find((x) => x.id === id); if (u) sum += u.score || 0; });
      return {
        id: g.id, name: g.name, leaderName: g.leaderName,
        memberCount: ids.length, scoreSum: Math.round(sum * 100) / 100,
      };
    }).sort((a, b) => b.scoreSum - a.scoreSum);
  }

  /* ============================================================
     悄悄话墙：公开、即投即公开、可指向同学/老师/部门
     ============================================================ */
  function getWall() { return lsGet(KEY.wall, []); }
  function postWall({ toType, toName, text }) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const t = String(text || "").trim();
    if (!t) return { ok: false, msg: "内容不能为空" };
    if (t.length > 200) return { ok: false, msg: "内容最长 200 字" };
    const list = getWall();
    list.unshift({
      id: uid("wl"),
      toType: toType || "class",
      toName: toName || "",
      text: t,
      ts: now(),
    });
    lsSet(KEY.wall, list);
    return { ok: true };
  }
  function deleteWall(id) {
    if (!isSuperAdmin(getSession()?.role)) return { ok: false, msg: "仅超管可删除" };
    lsSet(KEY.wall, getWall().filter((w) => w.id !== id));
    return { ok: true };
  }

  /* ============================================================
     投票/问卷：班主任/超管、班委发起，实名投票
     ============================================================ */
  function getVotes() { return lsGet(KEY.votes, []); }
  function saveVotes(list) { lsSet(KEY.votes, list); }
  function canManageVotes(role) { return isSuperAdmin(role) || role === "monitor"; }
  function createVote({ title, options, allowMulti, endDate, deadline }) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canManageVotes(s.role)) return { ok: false, msg: "仅班主任/超管/班委可发起投票" };
    if (!title || !options || !options.length) return { ok: false, msg: "标题与选项不能为空" };
    const opts = options.map((o) => ({ text: String(o), count: 0 }));
    if (opts.length < 2) return { ok: false, msg: "至少需要 2 个选项" };
    const list = getVotes();
    list.unshift({
      id: uid("vt"),
      title: String(title),
      options: opts,
      allowMulti: !!allowMulti,
      open: true,
      createBy: s.name,
      createTs: now(),
      deadline: endDate || deadline || "",
      responses: [],
    });
    saveVotes(list);
    return { ok: true, vote: list[0] };
  }
  // 实名投票（每人限一次）
  function castVote(voteId, picks) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    if (s.role !== "student" && s.role !== "superadmin") return { ok: false, msg: "仅同学可投票" };
    const list = getVotes();
    const v = list.find((x) => x.id === voteId);
    if (!v) return { ok: false, msg: "投票不存在" };
    if (!v.open) return { ok: false, msg: "投票已结束" };
    if (v.responses.some((r) => r.uid === s.id)) return { ok: false, msg: "你已投过票" };
    const idxs = (Array.isArray(picks) ? picks : [picks]).map(Number);
    if (!v.allowMulti && idxs.length > 1) return { ok: false, msg: "该投票仅单选" };
    idxs.forEach((i) => { if (v.options[i]) v.options[i].count += 1; });
    v.responses.push({ uid: s.id, name: s.name, picks: idxs });
    saveVotes(list);
    return { ok: true };
  }
  function closeVote(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canManageVotes(s.role)) return { ok: false, msg: "无权限" };
    const list = getVotes();
    const v = list.find((x) => x.id === id);
    if (v) v.open = false;
    saveVotes(list);
    return { ok: true };
  }
  function myVote(voteId) {
    const s = getSession(); if (!s) return null;
    const v = getVotes().find((x) => x.id === voteId);
    if (!v) return null;
    const r = v.responses.find((x) => x.uid === s.id);
    return r ? r : null;
  }

  /* ============================================================
     成长档案：积分+勋章+作品+悄悄话祝福+小组统计 聚合
     ============================================================ */
  function archive(userId) {
    const u = findById(userId);
    if (!u) return null;
    const works = [];
    getDeptItems("bianji").forEach((it) => {
      if (it.status === "published" && it.authorId === userId) {
        works.push({ type: "新闻·小报", title: it.title, date: it.createdTs });
      }
    });
    const publishedPhotos = allPublishedPhotos();
    const photos = publishedPhotos.filter((p) => p.caption && p.authorId === userId).length;
    const greetings = getWall().filter((w) => w.toType === "student" && w.toName === u.name).length;
    const group = getGroups().find((g) => g.leaderId === userId || g.members.some((m) => m.id === userId)) || null;
    return {
      user: u,
      score: u.score || 0,
      badges: u.badges || [],
      works,
      photoCount: photos,
      greetings,
      group,
      groupStats: groupStats(),
    };
  }

  /* ============================================================
     激励体系：三维榜单（时段）· 批量评分 · 周/月之星 · 心愿 · 成长时间线
     ============================================================ */
  // 周期起始时间（周从周一起、月从 1 号起）
  function periodStart(period) {
    const d = new Date();
    if (period === "week") {
      const w = new Date(d);
      w.setDate(w.getDate() - ((w.getDay() + 6) % 7));
      w.setHours(0, 0, 0, 0);
      return w.toISOString();
    }
    if (period === "month") return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01T00:00:00.000Z";
    return null; // all：用当前总分
  }
  // 某生某周期所得分（all = 当前总分；week/month = 周期内净变动）
  function studentGain(uid, period) {
    const u = findById(uid);
    if (!u) return 0;
    if (period === "all") return u.score || 0;
    const from = periodStart(period);
    let sum = 0;
    getLedger().forEach((r) => { if (r.uid === uid && r.ts >= from) sum += r.delta || 0; });
    return Math.round(sum * 100) / 100;
  }
  // 个人榜（按周期得分排序，含并列名次）
  function rankPeriod(period) {
    const list = getUsers()
      .filter((u) => u.role === "student" || u.role === "superadmin")
      .map((u) => ({ id: u.id, name: u.name, nickname: u.nickname, groupId: u.groupId, groupName: "", score: studentGain(u.id, period) }));
    const sorted = [...list].sort((a, b) => b.score - a.score);
    let rank = 0, prev = null;
    sorted.forEach((u, i) => { if (prev === null || u.score !== prev) rank = i + 1; u.rank = rank; prev = u.score; });
    const gmap = {};
    getGroups().forEach((g) => { gmap[g.id] = g.name; });
    sorted.forEach((u) => { u.groupName = gmap[u.groupId] || ""; });
    return sorted;
  }
  // 小组榜（按周期小组成分合计排序）
  function groupRank(period) {
    const gains = {};
    getGroups().forEach((g) => { gains[g.id] = 0; });
    rankPeriod(period).forEach((x) => { if (x.groupId && gains[x.groupId] !== undefined) gains[x.groupId] += x.score; });
    return getGroups()
      .map((g) => ({ id: g.id, name: g.name, leaderName: g.leaderName, members: g.members.length + (g.leaderId ? 1 : 0), score: Math.round((gains[g.id] || 0) * 100) / 100 }))
      .sort((a, b) => b.score - a.score);
  }
  // 批量评分（老师/班委：多选一次加减分）
  function batchApplyDelta(studentIds, delta, reason, category) {
    const op = getSession(); if (!op) return { ok: false, msg: "未登录" };
    if (!canEditRole(op.role)) return { ok: false, msg: "无权限修改分数" };
    const d = Math.round(Number(delta) * 100) / 100;
    if (isNaN(d) || d === 0) return { ok: false, msg: "变动值无效" };
    const cat = ["学习", "纪律", "卫生", "仪容仪表", "考勤", "综合素质", "其它"].indexOf(category) >= 0 ? category : "";
    const ids = (Array.isArray(studentIds) ? studentIds : [studentIds]).filter(Boolean);
    if (!ids.length) return { ok: false, msg: "请选择同学" };
    const users = getUsers(), ledger = getLedger();
    let n = 0;
    ids.forEach((id) => {
      const u = users.find((x) => x.id === id);
      if (!u || (u.role !== "student" && u.role !== "superadmin")) return;
      u.score = Math.round((u.score + d) * 100) / 100;
      ledger.push({ id: uid("led"), uid: u.id, name: u.name, delta: d, after: u.score, reason: reason || "批量评分", category: cat, operator: op.name, operatorRole: op.role, ts: now() });
      n++;
    });
    saveUsers(users); saveLedger(ledger);
    if (n) setMeta(op.name);
    logAction("批量" + (d > 0 ? "加分" : "扣分"), n + " 位同学 " + (d > 0 ? "+" : "") + d + " 分（" + (cat || "未分类") + "）");
    return { ok: true, count: n };
  }

  // 周之星 / 月之星
  function getStars() { return lsGet(KEY.stars, []); }
  function setStar(type, userId, reason) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(s.role)) return { ok: false, msg: "仅班主任/超管可评选" };
    const u = findById(userId); if (!u) return { ok: false, msg: "用户不存在" };
    const t = type === "month" ? "month" : "week";
    const list = getStars();
    list.unshift({ id: uid("st"), type: t, uid: userId, name: u.name, nickname: u.nickname, reason: String(reason || "").trim(), grantBy: s.name, ts: now() });
    lsSet(KEY.stars, list);
    return { ok: true };
  }
  function currentStar(type) { const l = getStars().filter((s) => s.type === type); return l.length ? l[0] : null; }
  function revokeStar(id) {
    if (!isSuperAdmin(getSession()?.role)) return { ok: false, msg: "无权限" };
    lsSet(KEY.stars, getStars().filter((s) => s.id !== id));
    return { ok: true };
  }

  // 心愿 / 兑换目标
  function getWishes() { return lsGet(KEY.wishes, []); }
  function myWishes() { const s = getSession(); if (!s) return []; return getWishes().filter((w) => w.uid === s.id).slice().reverse(); }
  function addWish({ title, cost }) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const t = String(title || "").trim();
    const c = Math.round(Number(cost) * 100) / 100;
    if (!t) return { ok: false, msg: "请填写目标名称" };
    if (isNaN(c) || c <= 0) return { ok: false, msg: "请填写目标积分" };
    const list = getWishes();
    list.unshift({ id: uid("ws"), uid: s.id, name: s.nickname || s.name, title: t, cost: c, done: false, ts: now() });
    lsSet(KEY.wishes, list);
    return { ok: true };
  }
  function toggleWish(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const list = getWishes(); const w = list.find((x) => x.id === id);
    if (!w) return { ok: false, msg: "目标不存在" };
    if (w.uid !== s.id && !isSuperAdmin(s.role)) return { ok: false, msg: "无权限" };
    w.done = !w.done; lsSet(KEY.wishes, list); return { ok: true };
  }
  function deleteWish(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const list = getWishes(); const w = list.find((x) => x.id === id);
    if (!w) return { ok: false, msg: "目标不存在" };
    if (w.uid !== s.id && !isSuperAdmin(s.role)) return { ok: false, msg: "无权限" };
    lsSet(KEY.wishes, list.filter((x) => x.id !== id)); return { ok: true };
  }

  // 成长时间线：积分/称号/作品/悄悄话/兑换 串成一条
  function timeline(userId) {
    const u = findById(userId); if (!u) return [];
    const ev = [];
    getLedger().forEach((r) => { if (r.uid === userId) ev.push({ ts: r.ts, icon: "score", title: "积分变动", text: (r.delta > 0 ? "+" : "") + r.delta + " 分 · " + r.reason, after: r.after }); });
    (u.badges || []).forEach((b) => ev.push({ ts: b.ts, icon: "badge", title: "获得称号", text: b.name + "（" + b.grantBy + " 授予）" }));
    getDeptItems("bianji").forEach((it) => { if (it.status === "published" && it.authorId === userId) ev.push({ ts: it.createdTs, icon: "work", title: "发布作品", text: "《" + it.title + "》· 编辑部" }); });
    getWall().forEach((w) => { if (w.toType === "student" && w.toName === u.name) ev.push({ ts: w.ts, icon: "love", title: "收到悄悄话", text: w.text }); });
    getRedeems().forEach((r) => { if (r.uid === userId) ev.push({ ts: r.applyTs, icon: "shop", title: "兑换申请", text: r.item + "（" + r.cost + " 分 · " + (r.status === "approved" ? "已通过" : r.status === "rejected" ? "未通过" : "待审批") + "）" }); });
    getWishes().forEach((w) => { if (w.uid === userId) ev.push({ ts: w.ts, icon: "wish", title: "立下心愿", text: "攒 " + w.cost + " 分，兑换「" + w.title + "」" }); });
    return ev.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  }

  /* ============================================================
     活动接龙 / 报名（班委/老师发起，同学报名）
     ============================================================ */
  function getSignups() { return lsGet(KEY.signups, []); }
  function canManageSignup(role) { return isSuperAdmin(role) || role === "monitor" || role === "teacher"; }
  function createSignup({ title, desc, items, deadline }) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canManageSignup(s.role)) return { ok: false, msg: "仅班委/老师可发起接龙" };
    if (!title) return { ok: false, msg: "请填写接龙标题" };
    const list = getSignups();
    list.unshift({ id: uid("sg"), title: String(title), desc: String(desc || ""), items: (items || []).map((t) => String(t)).filter(Boolean), deadline: deadline || "", open: true, createBy: s.name, createTs: now(), responses: [] });
    lsSet(KEY.signups, list);
    return { ok: true, signup: list[0] };
  }
  function signupRespond(id, { choice, note }) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const list = getSignups(); const sg = list.find((x) => x.id === id);
    if (!sg) return { ok: false, msg: "接龙不存在" };
    if (!sg.open) return { ok: false, msg: "接龙已结束" };
    const rec = { uid: s.id, name: s.nickname || s.name, choice: String(choice || ""), note: String(note || "") };
    const i = sg.responses.findIndex((r) => r.uid === s.id);
    if (i >= 0) sg.responses[i] = rec; else sg.responses.push(rec);
    lsSet(KEY.signups, list);
    return { ok: true };
  }
  function mySignup(id) {
    const s = getSession(); if (!s) return null;
    const sg = getSignups().find((x) => x.id === id);
    return sg ? sg.responses.find((r) => r.uid === s.id) || null : null;
  }
  function closeSignup(id) {
    const s = getSession(); if (!s || !canManageSignup(s.role)) return { ok: false, msg: "无权限" };
    const list = getSignups(); const sg = list.find((x) => x.id === id);
    if (sg) sg.open = false;
    lsSet(KEY.signups, list); return { ok: true };
  }

  /* ============================================================
     市场监督管理局 + 商店（营业执照 / 商品 / 审批）
     ============================================================ */
  function getLicenses() { return lsGet(KEY.licenses, []); }
  function getProducts() { return lsGet(KEY.products, []); }
  // 用户已持有的有效执照
  function userLicense(uid) { return getLicenses().find((l) => l.uid === uid) || null; }
  function approvedLicense(uid) { return getLicenses().find((l) => l.uid === uid && l.status === "approved") || null; }
  // 能否开店发布商品：老师/超管免执照；学生须持已审批执照
  function canPublish(uid) {
    const u = findById(uid); if (!u) return false;
    if (u.role === "teacher" || u.role === "admin" || u.role === "superadmin") return true;
    return !!approvedLicense(uid);
  }
  function applyLicense({ scope, applicant, staff }) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const list = getLicenses();
    if (list.some((l) => l.uid === s.id && (l.status === "pending" || l.status === "approved"))) return { ok: false, msg: "你已提交过申请（或已持有执照）" };
    list.unshift({ id: uid("lic"), uid: s.id, name: s.nickname || s.name, scope: String(scope || ""), applicant: String(applicant || ""), staff: String(staff || ""), status: "pending", applyTs: now(), reviewTs: null, reviewer: null, reason: null });
    lsSet(KEY.licenses, list);
    return { ok: true };
  }
  function reviewLicense(id, approve, reason) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditDept("shichang") && !isSuperAdmin(s.role)) return { ok: false, msg: "仅市监局可审批执照" };
    const list = getLicenses(); const l = list.find((x) => x.id === id);
    if (!l) return { ok: false, msg: "申请不存在" };
    if (l.status !== "pending") return { ok: false, msg: "该申请已处理" };
    l.status = approve ? "approved" : "rejected"; l.reviewTs = now(); l.reviewer = s.name; l.reason = reason || (approve ? "核准通过" : "未通过");
    lsSet(KEY.licenses, list);
    return { ok: true };
  }
  // 发布商品：老师免审批直接上架；学生提交后由市监局审批
  function publishProduct({ title, desc, type, price, stock, cover }) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const me = findById(s.id); if (!me) return { ok: false, msg: "用户不存在" };
    if (!canPublish(me.id)) return { ok: false, msg: "请先申请并持有营业执照才能开店" };
    const t = String(title || "").trim(); if (!t) return { ok: false, msg: "商品名称不能为空" };
    const p = Math.round(Number(price) * 100) / 100; if (isNaN(p) || p < 0) return { ok: false, msg: "价格无效" };
    const ptype = type === "physical" ? "physical" : "virtual";
    const teacher = me.role === "teacher" || me.role === "admin" || me.role === "superadmin";
    const list = getProducts();
    list.unshift({ id: uid("pd"), uid: me.id, name: s.nickname || s.name, title: t, desc: String(desc || ""), type: ptype, price: p, stock: Math.max(0, parseInt(stock, 10) || 0), cover: cover || "", status: teacher ? "published" : "pending", reviewTs: teacher ? now() : null, reviewer: teacher ? s.name : null, reason: null, ts: now() });
    lsSet(KEY.products, list);
    return { ok: true, msg: teacher ? "商品已上架（老师发布免审批）" : "已提交，等待市监局审批上架" };
  }
  function reviewProduct(id, approve, reason) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditDept("shichang") && !isSuperAdmin(s.role)) return { ok: false, msg: "仅市监局可审批商品" };
    const list = getProducts(); const p = list.find((x) => x.id === id);
    if (!p) return { ok: false, msg: "商品不存在" };
    if (p.status !== "pending") return { ok: false, msg: "该商品已处理" };
    p.status = approve ? "published" : "rejected"; p.reviewTs = now(); p.reviewer = s.name; p.reason = reason || (approve ? "通过上架" : "未通过");
    lsSet(KEY.products, list);
    return { ok: true };
  }
  function deleteProduct(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const list = getProducts(); const p = list.find((x) => x.id === id);
    if (!p) return { ok: false, msg: "商品不存在" };
    if (p.uid !== s.id && !isSuperAdmin(s.role) && !canEditDept("shichang")) return { ok: false, msg: "无权限" };
    lsSet(KEY.products, list.filter((x) => x.id !== id));
    return { ok: true };
  }
  function publishedProducts() { return getProducts().filter((p) => p.status === "published"); }
  function myProducts() { const s = getSession(); if (!s) return []; return getProducts().filter((p) => p.uid === s.id).slice().reverse(); }
  function myLicense() { const s = getSession(); if (!s) return null; return userLicense(s.id); }

  /* ---- 公共池（老师商品积分流入） ---- */
  function getTreasury() { return lsGet(KEY.treasury, []); }
  function treasuryBalance() { return Math.round(getTreasury().reduce((s, r) => s + (r.delta || 0), 0) * 100) / 100; }
  /* ---- 订单 ---- */
  function getOrders() { return lsGet(KEY.orders, []); }
  function myOrders() { const s = getSession(); if (!s) return []; return getOrders().filter((o) => o.buyerId === s.id); }
  function mySoldOrders() { const s = getSession(); if (!s) return []; return getOrders().filter((o) => o.sellerId === s.id); }

  /* ---- 购买商品（即时成交 · 积分结算） ---- */
  // 老师/超管买家：积分流入公共池；持证学生卖家：积分流入卖家。
  function buyProduct(id) {
    const s = getSession();
    if (!s) return { ok: false, msg: "请先登录" };
    if (s.role !== "student" && s.role !== "superadmin") return { ok: false, msg: "仅同学可购买商品" };

    const products = getProducts();
    const p = products.find((x) => x.id === id);
    if (!p) return { ok: false, msg: "商品不存在" };
    if (p.status !== "published") return { ok: false, msg: "商品已下架" };
    if (p.stock <= 0) return { ok: false, msg: "库存不足" };
    if (p.uid === s.id) return { ok: false, msg: "不能购买自己发布的商品" };

    const users = getUsers();
    const buyer = users.find((x) => x.id === s.id);
    if (!buyer) return { ok: false, msg: "用户不存在" };
    const price = Math.round(Number(p.price) * 100) / 100;
    if (buyer.score < price) return { ok: false, msg: "积分不足（需 " + price + " 分）" };

    const seller = users.find((x) => x.id === p.uid);
    const isTeacherSeller = seller && (seller.role === "teacher" || seller.role === "admin" || seller.role === "superadmin");

    const ledger = getLedger();
    // 买家扣分
    buyer.score = Math.round((buyer.score - price) * 100) / 100;
    ledger.push({ id: uid("led"), uid: buyer.id, name: buyer.name, delta: -price, after: buyer.score, reason: "购买「" + p.title + "」", operator: s.name, operatorRole: s.role, ts: now() });

    if (isTeacherSeller) {
      // 流入公共池
      const t = getTreasury();
      t.push({ id: uid("trs"), delta: price, reason: "售出「" + p.title + "」（" + p.name + "）", ts: now() });
      lsSet(KEY.treasury, t);
    } else if (seller) {
      // 流入卖家
      seller.score = Math.round((seller.score + price) * 100) / 100;
      ledger.push({ id: uid("led"), uid: seller.id, name: seller.name, delta: price, after: seller.score, reason: "售出「" + p.title + "」", operator: s.name, operatorRole: s.role, ts: now() });
    }

    // 库存 -1
    p.stock = Math.max(0, p.stock - 1);

    // 订单留痕
    const orders = getOrders();
    orders.unshift({ id: uid("ord"), productId: p.id, title: p.title, price, buyerId: buyer.id, buyerName: buyer.nickname || buyer.name, sellerId: p.uid, sellerName: p.name, ts: now() });
    lsSet(KEY.orders, orders);

    saveUsers(users);
    saveLedger(ledger);
    lsSet(KEY.products, products);
    setMeta(s.name);
    pushDocs(); // 远程模式：把本次写操作同步到服务端
    return { ok: true, msg: "购买成功" };
  }

  /* ---------- 公开 API ---------- */
  return {
    apiBase,
    ensureSeeded,
    isRemote, pushDocs, resyncDocs, syncReady, lastSyncedAt, waitSync,
    login, logout, changePassword, skipPasswordChange, refreshSession,
    register, pendingRegistrations, reviewRegister, myChild,
    getSession, findById, findByAccount,
    leaderboard, displayName,
    canEditRole, isSuperAdmin,
    applyDelta, undoLast,
    applyRedeem, reviewRedeem, offlineDeduct,
    getLedger, getRedeems, getMeta, getUsers,
    myLedger, myRedeems,
    requestNickname, reviewNickname, pendingNicknames, setAvatar,
    adminListUsers, adminUpdateRole, adminUpdateDept, adminResetPassword,
    getNews, addNews, deleteNews,
    getMedia, addMedia, deleteMedia,
    DEPTS, canEditDept, canApproveDept, myDepartment,
    getDeptItems, saveDeptItems, addDeptItem, updateDeptItem, reviewDeptItem, deleteDeptItem,
    myReports, submitReport, markReport,
    getAlbums, saveAlbums, addAlbum, addAlbumPhoto, reviewAlbumPhoto, deleteAlbumPhoto, deleteAlbum, allPublishedPhotos,
    galleryGet, gallerySave, galleryCreateAlbum, galleryUpload, galleryCanManage, galleryRename, galleryDeletePhoto, galleryDeleteAlbum,
    getNotices, addNotice, deleteNotice,
    getDuty, addDutyShift, deleteDutyShift,
    updateProfile, addPersonalImage, deletePersonalImage,
    grantBadge, revokeBadge,
    getGroups, saveGroups, setUserGroup, groupStats,
    getWall, postWall, deleteWall,
    getVotes, createVote, castVote, closeVote, myVote, canManageVotes,
    archive,
    periodStart, rankPeriod, groupRank, batchApplyDelta,
    getStars, setStar, currentStar, revokeStar,
    getWishes, myWishes, addWish, toggleWish, deleteWish,
    timeline,
    getSignups, createSignup, signupRespond, mySignup, closeSignup, canManageSignup,
    getLicenses, getProducts, userLicense, approvedLicense, canPublish,
    applyLicense, reviewLicense,
    publishProduct, reviewProduct, deleteProduct, publishedProducts, myProducts, myLicense,
    buyProduct, getTreasury, treasuryBalance, getOrders, myOrders, mySoldOrders,
    logAction, getLogs, clearLogs, roleRank,
    fmtTime, fmtMoney, now,
  };
})();