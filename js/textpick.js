/* ============================================================
  星河班 · 文字点选人机验证（自包含，前端判断）
  在容器内生成若干随机汉字，按提示顺序点选文字以通过校验。
  暴露 window.TEXTPICK = { create(containerId) -> { verify, refresh } }
  ============================================================ */
(function () {
  var POOL = "星河班春夏秋冬心梦想望勤奋诚相信你我他来去往东西高远清晨暮光读书写字谦礼智信勇毅矩温良恭俭让";

  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  function build() {
    var used = [];
    while (used.length < 6) {
      var c = POOL[randInt(0, POOL.length - 1)];
      if (used.indexOf(c) < 0) used.push(c);
    }
    var order = used.slice(0, 3);
    var items = used.map(function (ch) {
      return { ch: ch, x: randInt(5, 251), y: randInt(5, 71), angle: randInt(-22, 22), dark: randInt(0, 1) === 0, done: false };
    });
    return { items: items, order: order };
  }

  function draw(ctx, cfg, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f4f4f6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(0,0,0,.1)";
    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(randInt(0, canvas.width), randInt(0, canvas.height));
      ctx.lineTo(randInt(0, canvas.width), randInt(0, canvas.height));
      ctx.stroke();
    }
    cfg.items.forEach(function (it) {
      ctx.save();
      ctx.translate(it.x + 22, it.y + 26);
      ctx.rotate((it.angle * Math.PI) / 180);
      ctx.font = "700 26px 'Noto Serif SC', 'Songti SC', serif";
      if (it.done) {
        ctx.fillStyle = "rgba(0,0,0,.25)";
        ctx.fillText(it.ch, -13, 8);
        ctx.strokeStyle = "rgba(0,0,0,.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, 7); ctx.lineTo(10, -7);
        ctx.moveTo(-10, -7); ctx.lineTo(10, 7);
        ctx.stroke();
      } else {
        ctx.fillStyle = it.dark ? "#0a0a0a" : "#4a4a50";
        ctx.fillText(it.ch, -13, 8);
      }
      ctx.restore();
    });
  }

  function create(containerId) {
    var wrap = document.getElementById(containerId);
    if (!wrap) return null;

    var cfg = null;
    var inputs = [];

    function render() {
      wrap.innerHTML =
        '<div class="tp-head"><span class="tp-title">人机验证</span><span class="tp-tip">请按顺序点选：' +
        cfg.order.map(function (c) { return "<b>" + c + "</b>"; }).join("") +
        '</span></div>' +
        '<div class="tp-stage"><canvas width="300" height="120" class="tp-canvas"></canvas></div>' +
        '<div class="tp-state"><span class="tp-msg"></span><button type="button" class="tp-refresh">换一批</button></div>';
      var canvas = wrap.querySelector(".tp-canvas");
      var ctx = canvas.getContext("2d");

      canvas.addEventListener("click", function (e) {
        if (cfg.done) return;
        var rect = canvas.getBoundingClientRect();
        var mx = ((e.clientX - rect.left) * canvas.width) / rect.width;
        var my = ((e.clientY - rect.top) * canvas.height) / rect.height;
        var hit = null;
        for (var i = cfg.items.length - 1; i >= 0; i--) {
          var it = cfg.items[i];
          if (it.done) continue;
          if (mx >= it.x && mx <= it.x + 44 && my >= it.y && my <= it.y + 44) { hit = it; break; }
        }
        if (!hit) return;
        var expected = cfg.order[inputs.length];
        if (hit.ch === expected) {
          hit.done = true;
          inputs.push(hit.ch);
          if (inputs.length === cfg.order.length) {
            cfg.done = true;
            setMsg("验证通过", "ok");
            for (var j = 0; j < cfg.items.length; j++) cfg.items[j].done = true;
          }
          draw(ctx, cfg, canvas);
        } else {
          setMsg("顺序错误，正在生成新验证码…", "err");
          wrap.classList.add("shake");
          setTimeout(function () { wrap.classList.remove("shake"); }, 400);
          // 点错后自动换一批，无需手动查找刷新按钮
          clearTimeout(wrap._autoRef);
          wrap._autoRef = setTimeout(function () { refresh(); }, 850);
        }
      });

      wrap.querySelector(".tp-refresh").addEventListener("click", function () { refresh(); });
      draw(ctx, cfg, canvas);
    }

    function setMsg(t, kind) {
      var m = wrap.querySelector(".tp-msg");
      if (m) { m.textContent = t; m.className = "tp-msg " + (kind || ""); }
    }

    function refresh() {
      cfg = build();
      inputs = [];
      render();
    }

    refresh();
    return {
      verify: function () { return !!(cfg && cfg.done); },
      refresh: refresh
    };
  }

  window.TEXTPICK = { create: create };
})();