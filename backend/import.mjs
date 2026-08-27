// ============================================================
// 星河班 · 数据导入脚本（Node.js，部署 Cloudflare 时运行一次）
// 用法：node import.mjs
// 从 ../data/students.json 和 ../data/teachers.json 读取，
// 生成可直接粘贴到 D1 的导入 SQL（含密码哈希）。
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PWD = "123456";

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

function uid(prefix, i) {
  return `${prefix}-${String(i).padStart(3, "0")}`;
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const students = JSON.parse(readFileSync(join(__dirname, "../data/students.json"), "utf8"));
const teachers = JSON.parse(readFileSync(join(__dirname, "../data/teachers.json"), "utf8"));

const lines = [];
lines.push("-- 星河班初始账号（运行前请先执行 schema.sql 建表）");

let idx = 0;
students.forEach((s) => {
  idx++;
  lines.push(
    `INSERT INTO users (id, name, account, password_hash, role, subject, score, must_change) VALUES ` +
    `('${uid("stu", idx)}', '${esc(s.name)}', '${esc(s.account)}', '${hashPassword(DEFAULT_PWD)}', 'student', '', ${s.score}, 1);`
  );
});

teachers.forEach((t) => {
  idx++;
  lines.push(
    `INSERT INTO users (id, name, account, password_hash, role, subject, score, must_change) VALUES ` +
    `('${uid("tea", idx)}', '${esc(t.name)}', '${esc(t.account)}', '${hashPassword(DEFAULT_PWD)}', 'teacher', '${esc(t.subject)}', 0, 1);`
  );
});

// 班主任（超级管理员）
lines.push(
  `INSERT INTO users (id, name, account, password_hash, role, subject, score, must_change) VALUES ` +
  `('admin-1', '班主任', '班主任', '${hashPassword(DEFAULT_PWD)}', 'admin', '', 0, 1);`
);

const out = lines.join("\n") + "\n";
const outPath = join(__dirname, "seed.sql");
writeFileSync(outPath, out, "utf8");
console.log(`已生成 ${outPath}（${students.length} 名学生 + ${teachers.length} 名教师 + 1 管理员）`);
console.log("导入命令：npx wrangler d1 execute xinghe-bank --file=./seed.sql");