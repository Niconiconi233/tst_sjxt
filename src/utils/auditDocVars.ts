/**
 * 审计文书占位符字段表与取值构建。
 *
 * 占位符在 Word 模板里写成 `${字段名}`（也接受 `{{字段名}}`），
 * 字段名就是这里 `DOC_VAR_DEFS` 的 key —— 保持中文，便于业务人员在 Word 里直接抄。
 *
 * 取值来源：
 * - 机构信息：系统设置 → 机构与人员（`app_settings` 的 org.name / org.code）
 * - 审计项目：项目台账
 * - 审计组：组建时填写的信息与成员分工
 * - 文书信息：生成时填写的标题、文号、发文日期
 */
import dayjs from 'dayjs';
import type { AuditProject, GroupMember } from '@/types';

export type DocVarGroup = '机构信息' | '审计项目' | '审计组' | '文书信息';

export interface DocVarDef {
  key: string;
  label: string;
  group: DocVarGroup;
  desc: string;
  sample: string;
}

/** 全部可用占位符（顺序即说明弹窗里的展示顺序） */
export const DOC_VAR_DEFS: DocVarDef[] = [
  // ---------------- 机构信息 ----------------
  {
    key: '机关名称',
    label: '审计机关名称',
    group: '机构信息',
    desc: '系统设置 → 机构与人员中维护，用于落款',
    sample: '××市审计局',
  },
  {
    key: '机构代码',
    label: '机构代码',
    group: '机构信息',
    desc: '系统设置中维护的机构代码 / 统一社会信用代码',
    sample: '11330100000000000X',
  },
  // ---------------- 审计项目 ----------------
  {
    key: '项目名称',
    label: '项目名称',
    group: '审计项目',
    desc: '项目台账中的项目全称',
    sample: '2026年市交通运输局预算执行审计',
  },
  { key: '项目编码', label: '项目编码', group: '审计项目', desc: '项目编号', sample: 'P2026001' },
  {
    key: '被审计单位',
    label: '被审计单位',
    group: '审计项目',
    desc: '通知书的主送单位',
    sample: '市交通运输局',
  },
  { key: '单位性质', label: '单位性质', group: '审计项目', desc: '行政机关 / 事业单位等', sample: '行政机关' },
  {
    key: '审计类型',
    label: '审计类型',
    group: '审计项目',
    desc: '预算执行审计 / 经济责任审计等',
    sample: '预算执行审计',
  },
  { key: '立项年度', label: '立项年度', group: '审计项目', desc: '形如「2026年」', sample: '2026年' },
  {
    key: '审计期间',
    label: '审计期间',
    group: '审计项目',
    desc: '审计所属期间，形如「2025年1月1日至2025年12月31日」',
    sample: '2025年1月1日至2025年12月31日',
  },
  {
    key: '审计期间起',
    label: '审计期间起',
    group: '审计项目',
    desc: '审计期间起始日（中文日期）',
    sample: '2025年1月1日',
  },
  {
    key: '审计期间止',
    label: '审计期间止',
    group: '审计项目',
    desc: '审计期间截止日（中文日期）',
    sample: '2025年12月31日',
  },
  {
    key: '现场审计期间',
    label: '现场审计期间',
    group: '审计项目',
    desc: '现场实施起止，形如「2026年3月1日至2026年4月30日」',
    sample: '2026年3月1日至2026年4月30日',
  },
  {
    key: '现场审计起',
    label: '现场审计起',
    group: '审计项目',
    desc: '现场审计开始日（中文日期）',
    sample: '2026年3月1日',
  },
  {
    key: '现场审计止',
    label: '现场审计止',
    group: '审计项目',
    desc: '现场审计结束日（中文日期）',
    sample: '2026年4月30日',
  },
  {
    key: '审计事项',
    label: '审计事项',
    group: '审计项目',
    desc: '组内成员负责审计事项的汇总（去重，顿号分隔）',
    sample: '预算编制与执行、财政财务收支、资产管理',
  },
  // ---------------- 审计组 ----------------
  {
    key: '审计组名称',
    label: '审计组名称',
    group: '审计组',
    desc: '组建时填写的组名',
    sample: '市交通运输局预算执行审计组',
  },
  {
    key: '审计组组长',
    label: '审计组组长',
    group: '审计组',
    desc: '核心岗位配置中的组长姓名',
    sample: '张建国',
  },
  { key: '副组长', label: '副组长', group: '审计组', desc: '未配置时为空', sample: '李慧' },
  { key: '主审', label: '主审', group: '审计组', desc: '未配置时为空', sample: '王海涛' },
  {
    key: '廉政监督员',
    label: '廉政监督员',
    group: '审计组',
    desc: '未配置时为空',
    sample: '陈立',
  },
  {
    key: '审计组成员',
    label: '审计组成员',
    group: '审计组',
    desc: '全部成员姓名，顿号分隔',
    sample: '张建国、李慧、王海涛、陈立',
  },
  {
    key: '成员人数',
    label: '成员人数',
    group: '审计组',
    desc: '仅数字，如需「4人」请在模板里写 ${成员人数}人',
    sample: '4',
  },
  {
    key: '成员分工',
    label: '成员分工',
    group: '审计组',
    desc: '每名成员一行：「姓名（角色）：分工」',
    sample: '张建国（审计组长）：全面负责审计组工作',
  },
  {
    key: '工作驻地',
    label: '工作驻地',
    group: '审计组',
    desc: '组建时填写的工作驻地',
    sample: '市交通运输局 3 楼会议室',
  },
  { key: '成立日期', label: '成立日期', group: '审计组', desc: '中文件日期', sample: '2026年3月1日' },
  {
    key: '计划撤离日期',
    label: '计划撤离日期',
    group: '审计组',
    desc: '中文件日期',
    sample: '2026年4月30日',
  },
  {
    key: '廉政纪律要求',
    label: '廉政纪律要求',
    group: '审计组',
    desc: '组建时填写的廉政与纪律要求全文',
    sample: '严格遵守审计"八不准"工作纪律……',
  },
  // ---------------- 文书信息 ----------------
  { key: '文件标题', label: '文件标题', group: '文书信息', desc: '生成时填写或自动生成的标题', sample: '关于对市交通运输局2025年度预算执行审计的通知' },
  { key: '文号', label: '文号', group: '文书信息', desc: '生成时填写的发文字号', sample: '审通〔2026〕015号' },
  { key: '发文日期', label: '发文日期', group: '文书信息', desc: '中文件日期', sample: '2026年10月27日' },
];

