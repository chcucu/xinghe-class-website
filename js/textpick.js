/* ============================================================
  星河班 · 人机验证（自包含，前端判断）
  支持三种方式，验证条顶部可一键切换：
    1) 点字  - 按提示顺序点选汉字（默认）
    2) 滑块  - 按住圆钮向右拖到底
    3) 数字  - 输入画布上的字符
  手机 / 平板 / 电脑通用。
  暴露 window.TEXTPICK = { create(containerId) -> { verify, refresh } }
  ============================================================ */
(function () {
  var POOL = "星河班春夏秋冬心梦想望勤奋诚相信你我他来去往东西高远清晨暮光读书写字谦礼智信勇毅矩温良恭俭让";
  var ALNUM = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function elFrom(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstChild; }

  /* ---------- 方式 1：文字点选 ---------- */
  function buildTap(host, onDone) {
    var cfg = null;
    var inputs = [];

    function build() {
      var used = [];
      while (used.length < 6) { var c = POOL[randInt(0, POOL.length - 1)]; if (used.indexOf(c) < 0) used.push(c); }
      var order = used.slice(0, 3);
      var items = used.map(function (ch) {
        return { ch: ch, x: randInt(5, 251), y: randInt(5, 71), angle: randInt(-22, 22), dark: randInt(0, 1) === 0, done: false };
      });
      return { items: items, order: order };
    }

    function draw(ctx) {
      var canvas = host.querySelector(".tp-canvas");
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

    function setMsg(t, kind) {
      var m = host.querySelector(".tp-msg");
      if (m) { m.textContent = t; m.className = "tp-msg " + (kind || ""); }
    }

    function render() {
      host.innerHTML =
        '<div class="tp-head"><span class="tp-title">请按顺序点选</span><span class="tp-tip">' +
        cfg.order.map(function (c) { return "<b>" + c + "</b>"; }).join("") +
        '</span></div>' +
        '<div class="tp-stage"><canvas width="300" height="120" class="tp-canvas"></canvas></div>' +
        '<div class="tp-state"><span class="tp-msg"></span><button type="button" class="tp-refresh">换一批</button></div>';
      var canvas = host.querySelector(".tp-canvas");
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
            onDone(true);
          }
          draw(ctx);
        } else {
          setMsg("顺序错误，正在生成新验证码…", "err");
          host.classList.add("tp-shake");
          setTimeout(function () { host.classList.remove("tp-shake"); }, 400);
          var self = thisMethod;
          clearTimeout(timer);
          timer = setTimeout(function () { self.refresh(); }, 850);
        }
      });
      host.querySelector(".tp-refresh").addEventListener("click", function () { thisMethod.refresh(); });
      draw(ctx);
    }

    var timer = null;
    function refresh() { cfg = build(); inputs = []; onDone(false); render(); }
    refresh();
    var thisMethod = { refresh: refresh };
    return thisMethod;
  }

  /* ---------- 方式 2：滑块 ---------- */
  function buildSlide(host, onDone) {
    var state = { done: false, dragging: false, startX: 0, startKnob: 0 };
    function svgChevron() {
      return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
    }
    var el = elFrom(
      '<div class="tp-slider">' +
        '<div class="tp-st">' +
          '<div class="tp-slider-track"></div>' +
          '<div class="tp-slider-fill" style="width:0"></div>' +
          '<div class="tp-slider-text">按住滑块，向右拖动到底完成验证</div>' +
          '<div class="tp-slider-ok">✓</div>' +
          '<div class="tp-slider-knob" role="slider" aria-label="拖动完成验证">' + svgChevron() + '</div>' +
        '</div>' +
        '<div class="tp-foot"><span class="tp-msg"></span><button type="button" class="tp-refresh">换一个</button></div>' +
      '</div>'
    );
    var track = el.querySelector(".tp-slider-track");
    var fill = el.querySelector(".tp-slider-fill");
    var knob = el.querySelector(".tp-slider-knob");
    var msg = el.querySelector(".tp-msg");

    function setMsg(t, kind) { if (msg) { msg.textContent = t || ""; msg.className = "tp-msg " + (kind || ""); } }
    function trackW() { return track.clientWidth || 300; }
    function knobW() { return knob.offsetWidth || 44; }

    function setPos(x) {
      var maxX = trackW() - knobW();
      var px = Math.max(0, Math.min(x, maxX));
      knob.style.left = px + "px";
      fill.style.width = (px + knobW()) + "px";
    }
    function reset() {
      state.done = false;
      onDone(false);
      el.classList.remove("done");
      knob.style.left = "0px";
      fill.style.width = "0px";
      knob.classList.remove("active");
      el.classList.remove("nudge");
      void el.offsetWidth;
      el.classList.add("nudge");
      setTimeout(function () { el.classList.remove("nudge"); }, 360);
    }
    function onEnd() {
      if (!state.dragging) return;
      state.dragging = false;
      knob.classList.remove("active");
      var maxX = trackW() - knobW();
      if ((knob.offsetLeft || 0) >= maxX - 6) {
        state.done = true;
        el.classList.add("done");
        knob.style.left = (trackW() - knobW()) + "px";
        fill.style.width = "100%";
        setMsg("验证通过", "ok");
        onDone(true);
      } else {
        setMsg("未滑到底部，请重试", "err");
        reset();
      }
    }
    knob.addEventListener("pointerdown", function (e) {
      if (state.done) return;
      state.dragging = true;
      state.startX = e.clientX;
      state.startKnob = knob.offsetLeft || 0;
      try { knob.setPointerCapture(e.pointerId); } catch (err) {}
      knob.classList.add("active");
      setMsg("", "");
      e.preventDefault();
    });
    knob.addEventListener("pointermove", function (e) { if (state.dragging) setPos(state.startKnob + (e.clientX - state.startX)); e.preventDefault(); });
    knob.addEventListener("pointerup", onEnd);
    knob.addEventListener("pointercancel", onEnd);
    el.addEventListener("pointerup", onEnd);
    el.querySelector(".tp-refresh").addEventListener("click", function () { setMsg("", ""); reset(); });

    host.appendChild(el);
    return { refresh: function () { setMsg("", ""); reset(); } };
  }

  /* ---------- 方式 3：数字输入 ---------- */
  function buildInput(host, onDone) {
    var code = "";
    function gen() { var a = []; for (var i = 0; i < 4; i++) a.push(ALNUM[randInt(0, ALNUM.length - 1)]); return a.join(""); }
    function draw(ctx, canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f4f4f6";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(0,0,0,.08)";
      for (var i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(randInt(0, canvas.width), randInt(0, canvas.height));
        ctx.lineTo(randInt(0, canvas.width), randInt(0, canvas.height));
        ctx.stroke();
      }
      var x = 24;
      for (var j = 0; j < code.length; j++) {
        ctx.save();
        ctx.font = "700 26px 'Courier New', monospace";
        ctx.translate(x + 9, 40);
        ctx.rotate((randInt(-14, 14) * Math.PI) / 180);
        ctx.fillStyle = j % 2 ? "#0a0a0a" : "#4a4a50";
        ctx.fillText(code[j], 0, 0);
        ctx.restore();
        x += 36;
      }
    }
    function setMsg(t, kind) {
      var m = host.querySelector(".tp-msg");
      if (m) { m.textContent = t; m.className = "tp-msg " + (kind || ""); }
    }
    function refresh() {
      code = gen();
      onDone(false);
      render();
    }
    function render() {
      host.innerHTML =
        '<div class="tp-head"><span class="tp-title">输入下方字符</span><button type="button" class="tp-refresh">换一批</button></div>' +
        '<div class="tp-stage"><canvas width="180" height="70" class="tp-canvas"></canvas></div>' +
        '<div class="tp-input-row"><input type="text" class="tp-input" maxlength="4" autocomplete="off" autocapitalize="off" aria-label="验证码" placeholder="请输入 4 位字符"><button type="button" class="tp-btn">确认</button></div>' +
        '<div class="tp-state"><span class="tp-msg"></span></div>';
      var canvas = host.querySelector(".tp-canvas");
      var ctx = canvas.getContext("2d");
      var inp = host.querySelector(".tp-input");
      draw(ctx, canvas);
      host.querySelector(".tp-refresh").addEventListener("click", refresh);
      host.querySelector(".tp-btn").addEventListener("click", function () {
        if (state.done) return;
        var v = (inp.value || "").trim().toUpperCase();
        if (!v) { setMsg("请输入上方字符", "err"); return; }
        if (v === code) {
          state.done = true;
          setMsg("验证通过", "ok");
          inp.disabled = true;
          onDone(true);
        } else {
          setMsg("输入错误，正在生成新验证码…", "err");
          var self = thisMethod;
          clearTimeout(timer);
          timer = setTimeout(function () { refresh(); }, 800);
        }
      });
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") host.querySelector(".tp-btn").click(); });
      inp.focus();
    }
    var state = { done: false };
    var timer = null;
    refresh();
    var thisMethod = { refresh: refresh };
    return thisMethod;
  }

  /* ---------- 主控：方法切换 ---------- */
  var METHODS = [
    { key: "tap", label: "点字" },
    { key: "slide", label: "滑块" },
    { key: "input", label: "数字" }
  ];
  var BUILDERS = { tap: buildTap, slide: buildSlide, input: buildInput };

  function create(containerId) {
    var wrap = document.getElementById(containerId);
    if (!wrap) return null;

    var done = false;
    var current = null;
    var curKey = "tap";

    function buildBar() {
      var bar = document.createElement("div");
      bar.className = "tp-methods";
      METHODS.forEach(function (m) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "tp-method" + (m.key === curKey ? " on" : "");
        b.textContent = m.label;
        b.addEventListener("click", function () { switchTo(m.key); });
        bar.appendChild(b);
      });
      return bar;
    }

    function switchTo(key) {
      curKey = key;
      done = false;
      if (current && current._host) { current._host.innerHTML = ""; }
      wrap.innerHTML = "";
      var bar = buildBar();
      wrap.appendChild(bar);
      var host = document.createElement("div");
      host.className = "tp-host";
      wrap.appendChild(host);
      var builder = BUILDERS[key];
      current = builder(host, function (v) { done = v; if (v && window.showToast) window.showToast("人机验证通过", "success"); });
      current._host = host;
    }

    switchTo("tap");
    return {
      verify: function () { return done; },
      refresh: function () { switchTo(curKey); }
    };
  }

  window.TEXTPICK = { create: create };
})();