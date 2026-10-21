//! Tauri 命令：前端通过 invoke 调用的 CrUD 接口
//!
//! 所有业务读写均以 owner_id / 归属校验为基础，保证账户间数据隔离。

use rusqlite::Connection;
use serde_json::Value as Json;
use std::sync::MutexGuard;
use tauri::State;

use crate::db::AppState;
use crate::db_err;
use crate::models::{i, s, CmdResult, DictItem, UserRecord, WorkspaceData};

fn lock<'a>(state: &'a State<'_, AppState>) -> MutexGuard<'a, Connection> {
    state.db.lock().unwrap_or_else(|e| e.into_inner())
}

/* ------------------------------------------------------------------ */
/* 应用元信息                                                          */
/* ------------------------------------------------------------------ */

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub tauri_version: String,
    pub platform: String,
    pub db_path: String,
}

#[tauri::command]
pub fn app_info(state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        name: "审计组工作管理系统".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        tauri_version: tauri::VERSION.into(),
        platform: std::env::consts::OS.into(),
        db_path: state.db_path.to_string_lossy().to_string(),
    }
}

/// 健康检查：前端用它判断 Rust 后端是否可用
#[tauri::command]
pub fn ping() -> String {
    "pong".into()
}

/// 在系统文件管理器中选中数据库文件，便于确认数据实际落盘位置
#[tauri::command]
pub fn reveal_db_file(state: State<'_, AppState>) -> CmdResult<()> {
    let path = state.db_path.clone();

    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn();

    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .spawn();

    #[cfg(target_os = "linux")]
    let spawned = std::process::Command::new("xdg-open")
        .arg(path.parent().unwrap_or(&path))
        .spawn();

    spawned
        .map(|_| ())
        .map_err(|e| format!("无法打开数据库所在目录：{e}"))
}

/* ------------------------------------------------------------------ */
/* 业务字典（下拉选项配置）                                            */
/* ------------------------------------------------------------------ */

const DICT_COLUMNS: &str = "id, category, parent, label, remark, sort_order, enabled, builtin";

fn dict_mapper(r: &rusqlite::Row<'_>) -> rusqlite::Result<DictItem> {
    Ok(DictItem {
        id: r.get(0)?,
        category: r.get(1)?,
        parent: r.get(2)?,
        label: r.get(3)?,
        remark: r.get(4)?,
        sort_order: r.get(5)?,
        enabled: r.get::<_, i32>(6).unwrap_or(1) != 0,
        builtin: r.get::<_, i32>(7).unwrap_or(0) != 0,
    })
}

/// 全量字典（前端按 category / parent 自行分组）
#[tauri::command]
pub fn list_dict(state: State<'_, AppState>) -> CmdResult<Vec<DictItem>> {
    let conn = lock(&state);
    let mut stmt = db_err!(conn.prepare(&format!(
        "SELECT {DICT_COLUMNS} FROM dict_items
         ORDER BY category ASC, parent ASC, sort_order ASC, id ASC"
    )))?;
    let rows = db_err!(stmt.query_map([], dict_mapper))?;
    Ok(rows.filter_map(|x| x.ok()).collect())
}

/// 新增或更新字典条目（幂等 upsert）
#[tauri::command]
pub fn save_dict_item(state: State<'_, AppState>, item: Json) -> CmdResult<DictItem> {
    let rec = DictItem::from_json(&item);
    if rec.category.is_empty() || rec.label.is_empty() {
        return Err("字典分类与名称不能为空".into());
    }
    let id = if rec.id.is_empty() {
        format!("d_{}_{}", rec.category, chrono_like_stamp())
    } else {
        rec.id
    };
    let conn = lock(&state);
    db_err!(conn.execute(
        "INSERT INTO dict_items (id, category, parent, label, remark, sort_order, enabled, builtin)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
           category = excluded.category,
           parent = excluded.parent,
           label = excluded.label,
           remark = excluded.remark,
           sort_order = excluded.sort_order,
           enabled = excluded.enabled,
           builtin = excluded.builtin",
        rusqlite::params![
            id,
            rec.category,
            rec.parent,
            rec.label,
            rec.remark,
            rec.sort_order,
            rec.enabled as i32,
            rec.builtin as i32
        ],
    ))?;
    Ok(DictItem { id, ..rec })
}

