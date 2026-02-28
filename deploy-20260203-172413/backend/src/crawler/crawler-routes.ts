import { Router } from "express";
import { authenticate, requirePermissions } from "../auth.js";
import {
  getCrawlerConfigs,
  getCrawlerConfigById,
  createCrawlerConfig,
  updateCrawlerConfig,
  deleteCrawlerConfig,
  getCrawlerSyncLogs,
} from "./crawler-store.js";
import { testConnection, triggerSync } from "./crawler-service.js";
import { syncWithPuppeteer, testPuppeteerConnection } from "./puppeteer-crawler.js";
import type { CrawlerConfig, TestConnectionResult, SyncResult } from "./crawler-types.js";

const router = Router();

// ==================== 爬虫配置管理 ====================

// 获取配置列表
router.get("/crawlers", authenticate, async (req, res) => {
  try {
    const financierId = req.query.financierId as string | undefined;
    const configs = await getCrawlerConfigs(financierId);
    res.json(configs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 获取单个配置
router.get("/crawlers/:id", authenticate, async (req, res) => {
  try {
    const config = await getCrawlerConfigById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: "配置不存在" });
    }
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 创建配置
router.post("/crawlers", authenticate, async (req, res) => {
  try {
    const input = req.body;
    
    // 验证必填字段
    if (!input.financierId || !input.name || !input.systemUrl || !input.apiEndpoint || !input.cookies) {
      return res.status(400).json({ error: "缺少必填字段" });
    }

    const config = await createCrawlerConfig({
      financierId: input.financierId,
      name: input.name,
      systemUrl: input.systemUrl,
      apiEndpoint: input.apiEndpoint,
      cookies: input.cookies,
      companyId: input.companyId,
      userId: input.userId,
      groupId: input.groupId,
      extraParams: input.extraParams,
      syncEnabled: input.syncEnabled ?? true,
      syncIntervalMinutes: input.syncIntervalMinutes ?? 60,
    });

    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 更新配置
router.put("/crawlers/:id", authenticate, async (req, res) => {
  try {
    const config = await updateCrawlerConfig(req.params.id, req.body);
    res.json(config);
  } catch (err: any) {
    if (err.message === "爬虫配置不存在") {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// 删除配置
router.delete("/crawlers/:id", authenticate, async (req, res) => {
  try {
    await deleteCrawlerConfig(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    if (err.message === "爬虫配置不存在") {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// ==================== 测试连接 ====================

// 测试配置连接
router.post("/crawlers/test", authenticate, async (req, res) => {
  try {
    const { systemUrl, apiEndpoint, cookies, companyId, userId, groupId } = req.body;

    if (!systemUrl || !apiEndpoint || !cookies) {
      return res.status(400).json({ error: "缺少必填字段" });
    }

    // 调用爬虫服务测试连接
    const result = await testConnection({
      systemUrl,
      apiEndpoint,
      cookies,
      companyId,
      userId,
      groupId,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

// 测试已有配置的连接
router.post("/crawlers/:id/test", authenticate, async (req, res) => {
  try {
    const config = await getCrawlerConfigById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: "配置不存在" });
    }

    // 调用爬虫服务测试连接
    const result = await testConnection(config);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

// ==================== 同步操作 ====================

// 手动触发同步
router.post("/crawlers/:id/sync", authenticate, async (req, res) => {
  try {
    const config = await getCrawlerConfigById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: "配置不存在" });
    }

    // 调用爬虫服务执行同步（异步执行，立即返回）
    // 为了防止请求超时，同步在后台执行
    triggerSync(config.id).catch(err => {
      console.error(`[Crawler] 后台同步失败:`, err.message);
    });

    res.json({ 
      success: true,
      message: "同步任务已启动，请稍后查看结果",
      configId: config.id,
    });
  } catch (err: any) {
    res.status(500).json({ 
      success: false,
      message: err.message,
    });
  }
});

// Puppeteer 同步（使用浏览器自动化）
router.post("/crawlers/:id/sync-puppeteer", authenticate, async (req, res) => {
  try {
    const config = await getCrawlerConfigById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: "配置不存在" });
    }

    const maxPages = parseInt(req.query.maxPages as string) || 150;

    // 异步执行同步，立即返回
    syncWithPuppeteer(config.id, maxPages).catch(err => {
      console.error(`[Crawler] Puppeteer同步失败:`, err.message);
    });

    res.json({ 
      success: true,
      message: "Puppeteer同步任务已启动，请稍后查看结果",
      configId: config.id,
    });
  } catch (err: any) {
    res.status(500).json({ 
      success: false,
      message: err.message,
    });
  }
});

// Puppeteer 测试连接
router.post("/crawlers/:id/test-puppeteer", authenticate, async (req, res) => {
  try {
    const config = await getCrawlerConfigById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: "配置不存在" });
    }

    const result = await testPuppeteerConnection(config.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

// ==================== 同步日志 ====================

// 获取同步日志
router.get("/crawlers/:id/logs", authenticate, async (req, res) => {
  try {
    const config = await getCrawlerConfigById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: "配置不存在" });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await getCrawlerSyncLogs(req.params.id, limit);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
