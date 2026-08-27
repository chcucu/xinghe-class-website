/* ============================================================
   星河班 · 共享导航与用户条（平铺导航）
   需在 store.js / guard.js / main.js 之后加载。
   会重写 #mainNav 的列表，并向 .header-inner 注入用户条。
   ============================================================ */
(function () {
  function quEsc(s) { return String(s == null ? "" : s).replace(/'/g, "&apos;").replace(/"/g, "&quot;"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function curPath() { return location.pathname.split("/").pop() || "index.html"; }
  function isActive(href) {
    var page = href.split("?")[0];
    return curPath() === page;
  }

  // 平铺导航链接（首页 > 班级概况 > 部门事务 > 校园生活 > 个人）
  var NAV_ITEMS = [
    ["首页", "index.html"],
    ["班级介绍", "class.html"],
    ["师生风采", "members.html"],
    ["通知公告", "notices.html"],
    ["班级相册", "gallery.html"],
    ["班级荣誉", "honor.html"],
    ["班级新闻", "news.html"],
    ["成长档案", "archive.html"],
    ["宣传部", "department.html?dept=xuanchuan"],
    ["纪检部", "department.html?dept=jiwei"],
    ["编辑部", "department.html?dept=bianji"],
    ["医疗部", "department.html?dept=yiliao"],
    ["值日表", "duty.html"],
    ["投票", "votes.html"],
    ["悄悄话墙", "messages.html"],
    ["活动接龙", "signup.html"],
    ["操行银行", "bank.html"],
    ["班级商店", "shop.html"],
  ];

  // 访客/家长仅可见公开页面（家长额外可看成长档案）
  var PUBLIC_PAGES = ["index.html", "class.html", "members.html", "notices.html", "gallery.html", "honor.html", "news.html"];
  var PARENT_EXTRA = ["archive.html"];

  function navAllowed(href, role) {
    if (!role || role === "student" || role === "teacher" || role === "monitor" || role === "admin" || role === "superadmin") return true;
    var page = href.split("?")[0];
    if (role === "guest") return PUBLIC_PAGES.indexOf(page) >= 0;
    if (role === "parent") return PUBLIC_PAGES.indexOf(page) >= 0 || PARENT_EXTRA.indexOf(page) >= 0;
    return true;
  }

  var nav = document.getElementById("mainNav");
  if (nav) {
    var sNav = null;
    try { sNav = STORE.getSession(); } catch (e) { sNav = null; }
    var role = sNav ? sNav.role : null;
    var items = NAV_ITEMS.filter(function (it) { return navAllowed(it[1], role); });
    var html = "<ul>" + items.map(function (item) {
      return '<li class="' + (isActive(item[1]) ? "active" : "") + '"><a href="' + quEsc(item[1]) + '">' + item[0] + "</a></li>";
    }).join("") + "</ul>";
    nav.innerHTML = html;
    nav.classList.add("flat-nav");
    // 移动端关闭菜单
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { nav.classList.remove("open"); });
    });
  }

  // 用户条注入到 header-inner 末尾
  var headerInner = document.querySelector(".header-inner");
  var strip = document.getElementById("userStrip");
  if (headerInner && !strip) {
    strip = document.createElement("div");
    strip.id = "userStrip";
    strip.className = "user-strip";
    headerInner.appendChild(strip);
  }
  if (strip) {
    var s = null;
    try { s = STORE.refreshSession() || STORE.getSession(); } catch (e) { s = null; }
    var roleMap = { admin: "班主任", teacher: "教师", monitor: "班委", student: "学生", parent: "家长", guest: "访客" };
    if (s) {
      var roleLabel = roleMap[s.role] || "超级管理员";
      var disp = s.nickname || s.name;
      strip.innerHTML =
        '<span class="us-item us-name">' + esc(disp) + '</span>' +
        '<span class="us-item us-role">' + roleLabel + '</span>' +
        (s.role === "parent" ? '<a class="us-item us-link" href="archive.html">我的孩子</a>' : "") +
        '<a class="us-item us-link" href="profile.html">用户中心</a>' +
        (STORE.isSuperAdmin(s.role) ? '<a class="us-item us-link us-admin" href="admin.html">后台</a>' : "") +
        '<button class="us-item us-btn" id="usLogout">退出</button>';
      var btn = document.getElementById("usLogout");
      if (btn) btn.addEventListener("click", function () { STORE.logout(); location.href = "identity.html"; });
    } else {
      strip.innerHTML = '<a class="us-item us-link" href="identity.html">登录</a>';
    }
  }

  // ============ 页脚：反馈入口（全站） ============
  (function () {
    var FEEDBACK_EMAIL = "chenjh8557@outlook.com";
    var GITHUB_URL = "https://github.com/chcucu/xinghe-class-website";
    var foot = document.querySelector(".site-footer");
    if (!foot) return;
    if (foot.querySelector(".feedback-bar")) return;
    var bar = document.createElement("div");
    bar.className = "feedback-bar";
    bar.innerHTML =
      '<div class="feedback-inner">' +
      '<span class="fb-label">遇到问题或 Bug？</span>' +
      '<a class="fb-mail" href="mailto:' + FEEDBACK_EMAIL + '">发邮件反馈：' + FEEDBACK_EMAIL + '</a>' +
      '<a class="fb-github" href="' + GITHUB_URL + '" target="_blank" rel="noopener">GitHub</a>' +
      '</div>';
    var bottom = foot.querySelector(".footer-bottom");
    if (bottom) { foot.insertBefore(bar, bottom); } else { foot.appendChild(bar); }
  })();
})();