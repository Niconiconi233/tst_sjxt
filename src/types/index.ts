/** 审计业务领域模型定义（UI 阶段，均为前端类型） */

/** 审计项目类型 */
export type AuditType =
  | '预算执行审计'
  | '经济责任审计'
  | '专项资金审计'
  | '财务收支审计'
  | '绩效审计'
  | '合规审计'
  | '跟踪审计';

/** 项目状态 */
export type ProjectStatus = '筹备中' | '实施中' | '报告阶段' | '整改跟踪' | '已归档';

/** 项目级别 */
export type ProjectLevel = '一级' | '二级' | '三级';

/** 审计组成员角色 */
export type GroupRole =
  | '审计组长'
  | '副组长'
  | '主审'
  | '审计员'
  | '复核员'
  | '廉政监督员'
  | '资料员'
  | '外部专家';

/** 人员 */
export interface Auditor {
  id: string;
  name: string;
  /** 工号 / 执法证号 */
  code: string;
  gender: '男' | '女';
  /** 所属部门 */
  department: string;
  /** 职务 */
  title: string;
  /** 专业技术资格 */
  qualification?: string;
  phone: string;
  email: string;
  /** 可担任角色 */
  capableRoles: GroupRole[];
  /** 当前在组项目数（占用情况） */
  busyProjects: number;
  avatarColor: string;
}

/** 审计组成员（含组内分工） */
export interface GroupMember {
  memberId: string;
  auditor: Auditor;
  role: GroupRole;
  /** 组内分工描述 */
  duty: string;
  /** 负责的审计事项 / 科目 */
  responsibleItems: string[];
  joinDate: string;
  /** 是否驻场 */
  onSite: boolean;
}

/** 审计组 */
export interface AuditGroup {
  id: string;
  /** 组名 */
  name: string;
  projectId: string;
  projectName: string;
  leaderId: string;
  leaderName: string;
  memberCount: number;
  /** 成立日期 */
  establishDate: string;
  /** 现场结束日期 */
  planEndDate: string;
  status: '组建中' | '已成立' | '现场实施' | '已撤离';
  /** 工作驻地 */
  location: string;
  /** 廉政纪律要求 */
  disciplineNote?: string;
  members: GroupMember[];
}

/** 审计项目 */
export interface AuditProject {
  id: string;
  code: string;
  name: string;
  /** 被审计单位 */
  auditedUnit: string;
  /** 被审计单位性质 */
  unitNature: string;
  auditType: AuditType;
  level: ProjectLevel;
  status: ProjectStatus;
  /** 立项年度 */
  year: number;
  /** 审计期间起 */
  periodStart: string;
  /** 审计期间止 */
  periodEnd: string;
  /** 现场开始 */
  fieldStart: string;
  /** 现场结束 */
  fieldEnd: string;
  /** 计划工作日报送期限 */
  budget?: number;
  /** 项目负责人（机关侧） */
  ownerName: string;
  ownerId: string;
  /** 进度百分比 */
  progress: number;
  /** 关联审计组数 */
  groupCount: number;
  /** 文件数 */
  docCount: number;
  /** 发现问题数 */
  issueCount: number;
  createdAt: string;
  remark?: string;
  tags: string[];
}

/** 工作文件类别 */
export type DocCategory =
  | '审计方案类'
  | '审计通知类'
  | '取证与底稿类'
  | '审计证据类'
  | '审计报告类'
  | '整改与移送类'
  | '廉政与纪律类'
  | '内部管理类';

/** 文件状态流转 */
export type DocStatus = '草稿' | '待复核' | '复核中' | '已复核' | '已签发' | '已归档' | '被退回';

/** 密级 */
export type SecretLevel = '公开' | '内部' | '秘密' | '机密';

/** 在线编辑器形态：表格（Excel 类）或文档（Word 类） */
export type DocEditorType = 'sheet' | 'document';

/** 审计工作文件 */
export interface AuditDocument {
  id: string;
  code: string;
  title: string;
  category: DocCategory;
  /** 模板名称 */
  template: string;
  /** 正文编辑形态，缺省按表格处理 */
  docType?: DocEditorType;
  /** 是否已存在正文内容（在线编辑器写过内容） */
  hasContent?: boolean;
  projectId: string;
  projectName: string;
  groupId?: string;
  groupName?: string;
  status: DocStatus;
  secretLevel: SecretLevel;
  authorId: string;
  authorName: string;
  /** 复核人 */
  reviewerName?: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  /** 页数 */
  pages: number;
  /** 附件数 */
  attachmentCount: number;
  /** 关联底稿/证据编号 */
  refCodes: string[];
  remark?: string;
}

/** 文件版本记录 */
export interface DocVersion {
  version: string;
  operator: string;
  time: string;
  action: string;
  comment?: string;
}

/** 待办事项 */
export interface TodoItem {
  id: string;
  title: string;
  type: '待办' | '待复核' | '催办' | '到期提醒';
  deadline: string;
  projectName: string;
  owner: string;
  level: '高' | '中' | '低';
}
