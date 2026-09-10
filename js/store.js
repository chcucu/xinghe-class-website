/* ============================================================
   星河班 · 操行银行 数据引擎（Store）
   - 本地模式：localStorage 持久化，可直接运行
   - 以后部署 Cloudflare 时，把 STORE.apiBase 指向 Worker 地址
     即可切换为后端 API 模式（无需改页面逻辑）
   ============================================================ */

const STORE = (function () {
  // —— 部署配置 ——
  // 本地开发：null（用 localStorage）。
  // 上线：填后端 Worker 地址（已绑定自定义域名，国内可直接访问）
  const apiBase = "https://xinghe-api.tenyearmc.top/api";

  // 后端模式下的会话 / 同步标记
  const TOKEN_KEY = "xh_api_token";
  const SYNC_KEY = "xh_sync_ready";

  const KEY = {
    users: "xh_users",
    ledger: "xh_ledger",
    redeems: "xh_redeems",
    meta: "xh_meta",
    session: "xh_session",
    news: "xh_news",
    media: "xh_media",
    reports: "xh_reports",      // 纪检：匿名举报
    cases: "xh_cases",          // 纪检：案件公示
    articles: "xh_articles",    // 编辑部：新闻/小报
    meds: "xh_meds",            // 后勤部：公告（医务/生活/劳动）
    albums: "xh_albums",        // 宣传部：相册
    notices: "xh_notices",      // 通知公告
    deptNotices: "xh_dept_notices", // 部门弹窗公告（登录后弹窗展示）
    deptRecords: "xh_dept_records", // 部门专项登记（值日/卫生/打卡/投稿等），9部门各有专用
    duty: "xh_duty",            // 值日表
    wall: "xh_wall",            // 悄悄话墙
    votes: "xh_votes",          // 投票/问卷
    groups: "xh_groups",        // 小组
    stars: "xh_stars",          // 周之星/月之星
    wishes: "xh_wishes",        // 心愿/兑换目标
    signups: "xh_signups",      // 活动接龙/报名
    licenses: "xh_licenses",    // 市场监督管理局：营业执照
    products: "xh_products",    // 商店：商品
    orders: "xh_orders",        // 商店：订单记录
    logs: "xh_logs",            // 管理员操作日志
    gallery: "xh_gallery",      // 公开相册：成员/家长共同上传
    cashouts: "xh_cashouts",    // 零花钱兑换：孩子向家长申请兑换零花钱
    groupsVer: "xh_groups_ver", // 小组名单版本：每次名单改动 +1，触发 rebuildGroupsFromList 重建小组（不动其它数据）
    seedVer: "xh_seed_ver",
  };

  const SEED_VERSION = 9; // 数据版本：改动种子结构时 +1，触发重新初始化（9：新增零花钱兑换 xh_cashouts）
  const DEFAULT_PWD = "123456";

  /* ---------- 部门配置（与《星河班班委职责表》一致） ---------- */
  const DEPTS = {
    xingzheng:   { name: "行政部", title: "行政事务", desc: "班级外交 · 考勤 · 班委协调", page: "department.html?dept=xingzheng" },
    houqin:      { name: "后勤部", title: "后勤公告", desc: "劳动 · 生活 · 医务 · 安全", page: "department.html?dept=houqin" },
    xuexi:       { name: "学习部", title: "学习动态", desc: "作业收交 · 背书检查 · 学习活动", page: "department.html?dept=xuexi" },
    wenti:       { name: "文体部", title: "文体活动", desc: "体育赛事 · 文艺展演", page: "department.html?dept=wenti" },
    jiwei:       { name: "纪检部", title: "纪检公示", desc: "纪律监督 · 案件公示", page: "department.html?dept=jiwei" },
    xuanchuan:   { name: "宣传部", title: "宣传相册", desc: "照片采集 · 版报 · 会场布置", page: "department.html?dept=xuanchuan" },
    bianji:      { name: "编辑部", title: "新闻 · 星河小报", desc: "班级报纸发布与新闻", page: "department.html?dept=bianji" },
    xinxianquan: { name: "信息安全部", title: "信息安全", desc: "班级网站管理 · 信息保密", page: "department.html?dept=xinxianquan" },
    shichang:    { name: "市场监督管理局", title: "市场监督管理局", desc: "营业执照审批 · 商店监管", page: "shop.html" },
    huodong:     { name: "活动策划部", title: "活动方案", desc: "活动方案设计 · 史册记录", page: "department.html?dept=huodong" },
  };

  /* ---------- 分组名单（核对后，每组首位为组长） ----------
     GROUP_VERSION 每次名单改动时 +1，触发 rebuildGroupsFromList() 更新线上小组数据；
     只重建小组文档（group 列表 + 各用户 groupId），不影响积分/密码/兑换等其它数据。 */
  const GROUP_VERSION = "g9";
  /* ---------- 教师名单版本：改动 data/teachers.json 时 +1，触发 syncTeachersFromJson 增量同步线上教师 ---------- */
  const T_VERSION = "t2";
  const GROUP_LIST = [
    { leader: "郑雨嘉",   members: ["杨雯瑶", "邹奕宁", "汤程杰", "孙明远", "许文昊"] },
    { leader: "李雨婷",   members: ["关茗心", "徐立凡", "谢沂萱", "李张涵", "周廷翰"] },
    { leader: "杨萌",     members: ["赵津仪", "王翼航", "何兆轩", "徐开萍", "陈天和"] },
    { leader: "杨骐羽",   members: ["刘慕辰", "张芝清", "何汶锦", "梁书宁", "单立安"] },
    { leader: "康寇佳琦", members: ["吴优", "闫熙曼", "杨馨", "赵翌旭", "王煜滢"] },
    { leader: "柴丽欣",   members: ["赵晨雅", "李静苒", "马睿瞳", "陈劲豪", "韦尚轩"] },
    { leader: "吴明慧",   members: ["李文芳", "李俊娴", "李欣桐", "郑翀", "付楚珵"] },
    { leader: "沈杜晨希", members: ["宋彦霖", "云健凌", "吴亦翾", "洪晨竣", "杨天泽", "焦柔溪"] },
  ];

  /* ---------- 班委职责表（与《星河班班委职责表》一致） ----------
     图片按姓名自动关联：image/<姓名>.jpg，换图即生效；无图时显示姓名首字占位。 */
  const COMMITTEE = [
    { dept: "xingzheng", name: "行政部", brief: "代表班级形象，组织班委会，协调监督各班委工作。", members: [
      { role: "行政部长（班长）", name: "关茗心", duty: "负责外交，喊上下课口号，组织班委会，协调、安排、监督其他班委工作；搜集上报表册、资料、考勤；处理突发、紧急事务；组织优秀评选" },
      { role: "副班长 · 星河银行行长", name: "何汶锦", duty: "管理班级星河银行，统计星河币；负责「富豪榜」统计" },
      { role: "一组小组长", name: "郑雨嘉", duty: "小组学习、生活、卫生、纪律、作业、背书及两操、集队的管理与监督" },
      { role: "二组小组长", name: "李雨婷", duty: "小组学习、生活、卫生、纪律、作业、背书及两操、集队的管理与监督" },
      { role: "三组小组长", name: "杨萌", duty: "小组学习、生活、卫生、纪律、作业、背书及两操、集队的管理与监督" },
      { role: "四组小组长", name: "杨骐羽", duty: "小组学习、生活、卫生、纪律、作业、背书及两操、集队的管理与监督" },
      { role: "五组小组长", name: "康寇佳琦", duty: "小组学习、生活、卫生、纪律、作业、背书及两操、集队的管理与监督" },
      { role: "六组小组长", name: "柴丽欣", duty: "小组学习、生活、卫生、纪律、作业、背书及两操、集队的管理与监督" },
      { role: "七组小组长", name: "吴明慧", duty: "小组学习、生活、卫生、纪律、作业、背书及两操、集队的管理与监督" },
      { role: "八组小组长", name: "沈杜晨希", duty: "小组学习、生活、卫生、纪律、作业、背书及两操、集队的管理与监督" },
    ] },
    { dept: "houqin", name: "后勤部", brief: "劳动、生活、医务与安全，保障班级日常运转。", members: [
      { role: "劳动部部长（劳动委员）", name: "邹奕宁", duty: "组织班级劳动活动；安排班级轮值表及分工，监督每日劳动并检查；评选劳动之星" },
      { role: "生活委员", name: "杨雯瑶", duty: "管理班级饮用水、水票及饮水机；每日中餐、午点的发放和管理；领取劳动工具" },
      { role: "后勤委员", name: "付楚珵", duty: "监督桌椅整洁、地面卫生、劳动工具的领取和摆放；水槽卫生监督管理" },
      { role: "医务委员", name: "宋彦霖", duty: "负责医药箱的管理" },
      { role: "安全委员", name: "吴优", duty: "负责班级日常安全监督" },
    ] },
    { dept: "xuexi", name: "学习部", brief: "组织学习活动，监督作业收交与背书检查。", members: [
      { role: "学习部部长（学习委员）", name: "刘慕辰", duty: "组织班级学习活动；填报《作业记录手册》；作业布置及通知，监督收交并安排每日晨读；评选每月学习之星" },
      { role: "语文课代表", name: "郑翀", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "语文课代表", name: "闫熙曼", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "数学课代表", name: "谢沂萱", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "数学课代表", name: "单立安", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "英语课代表", name: "汤程杰", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "英语课代表", name: "韦尚轩", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "英语课代表", name: "杨天泽", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "历史课代表", name: "赵津仪", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "道法课代表", name: "梁书宁", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "生物课代表", name: "王煜滢", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "地理课代表", name: "李欣桐", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "物理课代表", name: "马睿瞳", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
      { role: "物理课代表", name: "何兆轩", duty: "每日作业收交并统计；背书、默写、听写、改错的监督检查；学科学习活动开展" },
    ] },
    { dept: "wenti", name: "文体部", brief: "组织体育活动与文艺展演，活跃班级氛围。", members: [
      { role: "文体部部长（体育委员）", name: "李文芳", duty: "组织大课间活动、运动会运动员筛选及体育课集队整队；体育活动纪律安全监督；评选体育之星" },
      { role: "文艺委员", name: "徐开萍", duty: "组织班级文艺活动与文化展演排练；国歌、校歌、班歌等练唱排舞；兼任美术、音乐课代表" },
    ] },
    { dept: "jiwei", name: "纪检部", brief: "监督班级纪律与作业文明，调查取证违规违纪。", members: [
      { role: "纪检部部长（纪律委员）", name: "李静苒", duty: "配合班长管理班级纪律，监督自习课纪律；监督作业文明，杜绝抄写；违规违纪调查取证、处理上报" },
      { role: "纪检委员", name: "王翼航", duty: "配合纪检部工作，监督班级纪律与作业文明" },
      { role: "纪检委员", name: "周廷翰", duty: "配合纪检部工作，监督班级纪律与作业文明" },
    ] },
    { dept: "xuanchuan", name: "宣传部", brief: "搜集班级活动照片，负责版报与宣传布置。", members: [
      { role: "宣传部部长", name: "徐立凡", duty: "为班级活动搜集照片，制作班级DVD、PPT；版报制作、宣传栏美化粘贴；黑板布置、会场布置与气氛营造" },
      { role: "宣传委员", name: "焦柔溪", duty: "配合宣传部分工，负责宣传布置与照片搜集" },
      { role: "宣传委员", name: "吴亦翾", duty: "配合宣传部分工，负责宣传布置与照片搜集" },
    ] },
    { dept: "bianji", name: "编辑部", brief: "统筹班级小报的设计与制作。", members: [
      { role: "编辑部部长", name: "李张涵", duty: "统筹班级小报的设计、制作等" },
      { role: "文字编辑", name: "闫熙曼", duty: "负责选稿、审稿工作" },
      { role: "文字编辑", name: "许文昊", duty: "负责选稿、审稿工作" },
      { role: "信息编辑", name: "洪晨竣", duty: "负责电脑排版设计工作" },
      { role: "信息编辑", name: "陈劲豪", duty: "负责电脑排版设计工作" },
    ] },
    { dept: "xinxianquan", name: "信息安全部", brief: "负责班级网站管理与信息保密。", members: [
      { role: "信息安全部部长", name: "陈劲豪", duty: "负责班级网站的管理、制作与信息安全管理" },
      { role: "信息安全管理员", name: "陈天和", duty: "负责教室电脑的开关管理；网络安全监督；班级日常安全监督管理（安全信息上报、安全手册记录）" },
      { role: "信息保密员", name: "赵翌旭", duty: "负责每次考前考场布置；考试期间的文明纪律监督" },
      { role: "信息保密员", name: "杨馨", duty: "负责每次考前考场布置；考试期间的文明纪律监督" },
      { role: "信息保密员", name: "李俊娴", duty: "负责每次考前考场布置；考试期间的文明纪律监督" },
      { role: "信息保密员", name: "张芝清", duty: "负责每次考前考场布置；考试期间的文明纪律监督" },
    ] },
    { dept: "shichang", name: "市场监督管理局", brief: "监督零食入校与班级小超市经营。", members: [
      { role: "市场监督管理局局长", name: "孙明远", duty: "监督学生违规带零食进校；班级小超市的定品、定价监督管理" },
      { role: "市场监督管理员", name: "赵晨雅", duty: "制作经营许可证；中餐辅食的质量检查（有效期、包装等）" },
    ] },
    { dept: "huodong", name: "活动策划部", brief: "设计班级活动方案，保管班级史册。", members: [
      { role: "活动策划部部长", name: "闫熙曼", duty: "负责每次班级活动的活动方案设计" },
      { role: "活动策划部副部长", name: "云健凌", duty: "负责每次班级活动的活动方案设计" },
      { role: "活动策划部员", name: "陈天和", duty: "负责每次班级活动的活动方案设计" },
      { role: "班级史官", name: "杨萌", duty: "负责班级史册的保管和撰写" },
    ] },
  ];

  /* ---------- 上一届班委（历史成员，展示于班级介绍页） ---------- */
  const PREV_COMMITTEE = [
    { role: "班长", name: "杨天泽", meta: "班级银行管理" },
    { role: "班长", name: "康寇佳琦", meta: "班级日常事务" },
    { role: "语文课代表", name: "闫熙曼", meta: "语文学习与作业收发", with: ["郑翀"] },
    { role: "数学课代表", name: "谢沂萱", meta: "数学学习与作业收发", with: ["许文昊"] },
    { role: "英语课代表", name: "关茗心", meta: "英语学习与作业收发", with: ["汤程杰", "韦尚轩"] },
    { role: "地理课代表", name: "宋晟睿", meta: "地理学习与作业收发" },
    { role: "历史课代表", name: "赵津仪", meta: "历史学习与作业收发", with: ["沈杜晨希"] },
    { role: "生物课代表", name: "云健凌", meta: "生物学习与作业收发" },
    { role: "体育课代表", name: "李文芳", meta: "体育课与队列组织" },
    { role: "道法课代表", name: "郑雨嘉", meta: "道德与法治课程" },
    { role: "信息课代表", name: "陈劲豪", meta: "信息技术课程", with: ["洪晨竣"] },
  ];

  /* ---------- 按班委表分配职务 ---------- */
  // 判定是否为可审批的"部长"（副部长/副职不拥有审批权）
  function isMinisterRole(roleName) {
    const r = String(roleName || "");
    if (!r) return false;
    if (/副/.test(r)) return false;            // 副部长/副局长等无审批权
    return /部长|局长|行长/.test(r);
  }
  // 按班委表为单个姓名计算全部职务
  function buildPostsFor(name) {
    const posts = [];
    COMMITTEE.forEach((d) => {
      d.members.forEach((m) => {
        if (m.name !== name) return;
        posts.push({ dept: d.dept, role: isMinisterRole(m.role) ? "minister" : "member" });
      });
    });
    return posts;
  }
  // 为全体用户按班委表分配：主部门 = 第一个匹配部门，posts 全量
  function assignCommittee(users) {
    const byName = {};
    users.forEach((u) => { (byName[u.name] = byName[u.name] || []).push(u); });
    COMMITTEE.forEach((d) => {
      d.members.forEach((m) => {
        (byName[m.name] || []).forEach((u) => {
          const role = isMinisterRole(m.role) ? "minister" : "member";
          u.posts = u.posts || [];
          if (!u.posts.some((p) => p.dept === d.dept)) u.posts.push({ dept: d.dept, role });
          if (!u.department) { u.department = d.dept; u.departmentRole = role; }
        });
      });
    });
    users.forEach((u) => { if (!Array.isArray(u.posts)) u.posts = []; });
  }

  // 已有用户增量补齐 posts（幂等）：不覆盖人工分配，仅补缺失；保留既有主部门兜底条目
  function backfillUserPosts() {
    let users;
    try { users = getUsers(); } catch (e) { return false; }
    if (!Array.isArray(users) || !users.length) return false;
    let changed = false;
    users.forEach((u) => {
      if (!u) return;
      if (Array.isArray(u.posts)) return; // 已迁移
      const posts = buildPostsFor(u.name || "");
      if (u.department && !posts.some((p) => p.dept === u.department)) {
        posts.unshift({ dept: u.department, role: u.departmentRole === "minister" ? "minister" : "member" });
      }
      u.posts = posts;
      if (!u.department && posts.length) { u.department = posts[0].dept; u.departmentRole = posts[0].role; }
      changed = true;
    });
    if (changed) {
      try { saveUsers(users); } catch (e) { return false; }
      logAction("迁移多职务", "为已有用户按班委表补齐部门职务");
    }
    return changed;
  }

  // 自动按《班委职责表》同步学生职务标签（幂等）：
  // 每次站点初始化时自动运行，班委表里出现的职务自动补齐/纠正，无需管理员手动操作；
  // 用户手工添加的非班委部门职务保留不动，仅当班委表覆盖到同一部门时以班委表职务为准。
  function autoApplyCommittee() {
    let users;
    try { users = getUsers(); } catch (e) { return false; }
    if (!Array.isArray(users) || !users.length) return false;
    const byName = {};
    users.forEach((u) => { (byName[u.name] = byName[u.name] || []).push(u); });
    let changed = false;
    COMMITTEE.forEach((d) => {
      d.members.forEach((m) => {
        (byName[m.name] || []).forEach((u) => {
          if (u.role !== "student" && u.role !== "superadmin") return; // 只处理学生
          const role = isMinisterRole(m.role) ? "minister" : "member";
          u.posts = Array.isArray(u.posts) ? u.posts : [];
          const i = u.posts.findIndex((p) => p.dept === d.dept);
          if (i >= 0) {
            if (u.posts[i].role !== role) { u.posts[i].role = role; changed = true; }
          } else {
            u.posts.push({ dept: d.dept, role });
            changed = true;
          }
          if (!u.department) { u.department = d.dept; u.departmentRole = role; changed = true; }
        });
      });
    });
    if (changed) {
      try { saveUsers(users); } catch (e) { return false; }
      logAction("自动同步班委标签", "按《班委职责表》自动补齐/纠正学生部门职务");
    }
    return changed;
  }

  // 只重建小组数据（groups 列表 + 各学生 groupId），不影响积分/密码/兑换等其它数据。
  // 每次名单改动 GROUP_VERSION +1；版本一致则跳过。远程且已登录时会把重建结果推回服务端。
  function rebuildGroupsFromList() {
    if (lsGet(KEY.groupsVer, "") === GROUP_VERSION) return false; // 已按当前名单应用过
    const users = getUsers();
    if (!Array.isArray(users) || !users.length) return false;
    const byName = {};
    users.forEach((u) => { if (u) byName[u.name] = u; });
    // 先清空旧组号，避免名单外的残留归属
    users.forEach((u) => { if (u) u.groupId = ""; });
    const groups = GROUP_LIST.map((g, i) => {
      const id = "grp-" + (i + 1);
      const lead = byName[g.leader];
      if (lead) { lead.groupId = id; }
      const members = g.members
        .map((mn) => { const u = byName[mn]; if (u) { u.groupId = id; return { id: u.id, name: u.name }; } return null; })
        .filter(Boolean);
      return { id, name: "第" + (i + 1) + "组", leaderId: lead ? lead.id : null, leaderName: g.leader, members, note: "组长：" + g.leader };
    });
    saveGroups(groups);   // 全量覆盖小组（远程有 token 时推服务端）
    saveUsers(users);     // 同步各学生 groupId（远程有 token 时推服务端）
    // 远程未登录时先不标记，待已登录的会话补齐服务端后再标记，避免漏推线上
    if (!isRemote() || apiToken()) {
      lsSet(KEY.groupsVer, GROUP_VERSION);
      logAction("更新分组", "按核对名单重建小组（" + groups.length + " 组，每组首位为组长）");
    }
    return true;
  }

  // 教师名单增量同步（幂等）：以 data/teachers.json 为准，
  // 同一科目的老师实名/账号有变则更新（如道法 王老师 → 王钰），缺失科目则追加新教师；
  // 只增改教师用户，不动积分/密码/学生。T_VERSION 变化才执行一次。
  async function syncTeachersFromJson() {
    if (lsGet(KEY.teachersVer, "") === T_VERSION) return;
    const users = getUsers();
    if (!Array.isArray(users) || !users.length) return;
    let json;
    try { json = await fetch("data/teachers.json").then((r) => r.json()); } catch (e) { return; }
    if (!Array.isArray(json)) return;
    const defHash = await hashPassword(DEFAULT_PWD);
    const bySubject = {};
    users.filter((u) => u && u.role === "teacher").forEach((u) => { bySubject[u.subject] = u; });
    let changed = false;
    json.forEach((t) => {
      const cur = bySubject[t.subject];
      if (cur) {
        // 同科目实名/账号变更（幂等更新）
        if (cur.name !== t.name || cur.account !== t.account) {
          cur.name = t.name; cur.account = t.account; changed = true;
        }
      } else {
        // 新科目老师追加（不覆盖既有 id 规则，用时间戳 id 防冲突）
        users.push({
          id: "tea-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
          name: t.name, account: t.account, password: defHash,
          role: "teacher", subject: t.subject, score: 0,
          nickname: "", nickPending: "", avatar: "", department: "", departmentRole: "", posts: [],
          contact: { qq: "", email: "", phone: "" }, bio: "", personalImages: [], badges: [],
          groupId: "", mustChange: true,
        });
        changed = true;
      }
    });
    if (changed) {
      try { saveUsers(users); } catch (e) { return; }
      logAction("同步教师名单", "按 data/teachers.json 更新教师实名/科目，新增 " + (json.length - Object.keys(bySubject).length) + " 位老师");
    }
    // 只有成功写入（或有 token 会推送）才标记，避免反复尝试
    if (!isRemote() || apiToken()) lsSet(KEY.teachersVer, T_VERSION);
  }

  // 某用户在指定部门的职务（多职务 posts 优先，回退旧单职务字段）
  function deptRoleOf(u, dept) {
    if (!u) return "";
    if (Array.isArray(u.posts)) {
      const p = u.posts.find((x) => x && x.dept === dept);
      if (p) return p.role === "minister" ? "minister" : "member";
    }
    if (u.department === dept && (u.departmentRole === "member" || u.departmentRole === "minister")) return u.departmentRole;
    return "";
  }
  function isDeptMember(u, dept) { return deptRoleOf(u, dept) !== ""; }
  function isMinister(u, dept) { return deptRoleOf(u, dept) === "minister"; }

  // 部门成员可编辑（草稿）：班主任/超管 或 本部门成员/部长
  function canEditDept(dept) {
    const s = getSession(); if (!s) return false;
    if (isSuperAdmin(s.role)) return true;
    const u = findById(s.id); return isDeptMember(u, dept);
  }
  // 可发布/删除（需部长确认）：班主任/超管 或 本部门部长
  function canApproveDept(dept) {
    const s = getSession(); if (!s) return false;
    if (isSuperAdmin(s.role)) return true;
    const u = findById(s.id); return isMinister(u, dept);
  }

  /* ---------- 本地后端模拟（Cloudflare 部署后替换为 fetch） ---------- */
  // 本地写入底层：仅写 localStorage，不做任何同步（供同步引擎内部使用）
  function lsWrite(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  // 数据写入入口：远程模式下写数据键后自动推送到服务端
  function lsSet(k, v) {
    lsWrite(k, v);
    if (isRemote() && k !== KEY.session && k !== KEY.seedVer) {
      dirtyKeys.add(k);
      pushDocs();
    }
  }
  function lsGet(k, def) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }

  /* ---------- 远程模式（Cloudflare Worker + D1） ---------- */
  // 写路径(seed.xxx)：带 STORE.xxx = y 的写函数（如 users, news, gallery…）
  // 写入后需 resyncDocs() 把所有可写文档从服务端拉回本地，保持多人同步。
  function isRemote() { return !!apiBase; }
  function apiToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setApiToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  // 向服务端换取不可伪造的签名令牌（id.HMAC-SHA256(id)，密钥在 Worker 侧）。
  // 成功即存；离线或未配置密钥时回退为旧 base64(id)，保证可用但不承诺防伪。
  async function fetchSignedToken(account, password) {
    try {
      const r = await fetch(apiBase + "/docs/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: account, password: password }),
      });
      const d = await r.json();
      if (d && d.ok && d.token) return d.token;
    } catch (e) { /* 网络失败走回退 */ }
    return null;
  }

  // 把本地数据推送到服务端；未登录或非写权限会静默跳过（下次同步再补）。
  // 仅推送“本会话内实际修改过”的数据键（dirty），避免登录时把陈旧的本地快照
  // 覆盖掉其他同学在服务端的最新数据。
  const dirtyKeys = new Set();
  async function pushDocs() {
    if (!isRemote()) return;
    const token = apiToken();
    if (!token) return;
    if (!dirtyKeys.size) return;
    const keys = [...dirtyKeys];
    const docs = {};
    const perms = {};
    keys.forEach((k) => {
      if (k === "seedVer" || k === "session") return;
      const v = lsGet(KEY[k], null);
      if (v === null) return;
      if (k === "users") {
        // 用户表含积分/角色：仅计分权限角色（教师/班委/管理）可覆盖，防普通同学篡改全班数据
        const s = getSession();
        const canScore = s && ["teacher", "admin", "monitor", "superadmin"].indexOf(s.role) >= 0;
        docs[k] = v;
        perms[k] = canScore ? "any" : "super";
      } else { docs[k] = v; perms[k] = "any"; }
    });
    if (!Object.keys(docs).length) return;
    try {
      await fetch(apiBase + "/docs", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ docs, perms }),
      });
      keys.forEach((k) => dirtyKeys.delete(k));
    } catch (e) { /* 网络失败时静默保留 dirty，下次再试 */ }
  }

  // 把服务端可写文档全部拉回本地，并做同步后的标记与刷新。
  let syncing = null;
  async function resyncDocs() {
    if (!isRemote()) return;
    if (syncing) return syncing;
    syncing = (async () => {
      try {
        const token = apiToken();
        const resp = await fetch(apiBase + "/docs?keys=" + encodeURIComponent(
          Object.keys(KEY).filter((k) => k !== "seedVer" && k !== "session").join(",")
        ), { headers: token ? { Authorization: "Bearer " + token } : {} });
        const data = await resp.json();
        if (data && data.ok && data.docs) {
          Object.keys(data.docs).forEach((k) => {
            let v = data.docs[k];
            if (v === null || typeof v === "undefined") return;
            // 用户表合并：保留当前登录用户本人的本地个人数据（头像/简介/个人图/联系方式/未审昵称申请），
            // 避免服务端拉取把本地刚改过、尚未同步的内容覆盖掉，确保重登不丢数据。
            if (k === "users") v = mergeUsersOnSync(v);
            // 登录页在无 token 时也需要用户表来完成客户端校验，故始终拉取
            lsWrite(KEY[k] || k, v); // 用底层写入，避免触发 pushDocs 造成循环推送
          });
        }
        try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch (e) {}
      } catch (e) { /* 服务端不可用时保持本地 */ }
      finally { syncing = null; }
    })();
    return syncing;
  }

  // 把当前用户的个人字段单独推送到服务端（头像/昵称申请/简介/个人图/联系方式）。
  // 普通同学无法整表写 users，走 /me/update 只更新自己的字段，防止重登后个人数据丢失。
  async function pushMe(patch) {
    if (!isRemote()) return;
    const token = apiToken();
    if (!token) return;
    try {
      await fetch(apiBase + "/me/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(patch),
      });
    } catch (e) { /* 网络失败时静默，下次再试 */ }
  }

  // 服务端用户表合并：仅对“当前登录用户”合并其本人可编辑、且只由本人修改的字段，
  // 其余用户与字段一律以服务端为准，避免覆盖他人或管理员的数据。
  function mergeUsersOnSync(serverUsers) {
    if (!Array.isArray(serverUsers)) return serverUsers;
    const s = getSession();
    const localUsers = lsGet(KEY.users, []);
    if (!s || !Array.isArray(localUsers)) return serverUsers;
    const li = localUsers.findIndex((u) => u && u.id === s.id);
    if (li < 0) return serverUsers;
    const local = localUsers[li] || {};
    const si = serverUsers.findIndex((u) => u && u.id === s.id);
    if (si < 0) return serverUsers;
    const server = serverUsers[si];
    if (local.avatar) server.avatar = local.avatar;
    if (local.bio) server.bio = local.bio;
    if (local.contact && Object.values(local.contact).some(Boolean)) server.contact = local.contact;
    if (Array.isArray(local.personalImages) && local.personalImages.length) server.personalImages = local.personalImages;
    if (local.nickPending) server.nickPending = local.nickPending; // 未审昵称申请本地优先
    if (!server.nickname && local.nickname) server.nickname = local.nickname; // 服务端无昵称时保留本地
    if (!server.password && local.password) server.password = local.password;
    if (local.mustChange === true) server.mustChange = true;
    if (Array.isArray(local.posts) && local.posts.length) server.posts = local.posts; // 本地多职务优先，防止 resync 冲掉
    if (local.role === "parent" && Number(local.cashRate) > 0) server.cashRate = local.cashRate; // 家长兑换比例本地优先
    serverUsers[si] = server;
    return serverUsers;
  }
  function lastSyncedAt() { try { return Number(localStorage.getItem(SYNC_KEY) || 0); } catch (e) { return 0; } }
  function syncReady() { return lastSyncedAt() > 0; }
  async function waitSync(ms) {
    if (!isRemote()) return;
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 2500)) {
      if (syncReady()) return;
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  /* ---------- 工具 ---------- */
  function now() { return new Date().toISOString(); }
  function uid(prefix) { return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8); }
  function fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function fmtMoney(v) {
    v = Number(v) || 0;
    const neg = v < 0;
    const a = Math.abs(v).toFixed(2);
    return neg ? "-" + a : a;
  }

  /* ---------- 密码哈希（SHA-256 + 随机盐，绝不存明文） ---------- */
  // 加盐格式：`<32位盐hex>.<64位摘要hex>`，与后端 worker.js 完全一致，前后端互通。
  const SALTED_RE = /^[0-9a-f]{32}\.[0-9a-f]{64}$/i;
  function hexBytes(buf) {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // 同步兜底（在极旧 / 非安全上下文下的降级，仅用于防明文，正常部署不会走这里）
  function fnvHex(s) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2, 33) ^ c;
    }
    return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }
  async function digestHex(s) {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      try {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
        return hexBytes(buf);
      } catch (e) { /* 退到同步兜底 */ }
    }
    return "sync-" + fnvHex(s);
  }
  function genSalt() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return hexBytes(a); // 32 位 hex
    }
    return fnvHex(Date.now() + "-" + Math.random()); // 兜底
  }
  // 新密码统一加盐存储
  async function hashPassword(pw) {
    const s = String(pw == null ? "" : pw);
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const salt = genSalt();
      return salt + "." + (await digestHex(salt + s));
    }
    return digestHex(s); // 非安全上下文的降级形态
  }
  // 校验：兼容【新加盐 / 旧 SHA-256 / 旧明文】，返回 true(已加盐且匹配)、新哈希(需升级)、或 null(密码错)
  async function verifyPw(plain, stored) {
    stored = String(stored == null ? "" : stored);
    if (SALTED_RE.test(stored)) {
      const salt = stored.slice(0, 32), dg = stored.slice(33);
      return (await digestHex(salt + String(plain))) === dg ? true : null;
    }
    if (/^[0-9a-f]{64}$/i.test(stored)) {
      return (await digestHex(String(plain))) === stored ? hashPassword(String(plain)) : null;
    }
    if (/^sync-/.test(stored)) {
      return ("sync-" + fnvHex(String(plain))) === stored ? hashPassword(String(plain)) : null;
    }
    return String(plain) === stored ? hashPassword(String(plain)) : null;
  }
  // 判断是否已是某种哈希（不再落明文）
  function isHashed(pw) {
    return typeof pw === "string" && (SALTED_RE.test(pw) || /^[0-9a-f]{64}$/i.test(pw) || /^sync-/.test(pw));
  }

  /* ---------- 初始化种子 ---------- */
  async function ensureSeeded() {
    // 远程模式（部署后端）：本地不再自我初始化，只等待服务端同步
    if (isRemote()) {
      await remoteBootstrap();
      await resyncDocs();
      // 服务端旧数据可能缺多职务字段：合并后自动按班委表补齐职务标签（幂等，有变化才推回服务端）
      autoApplyCommittee();
      // 核对后分组名单版本变化时，只重建小组数据并推回服务端（不动积分/密码）
      rebuildGroupsFromList();
      // 教师名单增量同步（道法王钰 / 新增物理王老师等）
      await syncTeachersFromJson();
      return;
    }
    // 版本迁移：种子结构变化时，清除旧数据重新初始化
    if (Number(lsGet(KEY.seedVer, 0)) !== SEED_VERSION) {
      [
        KEY.users, KEY.ledger, KEY.redeems, KEY.meta, KEY.news, KEY.media,
        KEY.reports, KEY.cases, KEY.articles, KEY.meds, KEY.albums, KEY.notices, KEY.duty,
        KEY.wall, KEY.votes, KEY.groups,
        KEY.stars, KEY.wishes, KEY.signups, KEY.licenses, KEY.products,
        KEY.orders, KEY.logs, KEY.gallery, KEY.cashouts,
      ].forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(KEY.seedVer, String(SEED_VERSION));
    }
    // 已有数据：仅做多职务增量迁移（幂等），不重新初始化
    if (lsGet(KEY.users, null)) { backfillUserPosts(); rebuildGroupsFromList(); await syncTeachersFromJson(); return; }
    const [students, teachers] = await Promise.all([
      fetch("data/students.json").then((r) => r.json()),
      fetch("data/teachers.json").then((r) => r.json()),
    ]);
    // 统一用哈希存初始密码，绝不落明文
    const defHash = await hashPassword(DEFAULT_PWD);
    const users = [];
    students.forEach((s, i) => {
      users.push({
        id: "stu-" + i,
        name: s.name,
        account: s.account,
        password: defHash,
        role: s.superadmin ? "superadmin" : "student",
        score: s.score,
        nickname: "",
        nickPending: "",
        avatar: "",
        department: "",
        departmentRole: "",
        posts: [],
        contact: { qq: "", email: "", phone: "" },
        bio: "",
        personalImages: [],
        badges: [],
        groupId: "",
        mustChange: true,
      });
    });
    teachers.forEach((t, i) => {
      users.push({
        id: "tea-" + i,
        name: t.name,
        account: t.account,
        password: defHash,
        role: t.head ? "admin" : "teacher",
        subject: t.subject,
        score: 0,
        nickname: "",
        nickPending: "",
        avatar: "",
        department: "",
        departmentRole: "",
        posts: [],
        contact: { qq: "", email: "", phone: "" },
        bio: "",
        personalImages: [],
        badges: [],
        groupId: "",
        mustChange: true,
      });
    });
    assignCommittee(users);
    lsSet(KEY.users, users);
    lsSet(KEY.ledger, []);
    lsSet(KEY.redeems, []);
    lsSet(KEY.news, []);
    lsSet(KEY.media, []);
    lsSet(KEY.reports, []);
    lsSet(KEY.cases, []);
    lsSet(KEY.articles, []);
    lsSet(KEY.meds, []);
    lsSet(KEY.notices, []);
    lsSet(KEY.duty, []);
    lsSet(KEY.wall, []);
    lsSet(KEY.votes, []);
    lsSet(KEY.stars, []);
    lsSet(KEY.wishes, []);
    lsSet(KEY.signups, []);
    lsSet(KEY.licenses, []);
    lsSet(KEY.products, []);
    lsSet(KEY.orders, []);
    lsSet(KEY.cashouts, []);

    // 小组：使用共享分组名单（核对后，每组首位为组长）
    const groupData = GROUP_LIST;
    const groups = groupData.map((g, i) => {
      const id = "grp-" + (i + 1);
      const lead = users.find((u) => u.name === g.leader);
      if (lead) { lead.groupId = id; }
      const members = g.members
        .map((mn) => { const u = users.find((x) => x.name === mn); if (u) { u.groupId = id; } return u ? { id: u.id, name: u.name } : null; })
        .filter(Boolean);
      return {
        id: id,
        name: "第" + (i + 1) + "组",
        leaderId: lead ? lead.id : null,
        leaderName: g.leader,
        members: members,
        note: "组长：" + g.leader,
      };
    });
    lsSet(KEY.groups, groups);

    // 宣传部相册：从 image/class 静态目录导入 107 张已发布照片
    const photos = [];
    for (let i = 1; i <= 107; i++) {
      const n = String(i).padStart(2, "0");
      photos.push({ src: "image/class/" + n + ".jpg", caption: "班级掠影", status: "published" });
    }
    lsSet(KEY.albums, [{
      id: uid("alb"),
      name: "班级风采掠影",
      author: "系统",
      createdTs: now(),
      photos,
      status: "published",
    }]);

    lsSet(KEY.meta, { lastUpdate: now(), lastOperator: "系统初始化" });
  }

  /* ---------- 远程首启：把本地种子一次性导入 D1（只成功一次） ---------- */
  // 部署后首个访问者（任意人）触发；若已被导入过则跳过，改为拉取服务端数据。
  async function remoteBootstrap() {
    const marker = lsGet(KEY.seedVer, 0);
    if (marker) return; // 本地已初始化过（或已同步过），不重复导入
    try {
      // 复用本地种子逻辑生成一遍种子文档（与 ensureSeeded 本地分支一致）
      const seed = await buildSeedDocs();
      const resp = await fetch(apiBase + "/docs/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: "xinghe-2026-seed", docs: seed }),
      });
      const data = await resp.json();
      if (data && data.ok) {
        Object.keys(seed).forEach((k) => lsSet(KEY[k], seed[k]));
      }
      // 无论导入成功(首启)还是 409(已存在)，都写标记，避免重复尝试
      lsSet(KEY.seedVer, String(SEED_VERSION));
    } catch (e) { /* 网络失败则保持本地，下次再试 */ }
  }

  // 生成一份与本地种子一致的文档集合（users 直接读 data/*.json 数据文件）。
  async function buildSeedDocs() {
    const [students, teachers] = await Promise.all([
      fetch("data/students.json").then((r) => r.json()),
      fetch("data/teachers.json").then((r) => r.json()),
    ]);
    // 初始密码统一存为哈希，绝不落明文
    const defHash = await hashPassword(DEFAULT_PWD);
    const users = [];
    students.forEach((s, i) => {
      users.push({
        id: "stu-" + i, name: s.name, account: s.account, password: defHash,
        role: s.superadmin ? "superadmin" : "student", score: s.score,
        nickname: "", nickPending: "", avatar: "", department: "", departmentRole: "", posts: [],
        contact: { qq: "", email: "", phone: "" }, bio: "", personalImages: [], badges: [],
        groupId: "", mustChange: true,
      });
    });
    teachers.forEach((t, i) => {
      users.push({
        id: "tea-" + i, name: t.name, account: t.account, password: defHash,
        role: t.head ? "admin" : "teacher", subject: t.subject, score: 0,
        nickname: "", nickPending: "", avatar: "", department: "", departmentRole: "", posts: [],
        contact: { qq: "", email: "", phone: "" }, bio: "", personalImages: [], badges: [],
        groupId: "", mustChange: true,
      });
    });
    assignCommittee(users);
    const photos = [];
    for (let i = 1; i <= 107; i++) {
      const n = String(i).padStart(2, "0");
      photos.push({ src: "image/class/" + n + ".jpg", caption: "班级掠影", status: "published" });
    }
    // 小组：与本地种子一致（使用共享分组名单，每组首位为组长）
    const groupData = GROUP_LIST;
    const groups = groupData.map((g, i) => {
      const id = "grp-" + (i + 1);
      const lead = users.find((u) => u.name === g.leader);
      if (lead) { lead.groupId = id; }
      const members = g.members
        .map((mn) => { const u = users.find((x) => x.name === mn); if (u) { u.groupId = id; } return u ? { id: u.id, name: u.name } : null; })
        .filter(Boolean);
      return {
        id, name: "第" + (i + 1) + "组",
        leaderId: lead ? lead.id : null, leaderName: g.leader,
        members, note: "组长：" + g.leader,
      };
    });
    return {
      users,
      groups,
      ledger: [],
      redeems: [],
      news: [],
      media: [],
      reports: [],
      cases: [],
      articles: [],
      meds: [],
      notices: [],
      duty: [],
      wall: [],
      votes: [],
      stars: [],
      wishes: [],
      signups: [],
      licenses: [],
      products: [],
      orders: [],
      cashouts: [],
      albums: [{ id: uid("alb"), name: "班级风采掠影", author: "系统", createdTs: now(), photos, status: "published" }],
      meta: { lastUpdate: now(), lastOperator: "系统初始化" },
    };
  }

  /* ---------- 数据读取 ---------- */
  function getUsers() { return lsGet(KEY.users, []); }
  function getLedger() { return lsGet(KEY.ledger, []); }
  function getRedeems() { return lsGet(KEY.redeems, []); }
  function getMeta() { return lsGet(KEY.meta, { lastUpdate: null, lastOperator: "—" }); }
  function getSession() { return lsGet(KEY.session, null); }

  function saveUsers(u) { lsSet(KEY.users, u); }
  function saveLedger(l) { lsSet(KEY.ledger, l); }
  function saveRedeems(r) { lsSet(KEY.redeems, r); }
  function saveMeta(m) { lsSet(KEY.meta, m); }

  function findByAccount(account) {
    return getUsers().find((u) => u.account === account);
  }
  function findById(id) {
    return getUsers().find((u) => u.id === id);
  }

  /* ---------- 认证 ---------- */
  async function login(account, password) {
    const users = getUsers();
    const u = users.find((x) => x.account === account);
    if (!u) return { ok: false, msg: "账号不存在" };
    // 加盐/旧SHA256/旧明文 兼容校验；需升级时这里自动写回加盐哈希
    const vh = await verifyPw(password, u.password);
    if (vh === null) return { ok: false, msg: "密码错误" };
    let upgraded = false;
    if (vh !== true && vh !== u.password) { u.password = vh; saveUsers(users); upgraded = true; }
    if (u.status === "pending") return { ok: false, msg: "该账号待班主任审核，通过后方可登录" };
    if (u.status === "rejected") return { ok: false, msg: "该注册申请未通过审核" };
    const session = {
      id: u.id, account: u.account, name: u.name, role: u.role,
      nickname: u.nickname, avatar: u.avatar, mustChange: u.mustChange,
    };
    lsSet(KEY.session, session);
    // 远程模式：向服务端换取签名令牌；换取失败回退 base64(id)
    if (isRemote()) {
      let token = await fetchSignedToken(u.account, password);
      if (!token) { try { token = btoa(u.id); } catch (e) { token = ""; } }
      setApiToken(token);
      if (upgraded) pushMe({ password: u.password, mustChange: u.mustChange }); // 明文升级后的哈希推到服务端
      pushDocs(); // 把本会话内修改过的数据推送到服务端
      resyncDocs();
    }
    logAction("登录", "账号 " + u.account + " 登录成功", u.name);
    return { ok: true, user: session };
  }
  function logout() {
    const s = getSession();
    if (s) logAction("退出登录", "账号 " + s.account + " 退出登录");
    localStorage.removeItem(KEY.session);
    setApiToken("");
    dirtyKeys.clear();
  }

  function refreshSession() {
    const s = getSession();
    if (!s) return null;
    const u = findById(s.id);
    if (!u) return null;
    const nu = {
      id: u.id, account: u.account, name: u.name, role: u.role,
      nickname: u.nickname, avatar: u.avatar, mustChange: u.mustChange,
    };
    lsSet(KEY.session, nu);
    return nu;
  }

  /* ---------- 家长 / 访客注册（需班主任审核） ---------- */
  // 生成家长/访客的默认用户骨架
  function mkMember(role, name, account, password, extra) {
    const u = {
      id: uid(role === "parent" ? "par" : "gst"),
      name: String(name || "").trim(),
      account: String(account || "").trim(),
      password: String(password || ""),
      role: role,
      status: "pending",
      studentId: "",
      studentName: "",
      registerTs: now(),
      score: 0,
      nickname: "", nickPending: "", avatar: "",
      department: "", departmentRole: "", posts: [],
      contact: { qq: "", email: "", phone: "" },
      bio: "", personalImages: [], badges: [], groupId: "",
      mustChange: false,
    };
    if (extra) Object.assign(u, extra);
    return u;
  }
  // 注册（家长/访客）。远程模式同步到服务端，避免刷新/换设备丢失；服务端不可达才回退本地。
  async function register(payload) {
    const role = payload.role === "parent" ? "parent" : "guest";
    const name = String(payload.name || "").trim();
    const account = String(payload.account || "").trim();
    const password = String(payload.password || "");
    if (!name) return { ok: false, msg: "请填写姓名" };
    if (!account) return { ok: false, msg: "请填写登录账号" };
    if (password.length < 4) return { ok: false, msg: "密码至少 4 位" };
    if (findByAccount(account)) return { ok: false, msg: "该账号已被使用，请更换" };

    const pwdHash = await hashPassword(password); // 只存哈希，不存明文
    const users = getUsers();
    let extra = {};
    if (role === "parent") {
      const sid = payload.studentId;
      const child = users.find((x) => x.id === sid);
      if (!child) return { ok: false, msg: "请选择要关联的学生" };
      extra = Object.assign(extra, {
        studentId: child.id, studentName: child.name,
        contact: { qq: "", email: "", phone: account },
      });
    }
    if (isRemote()) {
      const body = {
        role, name, account, password: pwdHash,
        studentId: extra.studentId || "", studentName: extra.studentName || "",
        contact: extra.contact || {},
      };
      try {
        const resp = await fetch(apiBase + "/docs/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await resp.json();
        if (d && d.ok) { extra.id = d.id; } // 使用服务端生成的 id，保证多设备一致
        else if (d && d.msg) return { ok: false, msg: d.msg }; // 账号重复等硬错误直接返回
        // 其它（网络/未知）静默回退为本地登记，下次同步兜底
      } catch (e) { /* 网络异常：回退本地 */ }
    }
    users.push(mkMember(role, name, account, pwdHash, extra));
    saveUsers(users);
    return { ok: true, msg: "注册申请已提交，请等待班主任审核" };
  }
  // 待审核注册列表
  function pendingRegistrations() {
    return getUsers().filter((u) => u.role === "parent" || u.role === "guest");
  }
  // 审核注册申请
  function reviewRegister(uid, approve) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "仅班主任/超管可审核" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u || (u.role !== "parent" && u.role !== "guest")) return { ok: false, msg: "该用户不存在或非注册用户" };
    u.status = approve ? "approved" : "rejected";
    saveUsers(users);
    logAction(approve ? "通过注册" : "驳回注册", (u.role === "parent" ? "家长" : "访客") + " " + u.name + "（账号 " + u.account + "）");
    return { ok: true };
  }
  // 家长：获取自己关联的孩子
  function myChild() {
    const s = getSession();
    if (!s || s.role !== "parent") return null;
    const u = findById(s.id);
    if (!u || !u.studentId) return null;
    return findById(u.studentId);
  }

  async function changePassword(newPwd) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.password = await hashPassword(newPwd); // 只存哈希
    u.mustChange = false;
    saveUsers(users);
    await pushMe({ password: u.password, mustChange: false }); // 等待服务端落库，避免关页即丢失
    s.mustChange = false;
    lsSet(KEY.session, s);
    return { ok: true };
  }

  // 跳过首次改密（保留原密码，仅清除强制标记）
  async function skipPasswordChange() {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.mustChange = false;
    saveUsers(users);
    await pushMe({ mustChange: false }); // 等待服务端清除强制改密标记
    s.mustChange = false;
    lsSet(KEY.session, s);
    return { ok: true };
  }

  /* ---------- 权限 ---------- */
  // 可编辑操行银行：教师/班委/管理员/超级管理员
  function canEditRole(role) { return ["teacher", "admin", "monitor", "superadmin"].includes(role); }
  // 超级管理员（可进后台）：admin（班主任）与 superadmin（系统超管）
  function isSuperAdmin(role) { return role === "admin" || role === "superadmin"; }
  // 网站管理员（管理网站内容）：超管 或 信息安全部部长
  function isSiteAdmin(s) {
    if (!s) return false;
    if (isSuperAdmin(s.role)) return true;
    try {
      const u = getUsers().find((x) => x.id === s.id);
      if (u && Array.isArray(u.posts) && u.posts.some((p) => p.dept === "xinxianquan" && p.role === "minister")) return true;
    } catch (e) {}
    return false;
  }
  // 管理员级别（用于操作日志查看权限）：超管=3 班主任=2 教师/班委=1 其余=0
  function roleRank(role) {
    if (role === "superadmin") return 3;
    if (role === "admin") return 2;
    if (role === "teacher" || role === "monitor") return 1;
    return 0;
  }

  /* ---------- 管理员操作日志 ---------- */
  // 记录任意用户操作（登录/兑换/修改等）。默认记录当前登录者；登录/注册等无会话时传入 actor 覆盖。
  function logAction(action, detail, actorOverride) {
    const s = actorOverride ? { name: actorOverride, role: "", rank: -1 } : getSession();
    if (!s) return;
    const logs = lsGet(KEY.logs, []);
    let page = "";
    try { page = (location.pathname.split("/").pop() || "index.html") + location.search; } catch (e) {}
    let ua = "";
    try { ua = String(navigator.userAgent || "").slice(0, 160); } catch (e) {}
    logs.push({
      id: uid("log"), ts: now(),
      operator: s.name, operatorRole: s.role || "", operatorRank: typeof s.rank === "number" ? s.rank : roleRank(s.role),
      action: action || "操作", detail: detail || "",
      page, ua, device: /Mobile|Android|iPhone|iPad/i.test(ua) ? "移动端" : "桌面端",
    });
    if (logs.length > 2000) logs.splice(0, logs.length - 2000);
    lsSet(KEY.logs, logs);
  }
  // 读取日志（最新在前）。查看权限：仅班主任/超管（最高级管理员）
  function getLogs() {
    const s = getSession();
    if (!s || !isSuperAdmin(s.role)) return { ok: false, msg: "仅最高级管理员可查看操作日志" };
    const logs = lsGet(KEY.logs, []).slice().reverse();
    return { ok: true, list: logs };
  }
  // 清空日志（仅超级管理员本人）
  function clearLogs() {
    const s = getSession();
    if (!s || s.role !== "superadmin") return { ok: false, msg: "仅超级管理员可清空操作日志" };
    lsSet(KEY.logs, []);
    return { ok: true };
  }

  /* ---------- 排行榜（含排名、并列同名次、最后更新时间） ---------- */
  function leaderboard() {
    const users = getUsers().filter((u) => u.role === "student" || u.role === "superadmin");
    const sorted = [...users].sort((a, b) => b.score - a.score);
    let rank = 0, prev = null;
    sorted.forEach((u, i) => {
      if (prev === null || u.score !== prev) rank = i + 1;
      u.rank = rank;
      prev = u.score;
    });
    return sorted;
  }

  // 显示名（昵称优先，其次真实姓名）
  function displayName(u) { return u?.nickname || u?.name || ""; }

  /* ---------- 分数更新（教师/班委/管理，即时生效+可撤销） ---------- */
  function applyDelta(studentId, delta, reason, category) {
    const op = getSession();
    if (!op) return { ok: false, msg: "未登录" };
    if (!canEditRole(op.role)) return { ok: false, msg: "无权限修改分数" };
    if (!studentId || !delta) return { ok: false, msg: "参数不完整" };

    const users = getUsers();
    const u = users.find((x) => x.id === studentId);
    if (!u || (u.role !== "student" && u.role !== "superadmin")) return { ok: false, msg: "目标学生不存在" };

    const dNum = Math.round(Number(delta) * 100) / 100;
    if (isNaN(dNum) || dNum === 0) return { ok: false, msg: "变动值无效" };
    const cat = ["学习", "纪律", "卫生", "仪容仪表", "考勤", "综合素质", "其它"].indexOf(category) >= 0 ? category : "";

    u.score = Math.round((u.score + dNum) * 100) / 100;

    const ledger = getLedger();
    const rec = {
      id: uid("led"), uid: u.id, name: u.name,
      delta: dNum, after: u.score, reason: reason || "手动调整",
      category: cat, operator: op.name, operatorRole: op.role, ts: now(),
    };
    ledger.push(rec);

    saveUsers(users);
    saveLedger(ledger);
    setMeta(op.name);
    logAction((dNum > 0 ? "增加" : "扣除") + "操行分", u.name + " " + (dNum > 0 ? "+" : "") + dNum + " 分 → " + u.score + " 分（" + (cat || "未分类") + " · " + (reason || "手动调整") + "）");
    return { ok: true, record: rec };
  }

  /* ---------- 撤销最近一次分数变动 ---------- */
  function undoLast() {
    const op = getSession();
    if (!op) return { ok: false, msg: "未登录" };
    if (!canEditRole(op.role)) return { ok: false, msg: "无权限" };

    const ledger = getLedger();
    if (!ledger.length) return { ok: false, msg: "没有可撤销的记录" };
    const last = ledger.pop();

    const users = getUsers();
    const u = users.find((x) => x.id === last.uid);
    if (u) {
      u.score = Math.round((u.score - last.delta) * 100) / 100;
    }
    const rec = {
      id: uid("led"), uid: last.uid, name: last.name,
      delta: -last.delta, after: u ? u.score : 0,
      reason: "撤销：" + last.reason + "（冲红）",
      operator: op.name, operatorRole: op.role, ts: now(),
    };
    ledger.push(rec);

    saveUsers(users);
    saveLedger(ledger);
    setMeta(op.name);
    logAction("撤销加分", last.name + "，内容：" + last.reason);
    return { ok: true, undone: last, record: rec };
  }

  function setMeta(operator) {
    saveMeta({ lastUpdate: now(), lastOperator: operator });
  }

  /* ---------- 兑换 ---------- */
  // 学生自助申请
  function applyRedeem(item, cost) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    if (s.role !== "student" && s.role !== "superadmin") return { ok: false, msg: "只有学生可申请兑换" };
    if (!item || !cost) return { ok: false, msg: "请填写兑换项目和所需积分" };
    const costNum = Math.round(Number(cost) * 100) / 100;
    if (isNaN(costNum) || costNum <= 0) return { ok: false, msg: "积分值无效" };

    const redeems = getRedeems();
    redeems.push({
      id: uid("rd"), uid: s.id, name: s.name, item, cost: costNum,
      status: "pending", applyTs: now(), approveTs: null, operator: null, reason: null,
    });
    saveRedeems(redeems);
    return { ok: true };
  }

  // 审批（通过则扣分；拒绝仅标记）
  function reviewRedeem(redeemId, approve, reason) {
    const op = getSession();
    if (!op) return { ok: false, msg: "未登录" };
    if (!canEditRole(op.role)) return { ok: false, msg: "无权限审批" };

    const redeems = getRedeems();
    const rd = redeems.find((x) => x.id === redeemId);
    if (!rd) return { ok: false, msg: "兑换单不存在" };
    if (rd.status !== "pending") return { ok: false, msg: "该单已处理" };

    rd.status = approve ? "approved" : "rejected";
    rd.approveTs = now();
    rd.operator = op.name;
    rd.reason = reason || (approve ? "兑换成功" : "兑换被拒");

    if (approve) {
      const users = getUsers();
      const u = users.find((x) => x.id === rd.uid);
      if (!u) return { ok: false, msg: "学生不存在" };
      u.score = Math.round((u.score - rd.cost) * 100) / 100;
      saveUsers(users);

      const ledger = getLedger();
      ledger.push({
        id: uid("led"), uid: u.id, name: u.name,
        delta: -rd.cost, after: u.score, reason: "兑换扣分：" + rd.item,
        operator: op.name, operatorRole: op.role, ts: now(),
      });
      saveLedger(ledger);
      setMeta(op.name);
    }
    saveRedeems(redeems);
    logAction(approve ? "批准兑换" : "驳回兑换", "学生 " + rd.name + " 兑换 " + rd.item + "（" + rd.cost + " 分）");
    return { ok: true, redeem: rd };
  }

  // 线下直接扣分（老师直接操作，等价于 applyDelta 负值，但语义更明确）
  function offlineDeduct(studentId, item, cost, reason) {
    const op = getSession();
    if (!op) return { ok: false, msg: "未登录" };
    if (!canEditRole(op.role)) return { ok: false, msg: "无权限" };
    const costNum = Math.round(Number(cost) * 100) / 100;
    if (!studentId || !costNum || costNum <= 0) return { ok: false, msg: "参数不完整" };

    const users = getUsers();
    const u = users.find((x) => x.id === studentId);
    if (!u) return { ok: false, msg: "学生不存在" };
    u.score = Math.round((u.score - costNum) * 100) / 100;
    saveUsers(users);

    const ledger = getLedger();
    ledger.push({
      id: uid("led"), uid: u.id, name: u.name,
      delta: -costNum, after: u.score, reason: reason || ("线下兑换：" + (item || "奖品")),
      operator: op.name, operatorRole: op.role, ts: now(),
    });
    saveLedger(ledger);
    setMeta(op.name);
    return { ok: true };
  }

  /* ---------- 查询 ---------- */
  function myLedger() {
    const s = getSession();
    if (!s) return [];
    return getLedger().filter((r) => r.uid === s.id).slice().reverse();
  }
  function myRedeems() {
    const s = getSession();
    if (!s) return [];
    return getRedeems().filter((r) => r.uid === s.id).slice().reverse();
  }

  /* ---------- 零花钱兑换（孩子 ↔ 家长） ---------- */
  function getCashouts() { return lsGet(KEY.cashouts, []); }
  function saveCashouts(list) { lsSet(KEY.cashouts, list); }
  // 我的绑定家长（学生）：反向查找关联自己的家长
  function myParent() {
    const s = getSession();
    if (!s) return null;
    if (s.role !== "student" && s.role !== "superadmin") return null;
    return getUsers().find((u) => u.role === "parent" && u.studentId === s.id) || null;
  }
  // 学生可用的兑换比例（元/分）：家长自定义优先，未设置用固定 1分=5元
  function cashoutRate() {
    const p = myParent();
    if (p && Number(p.cashRate) > 0) return Math.round(Number(p.cashRate) * 100) / 100;
    return 5;
  }
  // 家长：设置零花钱兑换比例
  async function setCashRate(rate) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    if (s.role !== "parent") return { ok: false, msg: "仅家长可设置兑换比例" };
    const r = Math.round(Number(rate) * 100) / 100;
    if (isNaN(r) || r <= 0) return { ok: false, msg: "比例必须为正数" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    const old = Number(u.cashRate) > 0 ? Math.round(Number(u.cashRate) * 100) / 100 : 5;
    u.cashRate = r;
    saveUsers(users);
    await pushMe({ cashRate: r }); // 远程模式同步到服务端
    logAction("修改零花钱比例", "零花钱兑换比例由 1分=" + old + "元 调整为 1分=" + r + "元");
    return { ok: true, rate: r };
  }
  // 学生：申请零花钱兑换（直接向绑定家长发送申请）
  function applyCashout(points, note) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    if (s.role !== "student" && s.role !== "superadmin") return { ok: false, msg: "只有学生可申请兑换零花钱" };
    const parent = myParent();
    if (!parent) return { ok: false, msg: "你尚未绑定家长：请在家长注册时选择你作为孩子" };
    const pNum = Math.round(Number(points) * 100) / 100;
    if (isNaN(pNum) || pNum <= 0) return { ok: false, msg: "兑换积分无效" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    if (u.score < pNum) return { ok: false, msg: "积分不足（当前 " + u.score + " 分）" };
    const rate = cashoutRate();
    const money = Math.round(pNum * rate * 100) / 100;
    const list = getCashouts();
    list.unshift({
      id: uid("co"), type: "apply",
      studentId: s.id, studentName: s.name,
      parentId: parent.id, parentName: parent.name,
      points: pNum, money, rate,
      status: "pending",
      applyTs: now(), reviewTs: null, paidTs: null,
      operator: "", reason: "", note: String(note || "").trim(),
    });
    saveCashouts(list);
    logAction("申请兑换零花钱", "向家长 " + parent.name + " 申请兑换 " + pNum + " 分 = " + money + " 元");
    return { ok: true, money, rate };
  }
  // 家长：查看孩子的兑换记录（含待处理申请）
  function parentCashouts() {
    const s = getSession();
    if (!s || s.role !== "parent") return [];
    const child = myChild();
    if (!child) return [];
    return getCashouts().filter((c) => c.parentId === s.id || c.studentId === child.id);
  }
  // 学生：查看自己的兑换记录
  function myCashouts() {
    const s = getSession();
    if (!s) return [];
    return getCashouts().filter((c) => c.studentId === s.id);
  }
  // 家长：审批申请（通过则扣除孩子积分并记为已兑换；拒绝仅标记）
  async function reviewCashout(cashoutId, approve, reason) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    if (s.role !== "parent") return { ok: false, msg: "仅家长可审批零花钱申请" };
    if (isRemote()) {
      // 远程模式：扣分涉及学生积分，由服务端权威处理（家长无法整表写 users）
      try {
        const resp = await fetch(apiBase + "/cashout/review", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiToken() },
          body: JSON.stringify({ id: cashoutId, approve: !!approve, reason: reason || "" }),
        });
        const d = await resp.json();
        if (d && d.ok) { await resyncDocs(); logAction(approve ? "批准零花钱兑换" : "拒绝零花钱兑换", d.msg || "", s.name); return { ok: true, msg: d.msg }; }
        return d && d.msg ? { ok: false, msg: d.msg } : { ok: false, msg: "服务端处理失败" };
      } catch (e) { return { ok: false, msg: "网络异常，请稍后重试" }; }
    }
    // 本地模式
    const list = getCashouts();
    const c = list.find((x) => x.id === cashoutId);
    if (!c) return { ok: false, msg: "记录不存在" };
    if (c.status !== "pending") return { ok: false, msg: "该申请已处理" };
    if (c.parentId !== s.id) return { ok: false, msg: "这不是发送给你的申请" };
    if (approve) {
      const users = getUsers();
      const stu = users.find((x) => x.id === c.studentId);
      if (!stu) return { ok: false, msg: "孩子不存在" };
      if (stu.score < c.points) return { ok: false, msg: "孩子积分不足（当前 " + stu.score + " 分），无法批准" };
      stu.score = Math.round((stu.score - c.points) * 100) / 100;
      saveUsers(users);
      const ledger = getLedger();
      ledger.push({ id: uid("led"), uid: stu.id, name: stu.name, delta: -c.points, after: stu.score, reason: "兑换零花钱：" + c.money + " 元", operator: s.name, operatorRole: s.role, ts: now() });
      saveLedger(ledger);
      c.status = "paid"; c.reviewTs = now(); c.paidTs = now(); c.operator = s.name; c.reason = reason || "家长同意";
      logAction("批准零花钱兑换", "同意 " + stu.name + " 兑换 " + c.points + " 分 = " + c.money + " 元" + (reason ? "（" + reason + "）" : ""));
    } else {
      c.status = "rejected"; c.reviewTs = now(); c.operator = s.name; c.reason = reason || "家长拒绝";
      logAction("拒绝零花钱兑换", "拒绝 " + c.studentName + " 兑换 " + c.points + " 分 = " + c.money + " 元" + (reason ? "（" + reason + "）" : ""));
    }
    saveCashouts(list);
    return { ok: true };
  }
  // 家长：手动记录已经兑换的零花钱（不扣积分，仅登记）
  function recordManualCashout({ money, note }) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    if (s.role !== "parent") return { ok: false, msg: "仅家长可记录零花钱" };
    const child = myChild();
    if (!child) return { ok: false, msg: "你尚未关联孩子" };
    const m = Math.round(Number(money) * 100) / 100;
    if (isNaN(m) || m <= 0) return { ok: false, msg: "金额无效" };
    const list = getCashouts();
    list.unshift({
      id: uid("co"), type: "manual",
      studentId: child.id, studentName: child.name,
      parentId: s.id, parentName: s.name,
      points: 0, money: m, rate: 0,
      status: "paid",
      applyTs: now(), reviewTs: null, paidTs: now(),
      operator: s.name, reason: "家长手动记录", note: String(note || "").trim(),
    });
    saveCashouts(list);
    logAction("手动记录零花钱", "为孩子 " + child.name + " 登记已兑换零花钱 " + m + " 元" + (note ? "（" + note + "）" : ""));
    return { ok: true };
  }

  /* ---------- 昵称（需管理员审核） ---------- */
  function requestNickname(nick) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    const nickStr = String(nick || "").trim();
    if (!nickStr) return { ok: false, msg: "昵称不能为空" };
    if (nickStr.length > 12) return { ok: false, msg: "昵称请在 12 字以内" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.nickPending = nickStr;
    saveUsers(users);
    pushMe({ nickPending: nickStr });
    return { ok: true };
  }

  function reviewNickname(uid, approve) {
    const op = getSession();
    if (!op) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(op.role)) return { ok: false, msg: "无审核权限" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    if (approve) {
      u.nickname = u.nickPending;
      u.nickPending = "";
    } else {
      u.nickPending = "";
    }
    saveUsers(users);
    return { ok: true };
  }

  function pendingNicknames() {
    return getUsers().filter((u) => u.nickPending).map((u) => ({
      id: u.id, name: u.name, nickPending: u.nickPending, currentNick: u.nickname || u.name,
    }));
  }

  /* ---------- 头像（本地演示：存 base64；上线走 R2） ---------- */
  function setAvatar(dataUrl) {
    const s = getSession();
    if (!s) return { ok: false, msg: "未登录" };
    if (!isImgSrc(dataUrl)) return { ok: false, msg: "图片无效" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.avatar = dataUrl;
    saveUsers(users);
    pushMe({ avatar: dataUrl });
    refreshSession();
    return { ok: true };
  }

  /* ---------- 管理员：用户管理 ---------- */
  function adminListUsers() {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    return { ok: true, list: getUsers() };
  }
  function adminUpdateRole(uid, newRole) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    const valid = ["student", "teacher", "monitor", "admin", "superadmin", "parent", "guest"];
    if (!valid.includes(newRole)) return { ok: false, msg: "角色无效" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.role = newRole;
    saveUsers(users);
    logAction("调整角色", u.name + " → " + newRole);
    return { ok: true };
  }
  // 班主任/超管：设主部门（同步 upsert 进 posts 多职务）
  function adminUpdateDept(uid, department, departmentRole) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    const depts = Object.keys(DEPTS);
    u.department = depts.includes(department) ? department : "";
    u.departmentRole = u.department ? (["member", "minister"].includes(departmentRole) ? departmentRole : "member") : "";
    u.posts = Array.isArray(u.posts) ? u.posts : [];
    if (u.department) {
      const post = { dept: u.department, role: u.departmentRole };
      const i = u.posts.findIndex((p) => p.dept === u.department);
      if (i >= 0) u.posts[i] = post; else u.posts.push(post);
    } // 清空主部门时保留其它 posts（用户仍是多部门成员）
    saveUsers(users);
    logAction("分配部门", u.name + " → " + (u.department ? (DEPTS[u.department]?.name || u.department) + "·" + (u.departmentRole === "minister" ? "部长" : "成员") : "无主部门"));
    return { ok: true };
  }
  // 班主任/超管：给用户追加一个部门职务（多职务支持）
  function adminAddPost(uid, dept, role) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    if (!DEPTS[dept]) return { ok: false, msg: "部门不存在" };
    const r = ["member", "minister"].includes(role) ? role : "member";
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.posts = Array.isArray(u.posts) ? u.posts : [];
    const i = u.posts.findIndex((p) => p.dept === dept);
    if (i >= 0) u.posts[i] = { dept, role: r }; else u.posts.push({ dept, role: r });
    if (!u.department) { u.department = dept; u.departmentRole = r; } // 无主部门时首个职务兼作主部门
    saveUsers(users);
    logAction("添加职务", u.name + " → " + DEPTS[dept].name + "·" + (r === "minister" ? "部长" : "成员"));
    return { ok: true };
  }
  // 班主任/超管：移除用户的某个部门职务
  function adminRemovePost(uid, dept) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.posts = (Array.isArray(u.posts) ? u.posts : []).filter((p) => p.dept !== dept);
    if (u.department === dept) { u.department = ""; u.departmentRole = ""; }
    if (!u.department && u.posts.length) { u.department = u.posts[0].dept; u.departmentRole = u.posts[0].role; }
    saveUsers(users);
    logAction("移除职务", u.name + " ← " + (DEPTS[dept]?.name || dept));
    return { ok: true };
  }
  // 班主任/超管：整体替换某用户的多职务（posts 空则清空）
  function adminSetPosts(uid, posts) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    if (!Array.isArray(posts)) return { ok: false, msg: "职务格式无效" };
    const clean = [];
    posts.forEach((p) => { if (p && DEPTS[p.dept] && ["member", "minister"].includes(p.role)) clean.push({ dept: p.dept, role: p.role }); });
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.posts = clean;
    if (clean.length) {
      if (!u.department || !clean.some((p) => p.dept === u.department)) { u.department = clean[0].dept; u.departmentRole = clean[0].role; }
    } else { u.department = ""; u.departmentRole = ""; }
    saveUsers(users);
    logAction("设置多职务", u.name + " → " + (clean.map((p) => (DEPTS[p.dept]?.name || p.dept) + "·" + (p.role === "minister" ? "部长" : "成员")).join("、") || "无"));
    return { ok: true };
  }
  // 班主任/超管：一键按《班委职责表》重分配全部学生职务
  function adminApplyCommittee() {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    const users = getUsers();
    users.forEach((u) => {
      if (u.role === "student" || u.role === "superadmin") { delete u.department; delete u.departmentRole; u.posts = []; }
    });
    assignCommittee(users);
    saveUsers(users);
    logAction("班委表分配", "按《班委职责表》重分配全部学生部门职务");
    return { ok: true };
  }
  // 当前会话用户归属的部门页（普通同学无部门则返回 null）
  function myDepartment() {
    const s = getSession(); if (!s) return null;
    const u = findById(s.id);
    if (!u || !u.department || (u.departmentRole !== "member" && u.departmentRole !== "minister")) return null;
    return { id: u.department, ...DEPTS[u.department], role: u.departmentRole };
  }
  // 班主任/超管：设置任意新密码（哈希存储；forceChange 默认 true 强制下次改密）
  async function adminSetPassword(uid, newPwd, forceChange) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    const pwd = String(newPwd == null ? "" : newPwd);
    if (pwd.length < 4) return { ok: false, msg: "密码至少 4 位" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.password = await hashPassword(pwd);
    u.mustChange = forceChange !== false;
    saveUsers(users);
    logAction("设置密码", u.name + "（" + (pwd === DEFAULT_PWD ? "重置为初始密码" : "管理员设置新密码") + (u.mustChange ? "，强制改密" : "") + "）");
    return { ok: true };
  }
  // 兼容旧调用：重置为默认密码
  function adminResetPassword(uid) { return adminSetPassword(uid, DEFAULT_PWD, true); }
  // 密码状态：仅返回 默认/已改，绝不暴露哈希
  async function adminGetPwdStatus(uid) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    const u = findById(uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    const isDefault = (await verifyPw(DEFAULT_PWD, u.password)) !== null;
    return { ok: true, status: isDefault ? "default" : "changed", mustChange: !!u.mustChange };
  }
  // 班主任/超管：代改用户 姓名/昵称/头像（头像支持 dataUrl / r2: / image/<姓名>.jpg，空串=清除）
  function adminUpdateProfile(uid, patch) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    const p = patch || {};
    if (p.name !== undefined) {
      const n = String(p.name).trim();
      if (!n) return { ok: false, msg: "姓名不能为空" };
      u.name = n;
    }
    if (p.nickname !== undefined) { u.nickname = String(p.nickname).trim().slice(0, 12); u.nickPending = ""; }
    if (p.avatar !== undefined) {
      const a = String(p.avatar || "");
      if (a && !isImgSrc(a)) return { ok: false, msg: "图片无效" };
      u.avatar = a;
    }
    saveUsers(users);
    if (u.id === op.id) refreshSession();
    logAction("修改用户资料", u.name + "（姓名/昵称/头像）");
    return { ok: true };
  }

  /* ---------- 管理员：新闻管理 ---------- */
  function getNews() { return lsGet(KEY.news, []); }
  function saveNews(list) {
    const op = getSession();
    if (!op || !isSiteAdmin(op)) return { ok: false, msg: "无权限" };
    lsSet(KEY.news, list);
    return { ok: true };
  }
  function addNews(item) {
    const op = getSession();
    if (!op || !isSiteAdmin(op)) return { ok: false, msg: "无权限" };
    if (!item || !item.title || !item.content) return { ok: false, msg: "标题与内容不能为空" };
    const list = getNews();
    list.unshift({ id: uid("news"), title: item.title, content: item.content, date: item.date || now(), ts: now() });
    lsSet(KEY.news, list);
    logAction("发布班级新闻", "「" + item.title + "」");
    return { ok: true, list };
  }
  function deleteNews(id) {
    const op = getSession();
    if (!op || !isSiteAdmin(op)) return { ok: false, msg: "无权限" };
    const target = getNews().find((n) => n.id === id);
    lsSet(KEY.news, getNews().filter((n) => n.id !== id));
    logAction("删除班级新闻", target ? "「" + target.title + "」" : id);
    return { ok: true };
  }

  /* ---------- 管理员：媒体/相册管理 ---------- */
  function getMedia() { return lsGet(KEY.media, []); }
  function addMedia(item) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    if (!item || !item.src) return { ok: false, msg: "图片不能为空" };
    const list = getMedia();
    list.unshift({ id: uid("media"), src: item.src, caption: item.caption || "", album: item.album || "班级风采", ts: now() });
    lsSet(KEY.media, list);
    logAction("添加媒体", item.album || "班级风采" + " · " + (item.caption || ""));
    return { ok: true, list };
  }
  function deleteMedia(id) {
    const op = getSession();
    if (!op || !isSuperAdmin(op.role)) return { ok: false, msg: "无权限" };
    const target = getMedia().find((m) => m.id === id);
    lsSet(KEY.media, getMedia().filter((m) => m.id !== id));
    logAction("删除媒体", target ? (target.album + " · " + (target.caption || id)) : id);
    return { ok: true };
  }

  /* ============================================================
     用户中心：联系方式 / 简介 / 个人图片
     ============================================================ */
  async function updateProfile({ contact, bio }) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    if (contact) {
      u.contact = u.contact || { qq: "", email: "", phone: "" };
      if (contact.qq !== undefined) u.contact.qq = String(contact.qq);
      if (contact.email !== undefined) u.contact.email = String(contact.email);
      if (contact.phone !== undefined) u.contact.phone = String(contact.phone);
    }
    if (bio !== undefined) u.bio = String(bio || "").slice(0, 120);
    saveUsers(users);
    await pushMe({ contact: u.contact, bio: u.bio }); // 等待服务端落库，避免刷新后联系方式丢失
    refreshSession();
    return { ok: true };
  }

  function addPersonalImage(dataUrl) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isImgSrc(dataUrl)) return { ok: false, msg: "图片无效" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.personalImages = u.personalImages || [];
    if (u.personalImages.length >= 12) return { ok: false, msg: "最多上传 12 张" };
    u.personalImages.push({ src: dataUrl, ts: now() });
    saveUsers(users);
    pushMe({ personalImages: u.personalImages });
    return { ok: true };
  }
  function deletePersonalImage(index) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const users = getUsers();
    const u = users.find((x) => x.id === s.id);
    if (!u || !u.personalImages) return { ok: false, msg: "用户不存在" };
    u.personalImages.splice(Number(index), 1);
    saveUsers(users);
    pushMe({ personalImages: u.personalImages });
    return { ok: true };
  }

  /* ============================================================
     部门内容通用流（案件公示/编辑部文章/医疗公告）
     status: draft → pending(待部长审核) → published
     普通成员：新建/编辑草稿、提交审核；部长/超管：直接发布、审核通过/驳回、删除
     ============================================================ */
  const DEPT_STORE_KEYS = {
    xingzheng:   "xh_dept_xingzheng",
    houqin:      KEY.meds,
    xuexi:       "xh_dept_xuexi",
    wenti:       "xh_dept_wenti",
    jiwei:       KEY.cases,
    xuanchuan:   "xh_dept_xuanchuan",
    bianji:      KEY.articles,
    xinxianquan: "xh_dept_xinxianquan",
    huodong:     "xh_dept_huodong",
  };
  function getDeptItems(deptId) {
    const k = DEPT_STORE_KEYS[deptId];
    return k ? lsGet(k, []) : [];
  }
  function saveDeptItems(deptId, list) { lsSet(DEPT_STORE_KEYS[deptId], list); }

  function deptItem(deptId, id) { return getDeptItems(deptId).find((x) => x.id === id); }

  // 新建（草稿 / 有权限则直接发布）
  function addDeptItem(deptId, fields) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditDept(deptId)) return { ok: false, msg: "你不属于该部门，无法操作" };
    const direct = canApproveDept(deptId);
    const item = {
      id: uid("dpt"),
      dept: deptId,
      ...fields,
      status: direct ? "published" : "pending",
      authorId: s.id,
      author: s.name,
      authorName: s.nickname || s.name,
      createdTs: now(),
      reviewTs: direct ? now() : null,
      reviewer: direct ? s.name : null,
    };
    const list = getDeptItems(deptId);
    list.unshift(item);
    saveDeptItems(deptId, list);
    logAction("发布部门内容", (DEPTS[deptId]?.name || deptId) + "：「" + (fields.title || fields.content || "(未命名)") + "」");
    return { ok: true, item, msg: direct ? "已直接发布" : "已保存草稿并提交部长审核" };
  }

  // 编辑草稿（仅本人或超管）
  function updateDeptItem(deptId, id, fields) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditDept(deptId)) return { ok: false, msg: "无编辑权限" };
    const list = getDeptItems(deptId);
    const item = list.find((x) => x.id === id);
    if (!item) return { ok: false, msg: "内容不存在" };
    if (item.authorId !== s.id && !isSuperAdmin(s.role)) return { ok: false, msg: "仅作者本人可编辑" };
    Object.keys(fields).forEach((k2) => { if (k2 !== "status" && k2 !== "id" && k2 !== "dept") item[k2] = fields[k2]; });
    item.status = canApproveDept(deptId) ? "published" : "pending";
    item.reviewTs = canApproveDept(deptId) ? now() : null;
    item.reviewer = canApproveDept(deptId) ? s.name : item.reviewer;
    saveDeptItems(deptId, list);
    logAction("编辑部门内容", (DEPTS[deptId]?.name || deptId) + "：「" + (item.title || item.content || "(未命名)") + "」");
    return { ok: true, msg: item.status === "published" ? "已更新并发布" : "已更新并重新提交审核" };
  }

  // 审核：部长/超管 通过或驳回
  function reviewDeptItem(deptId, id, approve) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canApproveDept(deptId)) return { ok: false, msg: "需要部长权限才能审核" };
    const list = getDeptItems(deptId);
    const item = list.find((x) => x.id === id);
    if (!item) return { ok: false, msg: "内容不存在" };
    if (approve) { item.status = "published"; item.reviewTs = now(); item.reviewer = s.name; }
    else { item.status = "rejected"; item.reviewTs = now(); item.reviewer = s.name; }
    saveDeptItems(deptId, list);
    logAction("审核部门内容", (DEPTS[deptId]?.name || deptId) + "：「" + (item.title || item.content || "(未命名)") + "」" + (approve ? "通过" : "驳回"));
    return { ok: true };
  }
  // 删除（需部长/超管）
  function deleteDeptItem(deptId, id) {
    if (!canApproveDept(deptId)) return { ok: false, msg: "需要部长权限才能删除" };
    saveDeptItems(deptId, getDeptItems(deptId).filter((x) => x.id !== id));
    logAction("删除部门内容", DEPTS[deptId]?.name + " · " + id);
    return { ok: true };
  }

  /* ============================================================
     部门专项登记（值日班长/卫生评比/作业打卡/征稿/巡检等）
     文体部不配置；纪检部已用案件公示+举报箱；市监局走 shop.html。
     登记即公示：本部门成员均可登记，部长/超管可删除，作者可删本人。
     ============================================================ */
  const DEPT_RECORD_SCHEMAS = {
    xingzheng: {
      name: "考勤与值日班长",
      hint: "行政部登记每日考勤：值日班长、迟到与缺勤情况。",
      fields: [
        { key: "date", label: "日期", type: "date" },
        { key: "leader", label: "值日班长", type: "text" },
        { key: "late", label: "迟到名单", type: "text" },
        { key: "absent", label: "缺勤名单", type: "text" },
        { key: "note", label: "备注", type: "textarea" },
      ],
      cols: [["date", "日期"], ["leader", "值日班长"], ["late", "迟到"], ["absent", "缺勤"]],
    },
    houqin: {
      name: "卫生评比",
      hint: "后勤部登记每周卫生检查得分，期末汇总评比。",
      fields: [
        { key: "week", label: "周次", type: "text" },
        { key: "groupName", label: "小组", type: "text" },
        { key: "score", label: "得分", type: "text" },
        { key: "note", label: "备注", type: "textarea" },
      ],
      cols: [["week", "周次"], ["groupName", "小组"], ["score", "得分"]],
    },
    xuexi: {
      name: "作业收交与背书检查",
      hint: "学习部登记作业收交、背书过关情况，公示未交/未过关名单。",
      fields: [
        { key: "date", label: "日期", type: "date" },
        { key: "subject", label: "科目", type: "text" },
        { key: "task", label: "作业/任务", type: "text" },
        { key: "unsub", label: "未交/未过关名单", type: "text" },
        { key: "note", label: "备注", type: "textarea" },
      ],
      cols: [["date", "日期"], ["subject", "科目"], ["task", "任务"], ["unsub", "未交名单"]],
    },
    xuanchuan: {
      name: "素材征集",
      hint: "宣传部登记照片、素材征集主题与完成情况。",
      fields: [
        { key: "date", label: "日期", type: "date" },
        { key: "theme", label: "征集主题", type: "text" },
        { key: "status", label: "完成情况", type: "text" },
        { key: "note", label: "备注", type: "textarea" },
      ],
      cols: [["date", "日期"], ["theme", "主题"], ["status", "完成情况"]],
    },
    bianji: {
      name: "征稿启事",
      hint: "编辑部发布各期征稿主题与收稿情况。",
      fields: [
        { key: "issue", label: "期号", type: "text" },
        { key: "theme", label: "征稿主题", type: "text" },
        { key: "deadline", label: "截止日期", type: "date" },
        { key: "note", label: "收稿情况", type: "textarea" },
      ],
      cols: [["issue", "期号"], ["theme", "主题"], ["deadline", "截止日期"]],
    },
    xinxianquan: {
      name: "网站巡检记录",
      hint: "信息安全部登记网站巡检、问题排查与处理情况。",
      fields: [
        { key: "date", label: "日期", type: "date" },
        { key: "item", label: "巡检项", type: "text" },
        { key: "result", label: "巡检结果", type: "text" },
        { key: "note", label: "处理记录", type: "textarea" },
      ],
      cols: [["date", "日期"], ["item", "巡检项"], ["result", "结果"]],
    },
    huodong: {
      name: "活动方案公示",
      hint: "活动策划部公示活动方案、时间地点与筹备进度。",
      fields: [
        { key: "name", label: "活动名称", type: "text" },
        { key: "date", label: "活动时间", type: "date" },
        { key: "venue", label: "地点", type: "text" },
        { key: "note", label: "方案要点", type: "textarea" },
      ],
      cols: [["name", "活动名称"], ["date", "活动时间"], ["venue", "地点"]],
    },
  };

  function getDeptRecords(deptId) {
    return lsGet(KEY.deptRecords, []).filter((x) => x.dept === deptId);
  }
  // 登记即公示：本部门成员均可登记（无需部长审核）
  function addDeptRecord(deptId, fields) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditDept(deptId)) return { ok: false, msg: "你不属于该部门，无法登记" };
    if (!fields || !Object.keys(fields).some((k) => fields[k])) return { ok: false, msg: "请至少填写一项内容" };
    const rec = {
      id: uid("rec"),
      dept: deptId,
      ...fields,
      status: "published",
      authorId: s.id,
      authorName: s.nickname || s.name,
      createdTs: now(),
    };
    const all = lsGet(KEY.deptRecords, []);
    all.unshift(rec);
    lsSet(KEY.deptRecords, all);
    const head = fields.date || fields.week || fields.name || fields.theme || fields.title || "登记";
    logAction("新增部门登记", (DEPTS[deptId]?.name || deptId) + "：「" + head + "」");
    return { ok: true, msg: "已登记并公示" };
  }
  // 删除：部长/超管可删任意登记，作者可删本人登记
  function deleteDeptRecord(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const all = lsGet(KEY.deptRecords, []);
    const rec = all.find((x) => x.id === id);
    if (!rec) return { ok: false, msg: "登记不存在" };
    if (!canApproveDept(rec.dept) && rec.authorId !== s.id) return { ok: false, msg: "无权限删除" };
    lsSet(KEY.deptRecords, all.filter((x) => x.id !== id));
    logAction("删除部门登记", (DEPTS[rec.dept]?.name || rec.dept) + " · " + id);
    return { ok: true };
  }

  /* ============================================================
     部门弹窗公告：本部门成员可发布，登录后按部门弹窗展示
     ============================================================ */
  function getDeptNotices() { return lsGet(KEY.deptNotices, []); }
  function addDeptNotice(deptId, fields) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditDept(deptId)) return { ok: false, msg: "你不属于该部门，无法操作" };
    if (!fields || !fields.title) return { ok: false, msg: "请填写公告标题" };
    const list = getDeptNotices();
    const direct = canApproveDept(deptId);
    list.unshift({
      id: uid("dnt"),
      dept: deptId,
      title: fields.title,
      content: fields.content || "",
      status: direct ? "published" : "pending",
      authorId: s.id,
      authorName: s.nickname || s.name,
      createdTs: now(),
    });
    lsSet(KEY.deptNotices, list);
    logAction("发布部门弹窗公告", DEPTS[deptId]?.name + "：「" + fields.title + "」");
    return { ok: true, msg: direct ? "已发布弹窗公告" : "已提交，待部长审核后弹窗" };
  }
  function reviewDeptNotice(id, approve) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const list = getDeptNotices();
    const n = list.find((x) => x.id === id);
    if (!n) return { ok: false, msg: "公告不存在" };
    if (!canApproveDept(n.dept)) return { ok: false, msg: "需要部长权限才能审核" };
    n.status = approve ? "published" : "rejected";
    lsSet(KEY.deptNotices, list);
    logAction("审核部门弹窗公告", (DEPTS[n.dept]?.name || n.dept) + "：「" + n.title + "」" + (approve ? "通过" : "驳回"));
    return { ok: true };
  }
  function deleteDeptNotice(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const list = getDeptNotices();
    const n = list.find((x) => x.id === id);
    if (!n) return { ok: false, msg: "公告不存在" };
    if (!canApproveDept(n.dept) && n.authorId !== s.id) return { ok: false, msg: "无权限删除" };
    lsSet(KEY.deptNotices, list.filter((x) => x.id !== id));
    logAction("删除部门弹窗公告", (DEPTS[n.dept]?.name || n.dept) + "：「" + n.title + "」");
    return { ok: true };
  }
  // 当前用户未读的已发布弹窗公告（按本人全部部门职务匹配，已读记录存本人）
  function unreadDeptNotices() {
    const s = getSession(); if (!s) return [];
    const u = findById(s.id);
    if (!u) return [];
    const myDepts = (Array.isArray(u.posts) ? u.posts : []).map((p) => p.dept);
    if (u.department) myDepts.push(u.department);
    const readIds = u.deptNoticesRead || [];
    return getDeptNotices().filter((x) =>
      x.status === "published" && readIds.indexOf(x.id) < 0 && myDepts.indexOf(x.dept) >= 0
    );
  }
  function markDeptNoticeRead(ids) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const u = findById(s.id);
    if (!u) return { ok: false, msg: "用户不存在" };
    const read = u.deptNoticesRead || [];
    (ids || []).forEach((id) => { if (read.indexOf(id) < 0) read.push(id); });
    u.deptNoticesRead = read;
    saveUsers(getUsers());
    pushMe({ deptNoticesRead: read });
    return { ok: true };
  }

  /* ============================================================
     纪检：实名 / 匿名举报（全站登录用户可提交，仅纪检成员可见）
     ============================================================ */
  function myReports() { return lsGet(KEY.reports, []); }
  function submitReport(fields) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    if (!fields || (!fields.target && !fields.detail)) return { ok: false, msg: "请填写涉案人员或案情经过至少一项" };
    const list = myReports();
    const reporterName = (s.nickname || s.name || "") + "（" + (s.account || "") + "）";
    list.unshift({
      id: uid("rep"), ts: now(),
      target: fields.target || "",       // 涉案人员
      detail: fields.detail || "",       // 案情经过
      evidence: fields.evidence || [],   // 图片佐证
      other: fields.other || "",         // 其他说明
      mode: fields.mode === "real" ? "real" : "anon", // real=实名 / anon=匿名
      reporter: fields.mode === "real" ? reporterName : "", // 实名时记录举报人，匿名留空
      status: "open",
    });
    saveReport(list);
    logAction("提交举报", (fields.mode === "real" ? "实名" : "匿名") + " · 涉案：" + (fields.target || "未填"));
    return { ok: true };
  }
  function saveReport(list) { lsSet(KEY.reports, list); }
  // 纪检成员将某举报标记为已受理/归档
  function markReport(id, status) {
    if (!canEditDept("jiwei")) return { ok: false, msg: "仅纪检部可处理" };
    const list = myReports();
    const r = list.find((x) => x.id === id);
    if (r) { r.status = status || "closed"; }
    saveReport(list);
    logAction("处理举报", (r && r.target ? "涉案：" + r.target : id) + " → " + (status || "closed"));
    return { ok: true };
  }

  /* ============================================================
     宣传部：相册（后台传相册；部长/超管发布删除）
     ============================================================ */
  function getAlbums() { return lsGet(KEY.albums, []); }
  function saveAlbums(list) { lsSet(KEY.albums, list); }
  function addAlbum(name) {
    if (!canEditDept("xuanchuan")) return { ok: false, msg: "无宣传部权限" };
    if (!name) return { ok: false, msg: "请输入相册名称" };
    const list = getAlbums();
    list.unshift({ id: uid("alb"), name, author: getSession().name, createdTs: now(), photos: [], status: canApproveDept("xuanchuan") ? "published" : "pending" });
    saveAlbums(list);
    logAction("创建相册", "「" + name + "」");
    return { ok: true };
  }
  function addAlbumPhoto(albumId, dataUrl, caption) {
    if (!canEditDept("xuanchuan")) return { ok: false, msg: "无宣传部权限" };
    const list = getAlbums();
    const a = list.find((x) => x.id === albumId);
    if (!a) return { ok: false, msg: "相册不存在" };
    a.photos.push({ src: dataUrl, caption: caption || "", status: canApproveDept("xuanchuan") ? "published" : "pending", ts: now() });
    saveAlbums(list);
    logAction("上传相册照片", a.name + " · " + (caption || "(无标题)"));
    return { ok: true };
  }
  function reviewAlbumPhoto(albumId, photoIndex, approve) {
    if (!canApproveDept("xuanchuan")) return { ok: false, msg: "需部长权限" };
    const list = getAlbums();
    const a = list.find((x) => x.id === albumId);
    if (!a) return { ok: false, msg: "相册不存在" };
    const p = a.photos[Number(photoIndex)];
    if (p) p.status = approve ? "published" : "rejected";
    saveAlbums(list);
    logAction("审核相册照片", a.name + " · " + (approve ? "通过" : "驳回"));
    return { ok: true };
  }
  function deleteAlbumPhoto(albumId, photoIndex) {
    if (!canApproveDept("xuanchuan")) return { ok: false, msg: "需部长权限" };
    const list = getAlbums();
    const a = list.find((x) => x.id === albumId);
    if (a) a.photos.splice(Number(photoIndex), 1);
    saveAlbums(list);
    logAction("删除相册照片", a ? a.name : albumId);
    return { ok: true };
  }
  function deleteAlbum(albumId) {
    if (!canApproveDept("xuanchuan")) return { ok: false, msg: "需部长权限" };
    const target = getAlbums().find((x) => x.id === albumId);
    saveAlbums(getAlbums().filter((x) => x.id !== albumId));
    logAction("删除相册", target ? "「" + target.name + "」" : albumId);
    return { ok: true };
  }
  // 全部已发布照片（相册页展示）
  function allPublishedPhotos() {
    const out = [];
    getAlbums().forEach((a) => a.photos.forEach((p) => { if (p.status === "published") out.push({ src: p.src, caption: p.caption, album: a.name }); }));
    return out;
  }

  /* ---------- 公开相册（成员 / 家长共同上传） ---------- */
  function galleryGet() { return lsGet(KEY.gallery, { albums: [], photos: [] }); }
  function gallerySave(g) { lsSet(KEY.gallery, g); }
  // 可上传：登录且非访客（本班成员 + 家长）
  function canUploadGallery() {
    const s = getSession();
    if (!s) return false;
    return s.role !== "guest";
  }
  function galleryCreateAlbum(name) {
    if (!canUploadGallery()) return { ok: false, msg: "请先登录（本班成员或家长可上传）" };
    name = String(name || "").trim();
    if (!name) return { ok: false, msg: "请输入相册名称" };
    const s = getSession();
    const g = galleryGet();
    if (g.albums.some((a) => a.name === name)) return { ok: false, msg: "已存在同名相册" };
    g.albums.unshift({ id: uid("gal"), name, authorId: s.id, authorName: s.nickname || s.name, ts: now() });
    gallerySave(g);
    logAction("创建公开相册", "「" + name + "」");
    return { ok: true, albumId: g.albums[0].id };
  }
  function galleryUpload(albumId, dataUrl, name) {
    if (!canUploadGallery()) return { ok: false, msg: "请先登录（本班成员或家长可上传）" };
    const s = getSession();
    const g = galleryGet();
    if (!g.albums.some((x) => x.id === albumId)) return { ok: false, msg: "相册不存在" };
    g.photos.push({ id: uid("gp"), albumId, name: name || "未命名", src: dataUrl, uploaderId: s.id, uploaderName: s.nickname || s.name, ts: now() });
    gallerySave(g);
    const album = g.albums.find((a) => a.id === albumId);
    logAction("上传公开相册", (album ? album.name : albumId) + " · " + (name || "未命名"));
    return { ok: true };
  }
  function galleryCanManage(photo) {
    const s = getSession();
    if (!s) return false;
    if (isSiteAdmin(s)) return true;
    return !!(photo && photo.uploaderId === s.id);
  }
  function galleryRename(photoId, newName) {
    newName = String(newName || "").trim();
    if (!newName) return { ok: false, msg: "请输入名称" };
    const g = galleryGet();
    const p = g.photos.find((x) => x.id === photoId);
    if (!p) return { ok: false, msg: "照片不存在" };
    if (!galleryCanManage(p)) return { ok: false, msg: "仅上传者或管理员可修改" };
    p.name = newName;
    gallerySave(g);
    logAction("重命名公开相册照片", newName);
    return { ok: true };
  }
  function galleryDeletePhoto(photoId) {
    const g = galleryGet();
    const p = g.photos.find((x) => x.id === photoId);
    if (!p) return { ok: false, msg: "照片不存在" };
    if (!galleryCanManage(p)) return { ok: false, msg: "仅上传者或管理员可删除" };
    g.photos = g.photos.filter((x) => x.id !== photoId);
    gallerySave(g);
    logAction("删除公开相册照片", p.name);
    return { ok: true };
  }
  function galleryDeleteAlbum(albumId) {
    const s = getSession();
    if (!s) return { ok: false, msg: "请先登录" };
    if (!isSiteAdmin(s)) return { ok: false, msg: "仅网站管理员可删除相册" };
    const g = galleryGet();
    const target = g.albums.find((a) => a.id === albumId);
    g.albums = g.albums.filter((a) => a.id !== albumId);
    g.photos = g.photos.filter((p) => p.albumId !== albumId);
    gallerySave(g);
    logAction("删除公开相册", target ? "「" + target.name + "」" : albumId);
    return { ok: true };
  }

  /* ============================================================
     通知公告：班主任/超管发布，所有人可见
     ============================================================ */
  function getNotices() { return lsGet(KEY.notices, []); }
  function addNotice(title, content) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSiteAdmin(s)) return { ok: false, msg: "仅网站管理员可发布通知" };
    if (!title || !content) return { ok: false, msg: "标题与内容不能为空" };
    const list = getNotices();
    list.unshift({ id: uid("nt"), title, content, author: s.name, ts: now() });
    lsSet(KEY.notices, list);
    logAction("发布通知公告", "「" + title + "」");
    return { ok: true, list };
  }
  function updateNotice(id, title, content) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSiteAdmin(s)) return { ok: false, msg: "仅网站管理员可编辑公告" };
    if (!id || !title || !content) return { ok: false, msg: "标题与内容不能为空" };
    const list = getNotices();
    const n = list.find((x) => x.id === id);
    if (!n) return { ok: false, msg: "公告不存在" };
    n.title = title; n.content = content; n.ts = now();
    lsSet(KEY.notices, list);
    logAction("编辑通知公告", "「" + title + "」");
    return { ok: true, list };
  }
  function deleteNotice(id) {
    if (!isSiteAdmin(getSession())) return { ok: false, msg: "无权限" };
    const target = getNotices().find((n) => n.id === id);
    lsSet(KEY.notices, getNotices().filter((n) => n.id !== id));
    logAction("删除通知公告", target ? "「" + target.title + "」" : id);
    return { ok: true };
  }

  /* ============================================================
     值日表：班委及以上可维护，所有人可见
     ============================================================ */
  function getDuty() { return lsGet(KEY.duty, []); }
  function addDutyShift(row) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditRole(s.role)) return { ok: false, msg: "无权限维护值日表" };
    if (!row || !row.date || !row.group) return { ok: false, msg: "日期与值日小组不能为空" };
    const list = getDuty();
    list.push({ id: uid("du"), date: row.date, group: row.group, members: row.members || [], note: row.note || "", ts: now() });
    lsSet(KEY.duty, list.sort((a, b) => String(a.date).localeCompare(String(b.date))));
    return { ok: true };
  }
  function deleteDutyShift(id) {
    if (!canEditRole(getSession()?.role)) return { ok: false, msg: "无权限" };
    lsSet(KEY.duty, getDuty().filter((d) => d.id !== id));
    return { ok: true };
  }

  /* ============================================================
     勋章/称号：班主任/超管手动授予
     ============================================================ */
  function grantBadge(uid, name) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(s.role)) return { ok: false, msg: "仅班主任/超管可授予" };
    const n = String(name || "").trim(); if (!n) return { ok: false, msg: "称号不能为空" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.badges = u.badges || [];
    if (u.badges.some((b) => b.name === n)) return { ok: false, msg: "已授予该称号" };
    u.badges.push({ id: uid("bdg"), name: n, grantBy: s.name, ts: now() });
    saveUsers(users);
    if (u.id === s.id) refreshSession();
    return { ok: true };
  }
  function revokeBadge(uid, badgeId) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(s.role)) return { ok: false, msg: "仅班主任/超管可撤销" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.badges = (u.badges || []).filter((b) => b.id !== badgeId);
    saveUsers(users);
    if (u.id === s.id) refreshSession();
    return { ok: true };
  }

  /* ============================================================
     小组：组长已登记，组员开学后补充
     ============================================================ */
  function getGroups() { return lsGet(KEY.groups, []); }
  function saveGroups(list) { lsSet(KEY.groups, list); }
  // 管理员/班委：把某同学加入某小组（或移除）
  function setUserGroup(uid, groupId) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(s.role) && s.role !== "monitor") return { ok: false, msg: "无权限" };
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    const groups = getGroups();
    // 从原有小组中移除
    groups.forEach((g) => { g.members = g.members.filter((m) => m.id !== uid); if (g.leaderId === uid) g.leaderId = null; });
    if (groupId) {
      const g = groups.find((x) => x.id === groupId);
      if (!g) return { ok: false, msg: "小组不存在" };
      if (g.leaderId !== uid && !g.members.some((m) => m.id === uid)) g.members.push({ id: uid, name: u.name });
    }
    u.groupId = groupId || "";
    saveGroups(groups);
    saveUsers(users);
    return { ok: true };
  }
  // 管理员/班委：设置某小组组长（uid 为空则移除组长，原组长保留组员身份）
  function setGroupLeader(groupId, uid) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(s.role) && s.role !== "monitor") return { ok: false, msg: "无权限" };
    const groups = getGroups();
    const g = groups.find((x) => x.id === groupId);
    if (!g) return { ok: false, msg: "小组不存在" };
    const users = getUsers();
    if (uid) {
      const u = users.find((x) => x.id === uid);
      if (!u) return { ok: false, msg: "用户不存在" };
      if (g.leaderId === uid) return { ok: true };
      g.members = g.members.filter((m) => m.id !== uid);
      g.members.unshift({ id: uid, name: u.name });
      g.leaderId = uid;
      g.leaderName = u.name;
      g.note = "组长：" + u.name;
      u.groupId = groupId;
    } else {
      g.leaderId = null;
      g.leaderName = "";
      g.note = "组长：待定";
    }
    saveGroups(groups);
    saveUsers(users);
    logAction("设置组长", g.name + " → " + (g.leaderName || "无"));
    return { ok: true };
  }
  // ============================================================
  // 小组长专享管理：组员 / 值日 / 班委头像（第二头像）
  // ============================================================
  // 小组长权限闸门：仅本组组长或超管可管理
  function leaderGate(groupId) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const g = getGroups().find((x) => x.id === groupId);
    if (!g) return { ok: false, msg: "小组不存在" };
    if (isSuperAdmin(s.role) || g.leaderId === s.id) return { ok: true };
    return { ok: false, msg: "仅本组组长可管理本组" };
  }
  // 当前用户身为组长的小组；不是组长返回 null
  function myGroupAsLeader() {
    const s = getSession(); if (!s) return null;
    return getGroups().find((g) => g.leaderId === s.id) || null;
  }
  // 当前用户所在小组（组长或组员）
  function myGroup() {
    const s = getSession(); if (!s) return null;
    return getGroups().find((g) => g.leaderId === s.id || g.members.some((m) => m.id === s.id)) || null;
  }

  // 小组长添加组员（可把任意同学拉进本组；若其在其他组会被移出）
  function groupLeaderAddMember(groupId, uid) {
    const gate = leaderGate(groupId); if (!gate.ok) return gate;
    if (!uid) return { ok: false, msg: "请选择要加入的成员" };
    const u = getUsers().find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "成员不存在" };
    const groups = getGroups();
    const g = groups.find((x) => x.id === groupId);
    if (!g) return { ok: false, msg: "小组不存在" };
    if (g.leaderId === uid) return { ok: true }; // 组长本人无需加入
    groups.forEach((o) => {
      o.members = o.members.filter((m) => m.id !== uid);
      if (o.leaderId === uid) o.leaderId = null;
    });
    g.members = g.members.filter((m) => m.id !== uid);
    if (!g.members.some((m) => m.id === uid)) g.members.push({ id: uid, name: u.name });
    const users = getUsers();
    const tu = users.find((x) => x.id === uid); if (tu) tu.groupId = g.id;
    saveGroups(groups);
    saveUsers(users);
    logAction("组长添加组员", g.name + " → " + u.name);
    return { ok: true };
  }
  // 小组长剔除组员（可备注理由，理由写入操作日志）
  function groupLeaderRemoveMember(groupId, uid, reason) {
    const gate = leaderGate(groupId); if (!gate.ok) return gate;
    const groups = getGroups();
    const g = groups.find((x) => x.id === groupId);
    if (!g) return { ok: false, msg: "小组不存在" };
    const mem = g.members.find((m) => m.id === uid);
    if (!mem) return { ok: false, msg: "该成员不在本组" };
    const r = String(reason || "").trim();
    g.members = g.members.filter((m) => m.id !== uid);
    const users = getUsers();
    const u = users.find((x) => x.id === uid); if (u) u.groupId = "";
    saveGroups(groups);
    saveUsers(users);
    logAction("组长剔除组员", g.name + " → " + mem.name + (r ? "（理由：" + r + "）" : ""));
    return { ok: true, name: mem.name };
  }

  // ---- 值日分配：支持「具体日期」与「星期几循环」两种模式 ----
  // week：1-7 表示每周循环到周{1-7}；0 表示具体日期（用 date）。
  function groupDutyAssign({ groupId, week, date, memberId, task }) {
    const gate = leaderGate(groupId); if (!gate.ok) return gate;
    const g = getGroups().find((x) => x.id === groupId);
    if (!g) return { ok: false, msg: "小组不存在" };
    const u = getUsers().find((x) => x.id === memberId);
    if (!u) return { ok: false, msg: "成员不存在" };
    const t = String(task || "").trim();
    if (!t) return { ok: false, msg: "请填写具体分工内容" };
    const w = Number(week);
    let useDate = "";
    let useWeek = 0;
    if (w >= 1 && w <= 7) {
      useWeek = w;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      useDate = date;
    } else {
      return { ok: false, msg: "请选择星期循环或具体日期" };
    }
    const list = getDuty();
    list.push({
      id: uid("du"), groupId, groupName: g.name,
      week: useWeek, date: useDate, memberId, memberName: u.name, task: t, ts: now(),
    });
    lsSet(KEY.duty, list.sort((a, b) => String(a.date).localeCompare(String(b.date))));
    logAction("组长安排值日", g.name + " → " + u.name + "：" + t + (useWeek ? "（每周周" + useWeek + "循环）" : "（" + useDate + "）"));
    return { ok: true };
  }
  // 组长/超管删除本组某条值日分工
  function deleteGroupDuty(id) {
    const d = getDuty().find((x) => x.id === id);
    if (!d) return { ok: false, msg: "值日安排不存在" };
    const gate = leaderGate(d.groupId); if (!gate.ok) return gate;
    lsSet(KEY.duty, getDuty().filter((x) => x.id !== id));
    logAction("删除值日安排", d.groupName + " → " + d.memberName + "：" + d.task);
    return { ok: true };
  }

  // 班委头像（第二头像）：组长可为本组组员上传真实头像，上传即生效。
  // 未设置时回退普通头像/班级介绍页 image/<姓名>.jpg。
  async function setMemberPortrait(groupId, uid, dataUrl) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const g = getGroups().find((x) => x.id === groupId);
    const isSelf = s.id === uid;
    if (g && (g.leaderId === s.id || (isSelf && g.members.some((m) => m.id === uid)))) {
      // 本组组长 或 组员本人
    } else if (isSuperAdmin(s.role)) {
      // 超管可代为任意上传
    } else {
      return { ok: false, msg: "仅本组组长或成员本人可上传本组头像" };
    }
    if (!isImgSrc(dataUrl)) return { ok: false, msg: "图片无效" };
    const url = await uploadImg(dataUrl, "jpg");
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.portrait = url;
    saveUsers(users);
    if (isRemote() && s) pushDocs();
    logAction("更新班委头像", u.name + "（" + (g ? g.name : "超管代传") + "）");
    return { ok: true, src: url };
  }

  // 管理员在「用户管理」上传/更换班委头像（网站管理员可用，上传即生效）
  async function adminSetPortrait(uid, dataUrl) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    if (!isSiteAdmin(s)) return { ok: false, msg: "仅网站管理员可上传班委头像" };
    // 空串表示清除头像
    if (dataUrl && !isImgSrc(dataUrl)) return { ok: false, msg: "图片无效" };
    const url = dataUrl ? await uploadImg(dataUrl, "jpg") : "";
    const users = getUsers();
    const u = users.find((x) => x.id === uid);
    if (!u) return { ok: false, msg: "用户不存在" };
    u.portrait = url;
    saveUsers(users);
    if (isRemote() && s) pushDocs();
    logAction(url ? "更新班委头像" : "清除班委头像", u.name + "（用户管理 · 网站管理员）");
    return { ok: true, src: url };
  }

  // 小组积分统计（组长+组员）
  function groupStats() {
    const users = getUsers();
    return getGroups().map((g) => {
      const ids = [g.leaderId].concat(g.members.map((m) => m.id)).filter(Boolean);
      let sum = 0;
      ids.forEach((id) => { const u = users.find((x) => x.id === id); if (u) sum += u.score || 0; });
      return {
        id: g.id, name: g.name, leaderName: g.leaderName,
        memberCount: ids.length, scoreSum: Math.round(sum * 100) / 100,
      };
    }).sort((a, b) => b.scoreSum - a.scoreSum);
  }

  /* ============================================================
     悄悄话墙：公开、即投即公开、可指向同学/老师/部门
     ============================================================ */
  function getWall() { return lsGet(KEY.wall, []); }
  function postWall({ toType, toName, text }) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const t = String(text || "").trim();
    if (!t) return { ok: false, msg: "内容不能为空" };
    if (t.length > 200) return { ok: false, msg: "内容最长 200 字" };
    const list = getWall();
    list.unshift({
      id: uid("wl"),
      toType: toType || "class",
      toName: toName || "",
      text: t,
      ts: now(),
    });
    lsSet(KEY.wall, list);
    logAction("发布悄悄话", "→ " + (toName || "全班") + " · " + t.slice(0, 30));
    return { ok: true };
  }
  function deleteWall(id) {
    if (!isSuperAdmin(getSession()?.role)) return { ok: false, msg: "仅超管可删除" };
    const target = getWall().find((w) => w.id === id);
    lsSet(KEY.wall, getWall().filter((w) => w.id !== id));
    logAction("删除悄悄话", target ? (target.toName + " · " + (target.text || "").slice(0, 20)) : id);
    return { ok: true };
  }

  /* ============================================================
     投票/问卷：班主任/超管、班委发起，实名投票
     ============================================================ */
  function getVotes() { return lsGet(KEY.votes, []); }
  function saveVotes(list) { lsSet(KEY.votes, list); }
  function canManageVotes(role) { return isSuperAdmin(role) || role === "monitor"; }
  function createVote({ title, options, allowMulti, endDate, deadline }) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canManageVotes(s.role)) return { ok: false, msg: "仅班主任/超管/班委可发起投票" };
    if (!title || !options || !options.length) return { ok: false, msg: "标题与选项不能为空" };
    const opts = options.map((o) => ({ text: String(o), count: 0 }));
    if (opts.length < 2) return { ok: false, msg: "至少需要 2 个选项" };
    const list = getVotes();
    list.unshift({
      id: uid("vt"),
      title: String(title),
      options: opts,
      allowMulti: !!allowMulti,
      open: true,
      createBy: s.name,
      createTs: now(),
      deadline: endDate || deadline || "",
      responses: [],
    });
    saveVotes(list);
    logAction("发起投票", "「" + title + "」" + (endDate || deadline ? " (截止 " + (endDate || deadline) + ")" : ""));
    return { ok: true, vote: list[0] };
  }
  // 实名投票（每人限一次）
  function castVote(voteId, picks) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    if (s.role !== "student" && s.role !== "superadmin") return { ok: false, msg: "仅同学可投票" };
    const list = getVotes();
    const v = list.find((x) => x.id === voteId);
    if (!v) return { ok: false, msg: "投票不存在" };
    if (!v.open) return { ok: false, msg: "投票已结束" };
    if (v.responses.some((r) => r.uid === s.id)) return { ok: false, msg: "你已投过票" };
    const idxs = (Array.isArray(picks) ? picks : [picks]).map(Number);
    if (!v.allowMulti && idxs.length > 1) return { ok: false, msg: "该投票仅单选" };
    idxs.forEach((i) => { if (v.options[i]) v.options[i].count += 1; });
    v.responses.push({ uid: s.id, name: s.name, picks: idxs });
    saveVotes(list);
    logAction("参与投票", "「" + v.title + "」 · 选 " + (idxs.map((i) => v.options[i]?.text).filter(Boolean).join("/") || "弃权"));
    return { ok: true };
  }
  function closeVote(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canManageVotes(s.role) && !isSiteAdmin(s)) return { ok: false, msg: "无权限" };
    const list = getVotes();
    const v = list.find((x) => x.id === id);
    if (v) v.open = false;
    saveVotes(list);
    logAction("结束投票", v ? "「" + v.title + "」" : id);
    return { ok: true };
  }
  // 删除投票（发起人或可管理人员）
  function deleteVote(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const list = getVotes();
    const v = list.find((x) => x.id === id);
    if (!v) return { ok: false, msg: "投票不存在" };
    if (v.createBy !== s.name && !canManageVotes(s.role) && !isSiteAdmin(s)) return { ok: false, msg: "仅发起人或班委/超管可删除" };
    saveVotes(list.filter((x) => x.id !== id));
    logAction("删除投票", "「" + v.title + "」");
    return { ok: true };
  }
  function myVote(voteId) {
    const s = getSession(); if (!s) return null;
    const v = getVotes().find((x) => x.id === voteId);
    if (!v) return null;
    const r = v.responses.find((x) => x.uid === s.id);
    return r ? r : null;
  }

  /* ============================================================
     成长档案：积分+勋章+作品+悄悄话祝福+小组统计 聚合
     ============================================================ */
  function archive(userId) {
    const u = findById(userId);
    if (!u) return null;
    const works = [];
    getDeptItems("bianji").forEach((it) => {
      if (it.status === "published" && it.authorId === userId) {
        works.push({ type: "新闻·小报", title: it.title, date: it.createdTs });
      }
    });
    const publishedPhotos = allPublishedPhotos();
    const photos = publishedPhotos.filter((p) => p.caption && p.authorId === userId).length;
    const greetings = getWall().filter((w) => w.toType === "student" && w.toName === u.name).length;
    const group = getGroups().find((g) => g.leaderId === userId || g.members.some((m) => m.id === userId)) || null;
    return {
      user: u,
      score: u.score || 0,
      badges: u.badges || [],
      works,
      photoCount: photos,
      greetings,
      group,
      groupStats: groupStats(),
    };
  }

  /* ============================================================
     激励体系：三维榜单（时段）· 批量评分 · 周/月之星 · 心愿 · 成长时间线
     ============================================================ */
  // 周期起始时间（周从周一起、月从 1 号起）
  function periodStart(period) {
    const d = new Date();
    if (period === "week") {
      const w = new Date(d);
      w.setDate(w.getDate() - ((w.getDay() + 6) % 7));
      w.setHours(0, 0, 0, 0);
      return w.toISOString();
    }
    if (period === "month") return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01T00:00:00.000Z";
    return null; // all：用当前总分
  }
  // 某生某周期所得分（all = 当前总分；week/month = 周期内净变动）
  function studentGain(uid, period) {
    const u = findById(uid);
    if (!u) return 0;
    if (period === "all") return u.score || 0;
    const from = periodStart(period);
    let sum = 0;
    getLedger().forEach((r) => { if (r.uid === uid && r.ts >= from) sum += r.delta || 0; });
    return Math.round(sum * 100) / 100;
  }
  // 个人榜（按周期得分排序，含并列名次）
  function rankPeriod(period) {
    const list = getUsers()
      .filter((u) => u.role === "student" || u.role === "superadmin")
      .map((u) => ({ id: u.id, name: u.name, nickname: u.nickname, groupId: u.groupId, groupName: "", score: studentGain(u.id, period) }));
    const sorted = [...list].sort((a, b) => b.score - a.score);
    let rank = 0, prev = null;
    sorted.forEach((u, i) => { if (prev === null || u.score !== prev) rank = i + 1; u.rank = rank; prev = u.score; });
    const gmap = {};
    getGroups().forEach((g) => { gmap[g.id] = g.name; });
    sorted.forEach((u) => { u.groupName = gmap[u.groupId] || ""; });
    return sorted;
  }
  // 小组榜（按周期小组成分合计排序）
  function groupRank(period) {
    const gains = {};
    getGroups().forEach((g) => { gains[g.id] = 0; });
    rankPeriod(period).forEach((x) => { if (x.groupId && gains[x.groupId] !== undefined) gains[x.groupId] += x.score; });
    return getGroups()
      .map((g) => ({ id: g.id, name: g.name, leaderName: g.leaderName, members: g.members.length + (g.leaderId ? 1 : 0), score: Math.round((gains[g.id] || 0) * 100) / 100 }))
      .sort((a, b) => b.score - a.score);
  }
  // 批量评分（老师/班委：多选一次加减分）
  function batchApplyDelta(studentIds, delta, reason, category) {
    const op = getSession(); if (!op) return { ok: false, msg: "未登录" };
    if (!canEditRole(op.role)) return { ok: false, msg: "无权限修改分数" };
    const d = Math.round(Number(delta) * 100) / 100;
    if (isNaN(d) || d === 0) return { ok: false, msg: "变动值无效" };
    const cat = ["学习", "纪律", "卫生", "仪容仪表", "考勤", "综合素质", "其它"].indexOf(category) >= 0 ? category : "";
    const ids = (Array.isArray(studentIds) ? studentIds : [studentIds]).filter(Boolean);
    if (!ids.length) return { ok: false, msg: "请选择同学" };
    const users = getUsers(), ledger = getLedger();
    let n = 0;
    ids.forEach((id) => {
      const u = users.find((x) => x.id === id);
      if (!u || (u.role !== "student" && u.role !== "superadmin")) return;
      u.score = Math.round((u.score + d) * 100) / 100;
      ledger.push({ id: uid("led"), uid: u.id, name: u.name, delta: d, after: u.score, reason: reason || "批量评分", category: cat, operator: op.name, operatorRole: op.role, ts: now() });
      n++;
    });
    saveUsers(users); saveLedger(ledger);
    if (n) setMeta(op.name);
    logAction("批量" + (d > 0 ? "加分" : "扣分"), n + " 位同学 " + (d > 0 ? "+" : "") + d + " 分（" + (cat || "未分类") + "）");
    return { ok: true, count: n };
  }

  // 周之星 / 月之星
  function getStars() { return lsGet(KEY.stars, []); }
  function setStar(type, userId, reason) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!isSuperAdmin(s.role)) return { ok: false, msg: "仅班主任/超管可评选" };
    const u = findById(userId); if (!u) return { ok: false, msg: "用户不存在" };
    const t = type === "month" ? "month" : "week";
    const list = getStars();
    list.unshift({ id: uid("st"), type: t, uid: userId, name: u.name, nickname: u.nickname, reason: String(reason || "").trim(), grantBy: s.name, ts: now() });
    lsSet(KEY.stars, list);
    return { ok: true };
  }
  function currentStar(type) { const l = getStars().filter((s) => s.type === type); return l.length ? l[0] : null; }
  function revokeStar(id) {
    if (!isSuperAdmin(getSession()?.role)) return { ok: false, msg: "无权限" };
    lsSet(KEY.stars, getStars().filter((s) => s.id !== id));
    return { ok: true };
  }

  // 心愿 / 兑换目标
  function getWishes() { return lsGet(KEY.wishes, []); }
  function myWishes() { const s = getSession(); if (!s) return []; return getWishes().filter((w) => w.uid === s.id).slice().reverse(); }
  function addWish({ title, cost }) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const t = String(title || "").trim();
    const c = Math.round(Number(cost) * 100) / 100;
    if (!t) return { ok: false, msg: "请填写目标名称" };
    if (isNaN(c) || c <= 0) return { ok: false, msg: "请填写目标积分" };
    const list = getWishes();
    list.unshift({ id: uid("ws"), uid: s.id, name: s.nickname || s.name, title: t, cost: c, done: false, ts: now() });
    lsSet(KEY.wishes, list);
    return { ok: true };
  }
  function toggleWish(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const list = getWishes(); const w = list.find((x) => x.id === id);
    if (!w) return { ok: false, msg: "目标不存在" };
    if (w.uid !== s.id && !isSuperAdmin(s.role)) return { ok: false, msg: "无权限" };
    w.done = !w.done; lsSet(KEY.wishes, list); return { ok: true };
  }
  function deleteWish(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const list = getWishes(); const w = list.find((x) => x.id === id);
    if (!w) return { ok: false, msg: "目标不存在" };
    if (w.uid !== s.id && !isSuperAdmin(s.role)) return { ok: false, msg: "无权限" };
    lsSet(KEY.wishes, list.filter((x) => x.id !== id)); return { ok: true };
  }

  // 成长时间线：积分/称号/作品/悄悄话/兑换 串成一条
  function timeline(userId) {
    const u = findById(userId); if (!u) return [];
    const ev = [];
    getLedger().forEach((r) => { if (r.uid === userId) ev.push({ ts: r.ts, icon: "score", title: "积分变动", text: (r.delta > 0 ? "+" : "") + r.delta + " 分 · " + r.reason, after: r.after }); });
    (u.badges || []).forEach((b) => ev.push({ ts: b.ts, icon: "badge", title: "获得称号", text: b.name + "（" + b.grantBy + " 授予）" }));
    getDeptItems("bianji").forEach((it) => { if (it.status === "published" && it.authorId === userId) ev.push({ ts: it.createdTs, icon: "work", title: "发布作品", text: "《" + it.title + "》· 编辑部" }); });
    getWall().forEach((w) => { if (w.toType === "student" && w.toName === u.name) ev.push({ ts: w.ts, icon: "love", title: "收到悄悄话", text: w.text }); });
    getRedeems().forEach((r) => { if (r.uid === userId) ev.push({ ts: r.applyTs, icon: "shop", title: "兑换申请", text: r.item + "（" + r.cost + " 分 · " + (r.status === "approved" ? "已通过" : r.status === "rejected" ? "未通过" : "待审批") + "）" }); });
    getWishes().forEach((w) => { if (w.uid === userId) ev.push({ ts: w.ts, icon: "wish", title: "立下心愿", text: "攒 " + w.cost + " 分，兑换「" + w.title + "」" }); });
    return ev.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  }

  /* ============================================================
     活动接龙 / 报名（班委/老师发起，同学报名）
     ============================================================ */
  function getSignups() { return lsGet(KEY.signups, []); }
  function canManageSignup(role) { return isSuperAdmin(role) || role === "monitor" || role === "teacher"; }
  function createSignup({ title, desc, items, deadline }) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canManageSignup(s.role)) return { ok: false, msg: "仅班委/老师可发起接龙" };
    if (!title) return { ok: false, msg: "请填写接龙标题" };
    const list = getSignups();
    list.unshift({ id: uid("sg"), title: String(title), desc: String(desc || ""), items: (items || []).map((t) => String(t)).filter(Boolean), deadline: deadline || "", open: true, createBy: s.name, createTs: now(), responses: [] });
    lsSet(KEY.signups, list);
    return { ok: true, signup: list[0] };
  }
  function signupRespond(id, { choice, note }) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const list = getSignups(); const sg = list.find((x) => x.id === id);
    if (!sg) return { ok: false, msg: "接龙不存在" };
    if (!sg.open) return { ok: false, msg: "接龙已结束" };
    const rec = { uid: s.id, name: s.nickname || s.name, choice: String(choice || ""), note: String(note || "") };
    const i = sg.responses.findIndex((r) => r.uid === s.id);
    if (i >= 0) sg.responses[i] = rec; else sg.responses.push(rec);
    lsSet(KEY.signups, list);
    return { ok: true };
  }
  function mySignup(id) {
    const s = getSession(); if (!s) return null;
    const sg = getSignups().find((x) => x.id === id);
    return sg ? sg.responses.find((r) => r.uid === s.id) || null : null;
  }
  function closeSignup(id) {
    const s = getSession(); if (!s || (!canManageSignup(s.role) && !isSiteAdmin(s))) return { ok: false, msg: "无权限" };
    const list = getSignups(); const sg = list.find((x) => x.id === id);
    if (sg) sg.open = false;
    lsSet(KEY.signups, list); return { ok: true };
  }
  // 删除接龙（发起人或可管理人员）
  function deleteSignup(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const list = getSignups(); const sg = list.find((x) => x.id === id);
    if (!sg) return { ok: false, msg: "接龙不存在" };
    if (sg.createBy !== s.name && !canManageSignup(s.role) && !isSiteAdmin(s)) return { ok: false, msg: "仅发起人或班委/老师可删除" };
    lsSet(KEY.signups, list.filter((x) => x.id !== id));
    logAction("删除接龙", "「" + sg.title + "」");
    return { ok: true };
  }

  /* ============================================================
     市场监督管理局 + 商店（营业执照 / 商品 / 审批）
     ============================================================ */
  function getLicenses() { return lsGet(KEY.licenses, []); }
  function getProducts() { return lsGet(KEY.products, []); }
  // 用户已持有的有效执照
  function userLicense(uid) { return getLicenses().find((l) => l.uid === uid) || null; }
  function approvedLicense(uid) { return getLicenses().find((l) => l.uid === uid && l.status === "approved") || null; }
  // 能否开店发布商品：老师/超管免执照；学生须持已审批执照
  function canPublish(uid) {
    const u = findById(uid); if (!u) return false;
    if (u.role === "teacher" || u.role === "admin" || u.role === "superadmin") return true;
    return !!approvedLicense(uid);
  }
  function applyLicense({ scope, applicant, staff }) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const list = getLicenses();
    if (list.some((l) => l.uid === s.id && (l.status === "pending" || l.status === "approved"))) return { ok: false, msg: "你已提交过申请（或已持有执照）" };
    list.unshift({ id: uid("lic"), uid: s.id, name: s.nickname || s.name, scope: String(scope || ""), applicant: String(applicant || ""), staff: String(staff || ""), status: "pending", applyTs: now(), reviewTs: null, reviewer: null, reason: null });
    lsSet(KEY.licenses, list);
    return { ok: true };
  }
  function reviewLicense(id, approve, reason) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditDept("shichang") && !isSuperAdmin(s.role)) return { ok: false, msg: "仅市监局可审批执照" };
    const list = getLicenses(); const l = list.find((x) => x.id === id);
    if (!l) return { ok: false, msg: "申请不存在" };
    if (l.status !== "pending") return { ok: false, msg: "该申请已处理" };
    l.status = approve ? "approved" : "rejected"; l.reviewTs = now(); l.reviewer = s.name; l.reason = reason || (approve ? "核准通过" : "未通过");
    lsSet(KEY.licenses, list);
    return { ok: true };
  }
  // 发布商品：老师免审批直接上架；学生提交后由市监局审批
  function publishProduct({ title, desc, type, price, stock, cover }) {
    const s = getSession(); if (!s) return { ok: false, msg: "请先登录" };
    const me = findById(s.id); if (!me) return { ok: false, msg: "用户不存在" };
    if (!canPublish(me.id)) return { ok: false, msg: "请先申请并持有营业执照才能开店" };
    const t = String(title || "").trim(); if (!t) return { ok: false, msg: "商品名称不能为空" };
    const p = Math.round(Number(price) * 100) / 100; if (isNaN(p) || p < 0) return { ok: false, msg: "价格无效" };
    const ptype = type === "physical" ? "physical" : "virtual";
    const teacher = me.role === "teacher" || me.role === "admin" || me.role === "superadmin";
    const list = getProducts();
    list.unshift({ id: uid("pd"), uid: me.id, name: s.nickname || s.name, title: t, desc: String(desc || ""), type: ptype, price: p, stock: Math.max(0, parseInt(stock, 10) || 0), cover: cover || "", status: teacher ? "published" : "pending", reviewTs: teacher ? now() : null, reviewer: teacher ? s.name : null, reason: null, ts: now() });
    lsSet(KEY.products, list);
    return { ok: true, msg: teacher ? "商品已上架（老师发布免审批）" : "已提交，等待市监局审批上架" };
  }
  function reviewProduct(id, approve, reason) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    if (!canEditDept("shichang") && !isSuperAdmin(s.role)) return { ok: false, msg: "仅市监局可审批商品" };
    const list = getProducts(); const p = list.find((x) => x.id === id);
    if (!p) return { ok: false, msg: "商品不存在" };
    if (p.status !== "pending") return { ok: false, msg: "该商品已处理" };
    p.status = approve ? "published" : "rejected"; p.reviewTs = now(); p.reviewer = s.name; p.reason = reason || (approve ? "通过上架" : "未通过");
    lsSet(KEY.products, list);
    return { ok: true };
  }
  function deleteProduct(id) {
    const s = getSession(); if (!s) return { ok: false, msg: "未登录" };
    const list = getProducts(); const p = list.find((x) => x.id === id);
    if (!p) return { ok: false, msg: "商品不存在" };
    if (p.uid !== s.id && !isSuperAdmin(s.role) && !canEditDept("shichang")) return { ok: false, msg: "无权限" };
    lsSet(KEY.products, list.filter((x) => x.id !== id));
    return { ok: true };
  }
  function publishedProducts() { return getProducts().filter((p) => p.status === "published"); }
  function myProducts() { const s = getSession(); if (!s) return []; return getProducts().filter((p) => p.uid === s.id).slice().reverse(); }
  function myLicense() { const s = getSession(); if (!s) return null; return userLicense(s.id); }

  /* ---- 订单 ---- */
  function getOrders() { return lsGet(KEY.orders, []); }
  function myOrders() { const s = getSession(); if (!s) return []; return getOrders().filter((o) => o.buyerId === s.id); }
  function mySoldOrders() { const s = getSession(); if (!s) return []; return getOrders().filter((o) => o.sellerId === s.id); }

  /* ---- 购买商品（即时成交 · 积分结算） ---- */
  // 老师/超管的商品售出后，积分直接回流经济系统（不设公共池）；持证学生卖家积分流入卖家。
  function buyProduct(id) {
    const s = getSession();
    if (!s) return { ok: false, msg: "请先登录" };
    if (s.role !== "student" && s.role !== "superadmin") return { ok: false, msg: "仅同学可购买商品" };

    const products = getProducts();
    const p = products.find((x) => x.id === id);
    if (!p) return { ok: false, msg: "商品不存在" };
    if (p.status !== "published") return { ok: false, msg: "商品已下架" };
    if (p.stock <= 0) return { ok: false, msg: "库存不足" };
    if (p.uid === s.id) return { ok: false, msg: "不能购买自己发布的商品" };

    const users = getUsers();
    const buyer = users.find((x) => x.id === s.id);
    if (!buyer) return { ok: false, msg: "用户不存在" };
    const price = Math.round(Number(p.price) * 100) / 100;
    if (buyer.score < price) return { ok: false, msg: "积分不足（需 " + price + " 分）" };

    const seller = users.find((x) => x.id === p.uid);
    const isTeacherSeller = seller && (seller.role === "teacher" || seller.role === "admin" || seller.role === "superadmin");

    const ledger = getLedger();
    // 买家扣分
    buyer.score = Math.round((buyer.score - price) * 100) / 100;
    ledger.push({ id: uid("led"), uid: buyer.id, name: buyer.name, delta: -price, after: buyer.score, reason: "购买「" + p.title + "」", operator: s.name, operatorRole: s.role, ts: now() });

    if (isTeacherSeller) {
      // 老师/超管售出：积分直接回流经济系统，不再计入公共池
    } else if (seller) {
      // 流入卖家
      seller.score = Math.round((seller.score + price) * 100) / 100;
      ledger.push({ id: uid("led"), uid: seller.id, name: seller.name, delta: price, after: seller.score, reason: "售出「" + p.title + "」", operator: s.name, operatorRole: s.role, ts: now() });
    }

    // 库存 -1
    p.stock = Math.max(0, p.stock - 1);

    // 订单留痕
    const orders = getOrders();
    orders.unshift({ id: uid("ord"), productId: p.id, title: p.title, price, buyerId: buyer.id, buyerName: buyer.nickname || buyer.name, sellerId: p.uid, sellerName: p.name, ts: now() });
    lsSet(KEY.orders, orders);

    saveUsers(users);
    saveLedger(ledger);
    lsSet(KEY.products, products);
    setMeta(s.name);
    pushDocs(); // 远程模式：把本次写操作同步到服务端
    return { ok: true, msg: "购买成功" };
  }

  /* ---------- 公开 API ---------- */
  /* ---------- R2 图片：上传 / 解析 ---------- */
  // 合法的图源：base64 data:image / R2 引用 r2:xxx / 本地 image/ 目录（头像联动班委图片）。
  function isImgSrc(src) {
    if (!src) return false;
    const s = String(src);
    return s.indexOf("data:image") === 0 || s.indexOf("r2:") === 0 || s.indexOf("image/") === 0;
  }
  // 上传：远程模式把 base64 推给 Worker 存 R2，成功返回 "r2:<key>"；否则安全回退原 base64。
  async function uploadImg(dataUrl, ext) {
    if (!isRemote()) return dataUrl;
    try {
      const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
      if (!m) return dataUrl;
      const r = await fetch(apiBase + "/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiToken() },
        body: JSON.stringify({ data: m[2], ext: ext || "jpg", mime: m[1] }),
      });
      const d = await r.json();
      return (d && d.ok && d.key) ? ("r2:" + d.key) : dataUrl;
    } catch (e) { return dataUrl; }
  }
  // 解析：把 "r2:<key>" 还原为可访问的图片地址；其余（base64 / 普通URL）原样返回。
  function resolveImg(src) {
    if (!src) return "";
    if (typeof src === "string" && src.indexOf("r2:") === 0) return apiBase + "/photos/" + src.slice(3);
    return src;
  }

  return {
    apiBase,
    ensureSeeded,
    isRemote, pushDocs, resyncDocs, syncReady, lastSyncedAt, waitSync,
    login, logout, changePassword, skipPasswordChange, refreshSession,
    register, pendingRegistrations, reviewRegister, myChild,
    getSession, findById, findByAccount,
    leaderboard, displayName,
    canEditRole, isSuperAdmin, isSiteAdmin, roleRank,
    adminSetPassword, adminGetPwdStatus, adminUpdateProfile,
    adminAddPost, adminRemovePost, adminSetPosts, adminApplyCommittee,
    setMemberPortrait, adminSetPortrait,
    applyDelta, undoLast,
    applyRedeem, reviewRedeem, offlineDeduct,
    getLedger, getRedeems, getMeta, getUsers,
    myLedger, myRedeems,
    requestNickname, reviewNickname, pendingNicknames, setAvatar,
    adminListUsers, adminUpdateRole, adminUpdateDept, adminResetPassword,
    adminAddPost, adminRemovePost, adminSetPosts, adminApplyCommittee,
    adminSetPassword, adminGetPwdStatus, adminUpdateProfile, backfillUserPosts, autoApplyCommittee,
    deptRoleOf, isDeptMember, isMinister,
    getNews, addNews, deleteNews,
    getMedia, addMedia, deleteMedia,
    DEPTS, COMMITTEE, PREV_COMMITTEE, canEditDept, canApproveDept, myDepartment,
    getDeptItems, saveDeptItems, addDeptItem, updateDeptItem, reviewDeptItem, deleteDeptItem,
    DEPT_RECORD_SCHEMAS, getDeptRecords, addDeptRecord, deleteDeptRecord,
    getDeptNotices, addDeptNotice, reviewDeptNotice, deleteDeptNotice, unreadDeptNotices, markDeptNoticeRead,
    myReports, submitReport, markReport,
    getAlbums, saveAlbums, addAlbum, addAlbumPhoto, reviewAlbumPhoto, deleteAlbumPhoto, deleteAlbum, allPublishedPhotos,
    galleryGet, gallerySave, galleryCreateAlbum, galleryUpload, galleryCanManage, galleryRename, galleryDeletePhoto, galleryDeleteAlbum,
    getNotices, addNotice, updateNotice, deleteNotice,
    getDuty, addDutyShift, deleteDutyShift,
    updateProfile, addPersonalImage, deletePersonalImage,
    uploadImg, resolveImg,
    grantBadge, revokeBadge,
    getGroups, saveGroups, setUserGroup, setGroupLeader, groupStats,
    myGroup, myGroupAsLeader, groupLeaderAddMember, groupLeaderRemoveMember,
    groupDutyAssign, deleteGroupDuty, setMemberPortrait,
    getWall, postWall, deleteWall,
    getVotes, createVote, castVote, closeVote, deleteVote, myVote, canManageVotes,
    archive,
    periodStart, rankPeriod, groupRank, batchApplyDelta,
    getStars, setStar, currentStar, revokeStar,
    getWishes, myWishes, addWish, toggleWish, deleteWish,
    timeline,
    getSignups, createSignup, signupRespond, mySignup, closeSignup, deleteSignup, canManageSignup,
    getLicenses, getProducts, userLicense, approvedLicense, canPublish,
    applyLicense, reviewLicense,
    publishProduct, reviewProduct, deleteProduct, publishedProducts, myProducts, myLicense,
    buyProduct, getOrders, myOrders, mySoldOrders,
    getCashouts, myParent, cashoutRate, setCashRate, applyCashout,
    parentCashouts, myCashouts, reviewCashout, recordManualCashout,
    logAction, getLogs, clearLogs, roleRank,
    fmtTime, fmtMoney, now,
  };
})();