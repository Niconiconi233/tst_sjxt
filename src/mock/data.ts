import { defaultAuditors } from '@/mock/auditorDefaults';
import type {
  AuditDocument,
  AuditGroup,
  AuditProject,
  Auditor,
  DocCategory,
  DocVersion,
  GroupMember,
  GroupRole,
  TodoItem,
} from '@/types';

/* ============================ 人员库 ============================ */

/**
 * 示例数据使用的人员快照。
 *
 * 运行时的名册来自数据库（`useAuditors`），这里仅为预置示例项目 / 审计组 / 文件
 * 提供人员引用。数据与 Rust 侧建库播种的默认名册同源（生成规则一致、id 一致），
 * 因此示例数据里的 A1001… 与数据库里是同一批人。
 */
const seedAuditorMap: Record<string, Auditor> = Object.fromEntries(
  defaultAuditors().map((a) => [a.id, { ...a, gender: a.gender === '女' ? '女' : '男' } as Auditor]),
);

/* ============================ 审计项目 ============================ */

export const projects: AuditProject[] = [
  {
    id: 'P2026001',
    code: '审财〔2026〕015号',
    name: '2025年度市级部门预算执行及决算草案审计',
    auditedUnit: '市交通运输局',
    unitNature: '行政机关',
    auditType: '预算执行审计',
    level: '一级',
    status: '实施中',
    year: 2026,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    fieldStart: '2026-03-02',
    fieldEnd: '2026-05-30',
    budget: 86,
    ownerName: '陈志远',
    ownerId: 'A1001',
    progress: 62,
    groupCount: 2,
    docCount: 37,
    issueCount: 9,
    createdAt: '2026-01-18 09:24',
    tags: ['本级预算', '重点专题'],
    remark: '重点关注"三公"经费、专项资金结转结余及政府采购执行情况。',
  },
  {
    id: 'P2026002',
    code: '审经〔2026〕007号',
    name: '市城投集团原董事长任期经济责任审计',
    auditedUnit: '市城市建设投资集团有限公司',
    unitNature: '国有企业',
    auditType: '经济责任审计',
    level: '一级',
    status: '实施中',
    year: 2026,
    periodStart: '2019-04-01',
    periodEnd: '2026-01-31',
    fieldStart: '2026-02-16',
    fieldEnd: '2026-06-15',
    budget: 120,
    ownerName: '王建国',
    ownerId: 'A1003',
    progress: 48,
    groupCount: 3,
    docCount: 52,
    issueCount: 14,
    createdAt: '2026-01-09 14:03',
    tags: ['经济责任', '离任交接'],
    remark: '任期跨度长，需调阅历年董事会决议与重大投资台账。',
  },
  {
    id: 'P2026003',
    code: '审社〔2026〕023号',
    name: '城乡义务教育补助专项资金绩效审计',
    auditedUnit: '市教育局',
    unitNature: '行政机关',
    auditType: '绩效审计',
    level: '二级',
    status: '报告阶段',
    year: 2026,
    periodStart: '2024-09-01',
    periodEnd: '2025-12-31',
    fieldStart: '2026-01-12',
    fieldEnd: '2026-04-20',
    budget: 60,
    ownerName: '孙雅芳',
    ownerId: 'A1006',
    progress: 88,
    groupCount: 1,
    docCount: 29,
    issueCount: 5,
    createdAt: '2025-12-22 10:11',
    tags: ['民生资金', '绩效评价'],
  },
  {
    id: 'P2026004',
    code: '审投〔2026〕004号',
    name: '城市轨道交通3号线一期工程跟踪审计',
    auditedUnit: '市轨道交通建设管理有限公司',
    unitNature: '事业单位',
    auditType: '跟踪审计',
    level: '一级',
    status: '实施中',
    year: 2026,
    periodStart: '2023-06-01',
    periodEnd: '2026-12-31',
    fieldStart: '2026-02-01',
    fieldEnd: '2026-11-30',
    budget: 200,
    ownerName: '赵慧敏',
    ownerId: 'A1004',
    progress: 35,
    groupCount: 4,
    docCount: 64,
    issueCount: 11,
    createdAt: '2026-01-05 08:40',
    tags: ['重大项目', '驻场审计'],
    remark: '按季度出具阶段性审计意见，重点关注工程变更与计量支付。',
  },
  {
    id: 'P2026005',
    code: '审财〔2026〕031号',
    name: '市第一人民医院2025年度财务收支审计',
    auditedUnit: '市第一人民医院',
    unitNature: '事业单位',
    auditType: '财务收支审计',
    level: '二级',
    status: '整改跟踪',
    year: 2026,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    fieldStart: '2025-11-03',
    fieldEnd: '2026-01-20',
    budget: 45,
    ownerName: '罗秀英',
    ownerId: 'A1017',
    progress: 95,
    groupCount: 1,
    docCount: 24,
    issueCount: 7,
    createdAt: '2025-10-15 16:22',
    tags: ['医疗收费', '药品耗材'],
  },
  {
    id: 'P2026006',
    code: '审金〔2026〕011号',
    name: '市属小额贷款公司合规经营专项审计',
    auditedUnit: '市金融控股集团',
    unitNature: '国有企业',
    auditType: '合规审计',
    level: '二级',
    status: '筹备中',
    year: 2026,
    periodStart: '2025-07-01',
    periodEnd: '2026-06-30',
    fieldStart: '2026-04-01',
    fieldEnd: '2026-07-15',
    budget: 55,
    ownerName: '周立新',
    ownerId: 'A1007',
    progress: 8,
    groupCount: 0,
    docCount: 4,
    issueCount: 0,
    createdAt: '2026-03-11 11:05',
    tags: ['地方金融', '风险防控'],
  },
  {
    id: 'P2026007',
    code: '审农〔2026〕009号',
    name: '乡村振兴衔接资金管理使用情况审计',
    auditedUnit: '市农业农村局',
    unitNature: '行政机关',
    auditType: '专项资金审计',
    level: '二级',
    status: '已归档',
    year: 2025,
    periodStart: '2024-01-01',
    periodEnd: '2025-10-31',
    fieldStart: '2025-08-04',
    fieldEnd: '2025-12-18',
    budget: 70,
    ownerName: '马俊峰',
    ownerId: 'A1011',
    progress: 100,
    groupCount: 2,
    docCount: 41,
    issueCount: 12,
    createdAt: '2025-07-02 09:00',
    tags: ['乡村振兴', '已完成'],
  },
  {
    id: 'P2026008',
    code: '审行〔2026〕018号',
    name: '市级机关运行经费保障情况专项审计调查',
    auditedUnit: '市级机关事务管理局',
    unitNature: '行政机关',
    auditType: '专项资金审计',
    level: '三级',
    status: '报告阶段',
    year: 2026,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    fieldStart: '2026-02-24',
    fieldEnd: '2026-05-15',
    budget: 38,
    ownerName: '吴彩虹',
    ownerId: 'A1008',
    progress: 76,
    groupCount: 1,
    docCount: 18,
    issueCount: 4,
    createdAt: '2026-01-28 15:47',
    tags: ['审计调查', '厉行节约'],
  },
];

