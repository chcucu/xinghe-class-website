/* ============================================================
   星河班 · 登录与首次改密
   ============================================================ */

(async function () {
  await STORE.ensureSeeded();

  // 初始化文字点选人机验证
  const tp = (window.TEXTPICK && document.getElementById("textpick"))
    ? window.TEXTPICK.create("textpick") : null;

  const loginForm = document.getElementById("loginForm");
  const chpwdForm = document.getElementById("chpwdForm");
  const authError = document.getElementById("authError");
  const loginHint = document.getElementById("loginHint");

  function showError(msg) {
    if (!msg) { authError.classList.remove("show"); authError.textContent = ""; return; }
    authError.textContent = msg;
    authError.classList.add("show");
  }

  function goAfterLogin() {
    const s = STORE.getSession();
    // 标记本次会话刚登录，供目标页弹出未读部门公告
    try { sessionStorage.setItem("xh_just_login", "1"); } catch (e) {}
    // 全站登录：登录后跳回来源页，否则默认首页；首次改密除外
    const params = new URLSearchParams(location.search);
    const next = params.get("next");
    if (next && !next.startsWith("login")) { location.href = next; return; }
    location.href = "index.html";
  }

  // 已登录则直接进入
  const existing = STORE.getSession();
  if (existing) {
    if (existing.mustChange) {
      loginForm.style.display = "none";
      chpwdForm.style.display = "";
      loginHint.style.display = "none";
    } else {
      goAfterLogin();
    }
  }

  // 登录
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (tp && !tp.verify()) {
      showError("请先完成人机验证");
      // 仅当用户主动刷新或被自动重置时再调用 refresh，避免验证已通过又被强制显示
      if (tp.refresh && !tp.verify()) tp.refresh();
      return;
    }
    const account = document.getElementById("account").value.trim();
    const password = document.getElementById("password").value;
    if (!account || !password) { showError("请填写账号和密码"); return; }

    const r = await STORE.login(account, password);
    if (!r.ok) { showError(r.msg); return; }

    if (r.user.mustChange) {
      showError("");
      loginForm.style.display = "none";
      chpwdForm.style.display = "";
      loginHint.style.display = "none";
    } else {
      goAfterLogin();
    }
  });

  // 首次改密
  chpwdForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const npwd = document.getElementById("npwd").value;
    const npwd2 = document.getElementById("npwd2").value;
    if (!npwd || npwd.length < 4) { showError("密码至少 4 位"); return; }
    if (npwd !== npwd2) { showError("两次输入的密码不一致"); return; }
    const r = await STORE.changePassword(npwd);
    if (!r.ok) { showError(r.msg); return; }
    goAfterLogin();
  });

  // 跳过改密
  const skip = document.getElementById("skipChpwd");
  if (skip) {
    skip.addEventListener("click", async (e) => {
      e.preventDefault();
      await STORE.skipPasswordChange();
      goAfterLogin();
    });
  }
})();