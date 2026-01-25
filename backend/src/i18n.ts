// 复用共享的i18n配置文件
// 注意：tsx 在运行时需要能够解析 .ts 文件，所以使用相对路径
import { defaultTranslations } from "../../shared/src/i18n-config.js";

// 使用共享的配置
const translations = defaultTranslations;

/**
 * 获取错误消息的i18n翻译
 */
export function getErrorMessage(key: string, lang: string = "zh-CN"): string {
  return translations[lang]?.[key] || translations["zh-CN"]?.[key] || key;
}

/**
 * 从请求中提取语言，支持header和query参数
 */
export function getLangFromRequest(req: { headers: any; query?: any }): string {
  // 优先从header获取
  const headerLang = req.headers["x-lang"] || req.headers["accept-language"];
  if (headerLang) {
    // 处理 "zh-CN" 或 "en-US" 格式
    if (headerLang.startsWith("zh")) return "zh-CN";
    if (headerLang.startsWith("en")) return "en-US";
  }
  
  // 从query参数获取
  const queryLang = req.query?.lang;
  if (queryLang === "zh-CN" || queryLang === "en-US") {
    return queryLang;
  }
  
  // 默认返回中文
  return "zh-CN";
}

