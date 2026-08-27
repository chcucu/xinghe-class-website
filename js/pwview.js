/* ============================================================
  星河班 · 密码显示 / 隐藏切换
  自动为页面内所有 input[type=password] 注入眼睛切换按钮。
  在 store.js 之后、页面脚本之前加载。
  ============================================================ */
(function () {
  var EYE_ON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
  var EYE_OFF =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 6.5 10 6.5a17 17 0 0 1-2.6 3.2"/><path d="M7.1 7.7A17.6 17.6 0 0 0 2 11.5S5.5 18 12 18a9.3 9.3 0 0 0 3.2-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  function decorate(input) {
    if (!input || input.dataset.pwv === "1") return;
    if (input.type !== "password") return;
    input.dataset.pwv = "1";

    var wrap = document.createElement("div");
    wrap.className = "pw-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-eye";
    btn.setAttribute("aria-label", "显示 / 隐藏密码");
    btn.innerHTML = EYE_ON;
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? EYE_OFF : EYE_ON;
      input.focus();
    });
    wrap.appendChild(btn);
  }

  function init() {
    document.querySelectorAll('input[type="password"]').forEach(decorate);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();