/// 删除字典条目
#[tauri::command]
pub fn delete_dict_item(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state);
    db_err!(conn.execute("DELETE FROM dict_items WHERE id = ?1", rusqlite::params![id]))?;
    Ok(())
}

/// 补回系统预置项：只补缺失的，不动人工新增与已改名的条目
#[tauri::command]
pub fn restore_dict_defaults(state: State<'_, AppState>) -> CmdResult<Vec<DictItem>> {
    let conn = lock(&state);
    db_err!(crate::dict::seed_defaults(&conn))?;
    drop(conn);
    list_dict(state)
}

/// 生成字典条目 id 用的时间戳片段（避免引入额外依赖）
fn chrono_like_stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{n}")
}

/* ------------------------------------------------------------------ */
/* 账户                                                                */
/* ------------------------------------------------------------------ */

fn user_mapper(r: &rusqlite::Row<'_>) -> rusqlite::Result<UserRecord> {
    Ok(UserRecord {
        id: r.get(0)?,
        name: r.get(1)?,
        avatar_color: r.get(2)?,
        department: r.get(3)?,
        title: r.get(4)?,
        employee_code: r.get(5)?,
        role: r.get(6)?,
        password: r.get(7)?,
        with_demo: r.get::<_, i32>(8).unwrap_or(0) != 0,
        created_at: r.get(9)?,
        last_login_at: r.get(10).unwrap_or(None),
        deleted_at: r.get(11).unwrap_or(None),
    })
}

const USER_COLUMNS: &str =
    "id, name, avatar_color, department, title, employee_code, role, password, with_demo, created_at, last_login_at, deleted_at";

/// 正常账户（登录页只展示这些）
#[tauri::command]
pub fn list_users(state: State<'_, AppState>) -> CmdResult<Vec<UserRecord>> {
    let conn = lock(&state);
    let mut stmt = db_err!(conn.prepare(&format!(
        "SELECT {USER_COLUMNS} FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC"
    )))?;
    let rows = db_err!(stmt.query_map([], user_mapper))?;
    Ok(rows.filter_map(|x| x.ok()).collect())
}