const VAR_LABEL: Record<string, DocVarDef> = Object.fromEntries(
  DOC_VAR_DEFS.map((d) => [d.key, d]),
);

export function varDefOf(key: string): DocVarDef | undefined {
  return VAR_LABEL[key];
}

/** `2025-01-01` → `2025年1月1日`；非法值原样返回，避免出现 Invalid Date */
export function cnDate(value?: string): string {
  if (!value) return '';
  const d = dayjs(value);
  return d.isValid() ? `${d.year()}年${d.month() + 1}月${d.date()}日` : value;
}

function span(from?: string, to?: string): string {
  const a = cnDate(from);
  const b = cnDate(to);
  if (a && b) return `${a}至${b}`;
  return a || b;
}

export interface AuditDocVarContext {
  org?: { name?: string; code?: string };
  project?: AuditProject | null;
  group?: {
    name?: string;
    members?: GroupMember[];
    location?: string;
    establishDate?: string;
    planEndDate?: string;
    disciplineNote?: string;
  };
  /** 文件标题 */
  title?: string;
  /** 发文字号 */
  docNo?: string;
  /** 发文日期（任意可被 dayjs 解析的字符串） */
  issueDate?: string;
}

/** 按上下文构建全部变量；取不到的字段返回空串（由界面提示手填） */
export function buildAuditDocVars(ctx: AuditDocVarContext): Record<string, string> {
  const p = ctx.project;
  const g = ctx.group ?? {};
  const members = g.members ?? [];
  const namesOf = (role: string) =>
    members
      .filter((m) => m.role === role)
      .map((m) => m.auditor?.name)
      .filter(Boolean)
      .join('、');

  const items: string[] = [];
  members.forEach((m) => {
    (m.responsibleItems ?? []).forEach((i) => {
      if (i && !items.includes(i)) items.push(i);
    });
  });

  const dutyLines = members
    .map((m) => {
      const name = m.auditor?.name ?? '';
      if (!name) return '';
      const role = m.role ? `（${m.role}）` : '';
      const duty = m.duty ? `：${m.duty}` : '';
      return `${name}${role}${duty}`;
    })
    .filter(Boolean);

  const periodYear = p?.periodStart ? dayjs(p.periodStart).year() : undefined;

  return {
    机关名称: ctx.org?.name ?? '',
    机构代码: ctx.org?.code ?? '',

    项目名称: p?.name ?? '',
    项目编码: p?.code ?? '',
    被审计单位: p?.auditedUnit ?? '',
    单位性质: p?.unitNature ?? '',
    审计类型: p?.auditType ?? '',
    立项年度: p?.year ? `${p.year}年` : periodYear ? `${periodYear}年` : '',
    审计期间: span(p?.periodStart, p?.periodEnd),
    审计期间起: cnDate(p?.periodStart),
    审计期间止: cnDate(p?.periodEnd),
    现场审计期间: span(p?.fieldStart, p?.fieldEnd),
    现场审计起: cnDate(p?.fieldStart),
    现场审计止: cnDate(p?.fieldEnd),
    审计事项: items.join('、'),

    审计组名称: g.name ?? '',
    审计组组长: namesOf('审计组长'),
    副组长: namesOf('副组长'),
    主审: namesOf('主审'),
    廉政监督员: namesOf('廉政监督员'),
    审计组成员: members.map((m) => m.auditor?.name).filter(Boolean).join('、'),
    成员人数: String(members.length),
    成员分工: dutyLines.join('\n'),
    工作驻地: g.location ?? '',
    成立日期: cnDate(g.establishDate),
    计划撤离日期: cnDate(g.planEndDate),
    廉政纪律要求: g.disciplineNote ?? '',

    文件标题: ctx.title ?? '',
    文号: ctx.docNo ?? '',
    发文日期: cnDate(ctx.issueDate),
  };
}

/** 给界面用：把「模板里检测到的字段」分成熟知 / 未知两类 */
export function splitDetectedVars(keys: string[]): { known: string[]; unknown: string[] } {
  const known: string[] = [];
  const unknown: string[] = [];
  keys.forEach((k) => (VAR_LABEL[k] ? known : unknown).push(k));
  return { known, unknown };
}