/* ============================ 审计组 ============================ */

function mkMember(memberId: string, role: GroupRole, duty: string, items: string[], onSite = true): GroupMember {
  const auditor = seedAuditorMap[memberId];
  return {
    memberId,
    auditor,
    role,
    duty,
    responsibleItems: items,
    joinDate: '2026-02-01',
    onSite,
  };
}

export const groups: AuditGroup[] = [
  {
    id: 'G2026001',
    name: '市交通运输局预算执行审计组',
    projectId: 'P2026001',
    projectName: '2025年度市级部门预算执行及决算草案审计',
    leaderId: 'A1001',
    leaderName: '陈志远',
    memberCount: 7,
    establishDate: '2026-02-20',
    planEndDate: '2026-05-30',
    status: '现场实施',
    location: '市交通运输局 3楼会议室',
    disciplineNote: '严格遵守审计"八不准"工作纪律，实行审计组廉政承诺制。',
    members: [
      mkMember('A1001', '审计组长', '全面负责审计组工作，审定审计实施方案与审计报告', ['总体统筹', '对外协调']),
      mkMember('A1002', '副组长', '协助组长工作，分管财政财务收支审计事项', ['部门预算', '决算草案']),
      mkMember('A1005', '主审', '起草审计实施方案，汇总审计底稿，撰写审计报告', ['底稿复核', '报告起草']),
      mkMember('A1006', '审计员', '负责政府采购与专项资金审计', ['政府采购', '专项资金']),
      mkMember('A1010', '审计员', '负责"三公"经费与会议培训费审计', ['三公经费', '会议培训']),
      mkMember('A1009', '审计员', '负责数据采集分析与信息化核查', ['数据分析', '电子数据']),
      mkMember('A1008', '廉政监督员', '监督审计组执行廉政纪律情况', ['廉政监督', '纪律检查']),
    ],
  },
  {
    id: 'G2026002',
    name: '市交通运输局预算执行审计二组（延伸组）',
    projectId: 'P2026001',
    projectName: '2025年度市级部门预算执行及决算草案审计',
    leaderId: 'A1003',
    leaderName: '王建国',
    memberCount: 4,
    establishDate: '2026-03-01',
    planEndDate: '2026-05-20',
    status: '现场实施',
    location: '市公路事业发展中心',
    disciplineNote: '延伸审计期间不得接受被审计单位宴请及礼品。',
    members: [
      mkMember('A1003', '审计组长', '负责延伸审计现场工作', ['延伸审计']),
      mkMember('A1013', '审计员', '负责下属单位财务收支核查', ['下属单位']),
      mkMember('A1016', '审计员', '负责固定资产与往来款项核查', ['固定资产', '往来款项']),
      mkMember('A1015', '资料员', '负责取证材料整理归档与台账登记', ['资料归档', '台账管理']),
    ],
  },
  {
    id: 'G2026003',
    name: '市城投集团经济责任审计组',
    projectId: 'P2026002',
    projectName: '市城投集团原董事长任期经济责任审计',
    leaderId: 'A1011',
    leaderName: '马俊峰',
    memberCount: 9,
    establishDate: '2026-02-05',
    planEndDate: '2026-06-15',
    status: '现场实施',
    location: '市城投集团总部 20楼',
    disciplineNote: '涉密资料实行专人保管、专柜存放，严禁外传。',
    members: [
      mkMember('A1011', '审计组长', '负责经济责任审计总体组织与责任界定', ['责任界定', '总体统筹']),
      mkMember('A1003', '副组长', '分管重大投资决策事项审计', ['重大投资', '决策程序']),
      mkMember('A1002', '主审', '汇总审计证据，起草经济责任审计报告', ['报告起草', '证据汇总']),
      mkMember('A1007', '审计员', '负责融资与债务风险审计', ['融资管理', '债务风险']),
      mkMember('A1018', '审计员', '负责资金往来与关联交易审计', ['关联交易', '资金往来']),
      mkMember('A1014', '外部专家', '负责工程造价与合同履约专业鉴定', ['工程造价', '合同履约']),
      mkMember('A1012', '外部专家', '负责法律合规性与责任认定咨询', ['法律合规']),
      mkMember('A1017', '复核员', '负责审计底稿与证据复核', ['底稿复核'], false),
      mkMember('A1015', '资料员', '负责资料调阅登记与涉密材料管理', ['资料管理', '保密台账']),
    ],
  },
  {
    id: 'G2026004',
    name: '轨道交通3号线跟踪审计一组',
    projectId: 'P2026004',
    projectName: '城市轨道交通3号线一期工程跟踪审计',
    leaderId: 'A1004',
    leaderName: '赵慧敏',
    memberCount: 6,
    establishDate: '2026-01-20',
    planEndDate: '2026-11-30',
    status: '现场实施',
    location: '轨交3号线项目部（驻场）',
    disciplineNote: '驻场人员须每日填报工作日志，按月轮换。',
    members: [
      mkMember('A1004', '审计组长', '负责跟踪审计总体协调与阶段意见签发', ['总体协调']),
      mkMember('A1014', '主审', '负责工程计量与变更签证审核', ['工程计量', '变更签证']),
      mkMember('A1013', '审计员', '负责招投标与合同管理审计', ['招投标', '合同管理']),
      mkMember('A1009', '审计员', '负责BIM模型与进度数据比对', ['数据分析']),
      mkMember('A1010', '资料员', '负责阶段审计资料归档', ['资料归档']),
      mkMember('A1016', '廉政监督员', '负责驻场期间纪律监督', ['廉政监督']),
    ],
  },
  {
    id: 'G2026005',
    name: '义务教育补助资金绩效审计组',
    projectId: 'P2026003',
    projectName: '城乡义务教育补助专项资金绩效审计',
    leaderId: 'A1006',
    leaderName: '孙雅芳',
    memberCount: 5,
    establishDate: '2026-01-08',
    planEndDate: '2026-04-20',
    status: '已成立',
    location: '市教育局 5楼',
    members: [
      mkMember('A1006', '审计组长', '负责绩效评价指标体系设计与报告', ['绩效评价']),
      mkMember('A1018', '主审', '负责资金拨付与使用效益分析', ['资金效益']),
      mkMember('A1015', '审计员', '负责学生资助数据核查与抽样', ['数据核查']),
      mkMember('A1005', '复核员', '负责底稿复核', ['底稿复核'], false),
      mkMember('A1010', '资料员', '负责资料归档', ['资料归档']),
    ],
  },
  {
    id: 'G2026006',
    name: '市一院财务收支审计组',
    projectId: 'P2026005',
    projectName: '市第一人民医院2025年度财务收支审计',
    leaderId: 'A1017',
    leaderName: '罗秀英',
    memberCount: 4,
    establishDate: '2025-10-25',
    planEndDate: '2026-01-20',
    status: '已撤离',
    location: '市第一人民医院行政楼',
    members: [
      mkMember('A1017', '审计组长', '负责总体组织与整改跟踪', ['整改跟踪']),
      mkMember('A1008', '主审', '负责医疗服务收费审计', ['医疗收费']),
      mkMember('A1013', '审计员', '负责药品与耗材采购审计', ['药品耗材']),
      mkMember('A1012', '复核员', '负责报告复核', ['报告复核'], false),
    ],
  },
];

