/* ============================================================
  星河班 · 滑钮式人机验证（自包含，前端判断）
  手机 / 平板 / 电脑通用：按住右侧滑块，向右拖动到底即通过。
  使用 Pointer Events，触屏与鼠标统一处理。
  暴露 window.TEXTPICK = { create(containerId) -> { verify, refresh } }
  ============================================================ */
(function () {
  // 生成验证单元 DOM（安全方式，不使用 innerHTML 拼接脚本）
  function elFrom(html) {
    var d = document.createElement("div");
    d.innerHTML = html;
    return d.firstChild;
  }

  function svgChevron() {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  }

  function create(containerId) {
    var wrap = document.getElementById(containerId);
    if (!wrap) return null;

    var state = { done: false, dragging: false, startX: 0, startKnob: 0 };

    var el = elFrom(
      '<div class="tp-slider">' +
        '<div class="tp-st">' +
          '<div class="tp-slider-track"></div>' +
          '<div class="tp-slider-fill" style="width:0"></div>' +
          '<div class="tp-slider-text">按住滑块，向右拖动到底完成验证</div>' +
          '<div class="tp-slider-ok">✓</div>' +
          '<div class="tp-slider-knob" role="slider" aria-label="拖动完成验证">' + svgChevron() + '</div>' +
        '</div>' +
        '<div class="tp-foot">' +
          '<span class="tp-msg"></span>' +
          '<button type="button" class="tp-refresh">换一个</button>' +
        '</div>' +
      '</div>'
    );

    var track = el.querySelector(".tp-slider-track");
    var fill = el.querySelector(".tp-slider-fill");
    var text = el.querySelector(".tp-slider-text");
    var ok = el.querySelector(".tp-slider-ok");
    var knob = el.querySelector(".tp-slider-knob");
    var msg = el.querySelector(".tp-msg");

    function setMsg(t, kind) {
      if (!msg) return;
      msg.textContent = t || "";
      msg.className = "tp-msg " + (kind || "");
    }

    function trackW() { return track.clientWidth || 300; }
    function knobW() { return knob.offsetWidth || 44; }

    function setDone() {
      state.done = true;
      el.classList.add("done");
      var w = trackW();
      knob.style.left = (w - knobW()) + "px";
      fill.style.width = "100%";
      setMsg("验证通过", "ok");
    }

    function reset() {
      state.done = false;
      el.classList.remove("done");
      knob.style.left = "0px";
      fill.style.width = "0px";
      knob.classList.remove("active");
      el.classList.remove("nudge");
      // 触发一次轻微抖动提示，避免静默无反馈
      void el.offsetWidth;
      el.classList.add("nudge");
      setTimeout(function () { el.classList.remove("nudge"); }, 360);
    }

    function setPos(x) {
      var maxX = trackW() - knobW();
      var px = Math.max(0, Math.min(x, maxX));
      knob.style.left = px + "px";
      fill.style.width = (px + knobW()) + "px";
      return px;
    }

    function onStart(e) {
      if (state.done) return;
      state.dragging = true;
      state.startX = e.clientX;
      state.startKnob = knob.offsetLeft || 0;
      try { knob.setPointerCapture(e.pointerId); } catch (err) {}
      knob.classList.add("active");
      setMsg("", "");
      e.preventDefault();
    }

    function onMove(e) {
      if (!state.dragging) return;
      setPos(state.startKnob + (e.clientX - state.startX));
      e.preventDefault();
    }

    function onEnd() {
      if (!state.dragging) return;
      state.dragging = false;
      knob.classList.remove("active");
      var maxX = trackW() - knobW();
      if ((knob.offsetLeft || 0) >= maxX - 6) {
        setDone();
      } else {
        setMsg("未滑到底部，请重试", "err");
        reset();
      }
    }

    knob.addEventListener("pointerdown", onStart);
    knob.addEventListener("pointermove", onMove);
    knob.addEventListener("pointerup", onEnd);
    knob.addEventListener("pointercancel", onEnd);
    // 处理在滑块上按下但手指滑出滑块的情况
    el.addEventListener("pointerup", onEnd);

    function refresh() {
      reset();
      setMsg("", "");
      el.classList.remove("done");
      knob.style.left = "0px";
      fill.style.width = "0px";
    }
    el.querySelector(".tp-refresh").addEventListener("click", refresh);

    wrap.innerHTML = "";
    wrap.appendChild(el);
    refresh();

    return {
      verify: function () { return state.done; },
      refresh: function () {
        refresh();
        return state.done;
      }
    };
  }

  window.TEXTPICK = { create: create };
})();