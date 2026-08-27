/* ============================================================
   星河班 · 公共交互脚本
   ============================================================ */

/* ---- 移动端导航 ---- */
const navToggle = document.getElementById("navToggle");
const mainNav = document.getElementById("mainNav");
if (navToggle && mainNav) {
  navToggle.addEventListener("click", () => {
    mainNav.classList.toggle("open");
  });
  // 点击导航项后关闭
  mainNav.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => mainNav.classList.remove("open"));
  });
}

/* ---- 顶部阴影（滚动时） ---- */
const header = document.querySelector(".site-header");
if (header) {
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---- 滚动入场动画 ---- */
const revealEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add("visible"));
}

/* ---- 首页星空粒子背景 ---- */
const starfield = document.getElementById("starfield");
if (starfield) {
  const ctx = starfield.getContext("2d");
  let stars = [];
  let raf;
  let w, h;

  function resize() {
    w = starfield.width = starfield.offsetWidth;
    h = starfield.height = starfield.offsetHeight;
    initStars();
  }
  function initStars() {
    stars = [];
    const count = Math.min(160, Math.floor((w * h) / 9000));
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.4,
        base: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.008,
        gold: false,
      });
    }
  }
  function frame(t) {
    ctx.clearRect(0, 0, w, h);
    stars.forEach((s) => {
      const alpha = 0.35 + Math.abs(Math.sin(s.base + t * s.speed * 60)) * 0.65;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.gold ? "#ffd977" : "#ffffff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  resize();
  window.addEventListener("resize", resize);
  raf = requestAnimationFrame(frame);
}

/* ---- 相册筛选 ---- */
const filterChips = document.querySelectorAll(".filter-chip");
const galleryItems = document.querySelectorAll(".gallery-item");
if (filterChips.length) {
  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      filterChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const f = chip.dataset.filter;
      galleryItems.forEach((item) => {
        const show = f === "all" || item.dataset.album === f;
        item.style.display = show ? "" : "none";
      });
    });
  });
}

/* ---- 相册灯箱 ---- */
const lightbox = document.getElementById("lightbox");
if (lightbox && galleryItems.length) {
  const lbImg = lightbox.querySelector(".lb-img");
  const lbCap = lightbox.querySelector(".lb-cap");
  let items = [...galleryItems].filter((i) => i.style.display !== "none");
  let idx = 0;

  // 构建真实图片数组（含隐藏，用于前后切换取可见项）
  const visible = () => [...galleryItems].filter((i) => i.style.display !== "none");

  function show(n) {
    const list = visible();
    if (!list.length) return;
    idx = (n + list.length) % list.length;
    const img = list[idx].querySelector("img");
    lbImg.src = img.src;
    lbCap.textContent = img.alt || "";
    lightbox.classList.add("open");
  }

  galleryItems.forEach((item) => {
    item.addEventListener("click", () => {
      const list = visible();
      idx = list.indexOf(item);
      const img = item.querySelector("img");
      lbImg.src = img.src;
      lbCap.textContent = img.alt || "";
      lightbox.classList.add("open");
    });
  });

  lightbox.querySelector(".lb-close").addEventListener("click", () => {
    lightbox.classList.remove("open");
  });
  lightbox.querySelector(".lb-prev").addEventListener("click", () => show(idx - 1));
  lightbox.querySelector(".lb-next").addEventListener("click", () => show(idx + 1));
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) lightbox.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("open")) return;
    if (e.key === "Escape") lightbox.classList.remove("open");
    if (e.key === "ArrowLeft") show(idx - 1);
    if (e.key === "ArrowRight") show(idx + 1);
  });
}