/* ============================ 工作文件 ============================ */

const DOC_TEMPLATES: Record<DocCategory, string[]> = {
  审计方案类: ['审计实施方案', '审计工作方案', '审计调查方案', '方案调整审批表'],
  审计通知类: ['审计通知书', '审计取证通知书', '延伸审计通知书', '审计承诺书'],
  取证与底稿类: ['审计工作底稿', '审计取证单', '审计事项确认单', '审计抽样记录'],
  审计证据类: ['证据材料清单', '询问笔录', '函证回函', '现场勘查记录'],
  审计报告类: ['审计报告（征求意见稿）', '审计报告', '审计决定书', '审计移送处理书'],
  整改与移送类: ['审计整改通知书', '整改情况反馈表', '问题线索移送书', '整改销号确认表'],
  廉政与纪律类: ['审计组廉政承诺书', '廉政纪律执行情况报告', '审计"八不准"告知书'],
  内部管理类: ['审计组会议纪要', '工作日志', '考勤登记表', '资料交接单'],
};

export const docTemplates = DOC_TEMPLATES;

export const docCategories: DocCategory[] = [
  '审计方案类',
  '审计通知类',
  '取证与底稿类',
  '审计证据类',
  '审计报告类',
  '整改与移送类',
  '廉政与纪律类',
  '内部管理类',
];

