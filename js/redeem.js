/* ============================================================
   星河班 · 积分兑换
   ============================================================ */

(async function () {
  await STORE.ensureSeeded();
  const session = STORE.getSession();
  if (!session) { location.href = "login.html"; return; }

  const role = session.role;
  const canManage = ["teacher", "admin", "monitor", "superadmin"].includes(role);
  const isStudent = role === "student";

  const userbar = document.getElementById("userbar");
  const studentPanel = document.getElementById("studentPanel");
  const teacherPanel = document.getElementById("teacherPanel");

  const roleLabel = { admin: "班主任", teacher: "教师", monitor: "班委", superadmin: "超级管理员", student: "学生" }[role] || role;
  userbar.innerHTML = `
    <a href="profile.html" style="font-size:13.5px;color:var(--text-soft);">个人中心</a>
    <span class="u-name">${esc(session.name)}</span>
    <span class="u-role">${roleLabel}</span>
    ${["admin", "superadmin"].includes(role) ? '<a href="admin.html" style="font-size:13.5px;color:#0a0a0a;font-weight:600;">管理后台</a>' : ""}
    <button id="btnLogout">退出</button>
  `;
  document.getElementById("btnLogout").addEventListener("click", () => {
    STORE.logout(); location.href = "login.html";
  });

  const Prizes = [
    { icon: "文", name: "文具小奖品", cost: 5 },
    { icon: "影", name: "自选午间影片", cost: 10 },
    { icon: "座", name: "换座位特权", cost: 15 },
    { icon: "免", name: "免一次值日", cost: 20 },
  ];

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function renderStudent() {
    if (!isStudent) { studentPanel.innerHTML = ""; return; }
    const u = STORE.findById(session.id);
    const myRd = STORE.myRedeems();
    studentPanel.innerHTML = `
      <div class="panel">
        <h3>我的积分</h3>
        <div style="font-family:var(--font-black);font-size:38px;font-weight:700;color:${u.score < 0 ? "#b30000" : "var(--ink)"};">
          ${STORE.fmtMoney(u.score)}
        </div>
        <p style="font-size:13px;color:var(--text-soft);margin-bottom:20px;">可用积分</p>

        <h3 style="margin-bottom:10px;">兑换奖品</h3>
        <div>
          ${Prizes.map((p) => `
            <div class="redeem-item">
              <div class="ri-ic">${p.icon}</div>
              <div class="ri-body"><b>${p.name}</b><div class="ri-cost">需 ${p.cost} 分</div></div>
              <button class="btn-outline" style="padding:7px 16px;font-size:13px;" data-apply="${p.name}" data-cost="${p.cost}">申请</button>
            </div>`).join("")}
        </div>
        <div class="field" style="margin-top:16px;">
          <label>自定义兑换（项目 / 所需积分）</label>
          <div style="display:flex;gap:10px;">
            <input type="text" id="customItem" placeholder="项目名称" style="flex:1;">
            <input type="number" id="customCost" placeholder="积分" style="width:90px;">
          </div>
          <button class="btn btn-block" id="customApply" style="margin-top:10px;">提交申请</button>
        </div>
      </div>

      <div class="panel" style="margin-top:22px;">
        <h3>我的兑换记录</h3>
        ${myRd.length ? myRd.map((r) => `
          <div class="redeem-item">
            <div class="ri-ic">兑</div>
            <div class="ri-body"><b>${esc(r.item)}</b><div class="ri-cost">${r.cost} 分 · ${STORE.fmtTime(r.applyTs)}</div></div>
            <span class="chip-status ${r.status}">${r.status === "pending" ? "待审批" : r.status === "approved" ? "已通过" : "已拒绝"}</span>
          </div>`).join("") : '<p style="font-size:13px;color:var(--muted);">暂无兑换记录</p>'}
      </div>`;

    // 申请按钮
    studentPanel.querySelectorAll("[data-apply]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cost = parseFloat(btn.dataset.cost);
        const name = btn.dataset.apply;
        if (u.score < cost) { alert("积分不足，无法兑换"); return; }
        if (!confirm(`确认申请兑换「${name}」（${cost} 分）？`)) return;
        const r = STORE.applyRedeem(name, cost);
        if (r.ok) { alert("申请已提交，等待老师/班委审批"); renderStudent(); }
        else alert(r.msg);
      });
    });
    document.getElementById("customApply").addEventListener("click", () => {
      const item = document.getElementById("customItem").value.trim();
      const cost = document.getElementById("customCost").value;
      if (!item || !cost) { alert("请填写项目名称和积分"); return; }
      const r = STORE.applyRedeem(item, cost);
      if (r.ok) { alert("申请已提交"); renderStudent(); }
      else alert(r.msg);
    });
  }

  function renderTeacher() {
    if (!canManage) { teacherPanel.style.display = "none"; return; }
    teacherPanel.style.display = "";

    const pending = STORE.getRedeems().filter((r) => r.status === "pending");
    const students = STORE.getUsers().filter((u) => u.role === "student")
      .sort((a, b) => a.name.localeCompare(b.name, "zh"));

    teacherPanel.innerHTML = `
      <div class="panel">
        <h3>待审批兑换（${pending.length}）</h3>
        ${pending.length ? pending.map((r) => `
          <div class="redeem-item" data-id="${r.id}">
            <div class="ri-ic">兑</div>
            <div class="ri-body"><b>${esc(r.name)} · ${esc(r.item)}</b><div class="ri-cost">${r.cost} 分 · ${STORE.fmtTime(r.applyTs)}</div></div>
            <button class="btn-outline" style="padding:6px 13px;font-size:12.5px;margin-right:6px;" data-ok="${r.id}">通过</button>
            <button class="btn-outline" style="padding:6px 13px;font-size:12.5px;" data-no="${r.id}">拒绝</button>
          </div>`).join("")
          : '<p style="font-size:13px;color:var(--muted);">暂无待审批兑换</p>'}

        <h3 style="margin-top:24px; margin-bottom:10px;">线下直接扣分</h3>
        <div class="field">
          <label for="offStudent">选择学生</label>
          <select id="offStudent">${students.map((s) => `<option value="${s.id}">${esc(s.name)}（当前 ${STORE.fmtMoney(s.score)} 分）</option>`).join("")}</select>
        </div>
        <div class="field">
          <label for="offItem">兑换项目（可选）</label>
          <input type="text" id="offItem" placeholder="例如：换座位">
        </div>
        <div class="field">
          <label for="offCost">扣除积分</label>
          <input type="number" id="offCost" step="0.01" placeholder="例如 10">
        </div>
        <button class="btn btn-block" id="offBtn">确认扣分</button>
      </div>`;

    teacherPanel.querySelectorAll("[data-ok]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("确认通过该兑换并扣分？")) return;
        const r = STORE.reviewRedeem(btn.dataset.ok, true);
        if (r.ok) { alert("已通过，积分已扣除"); renderTeacher(); }
        else alert(r.msg);
      });
    });
    teacherPanel.querySelectorAll("[data-no]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = STORE.reviewRedeem(btn.dataset.no, false);
        if (r.ok) { alert("已拒绝"); renderTeacher(); }
        else alert(r.msg);
      });
    });
    document.getElementById("offBtn").addEventListener("click", () => {
      const sid = document.getElementById("offStudent").value;
      const item = document.getElementById("offItem").value.trim();
      const cost = document.getElementById("offCost").value;
      if (!cost || parseFloat(cost) <= 0) { alert("请填写扣除积分"); return; }
      const r = STORE.offlineDeduct(sid, item, cost);
      if (r.ok) { alert("已扣分"); renderTeacher(); }
      else alert(r.msg);
    });
  }

  renderStudent();
  renderTeacher();
})();