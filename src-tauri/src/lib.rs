//! 审计组工作管理系统 —— Tauri 2 桌面端入口
//!
//! 数据持久化由本地 SQLite 承担（src/db.rs + src/commands.rs），
//! 所有业务表按 owner_id（登录账户）分片，实现账户级隔离。

mod auditors;
mod commands;
mod db;
mod dict;
mod models;

/// 把 rusqlite 错误统一转换为可序列化的 String，便于前端直接展示
#[macro_export]
macro_rules! db_err {
    ($e:expr) => {
        $e.map_err(|e: rusqlite::Error| e.to_string())
    };
}

use db::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 导出 Word/Excel 时弹出系统「另存为」对话框
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("无法解析应用数据目录：{e}"))?;
            std::fs::create_dir_all(&dir).ok();
            let db_path = dir.join("audit_workspace.db");
            app.manage(AppState::new(db_path).map_err(|e| e.to_string())?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 元信息
            commands::app_info,
            commands::ping,
            commands::db_file_path,
            commands::reveal_db_file,
            // 账户
            commands::list_users,
            commands::list_deleted_users,
            commands::save_user,
            commands::touch_login,
            commands::delete_user,
            commands::purge_user,
            commands::restore_user,
            // 工作台
            commands::load_workspace,
            commands::seed_workspace,
            commands::reset_workspace,
            // 审计项目
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            // 审计组
            commands::create_group,
            commands::update_group,
            commands::delete_group,
            // 审计工作文件
            commands::create_document,
            commands::update_document,
            commands::delete_document,
            commands::get_document_content,
            commands::save_document_content,
            // 导出文件落盘
            commands::write_export_file,
            // 待办
            commands::create_todo,
            commands::delete_todo,
            // 业务字典（下拉选项配置）
            commands::list_dict,
            commands::save_dict_item,
            commands::delete_dict_item,
            commands::restore_dict_defaults,
            // 文书模板附件（挂在 doc_template 条目上）
            commands::upload_dict_file,
            commands::read_dict_file,
            commands::delete_dict_file,
            // 应用级键值配置（机关名称、机构代码等）
            commands::load_app_settings,
            commands::save_app_setting,
            // 审计人员名册
            commands::list_auditors,
            commands::save_auditor,
            commands::delete_auditor,
            commands::restore_default_auditors,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