/// 已注销账户（系统设置中用于恢复）
#[tauri::command]
pub fn list_deleted_users(state: State<'_, AppState>) -> CmdResult<Vec<UserRecord>> {
    let conn = lock(&state);
    let mut stmt = db_err!(conn.prepare(&format!(
        "SELECT {USER_COLUMNS} FROM users WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    )))?;
    let rows = db_err!(stmt.query_map([], user_mapper))?;
    Ok(rows.filter_map(|x| x.ok()).collect())
}

/// 新建或更新账户（幂等 upsert）
#[tauri::command]
pub fn save_user(state: State<'_, AppState>, user: Json) -> CmdResult<UserRecord> {
    let rec = UserRecord::from_json(&user);
    if rec.id.is_empty() {
        return Err("账户 id 不能为空".into());
    }
    let conn = lock(&state);
    db_err!(conn.execute(
        "INSERT INTO users (id, name, avatar_color, department, title, employee_code, role, password, with_demo, created_at, last_login_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           avatar_color = excluded.avatar_color,
           department = excluded.department,
           title = excluded.title,
           employee_code = excluded.employee_code,
           role = excluded.role,
           password = excluded.password,
           with_demo = excluded.with_demo,
           last_login_at = excluded.last_login_at,
           deleted_at = NULL",
        rusqlite::params![
            rec.id,
            rec.name,
            rec.avatar_color,
            rec.department,
            rec.title,
            rec.employee_code,
            rec.role,
            rec.password,
            rec.with_demo as i32,
            rec.created_at,
            rec.last_login_at
        ],
    ))?;
    Ok(rec)
}

/// 记录最近登录时间
#[tauri::command]
pub fn touch_login(state: State<'_, AppState>, id: String, time: String) -> CmdResult<()> {
    let conn = lock(&state);
    db_err!(conn.execute(
        "UPDATE users SET last_login_at = ?1 WHERE id = ?2",
        rusqlite::params![time, id]
    ))?;
    Ok(())
}

/// 注销账户：逻辑删除 —— 仅打标记，不真正删行，可在系统设置中恢复
#[tauri::command]
pub fn delete_user(state: State<'_, AppState>, id: String, time: String) -> CmdResult<()> {
    let conn = lock(&state);
    let tx = db_err!(conn.unchecked_transaction())?;
    db_err!(tx.execute(
        "UPDATE users SET deleted_at = ?1 WHERE id = ?2",
        rusqlite::params![time, id]
    ))?;
    for table in ["projects", "groups", "documents", "todos"] {
        db_err!(tx.execute(
            &format!("UPDATE {table} SET deleted_at = ?1 WHERE owner_id = ?2"),
            rusqlite::params![time, id],
        ))?;
    }
    db_err!(tx.commit())?;
    Ok(())
}

/// 注销账户：物理删除 —— 直接从库中清除账户与其全部业务数据，不可恢复
///
/// 与 [`delete_user`] 的区别：这里执行真正的 `DELETE`，不保留任何副本，
/// 由前端「注销」弹窗中的「同时物理删除」勾选项触发。
#[tauri::command]
pub fn purge_user(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state);
    let tx = db_err!(conn.unchecked_transaction())?;
    // 先删业务数据，再删账户本身，避免留下孤立行
    for table in ["projects", "groups", "documents", "todos"] {
        db_err!(tx.execute(
            &format!("DELETE FROM {table} WHERE owner_id = ?1"),
            rusqlite::params![id],
        ))?;
    }
    db_err!(tx.execute("DELETE FROM users WHERE id = ?1", rusqlite::params![id]))?;
    db_err!(tx.commit())?;
    Ok(())
}

/// 恢复已注销账户：清掉账户与其数据上的删除标记
#[tauri::command]
pub fn restore_user(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state);
    let tx = db_err!(conn.unchecked_transaction())?;
    db_err!(tx.execute(
        "UPDATE users SET deleted_at = NULL WHERE id = ?1",
        rusqlite::params![id]
    ))?;
    for table in ["projects", "groups", "documents", "todos"] {
        db_err!(tx.execute(
            &format!("UPDATE {table} SET deleted_at = NULL WHERE owner_id = ?1"),
            rusqlite::params![id],
        ))?;
    }
    db_err!(tx.commit())?;
    Ok(())
}

/* ------------------------------------------------------------------ */
/* 工作台数据装载                                                       */
/* ------------------------------------------------------------------ */

fn json_col(v: &Json) -> String {
    serde_json::to_string(v).unwrap_or_else(|_| "{}".into())
}

fn read_all(conn: &Connection, sql: &str, owner: &str) -> CmdResult<Vec<Json>> {
    let mut stmt = db_err!(conn.prepare(sql))?;
    let rows = db_err!(stmt.query_map([owner], |r| {
        let raw: String = r.get(0)?;
        Ok(serde_json::from_str::<Json>(&raw).unwrap_or(Json::Null))
    }))?;
    Ok(rows.filter_map(|x| x.ok()).filter(|v| !v.is_null()).collect())
}

#[tauri::command]
pub fn load_workspace(state: State<'_, AppState>, owner_id: String) -> CmdResult<WorkspaceData> {
    let conn = lock(&state);
    Ok(WorkspaceData {
        projects: read_all(
            &conn,
            "SELECT data FROM projects WHERE owner_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC",
            &owner_id,
        )?,
        groups: read_all(
            &conn,
            "SELECT data FROM groups WHERE owner_id = ?1 AND deleted_at IS NULL ORDER BY establish_date DESC, rowid DESC",
            &owner_id,
        )?,
        documents: read_all(
            &conn,
            "SELECT data FROM documents WHERE owner_id = ?1 AND deleted_at IS NULL ORDER BY updated_at DESC, rowid DESC",
            &owner_id,
        )?,
        todos: read_all(
            &conn,
            "SELECT data FROM todos WHERE owner_id = ?1 AND deleted_at IS NULL ORDER BY rowid ASC",
            &owner_id,
        )?,
    })
}

/// 首次登录播种：仅当该账户尚无任何数据时写入，避免重复覆盖用户已建立的内容
#[tauri::command]
pub fn seed_workspace(
    state: State<'_, AppState>,
    owner_id: String,
    projects: Vec<Json>,
    groups: Vec<Json>,
    documents: Vec<Json>,
    todos: Vec<Json>,
) -> CmdResult<bool> {
    let mut conn = lock(&state);
    let exists: i64 = db_err!(conn.query_row(
        "SELECT COUNT(*) FROM (SELECT 1 FROM projects WHERE owner_id = ?1 UNION ALL SELECT 1 FROM documents WHERE owner_id = ?1)",
        rusqlite::params![owner_id],
        |r| r.get(0),
    ))?;
    if exists > 0 {
        return Ok(false);
    }

    let tx = db_err!(conn.transaction())?;
    for p in &projects {
        insert_project(&tx, &owner_id, p)?;
    }
    for g in &groups {
        insert_group(&tx, &owner_id, g)?;
    }
    for d in &documents {
        insert_document(&tx, &owner_id, d)?;
    }
    for t in &todos {
        db_err!(tx.execute(
            "INSERT OR REPLACE INTO todos (id, owner_id, deadline, data) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![s(t, "id"), owner_id, s(t, "deadline"), json_col(t)],
        ))?;
    }
    db_err!(tx.commit())?;
    Ok(true)
}

/* ------------------------------------------------------------------ */
/* 审计项目                                                            */
/* ------------------------------------------------------------------ */

fn insert_project(conn: &Connection, owner: &str, v: &Json) -> CmdResult<()> {
    db_err!(conn.execute(
        "INSERT OR REPLACE INTO projects (id, owner_id, code, name, status, audit_type, year, created_at, updated_at, data)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            s(v, "id"),
            owner,
            s(v, "code"),
            s(v, "name"),
            s(v, "status"),
            s(v, "auditType"),
            i(v, "year"),
            s(v, "createdAt"),
            s(v, "createdAt"),
            json_col(v)
        ],
    ))?;
    Ok(())
}

