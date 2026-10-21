//! 本地 SQLite 持久化层
//!
//! 数据库文件位于 Tauri 应用数据目录：
//! macOS: ~/Library/Application Support/cn.audit.workspace/
//! Windows: %APPDATA%\cn.audit.workspace\
//! Linux: ~/.local/share/cn.audit.workspace/
//!
//! 所有业务表均以 owner_id（登录账户 id）分片，实现账户级数据隔离。

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub db_path: PathBuf,
}

const MIGRATION_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    avatar_color  TEXT NOT NULL,
    department    TEXT NOT NULL,
    title         TEXT NOT NULL,
    employee_code TEXT NOT NULL,
    role          TEXT NOT NULL,
    password      TEXT NOT NULL DEFAULT '',
    with_demo     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    last_login_at TEXT,
    deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL,
    code        TEXT,
    name        TEXT,
    status      TEXT,
    audit_type  TEXT,
    year        INTEGER,
    created_at  TEXT,
    updated_at  TEXT,
    data        TEXT NOT NULL,
    deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

CREATE TABLE IF NOT EXISTS groups (
    id             TEXT PRIMARY KEY,
    owner_id       TEXT NOT NULL,
    project_id     TEXT,
    name           TEXT,
    leader_id      TEXT,
    status         TEXT,
    establish_date TEXT,
    created_at     TEXT,
    data           TEXT NOT NULL,
    deleted_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_id);

CREATE TABLE IF NOT EXISTS documents (
    id           TEXT PRIMARY KEY,
    owner_id     TEXT NOT NULL,
    project_id   TEXT,
    group_id     TEXT,
    code         TEXT,
    title        TEXT,
    category     TEXT,
    status       TEXT,
    secret_level TEXT,
    doc_type     TEXT NOT NULL DEFAULT 'sheet',
    created_at   TEXT,
    updated_at   TEXT,
    data         TEXT NOT NULL,
    content      TEXT,
    deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);

CREATE TABLE IF NOT EXISTS todos (
    id        TEXT PRIMARY KEY,
    owner_id  TEXT NOT NULL,
    deadline  TEXT,
    data      TEXT NOT NULL,
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_todos_owner ON todos(owner_id);
"#;

/// 判断表中是否已存在某列（用于旧库平滑升级）
fn has_column(conn: &Connection, table: &str, column: &str) -> bool {
    let mut stmt = match conn.prepare(&format!("PRAGMA table_info({table})")) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let rows = match stmt.query_map([], |r| r.get::<_, String>(1)) {
        Ok(r) => r,
        Err(_) => return false,
    };
    let found = rows.filter_map(|x| x.ok()).any(|name| name == column);
    found
}

/// 旧版本数据库缺少 deleted_at 列时补建，保证逻辑删除可用
fn ensure_deleted_at_columns(conn: &Connection) -> rusqlite::Result<()> {
    for table in ["users", "projects", "groups", "documents", "todos"] {
        if !has_column(conn, table, "deleted_at") {
            conn.execute(&format!("ALTER TABLE {table} ADD COLUMN deleted_at TEXT"), [])?;
        }
    }
    Ok(())
}

impl AppState {
    /// 打开（或创建）数据库并完成建表
    pub fn new(path: PathBuf) -> rusqlite::Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(&path)?;
        // WAL 提升并发读写表现；busy_timeout 避免偶发锁冲突
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;
        conn.execute_batch(MIGRATION_SQL)?;
        ensure_deleted_at_columns(&conn)?;
        Ok(Self {
            db: Mutex::new(conn),
            db_path: path,
        })
    }
}
