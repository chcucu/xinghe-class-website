/* ============================================================
   星河班 · 数据统计（SVG 自绘，无外部依赖）
   ============================================================ */

(async function () {
  await STORE.ensureSeeded();
  const session = STORE.getSession();
  if (!session) { location.href = "login.html"; return; }

  const role = session.role;
  const userbar = document.getElementById("userbar");
  const roleLabel = { admin: "班主任", teacher: "教师", monitor: "班委", student: "学生" }[role] || role;
  userbar.innerHTML = `<a href="profile.html" style="font-size:13.5px;color:var(--text-soft);">个人中心</a>` +
    `<span class="u-name">${esc(session.name)}</span><span class="u-role">${roleLabel}</span>` +
    `${["admin", "superadmin"].includes(role) ? '<a href="admin.html" style="font-size:13.5px;color:#0a0a0a;font-weight:600;">管理后台</a>' : ""}` +
    `<button id="btnLogout">退出</button>`;
  document.getElementById("btnLogout").addEventListener("click", () => { STORE.logout(); location.href = "login.html"; });

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  /* ---------- 个人趋势曲线 ---------- */
  function renderTrend() {
    const host = document.getElementById("trendChart");
    // myLedger 返回该生流水（新→旧）；这里转为旧→新以便累计
    const ledger = STORE.myLedger().slice().reverse();
    if (!ledger.length) {
      host.innerHTML = '<p style="font-size:13px;color:var(--muted);">暂无积分变动记录。老师/班委调整分数后，这里会显示你的积分趋势。</p>';
      return;
    }
    // 初始分 = 当前分 - 全部变动之和
    const me = STORE.findById(session.id);
    let init = me ? me.score : 0;
    ledger.forEach((r) => { init -= r.delta; });
    init = Math.round(init * 100) / 100;

    const vals = [init];
    const labels = ["初始"];
    ledger.forEach((r) => {
      vals.push(Math.round(r.after * 100) / 100);
      labels.push(STORE.fmtTime(r.ts));
    });

    host.innerHTML = lineChart(vals, labels);
  }

  /* ---------- 全班分布柱状图 ---------- */
  function renderDist() {
    const host = document.getElementById("distChart");
    const list = STORE.leaderboard();
    const vals = list.map((u) => u.score);
    const names = list.map((u) => u.name);
    host.innerHTML = barChart(vals, names);
  }

  function lineChart(values, labels) {
    const W = 520, H = 240, padL = 52, padR = 16, padT = 18, padB = 30;
    const min = Math.min(...values), max = Math.max(...values);
    const range = (max - min) || 1;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const px = (i) => padL + (i / (values.length - 1)) * innerW;
    const py = (v) => padT + (1 - (v - min) / range) * innerH;

    let pts = values.map((v, i) => `${px(i)},${py(v)}`).join(" ");
    let grid = "";
    for (let g = 0; g <= 4; g++) {
      const y = padT + (g / 4) * innerH;
      const val = max - (g / 4) * range;
      grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(0,0,0,.08)"/>`;
      grid += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#a1a1a6">${Math.round(val * 100) / 100}</text>`;
    }
    const dots = values.map((v, i) => `<circle cx="${px(i)}" cy="${py(v)}" r="3.5" fill="#000"/>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%;">
      ${grid}
      <polyline points="${pts}" fill="none" stroke="#000" stroke-width="2" stroke-linejoin="round"/>
      ${dots}
    </svg>`;
  }

  function barChart(values, names) {
    const W = 520, H = 240, padL = 50, padR = 10, padT = 18, padB = 40;
    const max = Math.max(...values.map((v) => Math.abs(v)), 1);
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const bw = innerW / values.length;

    let bars = "";
    values.forEach((v, i) => {
      const x = padL + i * bw + bw * 0.15;
      const w = bw * 0.7;
      const h = (Math.abs(v) / max) * innerH;
      const y = v >= 0 ? padT + (1 - Math.abs(v) / max) * innerH : padT + innerH;
      const color = v < 0 ? "#b30000" : "#000";
      bars += `<rect x="${x}" y="${Math.min(y, H - padB)}" width="${w}" height="${Math.max(h, 1)}" fill="${color}" rx="2"/>`;
      if (names.length <= 12) {
        bars += `<text x="${x + w / 2}" y="${H - padB + 16}" text-anchor="middle" font-size="9" fill="#6e6e73">${names[i]}</text>`;
      }
    });

    let grid = "";
    for (let g = 0; g <= 4; g++) {
      const y = padT + (g / 4) * innerH;
      const val = max - (g / 4) * max;
      grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(0,0,0,.08)"/>`;
      grid += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#a1a1a6">${Math.round(val)}</text>`;
    }

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%;">${grid}${bars}</svg>`;
  }

  renderTrend();
  renderDist();
})();