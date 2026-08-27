/* ============================================================
   星河班 · 图片压缩助手
   依赖：js/vendor-image-compression.js（browser-image-compression，MIT）
   作用：上传前在浏览器端压缩图片，尽量减小存储占用，
         同时保持图片可正常访问（可再点开看原图效果）。
   ============================================================ */
(function (global) {
  "use strict";

  const DEFAULT_OPTS = {
    maxSizeMB: 1.5,         // 压缩后目标（约）1.5MB：减小网站占用
    maxWidthOrHeight: 1920, // 超过该边长则等比缩放
    initialQuality: 0.85,   // 初始质量
    useWebWorker: false,    // 不用 Worker，避免在 Worker 内回源 CDN
  };

  const MAX_RAW_MB = 10; // 单张原图上限：超过直接拒绝，前端即拦下

  // 压缩并转成 base64 dataURL；库不可用或压缩失败时，回退为原图 dataURL。
  async function toDataUrl(file, opts) {
    if (file && file.size && file.size > MAX_RAW_MB * 1024 * 1024) {
      throw new Error("这张图片超过 " + MAX_RAW_MB + "MB，请压缩后再上传");
    }
    const o = Object.assign({}, DEFAULT_OPTS, opts || {});
    try {
      if (global.imageCompression && file && /^image\//.test(file.type)) {
        const out = await global.imageCompression(file, o);
        return await global.imageCompression.getDataUrlFromFile(out);
      }
    } catch (e) { /* 压缩失败则退回原图 */ }
    return new Promise((resolve, reject) => {
      const rd = new FileReader();
      rd.onload = () => resolve(rd.result);
      rd.onerror = () => reject(rd.error);
      rd.readAsDataURL(file);
    });
  }

  global.IMG = { toDataUrl };
})(window);