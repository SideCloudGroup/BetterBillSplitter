import type {ThemeConfig} from 'antd';
import {theme} from 'antd';

/** 品牌色：青绿，区别于 antd 默认蓝 */
export const brandPrimary = '#0d9488';
export const brandPrimaryHover = '#0f766e';

export const appTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: brandPrimary,
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorInfo: '#0284c7',
    colorLink: brandPrimary,
    colorLinkHover: brandPrimaryHover,
    borderRadius: 8,
    borderRadiusLG: 12,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    colorBgLayout: '#eef2f7',
    colorBgContainer: '#ffffff',
    colorBorderSecondary: '#e2e8f0',
    controlHeight: 36,
    controlHeightLG: 44,
    fontSize: 14,
    lineHeight: 1.5715,
    boxShadowTertiary: '0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 1px 3px 0 rgba(15, 23, 42, 0.08)',
  },
  components: {
    Button: {
      primaryShadow: '0 2px 0 rgba(13, 148, 136, 0.12)',
      defaultBorderColor: '#cbd5e1',
      defaultColor: '#334155',
      fontWeight: 500,
    },
    Card: {
      paddingLG: 20,
      headerFontSize: 15,
    },
    Menu: {
      itemBorderRadius: 8,
      itemMarginInline: 8,
      itemMarginBlock: 4,
      iconSize: 16,
    },
    Table: {
      headerBg: '#f8fafc',
      headerColor: '#475569',
      rowHoverBg: '#f0fdfa',
      borderColor: '#e2e8f0',
    },
    Layout: {
      headerBg: '#ffffff',
      bodyBg: '#eef2f7',
      siderBg: '#0f766e',
    },
    Input: {
      activeBorderColor: brandPrimary,
      hoverBorderColor: '#5eead4',
    },
    Select: {
      optionSelectedBg: '#ccfbf1',
    },
    Form: {
      labelColor: '#475569',
    },
    Typography: {
      titleMarginBottom: 0,
    },
  },
};

/** 侧栏深色菜单 */
export const siderMenuTheme = {
  darkItemBg: 'transparent',
  darkItemSelectedBg: 'rgba(255,255,255,0.16)',
  darkItemHoverBg: 'rgba(255,255,255,0.08)',
  darkItemColor: 'rgba(255,255,255,0.85)',
  darkItemSelectedColor: '#ffffff',
};
