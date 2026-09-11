-- ============================================================
-- 星河班 · 操行银行  数据库 Schema（Cloudflare D1 / SQLite）
-- ============================================================
-- 注：旧架构的 users / ledger / redeems / meta 四张 SQL 表已废弃（此前对应的
-- /login /leaderboard /delta /redeem* 等 SQL 端点已从 worker.js 删除）。
-- 当前唯一数据源是 docs 通用文档仓库（JSON），所有业务均读写 docs。

-- 通用文档仓库：每个功能一份完整 JSON 文档（用户/积分流水/相册/新闻/成长档案/部门/悄悄话等）
CREATE TABLE IF NOT EXISTS docs (
  key      TEXT PRIMARY KEY,
  value    TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);