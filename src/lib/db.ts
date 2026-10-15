import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./password";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  manager_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin','manager','customer')),
  company_id     INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  email          TEXT,
  phone          TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  code                   TEXT UNIQUE,
  company_id             INTEGER NOT NULL REFERENCES companies(id),
  customer_id            INTEGER NOT NULL REFERENCES users(id),
  manager_id             INTEGER REFERENCES users(id),
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL,
  severity               TEXT NOT NULL,
  category               TEXT NOT NULL,
  target_system          TEXT,
  occurred_at            TEXT,
  status                 TEXT NOT NULL DEFAULT 'received',
  cause                  TEXT,
  action_taken           TEXT,
  acknowledged_at        TEXT,
  action_at              TEXT,
  customer_confirmed_at  TEXT,
  manager_confirmed_at   TEXT,
  closed_at              TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS comments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id  INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id   INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  comment_id    INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  mime_type     TEXT,
  size          INTEGER NOT NULL,
  uploaded_by   INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 처리 경과(타임라인). 보고서의 '처리 경과' 섹션 원천 데이터
CREATE TABLE IF NOT EXISTS incident_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id  INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id),
  type         TEXT NOT NULL,
  detail       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  incident_id  INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  read_at      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 처리완료 시점에 확정된 보고서 스냅샷 (장애 이력)
CREATE TABLE IF NOT EXISTS reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id  INTEGER NOT NULL UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_incidents_company ON incidents(company_id);
CREATE INDEX IF NOT EXISTS idx_incidents_manager ON incidents(manager_id);
CREATE INDEX IF NOT EXISTS idx_comments_incident ON comments(incident_id);
CREATE INDEX IF NOT EXISTS idx_events_incident ON incident_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
`;

function seed(db: DatabaseSync) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n > 0) return;

  // 최초 실행 시 관리자 계정 생성. 로그인 후 '내 정보'에서 비밀번호를 바꾼다.
  const adminPassword = process.env.INIT_ADMIN_PASSWORD || "admin1234";
  db.prepare(
    "INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, 'admin')",
  ).run("admin", hashPassword(adminPassword), "시스템 관리자");

  if (process.env.SEED_DEMO === "1") {
    const managerId = db
      .prepare(
        "INSERT INTO users (username, password_hash, name, role, email) VALUES (?, ?, ?, 'manager', ?)",
      )
      .run("manager1", hashPassword("manager1234"), "김담당", "manager1@example.com")
      .lastInsertRowid;
    const companyId = db
      .prepare("INSERT INTO companies (name, manager_id) VALUES (?, ?)")
      .run("데모고객사", managerId).lastInsertRowid;
    db.prepare(
      "INSERT INTO users (username, password_hash, name, role, company_id, email) VALUES (?, ?, ?, 'customer', ?, ?)",
    ).run("customer1", hashPassword("customer1234"), "이고객", companyId, "customer1@example.com");
  }
}

function open(): DatabaseSync {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "app.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  seed(db);
  return db;
}

// 개발 서버의 HMR로 모듈이 다시 로드되어도 연결을 하나만 유지
const g = globalThis as unknown as { __incidentDb?: DatabaseSync };
export const db: DatabaseSync = g.__incidentDb ?? (g.__incidentDb = open());

/** 여러 쿼리를 하나의 트랜잭션으로 실행 */
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** SQLite datetime('now','localtime')과 같은 형식의 현재 시각 */
export function nowString(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