let docSeq = 0;
function mkDoc(
  category: DocCategory,
  template: string,
  title: string,
  projectId: string,
  author: string,
  status: AuditDocument['status'],
  extra: Partial<AuditDocument> = {},
): AuditDocument {
  const project = projects.find((p) => p.id === projectId);
  docSeq += 1;
  return {
    id: `D${String(60000 + docSeq)}`,
    code: `${project?.code.replace(/[〔〕]/g, '') ?? 'DOC'}-${String(docSeq).padStart(3, '0')}`,
    title,
    category,
    template,
    projectId,
    projectName: project?.name ?? '',
    groupId: extra.groupId,
    groupName: extra.groupName,
    status,
    secretLevel: extra.secretLevel ?? '内部',
    authorId: seedAuditorMap[author]?.id ?? author,
    authorName: seedAuditorMap[author]?.name ?? author,
    reviewerName: extra.reviewerName,
    version: extra.version ?? 'V1.0',
    createdAt: extra.createdAt ?? '2026-03-05 09:30',
    updatedAt: extra.updatedAt ?? '2026-03-12 17:20',
    pages: extra.pages ?? 3,
    attachmentCount: extra.attachmentCount ?? 0,
    refCodes: extra.refCodes ?? [],
    remark: extra.remark,
  };
}

