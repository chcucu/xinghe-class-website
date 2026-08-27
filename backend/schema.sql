-- ============================================================
-- 星河班 · 操行银行  数据库 Schema（Cloudflare D1 / SQLite）
-- ============================================================

-- 用户表（学生 / 教师 / 班委 / 管理员）
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  account       TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','teacher','monitor','admin')),
  subject       TEXT DEFAULT '',
  score         REAL NOT NULL DEFAULT 0,
  must_change   INTEGER NOT NULL DEFAULT 1,   -- 首次登录需改密
  created_at    TEXT DEFAULT (datetime('now'))
);

-- 分数变动流水（可撤销）
CREATE TABLE IF NOT EXISTS ledger (
  id            TEXT PRIMARY KEY,
  uid           TEXT NOT NULL,
  name          TEXT NOT NULL,
  delta         REAL NOT NULL,
  after         REAL NOT NULL,
  reason        TEXT DEFAULT '',
  operator      TEXT NOT NULL,
  operator_role TEXT NOT NULL,
  ts            TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (uid) REFERENCES users(id)
);

-- 兑换（申请 → 审批 / 线下直接扣分）
CREATE TABLE IF NOT EXISTS redeems (
  id          TEXT PRIMARY KEY,
  uid         TEXT NOT NULL,
  name        TEXT NOT NULL,
  item        TEXT NOT NULL,
  cost        REAL NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  apply_ts    TEXT DEFAULT (datetime('now')),
  approve_ts  TEXT,
  operator    TEXT,
  reason      TEXT DEFAULT '',
  FOREIGN KEY (uid) REFERENCES users(id)
);

-- 元信息（最后更新时间 / 操作人）
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_ledger_uid ON ledger(uid);
CREATE INDEX IF NOT EXISTS idx_redeems_status ON redeems(status);