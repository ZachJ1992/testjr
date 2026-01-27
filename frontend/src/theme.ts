/**
 * 登途云 - Ant Design 主题配置
 * 基于 ui-ux-pro-max 生成的设计系统
 * 
 * 色彩方案: Fresh Cyan + Clean Green
 * 风格: Data-Dense Dashboard (企业级数据密集型仪表盘)
 * 字体: 使用系统默认中文字体保证兼容性
 */

import type { ThemeConfig } from 'antd';

// 设计系统色彩
export const designColors = {
  // 主色 - 清新的青色，代表专业、可信
  primary: '#0891B2',
  primaryHover: '#0E7490',
  primaryActive: '#155E75',
  
  // 辅助色 - 更亮的青色，用于次要元素
  secondary: '#22D3EE',
  
  // CTA/强调色 - 绿色，代表积极、收益
  success: '#22C55E',
  successHover: '#16A34A',
  
  // 警告色
  warning: '#F59E0B',
  warningHover: '#D97706',
  
  // 错误色
  error: '#EF4444',
  errorHover: '#DC2626',
  
  // 信息色
  info: '#3B82F6',
  
  // 背景色
  bgPrimary: '#F8FAFC',      // 主背景 - 非常浅的灰蓝
  bgSecondary: '#F1F5F9',    // 次级背景
  bgCard: '#FFFFFF',         // 卡片背景
  bgSider: '#0F172A',        // 侧边栏深色背景
  bgHeader: '#FFFFFF',       // 头部白色背景
  
  // 文字色
  textPrimary: '#0F172A',    // 主文字 - 深色
  textSecondary: '#475569',  // 次要文字
  textTertiary: '#94A3B8',   // 辅助文字
  textLight: '#F8FAFC',      // 浅色文字（深色背景用）
  
  // 边框色
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  
  // 分割线
  divider: '#E2E8F0',
};

// Ant Design 主题配置
export const antdTheme: ThemeConfig = {
  token: {
    // 品牌色
    colorPrimary: designColors.primary,
    colorSuccess: designColors.success,
    colorWarning: designColors.warning,
    colorError: designColors.error,
    colorInfo: designColors.info,
    
    // 背景色
    colorBgContainer: designColors.bgCard,
    colorBgLayout: designColors.bgPrimary,
    colorBgElevated: designColors.bgCard,
    
    // 文字色
    colorText: designColors.textPrimary,
    colorTextSecondary: designColors.textSecondary,
    colorTextTertiary: designColors.textTertiary,
    
    // 边框
    colorBorder: designColors.border,
    colorBorderSecondary: designColors.borderLight,
    
    // 圆角 - 适度的圆角保持专业感
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    
    // 字体
    fontFamily: `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif`,
    fontSize: 14,
    
    // 阴影
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
    boxShadowSecondary: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
    
    // 动画
    motionDurationSlow: '0.3s',
    motionDurationMid: '0.2s',
    motionDurationFast: '0.1s',
    
    // 控件高度
    controlHeight: 36,
    controlHeightLG: 44,
    controlHeightSM: 28,
  },
  
  components: {
    // 布局
    Layout: {
      siderBg: designColors.bgSider,
      headerBg: designColors.bgHeader,
      bodyBg: designColors.bgPrimary,
      headerHeight: 56,
      headerPadding: '0 24px',
    },
    
    // 菜单
    Menu: {
      darkItemBg: designColors.bgSider,
      darkSubMenuItemBg: 'rgba(0, 0, 0, 0.2)',
      darkItemSelectedBg: designColors.primary,
      darkItemHoverBg: 'rgba(255, 255, 255, 0.08)',
      darkItemColor: 'rgba(255, 255, 255, 0.85)',
      darkItemSelectedColor: '#FFFFFF',
      itemHeight: 44,
      subMenuItemBorderRadius: 6,
      itemBorderRadius: 6,
      iconSize: 16,
      collapsedIconSize: 18,
    },
    
    // 卡片
    Card: {
      paddingLG: 20,
      borderRadiusLG: 8,
      boxShadowTertiary: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    },
    
    // 表格
    Table: {
      headerBg: '#FAFAFA',
      headerColor: designColors.textSecondary,
      rowHoverBg: '#F8FAFC',
      borderColor: designColors.borderLight,
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
      headerBorderRadius: 8,
    },
    
    // 按钮
    Button: {
      borderRadius: 6,
      controlHeight: 36,
      paddingInline: 16,
      fontWeight: 500,
    },
    
    // 输入框
    Input: {
      borderRadius: 6,
      controlHeight: 36,
      paddingInline: 12,
    },
    
    // 选择器
    Select: {
      borderRadius: 6,
      controlHeight: 36,
    },
    
    // 日期选择器
    DatePicker: {
      borderRadius: 6,
      controlHeight: 36,
    },
    
    // 标签页
    Tabs: {
      cardBg: '#FAFAFA',
      itemActiveColor: designColors.primary,
      itemHoverColor: designColors.primary,
      inkBarColor: designColors.primary,
    },
    
    // 标签
    Tag: {
      borderRadiusSM: 4,
    },
    
    // 徽标
    Badge: {
      colorBgContainer: designColors.error,
    },
    
    // 统计
    Statistic: {
      contentFontSize: 28,
      titleFontSize: 14,
    },
    
    // 弹窗
    Modal: {
      borderRadiusLG: 12,
      paddingLG: 24,
      headerBg: '#FFFFFF',
      titleFontSize: 18,
    },
    
    // 抽屉
    Drawer: {
      paddingLG: 24,
    },
    
    // 消息提示
    Message: {
      borderRadiusLG: 8,
    },
    
    // 通知
    Notification: {
      borderRadiusLG: 8,
    },
    
    // 描述列表
    Descriptions: {
      labelBg: '#FAFAFA',
      contentColor: designColors.textPrimary,
      titleColor: designColors.textPrimary,
    },
    
    // 分割线
    Divider: {
      colorSplit: designColors.divider,
    },
    
    // 面包屑
    Breadcrumb: {
      itemColor: designColors.textTertiary,
      lastItemColor: designColors.textPrimary,
      linkColor: designColors.textSecondary,
      linkHoverColor: designColors.primary,
    },
    
    // 分页
    Pagination: {
      borderRadius: 6,
      itemActiveBg: designColors.primary,
    },
    
    // 步骤条
    Steps: {
      colorPrimary: designColors.primary,
    },
    
    // 进度条
    Progress: {
      defaultColor: designColors.primary,
    },
    
    // 开关
    Switch: {
      colorPrimary: designColors.success,
    },
    
    // 警告提示
    Alert: {
      borderRadiusLG: 8,
    },
  },
};

// 导出侧边栏样式常量
export const siderStyles = {
  background: designColors.bgSider,
  width: 240,
  collapsedWidth: 80,
};

// 导出 header 样式常量
export const headerStyles = {
  background: designColors.bgHeader,
  height: 56,
  borderBottom: `1px solid ${designColors.border}`,
};

export default antdTheme;
