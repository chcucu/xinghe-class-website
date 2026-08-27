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
      b.addEventListener("click", () => { const r = STORE.reviewLicense(b.dataset.lid, true); alert(r.ok ? "已批准" : r.msg); renderReviews(); renderLicense(); renderShell(); });
    });
    document.querySelectorAll(".btn-reject").forEach((b) => {
      b.addEventListener("click", () => { const reason = prompt("驳回理由（可选）", ""); if (reason === null) return; const r = STORE.reviewLicense(b.dataset.lid, false, reason); alert(r.ok ? "已驳回" : r.msg); renderReviews(); renderLicense(); });
    });
    document.querySelectorAll(".btn-pub-approve").forEach((b) => {
      b.addEventListener("click", () => { const r = STORE.reviewProduct(b.dataset.pid, true); alert(r.ok ? "已上架" : r.msg); renderReviews(); renderShell(); });
    });
    document.querySelectorAll(".btn-pub-reject").forEach((b) => {
      b.addEventListener("click", () => { const reason = prompt("拒绝理由（可选）", ""); if (reason === null) return; const r = STORE.reviewProduct(b.dataset.pid, false, reason); alert(r.ok ? "已拒绝" : r.msg); renderReviews(); });
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
    alert(r.ok ? "申请已提交，等待市监局审批" : r.msg);
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
    alert(r.ok ? r.msg : r.msg);
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
      b.addEventListener("click", () => { if (!confirm("确认删除此商品？")) return; const r = STORE.deleteProduct(b.dataset.pid); alert(r.ok ? "已删除" : r.msg); renderMyProducts(); renderShell(); });
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

  /* ---- 公共池 ---- */
  function renderTreasury() {
    document.getElementById("treasuryBalance").textContent = STORE.fmtMoney(STORE.treasuryBalance());
  }
  renderTreasury();

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
        alert(r.ok ? "购买成功！" : r.msg);
        renderShell();
        renderTreasury();
        renderMyOrders();
        renderMyProducts();
      });
    });
  }
  renderShell();
})();