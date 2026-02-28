/**
 * 爬虫模板注册表
 * 
 * 定义系统支持的所有爬虫模板，每个模板对应一种TMS系统品牌。
 * 新增TMS系统时，只需在此处注册新模板即可。
 */

import { Page } from 'puppeteer-core';

// ==================== 类型定义 ====================

/**
 * 配置字段定义 - 用于前端动态渲染表单
 */
export interface FieldConfig {
  key: string;              // 字段键名
  label: string;            // 显示标签
  type: 'text' | 'password' | 'number' | 'select';
  required: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  options?: { value: string; label: string }[]; // 用于 select 类型
}

/**
 * 爬虫配置参数（传递给模板的运行时配置）
 */
export interface CrawlerRuntimeConfig {
  id: string;               // 外部系统配置ID
  financierId: string;      // 融资方ID
  financierName?: string;   // 融资方名称
  systemId: string;         // 外部系统ID
  loginUrl: string;         // 登录地址
  companyId: string;        // 公司ID
  username: string;         // 用户名
  password: string;         // 密码
  [key: string]: any;       // 其他自定义参数
}

/**
 * 同步结果
 */
export interface SyncResult {
  success: boolean;
  totalFetched: number;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  error?: string;
}

/**
 * 运单数据（标准化格式）
 */
export interface WaybillData {
  waybillNumber: string;
  externalId?: string;
  senderName?: string;
  senderPhone?: string;
  senderAddress?: string;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  goodsName?: string;
  weight?: number;
  volume?: number;
  declaredValue?: number;
  freight?: number;
  
  // 费用字段 - 应收
  receivableTotal?: number;         // 应收总计
  receivableCash?: number;          // 现付（应收）
  receivableCollect?: number;       // 到付（应收）
  receivableMonthly?: number;       // 月结（应收）
  receivableReturn?: number;        // 回付（应收）
  receivableTransport?: number;     // 运费
  receivableOther?: number;         // 其他费用
  
  // 费用字段 - 应付
  payableTotal?: number;            // 应付总计
  payableCash?: number;             // 现付（应付）
  payableCollect?: number;          // 到付（应付）
  payableReturn?: number;           // 回付（应付）
  payableTransport?: number;        // 运费
  
  status?: string;
  remark?: string;
  createTime?: Date;
  shipTime?: Date;
  deliveryTime?: Date;
  [key: string]: any;
}

/**
 * 爬虫模板接口
 */
export interface CrawlerTemplate {
  id: string;                           // 模板ID（唯一标识）
  name: string;                         // 显示名称
  description: string;                  // 描述
  requiredFields: FieldConfig[];        // 所需配置字段
  
  /**
   * 登录到TMS系统
   * @param page Puppeteer页面对象
   * @param config 运行时配置
   * @returns 登录是否成功
   */
  login: (page: Page, config: CrawlerRuntimeConfig) => Promise<boolean>;
  
  /**
   * 从TMS系统获取数据
   * @param page Puppeteer页面对象
   * @param config 运行时配置
   * @param maxPages 最大页数
   * @returns 原始数据数组
   */
  fetchData: (page: Page, config: CrawlerRuntimeConfig, maxPages: number) => Promise<any[]>;
  
  /**
   * 将原始数据映射为标准运单格式
   * @param rawData 原始数据
   * @returns 标准化运单数据
   */
  mapFields: (rawData: any) => WaybillData;
}

/**
 * 模板元信息（用于前端展示，不包含实现函数）
 */
export interface CrawlerTemplateMeta {
  id: string;
  name: string;
  description: string;
  requiredFields: FieldConfig[];
}

// ==================== 模板注册表 ====================

/**
 * 已注册的爬虫模板
 * 新增TMS系统时，在此处添加模板
 */
export const crawlerTemplates: Record<string, CrawlerTemplate> = {};

/**
 * 注册爬虫模板
 */
export function registerCrawlerTemplate(template: CrawlerTemplate): void {
  if (crawlerTemplates[template.id]) {
    console.warn(`[CrawlerTemplates] 模板 ${template.id} 已存在，将被覆盖`);
  }
  crawlerTemplates[template.id] = template;
  console.log(`[CrawlerTemplates] 已注册模板: ${template.id} (${template.name})`);
}

/**
 * 获取模板
 */
export function getCrawlerTemplate(templateId: string): CrawlerTemplate | undefined {
  return crawlerTemplates[templateId];
}

/**
 * 获取所有模板元信息（用于前端展示）
 */
export function getAllTemplatesMeta(): CrawlerTemplateMeta[] {
  return Object.values(crawlerTemplates).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    requiredFields: t.requiredFields,
  }));
}

/**
 * 获取所有模板ID列表
 */
export function getAllTemplateIds(): string[] {
  return Object.keys(crawlerTemplates);
}

// ==================== 通用字段定义 ====================

/**
 * 通用登录字段（大多数TMS系统都需要这些字段）
 */
export const commonLoginFields: FieldConfig[] = [
  { 
    key: 'loginUrl', 
    label: '登录地址', 
    type: 'text', 
    required: true,
    placeholder: '例如: https://tms.example.com'
  },
  { 
    key: 'companyId', 
    label: '公司ID', 
    type: 'text', 
    required: true,
    placeholder: '在TMS系统中的公司标识'
  },
  { 
    key: 'username', 
    label: '用户名', 
    type: 'text', 
    required: true,
    placeholder: '登录用户名'
  },
  { 
    key: 'password', 
    label: '密码', 
    type: 'password', 
    required: true,
    placeholder: '登录密码'
  },
];
