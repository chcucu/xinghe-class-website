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
    // 部门（与《星河班班委职责表》一致）
    ["行政部", "department.html?dept=xingzheng"],
    ["后勤部", "department.html?dept=houqin"],
    ["学习部", "department.html?dept=xuexi"],
    ["文体部", "department.html?dept=wenti"],
    ["纪检部", "department.html?dept=jiwei"],
    ["宣传部", "department.html?dept=xuanchuan"],
    ["编辑部", "department.html?dept=bianji"],
    ["信息安全部", "department.html?dept=xinxianquan"],
    ["活动策划部", "department.html?dept=huodong"],
    ["班级商店", "shop.html"],
    ["小组", "group.html"],
    ["值日表", "duty.html"],
    ["投票", "votes.html"],
    ["悄悄话墙", "messages.html"],
    ["活动接龙", "signup.html"],
    ["操行银行", "bank.html"],
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
        (STORE.isSiteAdmin(s) ? '<a class="us-item us-link us-admin" href="admin.html">后台</a>' : "") +
        '<button class="us-item us-btn" id="usLogout">退出</button>';
      var btn = document.getElementById("usLogout");
      if (btn) btn.addEventListener("click", function () { STORE.logout(); location.href = "identity.html"; });
    } else {
      strip.innerHTML = '<a class="us-item us-link" href="identity.html">登录</a>';
    }
  }

  // ============ 登录后弹窗展示未读部门公告 ============
  (function () {
    var just = null;
    try { just = sessionStorage.getItem("xh_just_login"); } catch (e) { just = null; }
    if (just !== "1") return;
    try { sessionStorage.removeItem("xh_just_login"); } catch (e) {}
    var list = [];
    try { list = STORE.unreadDeptNotices(); } catch (e) { list = []; }
    if (!list.length) return;
    var items = list.map(function (n) {
      return '<div style="padding:14px 0;border-bottom:1px dashed var(--line);">' +
        '<div style="font-size:15px;color:var(--ink);margin-bottom:4px;">' +
        (STORE.DEPTS[n.dept] ? STORE.DEPTS[n.dept].name : n.dept) + ' · ' + esc(n.title) + '</div>' +
        (n.content ? '<div style="font-size:13.5px;color:var(--text-soft);line-height:1.7;">' + esc(n.content) + '</div>' : '') +
        '<div style="font-size:12px;color:var(--muted);margin-top:6px;">' + STORE.fmtTime(n.createdTs) + ' · ' + esc(n.authorName || '') + '</div>' +
        '</div>';
    }).join("");
    var mask = document.createElement("div");
    mask.className = "modal-mask open";
    mask.innerHTML = '<div class="modal" style="max-width:460px;">' +
      '<span class="win-tl" style="margin-bottom:14px;"><i class="r"></i><i class="y"></i><i class="g"></i></span>' +
      '<div class="m-title">部门公告</div>' +
      '<div class="m-sub">你有 ' + list.length + ' 条部门公告未读。</div>' +
      '<div style="max-height:320px;overflow:auto;margin-bottom:20px;">' + items + '</div>' +
      '<button type="button" class="btn btn-block" id="deptNoticeClose">我知道了</button>' +
      '</div>';
    document.body.appendChild(mask);
    var ids = list.map(function (n) { return n.id; });
    var btn = document.getElementById("deptNoticeClose");
    if (btn) btn.addEventListener("click", function () {
      try { STORE.markDeptNoticeRead(ids); } catch (e) {}
      if (mask.parentNode) mask.parentNode.removeChild(mask);
    });
    mask.addEventListener("click", function (e) {
      if (e.target === mask) {
        try { STORE.markDeptNoticeRead(ids); } catch (e) {}
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }
    });
  })();

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

  // ============ 星河动效引擎（全站自动生效，零侵入） ============
  (function () {
    var reduced = false;
    try { reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    var finePointer = false;
    try { finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches; } catch (e) {}

    function qsa(sel) {
      try { return Array.prototype.slice.call(document.querySelectorAll(sel)); } catch (e) { return []; }
    }

    // ---- 页面进入：主内容 stagger 上浮（幂等，已加 .in 的跳过） ----
    var ENTER_SEL = [
      ".page-hero .crumbs, .page-hero .eyebrow, .page-hero h1, .page-hero .sub",
      ".hero .hero-text > *, .hero-visual",
      ".container > .panel, .container > .toolbar, .container > .motto, .container > .section",
      ".info-card, .person-card, .news-list > *, .gallery-grid > *, .work-grid > *",
      ".redeem-grid > *, .quick-links > *, .table-wrap, .data-table, .rank-table-wrap"
    ].join(", ");
    function initEnter() {
      if (reduced) return;
      var targets = qsa(ENTER_SEL);
      if (!targets.length) return;
      document.body.classList.add("xh-anim");
      var i = 0;
      targets.forEach(function (el) {
        if (el.classList.contains("in") || el.closest(".xh-skip")) return;
        el.classList.add("xh-rise");
        el.style.setProperty("--xd", Math.min(i * 55, 440) + "ms");
        i++;
        (function (node) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () { node.classList.add("in"); });
          });
        })(el);
      });
    }

    // ---- 滚动显现：进入视口才上浮（只触发一次，性能友好） ----
    function initReveal() {
      if (reduced || !("IntersectionObserver" in window)) return;
      var els = qsa(".xh-reveal");
      if (!els.length) return;
      document.body.classList.add("xh-anim");
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add("in");
          io.unobserve(en.target);
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
      els.forEach(function (el) { io.observe(el); });
    }

    // ---- 3D 倾斜：指针悬停时跟随视角（rAF 节流，仅精细指针设备） ----
    // .hero-card 首页 3D 视觉卡自动启用；页面另可显式加 .xh-tilt
    function initTilt() {
      if (reduced || !finePointer) return;
      qsa(".xh-tilt, .hero-card").forEach(function (el) {
        var raf = null;
        el.addEventListener("mousemove", function (e) {
          if (raf) return;
          raf = requestAnimationFrame(function () {
            raf = null;
            var r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            var px = (e.clientX - r.left) / r.width - 0.5;
            var py = (e.clientY - r.top) / r.height - 0.5;
            el.style.transform = "perspective(900px) rotateX(" + (-py * 9).toFixed(2) + "deg) rotateY(" + (px * 9).toFixed(2) + "deg)";
          });
        }, { passive: true });
        el.addEventListener("mouseleave", function () {
          if (raf) { cancelAnimationFrame(raf); raf = null; }
          el.style.transform = "";
        });
      });
    }

    // ---- 按钮涟漪（事件委托，深色底白波 / 浅色底黑波） ----
    function initRipple() {
      if (reduced) return;
      document.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest(".btn, .xh-ripple") : null;
        if (!btn) return;
        var r = btn.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var d = Math.max(r.width, r.height);
        var dark = btn.classList.contains("btn-block") || btn.classList.contains("btn-ghost") || !!btn.closest(".page-hero");
        var span = document.createElement("span");
        span.className = "xh-rip" + (dark ? "" : " xh-rip-dark");
        span.style.width = span.style.height = d + "px";
        span.style.left = (e.clientX - r.left - d / 2) + "px";
        span.style.top = (e.clientY - r.top - d / 2) + "px";
        btn.appendChild(span);
        setTimeout(function () { if (span.parentNode) span.parentNode.removeChild(span); }, 540);
      });
    }

    // ---- Hero 氛围光斑（慢速漂移，纯装饰） ----
    function initOrbs() {
      if (reduced) return;
      qsa(".page-hero").forEach(function (hero) {
        if (hero.querySelector(".xh-orb")) return;
        var colors = ["rgba(255,255,255,.05)", "rgba(150,150,255,.05)", "rgba(255,255,255,.07)"];
        for (var i = 0; i < 3; i++) {
          var orb = document.createElement("i");
          orb.className = "xh-orb";
          var size = 130 + Math.random() * 240;
          orb.style.width = orb.style.height = size + "px";
          orb.style.left = (Math.random() * 82) + "%";
          orb.style.top = (Math.random() * 82) + "%";
          orb.style.background = colors[i];
          orb.style.setProperty("--orb-t", (13 + Math.random() * 10) + "s");
          orb.style.animationDelay = (-Math.random() * 8) + "s";
          hero.appendChild(orb);
        }
      });
    }

    // ---- 页面切换：黑色圆环遮罩吞没旧页后跳转（排除外链/新窗/锚点/脚本） ----
    function initPageLeave() {
      if (reduced) return;
      document.addEventListener("click", function (e) {
        var a = e.target.closest ? e.target.closest("a[href]") : null;
        if (!a) return;
        if (e.defaultPrevented) return;
        if (a.target === "_blank" || a.hasAttribute("download")) return;
        var href = a.getAttribute("href") || "";
        if (/^javascript:|^#|^mailto:|^tel:/.test(href)) return;
        if (/^https?:/i.test(href) && href.indexOf(location.origin) !== 0 && href.charAt(0) !== "/") return;
        e.preventDefault();
        var done = false;
        function go() { if (done) return; done = true; location.href = a.href; }
        var veil = document.createElement("div");
        veil.className = "xh-veil";
        document.body.appendChild(veil);
        document.body.classList.add("xh-leave");
        setTimeout(go, 380); // 等圆环遮罩展开动画完成
      });
    }

    // ---- 顶部阅读进度条（scroll 用 rAF 节流，零布局开销） ----
    function initScrollProgress() {
      if (reduced) return;
      var bar = document.createElement("div");
      bar.className = "xh-progress";
      document.body.appendChild(bar);
      var ticking = false;
      function update() {
        ticking = false;
        var doc = document.documentElement;
        var max = doc.scrollHeight - window.innerHeight;
        var p = max > 0 ? window.scrollY / max : 0;
        bar.style.transform = "scaleX(" + Math.min(1, Math.max(0, p)).toFixed(4) + ")";
      }
      window.addEventListener("scroll", function () {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
      }, { passive: true });
      update();
    }

    // ---- 数字滚动（.xh-count[data-count]，进入视口后从 0 滚动到目标值） ----
    function initCounters() {
      if (reduced || !("IntersectionObserver" in window)) return;
      var els = qsa(".xh-count[data-count]");
      if (!els.length) return;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          var el = en.target;
          var target = parseFloat(el.getAttribute("data-count") || "0") || 0;
          var suffix = (el.textContent || "").replace(/[\d.,\s]+/g, ""); // 保留单位等尾缀
          var dur = 950, t0 = null;
          function step(t) {
            if (!t0) t0 = t;
            var p = Math.min((t - t0) / dur, 1);
            var val = Math.round(target * (1 - Math.pow(1 - p, 3)));
            el.textContent = String(val) + suffix;
            if (p < 1) requestAnimationFrame(step);
            else el.textContent = String(target) + suffix;
          }
          requestAnimationFrame(step);
        });
      }, { threshold: 0.5 });
      els.forEach(function (el) { io.observe(el); });
    }

    // ---- 图片懒加载 + 异步解码（首屏/Logo 除外；动态渲染的图也会自动补齐） ----
    function initLazyImgs() {
      function mark(img) {
        if (!img || img.hasAttribute("loading")) return;
        if (img.closest(".hero, .hero-visual, .brand-mark, .lightbox")) return;
        img.setAttribute("loading", "lazy");
        img.setAttribute("decoding", "async");
      }
      try {
        qsa("img").forEach(mark);
        var mo = new MutationObserver(function (muts) {
          muts.forEach(function (m) {
            m.addedNodes.forEach(function (n) {
              if (n.nodeType !== 1) return;
              if (n.tagName === "IMG") mark(n);
              else if (n.querySelectorAll) n.querySelectorAll("img").forEach(mark);
            });
          });
        });
        mo.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    }

    function boot() {
      initEnter();
      // 动态渲染的内容（如相册/成员卡由 JS 填充）稍后再补一次进入动画
      setTimeout(initEnter, 320);
      initReveal();
      initTilt();
      initOrbs();
      initRipple();
      initPageLeave();
      initScrollProgress();
      initCounters();
      initLazyImgs();
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  })();
})();