#[tauri::command]
pub fn create_project(state: State<'_, AppState>, owner_id: String, item: Json) -> CmdResult<()> {
    let conn = lock(&state);
    insert_project(&conn, &owner_id, &item)
}

#[tauri::command]
pub fn update_project(state: State<'_, AppState>, owner_id: String, item: Json) -> CmdResult<()> {
    let conn = lock(&state);
    let id = s(&item, "id");
    db_err!(conn.execute(
        "UPDATE projects SET code = ?1, name = ?2, status = ?3, audit_type = ?4, year = ?5, data = ?6
         WHERE id = ?7 AND owner_id = ?8",
        rusqlite::params![
            s(&item, "code"),
            s(&item, "name"),
            s(&item, "status"),
            s(&item, "auditType"),
            i(&item, "year"),
            json_col(&item),
            id,
            owner_id
        ],
    ))?;
    Ok(())
}

#[tauri::command]
pub fn delete_project(state: State<'_, AppState>, owner_id: String, id: String) -> CmdResult<()> {
    let conn = lock(&state);
    let tx = db_err!(conn.unchecked_transaction())?;
    db_err!(tx.execute(
        "DELETE FROM documents WHERE project_id = ?1 AND owner_id = ?2",
        rusqlite::params![id, owner_id]
    ))?;
    db_err!(tx.execute(
        "DELETE FROM groups WHERE project_id = ?1 AND owner_id = ?2",
        rusqlite::params![id, owner_id]
    ))?;
    db_err!(tx.execute(
        "DELETE FROM projects WHERE id = ?1 AND owner_id = ?2",
        rusqlite::params![id, owner_id]
    ))?;
    db_err!(tx.commit())?;
    Ok(())
}

/* ------------------------------------------------------------------ */
/* 审计组                                                              */
/* ------------------------------------------------------------------ */

