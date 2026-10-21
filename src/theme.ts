import type { ThemeConfig } from 'antd';

/**
 * 政务 / 审计专业风主题
 * 主色取沉稳的政务蓝，信息密度偏高，控件尺寸紧凑，适配长时间办公与表格数据查看
 */
export const auditTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1a5fb4',
    colorInfo: '#1a5fb4',
    colorSuccess: '#1a7f4b',
    colorWarning: '#b7791f',
    colorError: '#b42318',
    colorBgLayout: '#f2f4f7',
    colorBgContainer: '#ffffff',
    colorTextBase: '#1f2933',
    borderRadius: 4,
    fontSize: 13,
    fontFamily:
      '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    controlHeight: 30,
    sizeStep: 3,
    wireframe: false,
    lineWidth: 1,
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      headerHeight: 52,
      headerPadding: '0 16px',
      bodyBg: '#f2f4f7',
      siderBg: '#12233c',
      footerBg: 'transparent',
      footerPadding: '8px 16px',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: '#0d1a2e',
      darkItemSelectedBg: '#1a5fb4',
      darkItemSelectedColor: '#ffffff',
      darkItemHoverBg: 'rgba(26,95,180,0.35)',
      darkItemColor: 'rgba(255,255,255,0.75)',
      itemHeight: 38,
      itemMarginInline: 8,
      itemBorderRadius: 4,
      collapsedWidth: 56,
    },
    Table: {
      headerBg: '#eef2f7',
      headerColor: '#1f2933',
      headerSplitColor: '#dfe4ea',
      rowHoverBg: '#f0f6ff',
      borderColor: '#e6e9ee',
      cellPaddingBlock: 8,
      cellPaddingInline: 12,
    },
    Card: {
      headerBg: '#fafbfc',
      headerFontSize: 14,
      paddingLG: 16,
    },
    Tabs: {
      horizontalItemPadding: '8px 0',
      titleFontSize: 13,
    },
    Button: {
      primaryShadow: 'none',
      defaultShadow: 'none',
      paddingInline: 12,
    },
    Statistic: {
      titleFontSize: 12,
      contentFontSize: 22,
    },
    Tag: {
      defaultBg: '#f0f4f9',
      defaultColor: '#41546b',
    },
    Descriptions: {
      labelBg: '#f7f9fb',
      titleMarginBottom: 8,
    },
    Modal: {
      titleFontSize: 15,
    },
    Steps: {
      iconSize: 26,
    },
  },
};

/** 业务色板：用于状态标签、图表等 */
export const bizColors = {
  primary: '#1a5fb4',
  primaryLight: '#e8f1fc',
  sider: '#12233c',
  success: '#1a7f4b',
  warning: '#b7791f',
  danger: '#b42318',
  info: '#41546b',
  neutral: '#8a94a6',
  border: '#e6e9ee',
  /** 状态映射 */
  projectStatus: {
    筹备中: '#8a94a6',
    实施中: '#1a5fb4',
    报告阶段: '#b7791f',
    整改跟踪: '#7a3fa8',
    已归档: '#1a7f4b',
  },
  docStatus: {
    草稿: '#8a94a6',
    待复核: '#b7791f',
    复核中: '#1a5fb4',
    已复核: '#0f7b8a',
    已签发: '#1a7f4b',
    已归档: '#41546b',
    被退回: '#b42318',
  },
} as const;
