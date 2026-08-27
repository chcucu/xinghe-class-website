/* ============================================================
   星河班 · 全站登录门禁
   需在 store.js 之后加载，且先于页面逻辑。
   除 登录/身份选择/注册 页面外，未登录一律跳转身份选择页。
   ============================================================ */
(function () {
  var page = location.pathname.split("/").pop() || "";
  var isPublic = /^login\.html$/i.test(page) || /^identity\.html$/i.test(page) || /^register\.html$/i.test(page) || /[?&]q=login/i.test(location.search);
  if (isPublic) return;

  var s = null;
  try { s = STORE.getSession(); } catch (e) { s = null; }

  if (!s) {
    var url = "identity.html";
    var back = page + location.search;
    location.replace(url + "?next=" + encodeURIComponent(back));
  }
})();