export const documents: AuditDocument[] = [
  mkDoc('审计方案类', '审计实施方案', '2025年度市级部门预算执行审计实施方案', 'P2026001', 'A1002', '已签发', {
    groupId: 'G2026001',
    groupName: '市交通运输局预算执行审计组',
    version: 'V2.1',
    pages: 18,
    attachmentCount: 3,
    reviewerName: '陈志远',
    secretLevel: '内部',
  }),
  mkDoc('审计方案类', '审计工作方案', '轨道交通3号线跟踪审计年度工作方案', 'P2026004', 'A1004', '已复核', {
    version: 'V1.3',
    pages: 12,
    reviewerName: '刘振华',
  }),
  mkDoc('审计通知类', '审计通知书', '关于对市交通运输局开展预算执行审计的通知', 'P2026001', 'A1001', '已签发', {
    pages: 2,
    secretLevel: '内部',
  }),
  mkDoc('审计通知类', '审计承诺书', '市交通运输局审计承诺书（被审计单位）', 'P2026001', 'A1001', '已归档', {
    pages: 1,
    attachmentCount: 1,
  }),
  mkDoc('取证与底稿类', '审计工作底稿', '底稿-A01 部门预算编制完整性核查', 'P2026001', 'A1005', '已复核', {
    groupId: 'G2026001',
    groupName: '市交通运输局预算执行审计组',
    pages: 6,
    refCodes: ['QZ-001', 'QZ-002'],
    reviewerName: '刘振华',
  }),
  mkDoc('取证与底稿类', '审计取证单', '取证单-QZ003 关于超预算支出会议费的取证', 'P2026001', 'A1010', '待复核', {
    pages: 4,
    attachmentCount: 7,
    refCodes: ['底稿-A07'],
  }),
  mkDoc('审计证据类', '询问笔录', '询问笔录-财务科负责人 关于专项资金使用', 'P2026001', 'A1006', '复核中', {
    pages: 3,
    reviewerName: '刘振华',
  }),
  mkDoc('审计证据类', '现场勘查记录', '现场勘查记录-固定资产盘点（车辆）', 'P2026001', 'A1016', '草稿', {
    pages: 2,
    attachmentCount: 5,
  }),
  mkDoc('审计报告类', '审计报告（征求意见稿）', '经济责任审计报告（征求意见稿）', 'P2026002', 'A1002', '待复核', {
    pages: 26,
    secretLevel: '秘密',
    reviewerName: '陈志远',
  }),
  mkDoc('审计报告类', '审计报告', '市第一人民医院财务收支审计报告', 'P2026005', 'A1008', '已签发', {
    pages: 22,
    secretLevel: '内部',
    version: 'V3.0',
    reviewerName: '罗秀英',
  }),
  mkDoc('整改与移送类', '审计整改通知书', '关于市第一人民医院审计发现问题整改的通知', 'P2026005', 'A1017', '已签发', {
    pages: 3,
  }),
  mkDoc('整改与移送类', '问题线索移送书', '关于涉嫌违规招投标问题线索的移送书', 'P2026004', 'A1004', '已签发', {
    pages: 5,
    secretLevel: '秘密',
  }),
  mkDoc('廉政与纪律类', '审计组廉政承诺书', '审计组廉政承诺书（2026年度）', 'P2026001', 'A1008', '已归档', {
    pages: 1,
  }),
  mkDoc('廉政与纪律类', '廉政纪律执行情况报告', '第三审计组廉政纪律执行情况中期报告', 'P2026002', 'A1007', '已复核', {
    pages: 4,
    reviewerName: '马俊峰',
  }),
  mkDoc('内部管理类', '审计组会议纪要', '审计组第一次业务会议纪要', 'P2026001', 'A1005', '已归档', {
    pages: 3,
  }),
  mkDoc('内部管理类', '工作日志', '审计组工作日志（2026年3月第2周）', 'P2026004', 'A1015', '草稿', {
    pages: 2,
  }),
  mkDoc('取证与底稿类', '审计工作底稿', '底稿-B02 工程变更签证合规性核查', 'P2026004', 'A1014', '已复核', {
    pages: 8,
    refCodes: ['QZ-201', 'QZ-202'],
    reviewerName: '赵慧敏',
  }),
  mkDoc('审计证据类', '函证回函', '银行询证函回函（中信银行分行营业部）', 'P2026002', 'A1018', '已复核', {
    pages: 2,
    attachmentCount: 2,
  }),
  mkDoc('审计方案类', '审计调查方案', '市级机关运行经费专项审计调查方案', 'P2026008', 'A1008', '已签发', {
    pages: 10,
  }),
  mkDoc('审计报告类', '审计决定书', '关于追回违规发放津贴补贴的审计决定', 'P2026005', 'A1017', '已归档', {
    pages: 4,
    secretLevel: '内部',
  }),
  mkDoc('审计通知类', '延伸审计通知书', '关于延伸审计市公路事业发展中心的通知', 'P2026001', 'A1003', '已签发', {
    pages: 2,
  }),
  mkDoc('内部管理类', '资料交接单', '涉密资料交接单（第3批）', 'P2026002', 'A1015', '已归档', {
    pages: 1,
    secretLevel: '秘密',
  }),
];

