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
    if (tp && !tp.verify()) { showError("请先完成人机验证（按提示顺序点选文字）"); if (tp.refresh) tp.refresh(); return; }
    const account = document.getElementById("account").value.trim();
    const password = document.getElementById("password").value;
    if (!account || !password) { showError("请填写账号和密码"); return; }

    const r = STORE.login(account, password);
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
  chpwdForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const npwd = document.getElementById("npwd").value;
    const npwd2 = document.getElementById("npwd2").value;
    if (!npwd || npwd.length < 4) { showError("密码至少 4 位"); return; }
    if (npwd !== npwd2) { showError("两次输入的密码不一致"); return; }
    const r = STORE.changePassword(npwd);
    if (!r.ok) { showError(r.msg); return; }
    goAfterLogin();
  });

  // 跳过改密
  const skip = document.getElementById("skipChpwd");
  if (skip) {
    skip.addEventListener("click", (e) => {
      e.preventDefault();
      STORE.skipPasswordChange();
      goAfterLogin();
    });
  }
})();