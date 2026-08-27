/* ============================================================
   星河班 · 操行银行 三维排行榜
   - 周期：总榜 / 本周 / 本月
   - 视图：个人榜 / 小组榜 / 明星榜
   - 老师/班委：批量评分 + 评选周/月之星
   ============================================================ */

(async function () {
  await STORE.ensureSeeded();

  const session = STORE.getSession();
  if (!session) { location.href = "login.html"; return; }
  const role = session.role;
  const canEdit = ["teacher", "admin", "monitor", "superadmin"].includes(role);

  const metaTime = document.getElementById("metaTime");
  const metaOperator = document.getElementById("metaOperator");
  const rankBody = document.getElementById("rankBody");
  const colScoreHead = document.getElementById("colScoreHead");

  let period = "all";
  let view = "person";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---- 周期切换 ---- */
  document.querySelectorAll(".seg-btn[data-period]").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".seg-btn[data-period]").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      period = b.dataset.period;
      render();
    });
  });
  document.querySelectorAll(".admin-tabs button[data-view]").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".admin-tabs button[data-view]").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      view = b.dataset.view;
      render();
    });
  });

  /* ---- 编辑工具条 ---- */
  const editPanel = document.getElementById("editPanel");
  if (canEdit) editPanel.style.display = "";

  // 批量评分
  const selected = new Set();
  function renderBatchTargets() {
    const list = STORE.getUsers().filter((u) => u.role === "student" || u.role === "superadmin");
    document.getElementById("batchTargets").innerHTML = list.map((u) => {
      const id = u.id;
      return `<span class="batch-chip ${selected.has(id) ? "selected" : ""}" data-id="${id}">${esc(u.nickname || u.name)}</span>`;
    }).join("");
    document.querySelectorAll(".batch-chip[data-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.id;
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        el.classList.toggle("selected");
      });
    });
  }
  document.getElementById("btnBatchApply").addEventListener("click", () => {
    if (!selected.size) { alert("请先选择同学"); return; }
    const d = document.getElementById("batchDelta").value;
    if (d === "") { alert("请填写变动值"); return; }
    const cat = document.getElementById("batchCategory").value;
    const r = STORE.batchApplyDelta([...selected], d, document.getElementById("batchReason").value.trim(), cat);
    alert(r.ok ? "已为 " + r.count + " 位同学操作" : r.msg);
    render();
    renderStarShow();
    renderBatchTargets();
  });

  // 周之星 / 月之星
  function fillStarUser() {
    const list = STORE.getUsers().filter((u) => u.role === "student" || u.role === "superadmin");
    document.getElementById("starUser").innerHTML = list.map((u) => `<option value="${u.id}">${esc(u.nickname || u.name)}</option>`).join("");
  }
  function renderStarShow() {
    const w = STORE.currentStar("week"); const m = STORE.currentStar("month");
    const line = (t, s) => t ? `◇ ${s.nickname || s.name}${s.reason ? "（" + esc(s.reason) + "）" : ""} · ${STORE.fmtTime(s.ts)}` : "（尚未评选）";
    document.getElementById("starShow").innerHTML = `周之星：${line("week", w)}<br>月之星：${line("month", m)}`;
  }
  document.getElementById("btnSetStar").addEventListener("click", () => {
    const type = document.getElementById("starType").value;
    const uid = document.getElementById("starUser").value;
    const reason = prompt("给" + (type === "week" ? "周之星" : "月之星") + "的评语（可选）", "");
    if (reason === null) return;
    const r = STORE.setStar(type, uid, reason || "");
    alert(r.ok ? "已评选" : r.msg);
    renderStarShow();
  });

  /* ---- 渲染 ---- */
  function render() {
    const meta = STORE.getMeta();
    metaTime.textContent = STORE.fmtTime(meta.lastUpdate);
    metaOperator.textContent = meta.lastOperator || "—";

    if (view === "group") {
      colScoreHead.textContent = period === "all" ? "小组总分" : (period === "week" ? "本周得分" : "本月得分");
      renderGroup();
    } else {
      colScoreHead.textContent = period === "all" ? "当前积分" : (period === "week" ? "本周得分" : "本月得分");
      view === "star" ? renderStar() : renderPerson();
    }
  }

  function rankBadge(rank) {
    const cls = rank <= 3 ? "top" + rank : "";
    return `<span class="rank-badge ${cls}">${rank}</span>`;
  }

  function renderPerson() {
    const list = STORE.rankPeriod(period);
    if (!list.length) { rankBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-soft);">暂无数据</td></tr>'; return; }
    rankBody.innerHTML = list.map((u) => {
      const neg = u.score < 0;
      return `<tr${canEdit ? ` data-id="${u.id}"` : ""}>
        <td>${rankBadge(u.rank)}</td>
        <td><span class="rank-name">${esc(u.nickname || u.name)}</span></td>
        <td><span class="rank-name" style="font-size:13px;color:var(--text-soft);">${esc(u.groupName)}</span></td>
        <td style="text-align:right;"><span class="rank-score ${neg ? "neg" : ""}">${STORE.fmtMoney(u.score)}</span></td>
      </tr>`;
    }).join("");
    if (canEdit) {
      rankBody.querySelectorAll("tr[data-id]").forEach((tr) => {
        tr.style.cursor = "pointer";
        tr.addEventListener("click", () => openEdit(tr.dataset.id));
      });
    }
  }

  function renderGroup() {
    const list = STORE.groupRank(period);
    if (!list.length) { rankBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-soft);">暂无小组数据</td></tr>'; return; }
    rankBody.innerHTML = list.map((g) => {
      const neg = g.score < 0;
      return `<tr>
        <td>${rankBadge(list.indexOf(g) + 1)}</td>
        <td><span class="rank-name">${esc(g.name)}</span><div style="font-size:12.5px;color:var(--text-soft);">组长：${esc(g.leaderName)} · ${g.members} 人</div></td>
        <td></td>
        <td style="text-align:right;"><span class="rank-score ${neg ? "neg" : ""}">${STORE.fmtMoney(g.score)}</span></td>
      </tr>`;
    }).join("");
  }

  function renderStar() {
    const list = STORE.rankPeriod(period).slice(0, 10);
    const medals = ["gold", "silver", "bronze"];
    rankBody.innerHTML = '<tr><td colspan="4" style="padding:0;border:none;">' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">' +
      list.map((u, i) =>
        `<div class="star-card ${medals[i] || ""}">
          <span class="sc-rank">TOP ${i + 1}</span>
          <span class="sc-name">${esc(u.nickname || u.name)}${u.groupName ? '<span style="color:var(--text-soft);font-weight:400;font-size:12.5px;"> · ' + esc(u.groupName) + "</span>" : ""}</span>
          <span class="sc-score">${STORE.fmtMoney(u.score)} 分</span>
        </div>`
      ).join("") +
      '</div></td></tr>';
  }

  /* ---- 单同学编辑弹窗 ---- */
  const editModal = document.getElementById("editModal");
  let editingId = null;
  function openEdit(id) {
    const u = STORE.findById(id); if (!u) return;
    editingId = id;
    document.getElementById("editTitle").textContent = "调整「" + u.name + "」的积分";
    document.getElementById("editSub").innerHTML = `当前累计：<b>${STORE.fmtMoney(u.score)}</b> 分`;
    document.getElementById("deltaVal").value = "";
    document.getElementById("deltaCategory").value = "";
    document.getElementById("deltaReason").value = "";
    editModal.classList.add("open");
    setTimeout(() => document.getElementById("deltaVal").focus(), 60);
  }
  function closeEdit() { editModal.classList.remove("open"); editingId = null; }
  editModal.addEventListener("click", (e) => { if (e.target === editModal) closeEdit(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && editModal.classList.contains("open")) closeEdit(); });
  document.getElementById("editConfirm").addEventListener("click", () => {
    if (!editingId) return;
    const d = document.getElementById("deltaVal").value;
    if (d === "") { alert("请填写变动值"); return; }
    const cat = document.getElementById("deltaCategory").value;
    const r = STORE.applyDelta(editingId, d, document.getElementById("deltaReason").value.trim(), cat);
    if (!r.ok) { alert(r.msg); return; }
    closeEdit();
    render();
  });

  /* ---- 初始化 ---- */
  if (canEdit) { renderBatchTargets(); fillStarUser(); renderStarShow(); }
  render();
})();