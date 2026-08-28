/* ============================================================
   星河班 · 班级商店（市场监督管理局 + 货架）
   ============================================================ */

(async function () {
  await STORE.ensureSeeded();

  const s = STORE.getSession();
  if (!s) { location.href = "login.html"; return; }
  const me = STORE.findById(s.id);

  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const isShichang = STORE.canEditDept("shichang");
  const teacher = me.role === "teacher" || me.role === "admin" || me.role === "superadmin";
  const isStudent = me.role === "student" || me.role === "superadmin";

  /* ---- 零花钱兑换（孩子 ↔ 家长） ---- */
  const cashoutPanel = document.getElementById("cashoutPanel");
  if (isStudent) {
    cashoutPanel.style.display = "";
    renderCashout();
  } else if (me.role === "parent") {
    cashoutPanel.style.display = "";
    document.getElementById("cashoutBox").innerHTML =
      '<span class="muted-note">你是家长身份：请前往<a href="profile.html" style="color:var(--accent);">个人中心</a>设置兑换比例、审批孩子的零花钱申请并记录已兑换金额。</span>';
  }

  function renderCashout() {
    const box = document.getElementById("cashoutBox");
    const parent = STORE.myParent();
    const rate = STORE.cashoutRate();
    const self = STORE.findById(s.id);
    const score = self ? self.score : 0;

    if (!parent) {
      box.innerHTML =
        '<div class="pc-alert" style="border:1px dashed var(--line-2);border-radius:var(--radius-md);padding:14px;background:var(--bg-soft);">' +
          '<b>尚未绑定家长</b><p class="muted-note" style="margin-top:6px;margin-bottom:0;">零花钱兑换需要先绑定家长。请让家长在<b>注册</b>时选择你作为“孩子”完成绑定；绑定后即可在这里用积分向家长兑换零花钱。</p>' +
        '</div>' +
        '<div id="cashoutHistory" style="margin-top:16px;"></div>';
      renderCashoutHistory();
      return;
    }

    const pname = esc(parent.name);
    box.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin-bottom:16px;">' +
        '<div style="flex:1;min-width:180px;"><span class="muted-note">当前积分</span><div style="font-family:var(--font-black);font-size:26px;">' + STORE.fmtMoney(score) + ' 分</div></div>' +
        '<div style="flex:1;min-width:180px;"><span class="muted-note">兑换比例（家长 ' + pname + ' 设置）</span><div style="font-family:var(--font-black);font-size:26px;">1 分 = ' + rate + ' 元</div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:12px;">' +
        '<div class="field"><label>兑换积分</label><input class="mini" id="coPoints" type="number" step="0.01" min="0" placeholder="输入要兑换的积分" style="width:100%;"></div>' +
        '<div class="field"><label>备注（可选）</label><input class="mini" id="coNote" maxlength="60" placeholder="例如：本周表现好，奖励一下" style="width:100%;"></div>' +
        '<div class="field" style="display:flex;align-items:flex-end;gap:10px;">' +
          '<button class="btn" id="btnCashout" style="flex:1;">提交兑换申请</button>' +
          '<span class="muted-note" id="coPreview" style="line-height:1.3;flex:1;min-width:120px;"></span>' +
        '</div>' +
      '</div>' +
      '<div id="cashoutHistory"></div>';

    // 实时预览金额
    const coPoints = document.getElementById("coPoints");
    const coPreview = document.getElementById("coPreview");
    const upd = () => {
      const v = Number(coPoints.value);
      if (isNaN(v) || v <= 0) { coPreview.textContent = ""; return; }
      const m = Math.round(v * rate * 100) / 100;
      coPreview.innerHTML = "约可兑换 <b style='font-family:var(--font-black);'>" + m + " 元</b>";
    };
    coPoints.addEventListener("input", upd);

    document.getElementById("btnCashout").addEventListener("click", () => {
      const r = STORE.applyCashout(coPoints.value, document.getElementById("coNote").value.trim());
      if (r.ok) {
        window.showToast("已向家长发送兑换申请：" + r.money + " 元，等待确认", "success");
        coPoints.value = ""; document.getElementById("coNote").value = ""; upd();
        renderCashoutHistory();
      } else {
        window.showToast(r.msg, "error");
      }
    });

    renderCashoutHistory();
  }

  function renderCashoutHistory() {
    const host = document.getElementById("cashoutHistory");
    if (!host) return;
    const list = STORE.myCashouts();
    const stLabel = { pending: "待家长确认", paid: "已兑换", rejected: "家长已拒绝" };
    const stColor = { pending: "var(--accent)", paid: "#1a7f37", rejected: "#b30000" };
    host.innerHTML = list.length
      ? '<div style="font-size:13px;margin-bottom:6px;"><b>我的兑换记录</b></div>' +
        list.slice(0, 20).map((c) =>
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-2);">' +
            '<span>' + (c.type === "manual" ? "家长登记 · " : "") + STORE.fmtMoney(c.money) + ' 元' +
              (c.type === "apply" ? ' <span class="muted-note">(' + c.points + ' 分)</span>' : "") +
              (c.note ? ' <span class="muted-note">' + esc(c.note) + '</span>' : "") +
            '</span>' +
            '<span style="font-size:12.5px;color:' + stColor[c.status] + ';">' + (stLabel[c.status] || c.status) + '</span>' +
          '</div>'
        ).join("")
      : '<span class="muted-note">还没有兑换记录。</span>';
  }

  /* ---- 市监局审批面板 ---- */
  const shichangPanel = document.getElementById("shichangPanel");
  if (isShichang) {
    shichangPanel.style.display = "grid";
    renderReviews();
  }

  function renderReviews() {
    // 执照待审
    const pendingLic = STORE.getLicenses().filter((l) => l.status === "pending");
    document.getElementById("licReview").innerHTML = pendingLic.length
      ? pendingLic.map((l) =>
        `<div style="border:1px solid var(--line-2);border-radius:var(--radius-md);padding:12px;margin-bottom:10px;">
          <b>${esc(l.name)}</b> 申请营业执照<br>
          <span class="muted-note">经营范围：${esc(l.scope)} · 申请人：${esc(l.applicant)} · 营业人员：${esc(l.staff)}</span>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn btn-sm btn-approve" data-lid="${l.id}">批准</button>
            <button class="btn btn-sm btn-reject" data-lid="${l.id}">驳回</button>
          </div>
        </div>`
      ).join("")
      : '<span class="muted-note">暂无待审执照</span>';

    // 商品待审
    const pendingProd = STORE.getProducts().filter((p) => p.status === "pending");
    document.getElementById("prodReview").innerHTML = pendingProd.length
      ? pendingProd.map((p) =>
        `<div style="border:1px solid var(--line-2);border-radius:var(--radius-md);padding:12px;margin-bottom:10px;">
          <b>${esc(p.title)}</b> · ${p.type === "physical" ? "实物" : "虚拟"} · ${STORE.fmtMoney(p.price)} 分<br>
          <span class="muted-note">卖家：${esc(p.name)} · ${esc(p.desc || "暂无描述")}</span>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn btn-sm btn-pub-approve" data-pid="${p.id}">上架</button>
            <button class="btn btn-sm btn-pub-reject" data-pid="${p.id}">拒绝</button>
          </div>
        </div>`
      ).join("")
      : '<span class="muted-note">暂无待审商品</span>';

    // bind
    document.querySelectorAll(".btn-approve").forEach((b) => {
      b.addEventListener("click", () => { const r = STORE.reviewLicense(b.dataset.lid, true); r.ok ? window.showToast("执照已批准", "success") : window.showToast(r.msg, "error"); renderReviews(); renderLicense(); renderShell(); });
    });
    document.querySelectorAll(".btn-reject").forEach((b) => {
      b.addEventListener("click", () => { const reason = prompt("驳回理由（可选）", ""); if (reason === null) return; const r = STORE.reviewLicense(b.dataset.lid, false, reason); r.ok ? window.showToast("执照已驳回", "success") : window.showToast(r.msg, "error"); renderReviews(); renderLicense(); });
    });
    document.querySelectorAll(".btn-pub-approve").forEach((b) => {
      b.addEventListener("click", () => { const r = STORE.reviewProduct(b.dataset.pid, true); r.ok ? window.showToast("商品已上架", "success") : window.showToast(r.msg, "error"); renderReviews(); renderShell(); });
    });
    document.querySelectorAll(".btn-pub-reject").forEach((b) => {
      b.addEventListener("click", () => { const reason = prompt("拒绝理由（可选）", ""); if (reason === null) return; const r = STORE.reviewProduct(b.dataset.pid, false, reason); r.ok ? window.showToast("商品已拒绝上架", "success") : window.showToast(r.msg, "error"); renderReviews(); });
    });
  }

  /* ---- 我的店铺 ---- */
  function renderLicense() {
    const l = STORE.myLicense();
    const box = document.getElementById("myLicenseBox");
    if (teacher) {
      box.innerHTML = '<span class="pc-role" style="margin-top:8px;">教师身份：免执照可直接发布商品</span>';
      document.getElementById("myPublish").style.display = "";
      return;
    }
    if (!l) {
      box.innerHTML = '<span class="muted-note">你尚未申请营业执照</span>';
      document.getElementById("myLicApply").style.display = "";
      document.getElementById("myPublish").style.display = "none";
      return;
    }
    const stLabel = l.status === "approved" ? "已核准" : l.status === "rejected" ? "未通过" : "审批中";
    box.innerHTML = `<div style="border:1px solid var(--line-2);border-radius:var(--radius-md);padding:14px;">
        <b>营业执照 · ${stLabel}</b><br>
        <span class="muted-note">经营范围：${esc(l.scope)} · 申请人：${esc(l.applicant)} · 营业人员：${esc(l.staff)}</span>
        ${l.status === "rejected" ? '<br><span class="muted-note">原因：' + esc(l.reason) + '</span>' : ""}
      </div>`;
    if (l.status === "approved") document.getElementById("myPublish").style.display = "";
    document.getElementById("myLicApply").style.display = "none";
  }
  renderLicense();

  // 申请执照
  document.getElementById("btnApplyLicense").addEventListener("click", () => {
    const r = STORE.applyLicense({
      scope: document.getElementById("licScope").value,
      applicant: document.getElementById("licApplicant").value,
      staff: document.getElementById("licStaff").value,
    });
    if (r.ok) { window.showToast("申请已提交，等待市监局审批", "success"); } else { window.showToast(r.msg, "error"); }
    renderLicense();
  });

  // 发布商品
  document.getElementById("btnPublishProduct").addEventListener("click", () => {
    const r = STORE.publishProduct({
      title: document.getElementById("prodTitle").value,
      desc: document.getElementById("prodDesc").value,
      type: document.getElementById("prodType").value,
      price: document.getElementById("prodPrice").value,
      stock: document.getElementById("prodStock").value,
      cover: document.getElementById("prodCover").value,
    });
    if (r.ok) { window.showToast(r.msg, "success"); } else { window.showToast(r.msg, "error"); }
    renderMyProducts();
    renderShell();
    renderReviews();
  });

  function renderMyProducts() {
    const list = STORE.myProducts();
    document.getElementById("myProductList").innerHTML = list.length
      ? '<div style="font-size:13px;margin-bottom:6px;"><b>我发布的商品</b></div>' +
        list.map((p) =>
          `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-2);">
            <span>${esc(p.title)} · <span class="muted-note">${p.status === "published" ? "已上架" : p.status === "pending" ? "审批中" : "未通过"}</span></span>
            <button class="btn btn-sm btn-delete-prod" data-pid="${p.id}" style="padding:4px 12px;font-size:12px;">删除</button>
          </div>`
        ).join("")
      : '';
    document.querySelectorAll(".btn-delete-prod").forEach((b) => {
      b.addEventListener("click", () => { if (!confirm("确认删除此商品？")) return; const r = STORE.deleteProduct(b.dataset.pid); r.ok ? window.showToast("商品已删除", "success") : window.showToast(r.msg, "error"); renderMyProducts(); renderShell(); });
    });
  }
  renderMyProducts();

  /* ---- 执照公示 ---- */
  function renderLicenseBoard() {
    const approved = STORE.getLicenses().filter((l) => l.status === "approved");
    document.getElementById("licBoard").innerHTML = approved.length
      ? approved.map((l) =>
        `<div class="panel" style="padding:14px;">
          <b>${esc(l.name)}</b>
          <div class="muted-note" style="margin-top:4px;">经营范围：${esc(l.scope)}<br>申请人：${esc(l.applicant)}<br>营业人员：${esc(l.staff)}</div>
        </div>`
      ).join("")
      : '<span class="muted-note">暂无公示店铺</span>';
  }
  renderLicenseBoard();

  /* ---- 我的购买记录 ---- */
  function renderMyOrders() {
    const list = STORE.myOrders();
    document.getElementById("myOrderList").innerHTML = list.length
      ? list.map((o) =>
          `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-2);">
            <span>${esc(o.title)}</span>
            <span class="muted-note">${STORE.fmtMoney(o.price)} 分 · ${esc(STORE.fmtTime(o.ts))}</span>
          </div>`
        ).join("")
      : '<span class="muted-note">暂无购买记录</span>';
  }
  renderMyOrders();

  /* ---- 货架 ---- */
  function renderShell() {
    const list = STORE.publishedProducts();
    document.getElementById("storeShell").innerHTML = list.length
      ? list.map((p) =>
        `<div class="panel" style="padding:0;overflow:hidden;">
          ${p.cover ? '<div style="height:140px;background:#f5f5f5;background-image:url(' + esc(p.cover) + ');background-size:cover;background-position:center;"></div>' : '<div style="height:140px;background:var(--bg-soft);display:grid;place-items:center;color:var(--muted);">商品图片</div>'}
          <div style="padding:12px 14px;">
            <b>${esc(p.title)}</b>
            <div class="muted-note" style="margin-top:4px;">${esc(p.desc || "暂无描述")}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
              <span style="font-family:var(--font-play);font-weight:600;">${STORE.fmtMoney(p.price)} 分</span>
              <span class="muted-note">库存 ${p.stock}</span>
            </div>
            <div class="muted-note" style="font-size:12px;margin-top:4px;">卖家：${esc(p.name)}</div>
            ${p.uid !== s.id && p.stock > 0 ? `<button class="btn btn-sm btn-buy" data-pid="${p.id}" style="width:100%;margin-top:10px;">购买</button>` : ""}
          </div>
        </div>`
      ).join("")
      : '<span class="muted-note">货架暂无商品</span>';

    document.querySelectorAll(".btn-buy").forEach((b) => {
      b.addEventListener("click", () => {
        if (!confirm("确认用积分购买该商品？")) return;
        const r = STORE.buyProduct(b.dataset.pid);
        if (r.ok) { window.showToast("购买成功！", "success"); } else { window.showToast(r.msg, "error"); }
        renderShell();
        renderMyOrders();
        renderMyProducts();
      });
    });
  }
  renderShell();
})();