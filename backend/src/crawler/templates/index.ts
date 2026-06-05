/**
 * 爬虫模板索引
 * 
 * 自动加载所有爬虫模板
 * 新增模板时，只需在此处添加 import 即可
 */

// 导入所有模板（导入时会自动注册）
import './zo-cloud.js';
import './zo-cloud-orders.js';
import './yaoqianshu.js';
import './qqt-linyi.js';
import './dszny-jinluo.js';

// 导出模板注册表相关功能
export { 
  crawlerTemplates, 
  getCrawlerTemplate, 
  getAllTemplatesMeta,
  getAllTemplateIds,
  registerCrawlerTemplate,
  commonLoginFields,
} from '../crawler-templates.js';

export type {
  CrawlerTemplate,
  CrawlerTemplateMeta,
  CrawlerRuntimeConfig,
  WaybillData,
  SyncResult,
  FieldConfig,
} from '../crawler-templates.js';

console.log('[CrawlerTemplates] 爬虫模板加载完成');
