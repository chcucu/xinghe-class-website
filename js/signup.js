/* ============================================================
   星河班 · 活动接龙 / 报名
   ============================================================ */

(async function () {
  await STORE.ensureSeeded();

  const s = STORE.getSession();
  if (!s) { location.href = "login.html"; return; }
  const canManage = STORE.canManageSignup(s.role);
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  if (canManage) document.getElementById("createPanel").style.display = "";

  document.getElementById("btnCreateSignup").addEventListener("click", () => {
    const title = document.getElementById("sgTitle").value;
    const items = document.getElementById("sgItems").value.split("\n").map((x) => x.trim()).filter(Boolean);
    const r = STORE.createSignup({
      title,
      desc: document.getElementById("sgDesc").value,
      items: items.length ? items : ["参加", "不参加"],
      deadline: document.getElementById("sgDeadline").value,
    });
    if (!r.ok) { alert(r.msg); return; }
    render();
    document.getElementById("sgTitle").value = "";
    document.getElementById("sgDesc").value = "";
    document.getElementById("sgItems").value = "";
  });

  function render() {
    const list = STORE.getSignups();
    document.getElementById("signupList").innerHTML = list.length
      ? list.map((sg) => card(sg)).join("")
      : '<div class="panel" style="grid-column:1/-1;"><span class="muted-note">暂无接龙活动</span></div>';
  }

  function badge(label, active) {
    return `<span style="display:inline-block;font-family:var(--font-play);font-size:11.5px;color:#fff;background:${active ? "#000" : "#999"};padding:2px 10px;border-radius:999px;">${label}</span>`;
  }

  function card(sg) {
    const mine = STORE.mySignup(sg.id);
    const total = sg.responses.length;
    const counts = {};
    sg.items.forEach((it) => { counts[it] = sg.responses.filter((r) => r.choice === it).length; });
    return `
      <div class="panel" style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <b style="font-size:16px;">${esc(sg.title)}</b>
          ${sg.open ? badge("进行中", true) : badge("已截止", false)}
        </div>
        ${sg.desc ? `<div class="muted-note">${esc(sg.desc)}</div>` : ""}
        <div class="muted-note" style="font-size:12px;">发起人：${esc(sg.createBy)} · 已报名 ${total} 人${sg.deadline ? " · 截止 " + esc(sg.deadline) : ""}</div>

        <div style="margin-top:4px;">
          ${sg.items.map((it) => {
            const c = counts[it] || 0;
            const checked = mine && mine.choice === it;
            return `<button class="seg-btn ${checked ? "active" : ""} opt-btn" data-sg="${sg.id}" data-opt="${esc(it)}" ${sg.open ? "" : "disabled"} style="margin:0 6px 6px 0;">
              ${esc(it)}（${c}）
            </button>`;
          }).join("")}
          ${mine ? `<span class="muted-note" style="margin-left:4px;">我的选择：${esc(mine.choice)}</span>` : ""}
        </div>

        ${mine && mine.note ? `<div class="muted-note">备注：${esc(mine.note)}</div>` : ""}
        ${canManage ? `<div class="muted-note" style="border-top:1px solid var(--line-2);padding-top:8px;font-size:12.5px;"><b>报名名单：</b>${sg.responses.length ? sg.responses.map((r) => esc(r.name) + (r.choice === "参加" || !sg.items.length ? "" : "（" + esc(r.choice) + "）") + (r.note ? "{" + esc(r.note) + "}" : "")).join("、") : "暂无"}</div>` : ""}
        ${canManage && sg.open ? `<button class="btn btn-sm sg-close" data-sg="${sg.id}" style="align-self:flex-start;margin-top:4px;">截止接龙</button>` : ""}
      </div>`;
  }

  document.getElementById("signupList").addEventListener("click", (e) => {
    const opt = e.target.closest(".opt-btn");
    if (opt) {
      const sgId = opt.dataset.sg;
      const choice = opt.dataset.opt;
      const note = prompt("备注（可选，可留空）", "");
      if (note === null) return;
      const r = STORE.signupRespond(sgId, { choice, note });
      alert(r.ok ? "已报名" : r.msg);
      render();
      return;
    }
    const close = e.target.closest(".sg-close");
    if (close) {
      if (!confirm("确定截止该接龙？")) return;
      STORE.closeSignup(close.dataset.sg);
      render();
    }
  });

  render();
})();