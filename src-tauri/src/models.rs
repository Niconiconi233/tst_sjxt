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
