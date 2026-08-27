// ============================================================
// 星河班 · 云端数据预初始化（只运行一次）
// 把 data/students.json + data/teachers.json 生成种子文档，
// 通过 /api/docs/bootstrap 一次性导入 D1（幂等：重复运行会被 409 拒绝）。
// 用法：node bootstrap.mjs
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = "https://xinghe-api.tenyearmc.top/api";
const SEED = "xinghe-2026-seed";
const DEFAULT_PWD = "123456";

function now() { return new Date().toISOString(); }
function uid(prefix) { return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8); }

const students = JSON.parse(readFileSync(join(__dirname, "../data/students.json"), "utf8"));
const teachers = JSON.parse(readFileSync(join(__dirname, "../data/teachers.json"), "utf8"));

const users = [];
students.forEach((s, i) => {
  users.push({
    id: "stu-" + i, name: s.name, account: s.account, password: DEFAULT_PWD,
    role: s.superadmin ? "superadmin" : "student", score: s.score,
    nickname: "", nickPending: "", avatar: "", department: "", departmentRole: "",
    contact: { qq: "", email: "", phone: "" }, bio: "", personalImages: [], badges: [],
    groupId: "", mustChange: true,
  });
});
teachers.forEach((t, i) => {
  users.push({
    id: "tea-" + i, name: t.name, account: t.account, password: DEFAULT_PWD,
    role: t.head ? "admin" : "teacher", subject: t.subject, score: 0,
    nickname: "", nickPending: "", avatar: "", department: "", departmentRole: "",
    contact: { qq: "", email: "", phone: "" }, bio: "", personalImages: [], badges: [],
    groupId: "", mustChange: true,
  });
});

// 小组：与 js/store.js buildSeedDocs 保持一致
const groupData = [
  { leader: "柴丽欣",   members: ["何汶锦", "刘慕辰", "陈劲豪", "周廷翰", "赵晨雅", "汤程杰"] },
  { leader: "李张涵",   members: ["李雨婷", "郑翀", "张芝清", "谢沂萱", "李文芳"] },
  { leader: "李欣桐",   members: ["孙明远", "吴优", "梁书宁", "韦尚轩", "马睿瞳", "吴亦翾"] },
  { leader: "李俊娴",   members: ["吴明慧", "洪晨竣", "付楚珵", "邹奕宁", "郑雨嘉"] },
  { leader: "杨骐羽",   members: ["王翼航", "杨萌", "杨雯瑶", "赵翌旭", "杨馨", "杨天泽"] },
  { leader: "康寇佳琦", members: ["王煜滢", "单立安", "陈天和", "李静苒", "焦柔溪", "宋晟睿"] },
  { leader: "闫熙曼",   members: ["徐开萍", "许文昊", "云健凌", "何兆轩", "徐立凡", "关茗心"] },
];
const groups = groupData.map((g, i) => {
  const id = "grp-" + (i + 1);
  const lead = users.find((u) => u.name === g.leader);
  if (lead) lead.groupId = id;
  const members = g.members
    .map((mn) => { const u = users.find((x) => x.name === mn); if (u) u.groupId = id; return u ? { id: u.id, name: u.name } : null; })
    .filter(Boolean);
  return { id, name: "第" + (i + 1) + "组", leaderId: lead ? lead.id : null, leaderName: g.leader, members, note: "组长：" + g.leader };
});

const photos = [];
for (let i = 1; i <= 107; i++) {
  const n = String(i).padStart(2, "0");
  photos.push({ src: "image/class/" + n + ".jpg", caption: "班级掠影", status: "published" });
}

const docs = {
  users,
  groups,
  ledger: [], redeems: [], news: [], media: [], reports: [], cases: [],
  articles: [], meds: [], notices: [], duty: [], wall: [], votes: [], stars: [],
  wishes: [], signups: [], licenses: [], products: [], treasury: [], orders: [],
  albums: [{ id: uid("alb"), name: "班级风采掠影", author: "系统", createdTs: now(), photos, status: "published" }],
  meta: { lastUpdate: now(), lastOperator: "系统初始化" },
};

const resp = await fetch(API + "/docs/bootstrap", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ seed: SEED, docs }),
});
const data = await resp.json();
console.log("HTTP", resp.status, JSON.stringify(data));
