//! 审计人员名册默认数据
//!
//! 人员名册（选人、组长指派、文件编制人 / 复核人）统一存放在 `auditors` 表中，
//! 由「系统设置 → 审计人员名册」维护。首次建库时按这里的数据播种一次，
//! 之后全部以数据库为准，前端不再硬编码。
//!
//! 注意：id（A1001…）与头像配色沿用早期内置名单的生成规则，
//! 保证已落库的历史数据里存的 A1003 仍指向同一个人。

use rusqlite::{params, Connection};

/// 头像配色（与前端 AVATAR_COLORS 一致，循环取用）
const AVATAR_COLORS: &[&str] = &[
    "#1a5fb4", "#0f7b8a", "#7a3fa8", "#b7791f", "#1a7f4b", "#b42318", "#41546b",
];

/// (姓名, 部门, 职务, 专业技术资格, 可担任角色)
pub const DEFAULT_AUDITORS: &[(&str, &str, &str, &str, &[&str])] = &[
    ("陈志远", "财政审计一处", "处长", "高级审计师", &["审计组长", "副组长", "主审"]),
    ("李文静", "财政审计一处", "副处长", "高级审计师", &["审计组长", "主审", "复核员"]),
    ("王建国", "经济责任审计处", "调研员", "审计师", &["副组长", "主审", "审计员"]),
    ("赵慧敏", "固定资产投资审计处", "主任科员", "审计师", &["审计员", "资料员"]),
    ("刘振华", "财政审计二处", "副调研员", "高级审计师", &["复核员", "审计员"]),
    ("孙雅芳", "社会保障审计处", "主任科员", "审计师", &["主审", "审计员"]),
    ("周立新", "金融审计处", "处长", "注册会计师", &["审计组长", "副组长"]),
    ("吴彩虹", "行政事业审计处", "副处长", "审计师", &["副组长", "廉政监督员"]),
    ("郑海涛", "计算机审计中心", "工程师", "信息系统审计师", &["审计员", "外部专家"]),
    ("冯丽娟", "财政审计一处", "主任科员", "审计师", &["审计员", "资料员"]),
    ("马俊峰", "企业审计处", "副处长", "高级审计师", &["审计组长", "主审"]),
    ("钱思远", "法规审理处", "调研员", "律师", &["复核员", "外部专家"]),
    ("谭雪梅", "社会保障审计处", "主任科员", "审计师", &["审计员"]),
    ("何伟民", "固定资产投资审计处", "副调研员", "造价工程师", &["外部专家", "审计员"]),
    ("杨舒涵", "计算机审计中心", "助理工程师", "数据分析师", &["审计员", "资料员"]),
    ("徐明辉", "经济责任审计处", "主任科员", "审计师", &["审计员", "廉政监督员"]),
    ("罗秀英", "行政事业审计处", "调研员", "高级审计师", &["复核员", "主审"]),
    ("高天宇", "金融审计处", "主任科员", "审计师", &["审计员"]),
];

/// 与早期内置名单一致的派生规则：工号、性别、电话、邮箱、头像色
fn derived(i: usize) -> (String, String, &'static str, String, String, String) {
    let id = format!("A{}", 1000 + i + 1);
    let code = format!("SJ-{}", 1001 + i);
    let gender = if i % 3 == 1 { "女" } else { "男" };
    let phone = format!("138{}", &format!("{}", 10_000_000i64 + i as i64 * 1_234_567)[..8]);
    let email = format!("user{}@audit.gov.cn", i + 1);
    let color = AVATAR_COLORS[i % AVATAR_COLORS.len()].to_string();
    (id, code, gender, phone, email, color)
}

/// 播种默认人员：只补缺失的 id，不动人工新增与已改动的条目
pub fn seed_defaults(conn: &Connection) -> rusqlite::Result<()> {
    for (i, (name, department, title, qualification, roles)) in DEFAULT_AUDITORS.iter().enumerate() {
        let (id, code, gender, phone, email, color) = derived(i);
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM auditors WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )?;
        if exists > 0 {
            continue;
        }
        conn.execute(
            "INSERT INTO auditors
             (id, name, code, gender, department, title, qualification, phone, email,
              capable_roles, busy_projects, avatar_color, sort_order, enabled, builtin)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?12, 1, 1)",
            params![
                id,
                name,
                code,
                gender,
                department,
                title,
                qualification,
                phone,
                email,
                roles.join(","),
                color,
                i as i64,
            ],
        )?;
    }
    Ok(())
}
