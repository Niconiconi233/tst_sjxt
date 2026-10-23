//! 与前端 TS 类型对应的 Rust 数据结构与取值辅助函数

use serde::{Deserialize, Serialize};
use serde_json::Value as Json;

/// 本机登录账户
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRecord {
    pub id: String,
    pub name: String,
    pub avatar_color: String,
    pub department: String,
    pub title: String,
    pub employee_code: String,
    pub role: String,
    pub password: String,
    pub with_demo: bool,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_login_at: Option<String>,
    /// 注销时间：非空表示账户已逻辑删除（可在系统设置中恢复）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

/// 业务字典条目（下拉选项，全库共享）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictItem {
    pub id: String,
    /// 字典分类：department / title / role / audit_type / doc_category ...
    pub category: String,
    /// 上级值：二级字典（模板→文件类别、审计事项→审计类型）使用，一级为空串
    pub parent: String,
    pub label: String,
    /// 备注：模板说明等辅助文案
    pub remark: String,
    pub sort_order: i64,
    pub enabled: bool,
    /// 是否为系统预置项（预置项可停用但界面上标注来源）
    pub builtin: bool,
}

impl DictItem {
    pub fn from_json(v: &Json) -> Self {
        DictItem {
            id: s(v, "id"),
            category: s(v, "category"),
            parent: s(v, "parent"),
            label: s(v, "label"),
            remark: s(v, "remark"),
            sort_order: i(v, "sortOrder"),
            enabled: if v.get("enabled").is_none() {
                true
            } else {
                b(v, "enabled")
            },
            builtin: b(v, "builtin"),
        }
    }
}

/// 审计人员名册（全库共享，对应前端 Auditor + 维护字段）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditorRecord {
    pub id: String,
    pub name: String,
    /// 工号 / 执法证号
    pub code: String,
    pub gender: String,
    pub department: String,
    pub title: String,
    pub qualification: String,
    pub phone: String,
    pub email: String,
    /// 可担任角色：存储态为逗号分隔字符串；输出给前端时展开为数组
    #[serde(skip)]
    pub capable_roles_raw: String,
    pub capable_roles: Vec<String>,
    pub busy_projects: i64,
    pub avatar_color: String,
    pub sort_order: i64,
    pub enabled: bool,
    pub builtin: bool,
}

impl AuditorRecord {
    /// 从数据库行读取（capable_roles 为逗号分隔）
    pub fn from_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        let raw: String = r.get(10)?;
        Ok(AuditorRecord {
            id: r.get(0)?,
            name: r.get(1)?,
            code: r.get(2)?,
            gender: r.get(3)?,
            department: r.get(4)?,
            title: r.get(5)?,
            qualification: r.get(6)?,
            phone: r.get(7)?,
            email: r.get(8)?,
            capable_roles: split_roles(&raw),
            capable_roles_raw: raw,
            busy_projects: r.get(9)?,
            avatar_color: r.get(11)?,
            sort_order: r.get(12)?,
            enabled: r.get::<_, i32>(13).unwrap_or(1) != 0,
            builtin: r.get::<_, i32>(14).unwrap_or(0) != 0,
        })
    }

    /// 从前端提交的 JSON 读取
    pub fn from_json(v: &Json) -> Self {
        let roles: Vec<String> = v
            .get("capableRoles")
            .and_then(|x| x.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        AuditorRecord {
            id: s(v, "id"),
            name: s(v, "name"),
            code: s(v, "code"),
            gender: s(v, "gender"),
            department: s(v, "department"),
            title: s(v, "title"),
            qualification: s(v, "qualification"),
            phone: s(v, "phone"),
            email: s(v, "email"),
            capable_roles_raw: roles.join(","),
            capable_roles: roles,
            busy_projects: i(v, "busyProjects"),
            avatar_color: s(v, "avatarColor"),
            sort_order: i(v, "sortOrder"),
            enabled: if v.get("enabled").is_none() {
                true
            } else {
                b(v, "enabled")
            },
            builtin: b(v, "builtin"),
        }
    }
}

/// "审计组长,主审" → ["审计组长", "主审"]
fn split_roles(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|x| x.trim())
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string())
        .collect()
}

/// 单个账户的完整工作台数据（与前端 UserDataset 对应）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkspaceData {
    pub projects: Vec<Json>,
    pub groups: Vec<Json>,
    pub documents: Vec<Json>,
    pub todos: Vec<Json>,
}

impl UserRecord {
    pub fn from_json(v: &Json) -> Self {
        UserRecord {
            id: s(v, "id"),
            name: s(v, "name"),
            avatar_color: s(v, "avatarColor"),
            department: s(v, "department"),
            title: s(v, "title"),
            employee_code: s(v, "employeeCode"),
            role: s(v, "role"),
            password: s(v, "password"),
            with_demo: b(v, "withDemo"),
            created_at: s(v, "createdAt"),
            last_login_at: opt(v, "lastLoginAt"),
            deleted_at: opt(v, "deletedAt"),
        }
    }
}

/// 取字符串字段，缺省返回空串
pub fn s(v: &Json, key: &str) -> String {
    match v.get(key) {
        Some(Json::String(x)) => x.clone(),
        Some(Json::Number(n)) => n.to_string(),
        Some(Json::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

/// 取可选字符串字段
pub fn opt(v: &Json, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str())
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string())
}

/// 取布尔字段
pub fn b(v: &Json, key: &str) -> bool {
    match v.get(key) {
        Some(Json::Bool(x)) => *x,
        Some(Json::Number(n)) => n.as_i64().unwrap_or(0) != 0,
        _ => false,
    }
}

/// 取整型字段
pub fn i(v: &Json, key: &str) -> i64 {
    match v.get(key) {
        Some(Json::Number(n)) => n.as_i64().unwrap_or(0),
        Some(Json::String(t)) => t.parse::<i64>().unwrap_or(0),
        _ => 0,
    }
}

/// 统一的 API 错误：直接暴露给前端展示
pub type CmdResult<T> = Result<T, String>;
