/** 业务字典：下拉选项统一入库，由「系统设置 → 字典与模板配置」维护 */

/** 字典分类（与 Rust 侧 dict.rs 中的 category 对应） */
export type DictCategory =
  | 'department'
  | 'title'
  | 'role'
  | 'audit_type'
  | 'unit_nature'
  | 'project_level'
  | 'project_status'
  | 'audit_item'
  | 'group_status'
  | 'doc_category'
  | 'doc_status'
  | 'secret_level'
  | 'doc_template';

export interface DictItem {
  id: string;
  category: DictCategory | string;
  /** 上级值：模板挂在文件类别下、审计事项挂在审计类型下；一级字典为空串 */
  parent: string;
  label: string;
  /** 备注：如模板说明 */
  remark: string;
  sortOrder: number;
  enabled: boolean;
  builtin: boolean;
}

/** 各分类的中文名与二级归属说明，供配置页渲染 */
export const DICT_CATEGORY_META: Record<
  string,
  { label: string; parent?: DictCategory; parentLabel?: string; hint: string }
> = {
  department: { label: '所属部门', hint: '新建账户、人员信息中的部门下拉项' },
  title: { label: '职务', hint: '新建账户、人员信息中的职务下拉项' },
  role: { label: '审计组角色', hint: '组长/主审/审计员等组内角色，直接影响页面权限' },
  audit_type: { label: '审计类型', hint: '审计项目的业务类型' },
  unit_nature: { label: '被审计单位性质', hint: '立项登记时选择' },
  project_level: { label: '项目级别', hint: '一级 / 二级 / 三级' },
  project_status: { label: '项目状态', hint: '项目台账与筛选使用的状态' },
  group_status: { label: '审计组状态', hint: '审计组生命周期状态' },
  doc_category: { label: '文件类别', hint: '工作文件的八大类别，影响编写权限' },
  doc_status: { label: '文件状态', hint: '文件流转状态' },
  secret_level: { label: '密级', hint: '文件密级' },
  doc_template: {
    label: '文件模板',
    parent: 'doc_category',
    parentLabel: '所属文件类别',
    hint: '每个文件类别下的可用模板，新建文件时选择',
  },
  audit_item: {
    label: '审计事项',
    parent: 'audit_type',
    parentLabel: '所属审计类型',
    hint: '分工时分配给成员的审计事项，按审计类型分组',
  },
};

/** 配置页左侧分组顺序 */
export const DICT_GROUPS: { title: string; categories: string[] }[] = [
  { title: '人员与账户', categories: ['department', 'title', 'role'] },
  {
    title: '审计项目',
    categories: ['audit_type', 'unit_nature', 'project_level', 'project_status'],
  },
  { title: '审计事项', categories: ['audit_item'] },
  { title: '审计组', categories: ['group_status'] },
  {
    title: '工作文件',
    categories: ['doc_category', 'doc_template', 'doc_status', 'secret_level'],
  },
];