export const docVersions: DocVersion[] = [
  { version: 'V2.1', operator: '李文静', time: '2026-03-12 17:20', action: '修订', comment: '根据局务会意见调整审计重点' },
  { version: 'V2.0', operator: '李文静', time: '2026-03-04 10:02', action: '修订', comment: '补充数据分析事项' },
  { version: 'V1.1', operator: '刘振华', time: '2026-02-26 15:40', action: '复核', comment: '建议细化抽样方法' },
  { version: 'V1.0', operator: '李文静', time: '2026-02-22 09:15', action: '创建', comment: '' },
];

/* ============================ 待办 ============================ */

export const todos: TodoItem[] = [
  { id: 'T1', title: '复核《取证单-QZ003 关于超预算支出会议费的取证》', type: '待复核', deadline: '2026-03-22', projectName: '2025年度市级部门预算执行及决算草案审计', owner: '刘振华', level: '高' },
  { id: 'T2', title: '提交审计组本周工作日志与进度报表', type: '到期提醒', deadline: '2026-03-21', projectName: '城市轨道交通3号线一期工程跟踪审计', owner: '杨舒涵', level: '中' },
  { id: 'T3', title: '完成《经济责任审计报告（征求意见稿）》内部复核', type: '待复核', deadline: '2026-03-25', projectName: '市城投集团原董事长任期经济责任审计', owner: '陈志远', level: '高' },
  { id: 'T4', title: '催办市教育局补充绩效评价佐证材料', type: '催办', deadline: '2026-03-19', projectName: '城乡义务教育补助专项资金绩效审计', owner: '孙雅芳', level: '高' },
  { id: 'T5', title: '编制市金融控股集团审计组组建方案', type: '待办', deadline: '2026-03-28', projectName: '市属小额贷款公司合规经营专项审计', owner: '周立新', level: '中' },
  { id: 'T6', title: '整理第一人民医院整改销号材料', type: '待办', deadline: '2026-03-30', projectName: '市第一人民医院2025年度财务收支审计', owner: '罗秀英', level: '低' },
];

/* ============================ 审计事项 / 分工事项库 ============================ */

export const auditItemsByType: Record<string, string[]> = {
  预算执行审计: ['部门预算编制', '预算执行进度', '专项资金结转结余', '政府采购', '三公经费', '决算草案', '非税收入'],
  经济责任审计: ['重大经济决策', '财务收支真实性', '国有资产管理', '债务风险', '廉洁从业', '任期目标完成'],
  专项资金审计: ['资金拨付及时性', '资金使用合规性', '项目绩效', '配套资金落实', '受益对象认定'],
  财务收支审计: ['收入完整性', '支出合规性', '资产管理', '往来款项', '会计核算'],
  绩效审计: ['绩效目标设定', '指标完成度', '投入产出比', '社会效益', '可持续性'],
  合规审计: ['资质合规', '业务合规', '内控健全性', '风险敞口', '监管报送'],
  跟踪审计: ['工程计量支付', '变更签证', '招投标合规', '合同履约', '资金到位'],
};

export const allRoles: GroupRole[] = [
  '审计组长',
  '副组长',
  '主审',
  '审计员',
  '复核员',
  '廉政监督员',
  '资料员',
  '外部专家',
];

export const roleOptions = allRoles.map((r) => ({ label: r, value: r }));

/** 当前登录用户（审计组视角） */
export const currentUser = {
  id: 'A1001',
  name: '陈志远',
  title: '财政审计一处 处长',
  role: '审计组长',
  department: '财政审计一处',
};
