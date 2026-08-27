/* ============================================================
  星河班 · 轻量全局提示 Toast
  任意位置调用 window.showToast(msg, type)：
    type 可选 success / error / info（默认 info）
  全站统一在业务完成后显示 Success/成功 反馈。
  ============================================================ */
(function () {
  function showToast(msg, type) {
    var wrap = document.getElementById("xh-toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "xh-toast-wrap";
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    var el = document.createElement("div");
    el.className = "toast " + (type === "success" ? "success" : type === "error" ? "error" : "info");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.classList.add("hide");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 2200);
  }
  window.showToast = showToast;
})();