fn insert_group(conn: &Connection, owner: &str, v: &Json) -> CmdResult<()> {
    db_err!(conn.execute(
        "INSERT OR REPLACE INTO groups (id, owner_id, project_id, name, leader_id, status, establish_date, created_at, data)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            s(v, "id"),
            owner,
            s(v, "projectId"),
            s(v, "name"),
            s(v, "leaderId"),
            s(v, "status"),
            s(v, "establishDate"),
            s(v, "establishDate"),
            json_col(v)
        ],
    ))?;
    Ok(())
}

#[tauri::command]
pub fn create_group(state: State<'_, AppState>, owner_id: String, item: Json) -> CmdResult<()> {
    let conn = lock(&state);
    insert_group(&conn, &owner_id, &item)
}

#[tauri::command]
pub fn update_group(state: State<'_, AppState>, owner_id: String, item: Json) -> CmdResult<()> {
    let conn = lock(&state);
    db_err!(conn.execute(
        "UPDATE groups SET project_id = ?1, name = ?2, leader_id = ?3, status = ?4, establish_date = ?5, data = ?6
         WHERE id = ?7 AND owner_id = ?8",
        rusqlite::params![
            s(&item, "projectId"),
            s(&item, "name"),
            s(&item, "leaderId"),
            s(&item, "status"),
            s(&item, "establishDate"),
            json_col(&item),
            s(&item, "id"),
            owner_id
        ],
    ))?;
    Ok(())
}

#[tauri::command]
pub fn delete_group(state: State<'_, AppState>, owner_id: String, id: String) -> CmdResult<()> {
    let conn = lock(&state);
    let tx = db_err!(conn.unchecked_transaction())?;
    // 解除文件与审计组的关联
    db_err!(tx.execute(
        "UPDATE documents SET group_id = '' WHERE group_id = ?1 AND owner_id = ?2",
        rusqlite::params![id, owner_id]
    ))?;
    db_err!(tx.execute(
        "DELETE FROM groups WHERE id = ?1 AND owner_id = ?2",
        rusqlite::params![id, owner_id]
    ))?;
    db_err!(tx.commit())?;
    Ok(())
}

/* ------------------------------------------------------------------ */
/* 审计工作文件                                                        */
/* ------------------------------------------------------------------ */

fn insert_document(conn: &Connection, owner: &str, v: &Json) -> CmdResult<()> {
    db_err!(conn.execute(
        "INSERT OR REPLACE INTO documents (id, owner_id, project_id, group_id, code, title, category, status, secret_level, doc_type, created_at, updated_at, data, content)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            s(v, "id"),
            owner,
            s(v, "projectId"),
            s(v, "groupId"),
            s(v, "code"),
            s(v, "title"),
            s(v, "category"),
            s(v, "status"),
            s(v, "secretLevel"),
            doc_type_of(v),
            s(v, "createdAt"),
            s(v, "updatedAt"),
            json_col(v),
            v.get("content").and_then(|x| x.as_str()).unwrap_or("").to_string()
        ],
    ))?;
    Ok(())
}

fn doc_type_of(v: &Json) -> String {
    let t = s(v, "docType");
    if t.is_empty() {
        // 默认为表格（审计底稿、取证清单多为表格形式）
        "sheet".to_string()
    } else {
        t
    }
}

#[tauri::command]
pub fn create_document(state: State<'_, AppState>, owner_id: String, item: Json) -> CmdResult<()> {
    let conn = lock(&state);
    insert_document(&conn, &owner_id, &item)
}

#[tauri::command]
pub fn update_document(state: State<'_, AppState>, owner_id: String, item: Json) -> CmdResult<()> {
    let conn = lock(&state);
    db_err!(conn.execute(
        "UPDATE documents SET project_id = ?1, group_id = ?2, code = ?3, title = ?4, category = ?5,
                status = ?6, secret_level = ?7, doc_type = ?8, updated_at = ?9, data = ?10
         WHERE id = ?11 AND owner_id = ?12",
        rusqlite::params![
            s(&item, "projectId"),
            s(&item, "groupId"),
            s(&item, "code"),
            s(&item, "title"),
            s(&item, "category"),
            s(&item, "status"),
            s(&item, "secretLevel"),
            doc_type_of(&item),
            s(&item, "updatedAt"),
            json_col(&item),
            s(&item, "id"),
            owner_id
        ],
    ))?;
    Ok(())
}

