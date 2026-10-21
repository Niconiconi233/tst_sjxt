//! 业务字典（下拉选项）默认数据
//!
//! 部门、职务、角色、审计类型、文件类别与模板等可配置字段统一存放在
//! `dict_items` 表中，由「系统设置 → 字典与模板配置」维护。
//! 首次建库时按这里的数据播种一次，之后全部以数据库为准，前端不再硬编码。

use rusqlite::{params, Connection};

/// (category, parent, label, remark)
/// - parent 用于二级字典：`doc_template` 挂在某个文件类别下，
///   `audit_item` 挂在某个审计类型下；一级字典 parent 为空串。
pub const DEFAULT_ITEMS: &[(&str, &str, &str, &str)] = &[
    /* ---------------- 账户 / 人员 ---------------- */
    ("department", "", "财政审计一处", ""),
    ("department", "", "财政审计二处", ""),
    ("department", "", "经济责任审计处", ""),
    ("department", "", "固定资产投资审计处", ""),
    ("department", "", "社会保障审计处", ""),
    ("department", "", "金融审计处", ""),
    ("department", "", "行政事业审计处", ""),
    ("department", "", "企业审计处", ""),
    ("department", "", "计算机审计中心", ""),
    ("department", "", "法规审理处", ""),
    ("title", "", "处长", ""),
    ("title", "", "副处长", ""),
    ("title", "", "调研员", ""),
    ("title", "", "副调研员", ""),
    ("title", "", "主任科员", ""),
    ("title", "", "审计员", ""),
    ("title", "", "工程师", ""),
    ("role", "", "审计组长", ""),
    ("role", "", "副组长", ""),
    ("role", "", "主审", ""),
    ("role", "", "审计员", ""),
    ("role", "", "复核员", ""),
    ("role", "", "廉政监督员", ""),
    ("role", "", "资料员", ""),
    ("role", "", "外部专家", ""),

    /* ---------------- 审计项目 ---------------- */
    ("audit_type", "", "预算执行审计", ""),
    ("audit_type", "", "经济责任审计", ""),
    ("audit_type", "", "专项资金审计", ""),
    ("audit_type", "", "财务收支审计", ""),
    ("audit_type", "", "绩效审计", ""),
    ("audit_type", "", "合规审计", ""),
    ("audit_type", "", "跟踪审计", ""),
    ("unit_nature", "", "行政机关", ""),
    ("unit_nature", "", "事业单位", ""),
    ("unit_nature", "", "国有企业", ""),
    ("unit_nature", "", "社会团体", ""),
    ("unit_nature", "", "其他组织", ""),
    ("project_level", "", "一级", ""),
    ("project_level", "", "二级", ""),
    ("project_level", "", "三级", ""),
    ("project_status", "", "筹备中", ""),
    ("project_status", "", "实施中", ""),
    ("project_status", "", "报告阶段", ""),
    ("project_status", "", "整改跟踪", ""),
    ("project_status", "", "已归档", ""),

    /* ---------------- 审计事项（按审计类型分组） ---------------- */
    ("audit_item", "预算执行审计", "部门预算编制", ""),
    ("audit_item", "预算执行审计", "预算执行进度", ""),
    ("audit_item", "预算执行审计", "专项资金结转结余", ""),
    ("audit_item", "预算执行审计", "政府采购", ""),
    ("audit_item", "预算执行审计", "三公经费", ""),
    ("audit_item", "预算执行审计", "决算草案", ""),
    ("audit_item", "预算执行审计", "非税收入", ""),
    ("audit_item", "经济责任审计", "重大经济决策", ""),
    ("audit_item", "经济责任审计", "财务收支真实性", ""),
    ("audit_item", "经济责任审计", "国有资产管理", ""),
    ("audit_item", "经济责任审计", "债务风险", ""),
    ("audit_item", "经济责任审计", "廉洁从业", ""),
    ("audit_item", "经济责任审计", "任期目标完成", ""),
    ("audit_item", "专项资金审计", "资金拨付及时性", ""),
    ("audit_item", "专项资金审计", "资金使用合规性", ""),
    ("audit_item", "专项资金审计", "项目绩效", ""),
    ("audit_item", "专项资金审计", "配套资金落实", ""),
    ("audit_item", "专项资金审计", "受益对象认定", ""),
    ("audit_item", "财务收支审计", "收入完整性", ""),
    ("audit_item", "财务收支审计", "支出合规性", ""),
    ("audit_item", "财务收支审计", "资产管理", ""),
    ("audit_item", "财务收支审计", "往来款项", ""),
    ("audit_item", "财务收支审计", "会计核算", ""),
    ("audit_item", "绩效审计", "绩效目标设定", ""),
    ("audit_item", "绩效审计", "指标完成度", ""),
    ("audit_item", "绩效审计", "投入产出比", ""),
    ("audit_item", "绩效审计", "社会效益", ""),
    ("audit_item", "绩效审计", "可持续性", ""),
    ("audit_item", "合规审计", "资质合规", ""),
    ("audit_item", "合规审计", "业务合规", ""),
    ("audit_item", "合规审计", "内控健全性", ""),
    ("audit_item", "合规审计", "风险敞口", ""),
    ("audit_item", "合规审计", "监管报送", ""),
    ("audit_item", "跟踪审计", "工程计量支付", ""),
    ("audit_item", "跟踪审计", "变更签证", ""),
    ("audit_item", "跟踪审计", "招投标合规", ""),
    ("audit_item", "跟踪审计", "合同履约", ""),
    ("audit_item", "跟踪审计", "资金到位", ""),

    /* ---------------- 审计组 ---------------- */
    ("group_status", "", "组建中", ""),
    ("group_status", "", "已成立", ""),
    ("group_status", "", "现场实施", ""),
    ("group_status", "", "已撤离", ""),

    /* ---------------- 工作文件 ---------------- */
    ("doc_category", "", "审计方案类", ""),
    ("doc_category", "", "审计通知类", ""),
    ("doc_category", "", "取证与底稿类", ""),
    ("doc_category", "", "审计证据类", ""),
    ("doc_category", "", "审计报告类", ""),
    ("doc_category", "", "整改与移送类", ""),
    ("doc_category", "", "廉政与纪律类", ""),
    ("doc_category", "", "内部管理类", ""),
    ("doc_status", "", "草稿", ""),
    ("doc_status", "", "待复核", ""),
    ("doc_status", "", "复核中", ""),
    ("doc_status", "", "已复核", ""),
    ("doc_status", "", "已签发", ""),
    ("doc_status", "", "已归档", ""),
    ("doc_status", "", "被退回", ""),
    ("secret_level", "", "公开", ""),
    ("secret_level", "", "内部", ""),
    ("secret_level", "", "秘密", ""),
    ("secret_level", "", "机密", ""),

    /* ---------------- 文件模板（挂在文件类别下） ---------------- */
    ("doc_template", "审计方案类", "审计实施方案", "明确审计目标、范围、内容、重点与人员分工"),
    ("doc_template", "审计方案类", "审计工作方案", "机关层面统一组织实施的总体工作安排"),
    ("doc_template", "审计方案类", "审计调查方案", ""),
    ("doc_template", "审计方案类", "方案调整审批表", ""),
    ("doc_template", "审计通知类", "审计通知书", "向被审计单位送达的正式审计文书"),
    ("doc_template", "审计通知类", "审计取证通知书", ""),
    ("doc_template", "审计通知类", "延伸审计通知书", ""),
    ("doc_template", "审计通知类", "审计承诺书", ""),
    ("doc_template", "取证与底稿类", "审计工作底稿", "记录审计程序执行过程与结论"),
    ("doc_template", "取证与底稿类", "审计取证单", "记录单项审计事项取证情况及证据清单"),
    ("doc_template", "取证与底稿类", "审计事项确认单", ""),
    ("doc_template", "取证与底稿类", "审计抽样记录", ""),
    ("doc_template", "审计证据类", "证据材料清单", ""),
    ("doc_template", "审计证据类", "询问笔录", ""),
    ("doc_template", "审计证据类", "函证回函", ""),
    ("doc_template", "审计证据类", "现场勘查记录", ""),
    ("doc_template", "审计报告类", "审计报告（征求意见稿）", ""),
    ("doc_template", "审计报告类", "审计报告", "汇总审计情况、发现问题与处理意见"),
    ("doc_template", "审计报告类", "审计决定书", "对违反国家规定的财政财务收支行为作出处理"),
    ("doc_template", "审计报告类", "审计移送处理书", ""),
    ("doc_template", "整改与移送类", "审计整改通知书", "要求被审计单位限期整改审计发现问题"),
    ("doc_template", "整改与移送类", "整改情况反馈表", ""),
    ("doc_template", "整改与移送类", "问题线索移送书", ""),
    ("doc_template", "整改与移送类", "整改销号确认表", ""),
    ("doc_template", "廉政与纪律类", "审计组廉政承诺书", "审计组全体成员廉洁从审的书面承诺"),
    ("doc_template", "廉政与纪律类", "廉政纪律执行情况报告", ""),
    ("doc_template", "廉政与纪律类", "审计“八不准”告知书", ""),
    ("doc_template", "内部管理类", "审计组会议纪要", "记录审计组业务会议议定事项"),
    ("doc_template", "内部管理类", "工作日志", ""),
    ("doc_template", "内部管理类", "考勤登记表", ""),
    ("doc_template", "内部管理类", "资料交接单", ""),
];

/// 播种默认字典：只补缺失项，不动人工新增与已改名的条目
pub fn seed_defaults(conn: &Connection) -> rusqlite::Result<()> {
    let mut seq: std::collections::HashMap<(String, String), i64> = std::collections::HashMap::new();

    for (category, parent, label, remark) in DEFAULT_ITEMS {
        let key = ((*category).to_string(), (*parent).to_string());
        let slot = seq.entry(key).or_insert(0);
        let sort = *slot;
        *slot += 1;

        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM dict_items WHERE category = ?1 AND parent = ?2 AND label = ?3",
            params![category, parent, label],
            |r| r.get(0),
        )?;
        if exists > 0 {
            continue;
        }
        let id = format!("bi_{}_{}_{}", category, parent, sort);
        conn.execute(
            "INSERT INTO dict_items (id, category, parent, label, remark, sort_order, enabled, builtin)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 1)",
            params![id, category, parent, label, remark, sort],
        )?;
    }
    Ok(())
}
