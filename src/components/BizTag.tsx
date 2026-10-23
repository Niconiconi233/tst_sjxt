import { Avatar, Tag, Tooltip } from 'antd';
import type { Auditor, DocStatus, GroupRole, ProjectStatus, SecretLevel } from '@/types';
import { bizColors } from '@/theme';

/* ------------------------------ 项目状态 ------------------------------ */

export function ProjectStatusTag({ status }: { status: ProjectStatus }) {
  const color = bizColors.projectStatus[status] ?? bizColors.neutral;
  return (
    <Tag
      color={color}
      style={{ borderRadius: 2, marginInlineEnd: 0, fontSize: 12 }}
     
    >
      {status}
    </Tag>
  );
}

/* ------------------------------ 文件状态 ------------------------------ */

export function DocStatusTag({ status }: { status: DocStatus }) {
  const color = bizColors.docStatus[status] ?? bizColors.neutral;
  return (
    <Tag color={color} style={{ borderRadius: 2, marginInlineEnd: 0, fontSize: 12 }}>
      {status}
    </Tag>
  );
}

/* ------------------------------ 密级 ------------------------------ */

const SECRET_COLOR: Record<SecretLevel, string> = {
  公开: '#1a7f4b',
  内部: '#41546b',
  秘密: '#b7791f',
  机密: '#b42318',
};

export function SecretTag({ level }: { level: SecretLevel }) {
  return (
    <Tag
      color={SECRET_COLOR[level]}
     
      style={{ borderRadius: 2, marginInlineEnd: 0, fontSize: 12 }}
    >
      {level}
    </Tag>
  );
}

/* ------------------------------ 角色 ------------------------------ */

const ROLE_COLOR: Record<GroupRole, string> = {
  审计组长: '#1a5fb4',
  副组长: '#0f7b8a',
  主审: '#7a3fa8',
  审计员: '#41546b',
  复核员: '#b7791f',
  廉政监督员: '#b42318',
  资料员: '#1a7f4b',
  外部专家: '#8a94a6',
};

export function RoleTag({ role }: { role: GroupRole }) {
  return (
    <Tag color={ROLE_COLOR[role]} style={{ borderRadius: 2, marginInlineEnd: 0, fontSize: 12 }}>
      {role}
    </Tag>
  );
}

/* ------------------------------ 人员 ------------------------------ */

/** 名册中可能查不到对应人员（如已删除），此时渲染占位头像而不是崩页面 */
export function AuditorAvatar({ auditor, size = 28 }: { auditor?: Auditor; size?: number }) {
  if (!auditor) {
    return (
      <Avatar
        size={size}
        style={{ backgroundColor: '#c3ccd6', fontSize: size > 26 ? 13 : 11, flex: 'none' }}
      >
        ?
      </Avatar>
    );
  }
  return (
    <Avatar
      size={size}
      style={{ backgroundColor: auditor.avatarColor, fontSize: size > 26 ? 13 : 11, flex: 'none' }}
    >
      {auditor.name.slice(-2)}
    </Avatar>
  );
}

export function AuditorCell({
  auditor,
  showDept = true,
}: {
  auditor: Auditor;
  showDept?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <AuditorAvatar auditor={auditor} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#1f2933', lineHeight: 1.3 }}>
          {auditor.name}
          <span className="text-muted" style={{ marginLeft: 6, fontSize: 11 }}>
            {auditor.title}
          </span>
        </div>
        {showDept && (
          <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.3 }}>
            {auditor.department}
          </div>
        )}
      </div>
    </div>
  );
}

export function BusyTag({ count }: { count: number }) {
  const color = count === 0 ? '#1a7f4b' : count === 1 ? '#b7791f' : '#b42318';
  const text = count === 0 ? '空闲' : `在办 ${count} 项`;
  return (
    <Tooltip title={`当前参与 ${count} 个在办项目`}>
      <Tag color={color} style={{ borderRadius: 2, marginInlineEnd: 0, fontSize: 11 }}>
        {text}
      </Tag>
    </Tooltip>
  );
}