#[tauri::command]
pub fn delete_document(state: State<'_, AppState>, owner_id: String, id: String) -> CmdResult<()> {
    let conn = lock(&state);
    db_err!(conn.execute(
        "DELETE FROM documents WHERE id = ?1 AND owner_id = ?2",
        rusqlite::params![id, owner_id]
    ))?;
    Ok(())
}

/// 读取在线编辑器（Univer）内容快照
#[tauri::command]
pub fn get_document_content(state: State<'_, AppState>, id: String) -> CmdResult<String> {
    let conn = lock(&state);
    let r: rusqlite::Result<String> = conn.query_row(
        "SELECT COALESCE(content, '') FROM documents WHERE id = ?1",
        rusqlite::params![id],
        |row| row.get(0),
    );
    match r {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// 保存在线编辑器内容快照，并同步文件的最近更新时间
#[tauri::command]
pub fn save_document_content(
    state: State<'_, AppState>,
    owner_id: String,
    id: String,
    content: String,
    updated_at: String,
) -> CmdResult<()> {
    let conn = lock(&state);
    db_err!(conn.execute(
        "UPDATE documents SET content = ?1, updated_at = ?2 WHERE id = ?3 AND owner_id = ?4",
        rusqlite::params![content, updated_at, id, owner_id]
    ))?;
    // 同步更新 data 中的 updatedAt 字段，保证列表展示一致
    let raw: rusqlite::Result<String> = conn.query_row(
        "SELECT data FROM documents WHERE id = ?1",
        rusqlite::params![id],
        |r| r.get(0),
    );
    if let Ok(raw) = raw {
        if let Ok(mut v) = serde_json::from_str::<Json>(&raw) {
            if let Some(obj) = v.as_object_mut() {
                obj.insert("updatedAt".into(), Json::String(updated_at));
                obj.insert("hasContent".into(), Json::Bool(true));
                db_err!(conn.execute(
                    "UPDATE documents SET data = ?1 WHERE id = ?2",
                    rusqlite::params![json_col(&v), id]
                ))?;
            }
        }
    }
    Ok(())
}

/* ------------------------------------------------------------------ */
/* 待办                                                                */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub fn create_todo(state: State<'_, AppState>, owner_id: String, item: Json) -> CmdResult<()> {
    let conn = lock(&state);
    db_err!(conn.execute(
        "INSERT OR REPLACE INTO todos (id, owner_id, deadline, data) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![s(&item, "id"), owner_id, s(&item, "deadline"), json_col(&item)],
    ))?;
    Ok(())
}

#[tauri::command]
pub fn delete_todo(state: State<'_, AppState>, owner_id: String, id: String) -> CmdResult<()> {
    let conn = lock(&state);
    db_err!(conn.execute(
        "DELETE FROM todos WHERE id = ?1 AND owner_id = ?2",
        rusqlite::params![id, owner_id]
    ))?;
    Ok(())
}

/// 清空当前账户全部业务数据（保留账户本身）
#[tauri::command]
pub fn reset_workspace(state: State<'_, AppState>, owner_id: String) -> CmdResult<()> {
    let conn = lock(&state);
    let tx = db_err!(conn.unchecked_transaction())?;
    db_err!(tx.execute("DELETE FROM todos WHERE owner_id = ?1", rusqlite::params![owner_id]))?;
    db_err!(tx.execute("DELETE FROM documents WHERE owner_id = ?1", rusqlite::params![owner_id]))?;
    db_err!(tx.execute("DELETE FROM groups WHERE owner_id = ?1", rusqlite::params![owner_id]))?;
    db_err!(tx.execute("DELETE FROM projects WHERE owner_id = ?1", rusqlite::params![owner_id]))?;
    db_err!(tx.commit())?;
    Ok(())
}

/// 当前使用的数据库文件路径（系统设置页展示用）
#[tauri::command]
pub fn db_file_path(state: State<'_, AppState>) -> String {
    state.db_path.to_string_lossy().to_string()
}
