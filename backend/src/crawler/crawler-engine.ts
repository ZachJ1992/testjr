/**
 * 爬虫引擎
 * 
 * 封装浏览器管理和模板调用逻辑
 * 提供统一的爬虫执行入口
 * 
 * 资源管理优化：
 * - 超时控制防止无限挂起
 * - 强制进程清理确保 Chrome 不残留
 * - 临时目录自动清理
 */

import puppeteer, { Browser, Page } from 'puppeteer-core';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { pool } from '../db.js';
import type { ExternalSystemConfig, CrawlerConfigParams } from '../types.js';
import type { CrawlerTemplate, CrawlerRuntimeConfig, SyncResult, WaybillData } from './crawler-templates.js';

// 爬虫执行超时时间（毫秒）
// 大数据量抓取需要较长时间，128000条数据约需15-20分钟
const CRAWLER_TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟
const BROWSER_CLOSE_TIMEOUT_MS = 10 * 1000; // 10 秒

// ==================== 浏览器路径查找 ====================
function findChromePath(): string | null {
  const possiblePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }
  return null;
}

// ==================== 临时目录管理 ====================
function createTempUserDataDir(): string {
  const tempDir = path.join(
    os.tmpdir(), 
    `crawler-engine-${Date.now()}-${randomUUID().substring(0, 6)}`
  );
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`[CrawlerEngine] 创建临时用户数据目录: ${tempDir}`);
  return tempDir;
}

function cleanupTempUserDataDir(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`[CrawlerEngine] 已清理临时目录: ${dirPath}`);
    }
  } catch (e: any) {
    console.log(`[CrawlerEngine] 清理临时目录失败: ${e.message}`);
  }
}

// ==================== 强制关闭浏览器 ====================
async function forceCloseBrowser(browser: Browser | null, tempDir: string): Promise<void> {
  if (!browser) return;
  
  // 获取浏览器进程信息
  let browserPid: number | undefined;
  try {
    const browserProcess = browser.process();
    browserPid = browserProcess?.pid;
  } catch (e) {
    // 忽略
  }
  
  // 尝试正常关闭
  try {
    const closePromise = browser.close();
    const timeoutPromise = new Promise<void>((_, reject) => 
      setTimeout(() => reject(new Error('Browser close timeout')), BROWSER_CLOSE_TIMEOUT_MS)
    );
    
    await Promise.race([closePromise, timeoutPromise]);
    console.log(`[CrawlerEngine] 浏览器已正常关闭`);
    return;
  } catch (e: any) {
    console.log(`[CrawlerEngine] 正常关闭浏览器失败: ${e.message}, 尝试强制终止`);
  }
  
  // 强制杀掉进程
  if (browserPid) {
    try {
      process.kill(browserPid, 'SIGKILL');
      console.log(`[CrawlerEngine] 已强制终止浏览器进程: ${browserPid}`);
    } catch (e: any) {
      console.log(`[CrawlerEngine] 终止进程失败: ${e.message}`);
    }
  }
  
  // 杀掉使用该临时目录的所有 Chrome 进程
  try {
    if (process.platform !== 'win32') {
      execSync(`pkill -9 -f "${tempDir}" 2>/dev/null || true`, { stdio: 'ignore' });
    }
  } catch (e) {
    // 忽略
  }
}

// ==================== 带超时的 Promise 包装 ====================
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${errorMsg} (超时 ${ms}ms)`));
    }, ms);
    
    promise
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ==================== 构建运行时配置 ====================
function buildRuntimeConfig(config: ExternalSystemConfig): CrawlerRuntimeConfig {
  const crawlerConfig = config.crawlerConfig || {};
  
  return {
    id: config.id,
    financierId: config.financierId,
    financierName: undefined, // 可以从数据库获取
    systemId: config.systemId,
    loginUrl: crawlerConfig.loginUrl || '',
    companyId: crawlerConfig.companyId || '',
    username: crawlerConfig.username || '',
    password: crawlerConfig.password || '',
    ...crawlerConfig,
  };
}

// ==================== 保存运单数据 ====================
async function saveWaybillData(
  waybill: WaybillData, 
  financierId: string
): Promise<{ inserted: boolean; updated: boolean }> {
  try {
    // 检查是否已存在
    const [existing] = await pool.query<any[]>(
      `SELECT id, receivable_total, payable_total, receivable_cash, receivable_collect, 
              receivable_return, monthly_cost, remark FROM waybills 
       WHERE waybill_number = ? AND deleted_at IS NULL`,
      [waybill.waybillNumber]
    );
    
    if (existing.length > 0) {
      // 检查是否需要更新（比较所有费用字段）
      const existingRow = existing[0];
      const needUpdate = 
        Math.abs((existingRow.receivable_total || 0) - (waybill.receivableTotal || 0)) > 0.01 ||
        Math.abs((existingRow.payable_total || 0) - (waybill.payableTotal || 0)) > 0.01 ||
        Math.abs((existingRow.receivable_cash || 0) - (waybill.receivableCash || 0)) > 0.01 ||
        Math.abs((existingRow.receivable_collect || 0) - (waybill.receivableCollect || 0)) > 0.01 ||
        Math.abs((existingRow.receivable_return || 0) - (waybill.receivableReturn || 0)) > 0.01 ||
        Math.abs((existingRow.monthly_cost || 0) - (waybill.receivableMonthly || 0)) > 0.01 ||
        (existingRow.remark || '') !== (waybill.remark || '');
      
      if (needUpdate) {
        await pool.query(
          `UPDATE waybills SET 
            receivable_total = ?,
            payable_total = ?,
            receivable_cash = ?,
            receivable_collect = ?,
            receivable_return = ?,
            monthly_cost = ?,
            receivable_transport = ?,
            remark = ?,
            updated_at = NOW()
           WHERE id = ?`,
          [
            waybill.receivableTotal || 0,
            waybill.payableTotal || 0,
            waybill.receivableCash || 0,
            waybill.receivableCollect || 0,
            waybill.receivableReturn || 0,
            waybill.receivableMonthly || 0,
            waybill.receivableTransport || 0,
            waybill.remark || '',
            existingRow.id,
          ]
        );
        return { inserted: false, updated: true };
      }
      
      return { inserted: false, updated: false };
    }
    
    // 插入新记录（包含所有费用字段）
    const id = randomUUID();
    await pool.query(
      `INSERT INTO waybills (
        id, waybill_number, customer_id, customer_name,
        driver_name, vehicle_plate, departure_place, arrival_place,
        freight_amount, receivable_total, payable_total,
        receivable_cash, receivable_collect, receivable_return, monthly_cost, receivable_transport,
        status, remark, waybill_date, business_mode, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        waybill.waybillNumber,
        financierId,
        '',
        waybill.driverName || '',
        waybill.vehiclePlate || '',
        waybill.departurePlace || waybill.senderAddress || '',
        waybill.arrivalPlace || waybill.receiverAddress || '',
        waybill.freight || 0,
        waybill.receivableTotal || 0,
        waybill.payableTotal || 0,
        waybill.receivableCash || 0,       // 现付
        waybill.receivableCollect || 0,    // 到付
        waybill.receivableReturn || 0,     // 回付
        waybill.receivableMonthly || 0,    // 月结
        waybill.receivableTransport || 0,  // 运费
        waybill.status || 'pending',
        waybill.remark || '',
        waybill.createTime ? new Date(waybill.createTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        'standard',  // business_mode 默认值
      ]
    );
    
    return { inserted: true, updated: false };
  } catch (error: any) {
    console.error(`[CrawlerEngine] 保存运单失败: ${waybill.waybillNumber}, ${error.message}`);
    return { inserted: false, updated: false };
  }
}

// ==================== 主执行函数 ====================
export async function runCrawlerWithTemplate(
  config: ExternalSystemConfig,
  template: CrawlerTemplate,
  maxPages: number = 150
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    totalFetched: 0,
    newCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
  };
  
  const runtimeConfig = buildRuntimeConfig(config);
  const templateId = template.id;
  const startTime = Date.now();
  
  console.log(`[CrawlerEngine] 开始执行爬虫模板: ${templateId}`);
  console.log(`[CrawlerEngine] 配置: 融资方=${runtimeConfig.financierId}, 登录地址=${runtimeConfig.loginUrl}`);
  console.log(`[CrawlerEngine] 超时设置: ${CRAWLER_TIMEOUT_MS / 1000} 秒`);
  
  // 查找 Chrome
  const chromePath = findChromePath();
  if (!chromePath) {
    result.error = '未找到 Chrome 浏览器';
    console.error(`[CrawlerEngine] ${result.error}`);
    return result;
  }
  
  // 创建临时目录
  const tempDir = createTempUserDataDir();
  let browser: Browser | null = null;
  
  // 超时处理器
  let timeoutReached = false;
  const timeoutHandler = setTimeout(() => {
    timeoutReached = true;
    console.error(`[CrawlerEngine] 爬虫执行超时 (${CRAWLER_TIMEOUT_MS / 1000}秒)，强制终止`);
  }, CRAWLER_TIMEOUT_MS);
  
  try {
    // 启动浏览器
    console.log(`[CrawlerEngine] 启动浏览器: ${chromePath}`);
    browser = await withTimeout(
      puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-blink-features=AutomationControlled',
          '--single-process',  // 减少子进程
        ],
        userDataDir: tempDir,
        timeout: 30000,  // 浏览器启动超时
      }),
      30000,
      '浏览器启动超时'
    );
    
    // 创建页面
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 设置超时
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);
    
    // 检查是否超时
    if (timeoutReached) throw new Error('爬虫执行超时');
    
    // 步骤1: 登录
    console.log(`[CrawlerEngine] 步骤1: 登录`);
    const loginSuccess = await withTimeout(
      template.login(page, runtimeConfig),
      120000,
      '登录超时'
    );
    
    if (!loginSuccess) {
      result.error = '登录失败';
      console.error(`[CrawlerEngine] ${result.error}`);
      return result;
    }
    
    console.log(`[CrawlerEngine] 登录成功`);
    
    // 检查是否超时
    if (timeoutReached) throw new Error('爬虫执行超时');
    
    // 步骤2: 获取数据
    console.log(`[CrawlerEngine] 步骤2: 获取数据`);
    let rawData: any[] = [];
    try {
      rawData = await withTimeout(
        template.fetchData(page, runtimeConfig, maxPages),
        CRAWLER_TIMEOUT_MS - (Date.now() - startTime) - 30000,  // 剩余时间减30秒
        '数据获取超时'
      );
      console.log(`[CrawlerEngine] fetchData 返回: ${rawData.length} 条数据`);
    } catch (fetchError: any) {
      console.error(`[CrawlerEngine] fetchData 异常: ${fetchError.message}`);
    }
    
    result.totalFetched = rawData.length;
    console.log(`[CrawlerEngine] 获取到 ${rawData.length} 条原始数据`);
    
    if (rawData.length === 0) {
      result.success = true;
      console.log(`[CrawlerEngine] 没有获取到数据，任务完成`);
      return result;
    }
    
    // 打印第一条数据用于调试
    if (rawData.length > 0) {
      // 打印完整的第一条数据用于调试费用字段
      const firstItem = rawData[0];
      console.log(`[CrawlerEngine] 第一条原始数据键: ${Object.keys(firstItem).join(', ')}`);
      console.log(`[CrawlerEngine] 第一条原始数据(前500字符): ${JSON.stringify(firstItem).substring(0, 500)}`);
      // 特别查找费用相关字段
      const feeFields = Object.entries(firstItem)
        .filter(([k, v]) => v !== null && v !== '' && typeof v === 'number' || 
                (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)))
        .slice(0, 20);
      console.log(`[CrawlerEngine] 数值型字段: ${JSON.stringify(Object.fromEntries(feeFields))}`);
    }
    
    // 步骤3: 字段映射和保存
    console.log(`[CrawlerEngine] 步骤3: 字段映射和保存`);
    
    for (const raw of rawData) {
      // 检查是否超时
      if (timeoutReached) {
        console.log(`[CrawlerEngine] 超时，停止保存剩余数据`);
        break;
      }
      
      try {
        const waybill = template.mapFields(raw);
        
        if (!waybill.waybillNumber) {
          result.errorCount++;
          continue;
        }
        
        const saveResult = await saveWaybillData(waybill, runtimeConfig.financierId);
        
        if (saveResult.inserted) {
          result.newCount++;
        } else if (saveResult.updated) {
          result.updatedCount++;
        } else {
          result.skippedCount++;
        }
      } catch (error: any) {
        console.error(`[CrawlerEngine] 处理数据失败: ${error.message}`);
        result.errorCount++;
      }
    }
    
    result.success = true;
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[CrawlerEngine] 任务完成 (耗时${elapsed.toFixed(1)}秒): 新增=${result.newCount}, 更新=${result.updatedCount}, 跳过=${result.skippedCount}, 错误=${result.errorCount}`);
    
  } catch (error: any) {
    result.error = error.message;
    console.error(`[CrawlerEngine] 执行失败: ${error.message}`);
  } finally {
    // 清除超时处理器
    clearTimeout(timeoutHandler);
    
    // 强制关闭浏览器（包含超时和进程级清理）
    await forceCloseBrowser(browser, tempDir);
    
    // 清理临时目录
    cleanupTempUserDataDir(tempDir);
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[CrawlerEngine] 资源清理完成，总耗时: ${elapsed.toFixed(1)}秒`);
  }
  
  return result;
}

// ==================== 测试连接 ====================
const TEST_CONNECTION_TIMEOUT_MS = 60 * 1000; // 1 分钟

export async function testCrawlerConnection(
  config: ExternalSystemConfig,
  template: CrawlerTemplate
): Promise<{ success: boolean; message: string }> {
  const runtimeConfig = buildRuntimeConfig(config);
  
  console.log(`[CrawlerEngine] 测试连接: ${template.id}`);
  
  const chromePath = findChromePath();
  if (!chromePath) {
    return { success: false, message: '未找到 Chrome 浏览器' };
  }
  
  const tempDir = createTempUserDataDir();
  let browser: Browser | null = null;
  
  try {
    browser = await withTimeout(
      puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--single-process',
        ],
        userDataDir: tempDir,
        timeout: 30000,
      }),
      30000,
      '浏览器启动超时'
    );
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    const loginSuccess = await withTimeout(
      template.login(page, runtimeConfig),
      TEST_CONNECTION_TIMEOUT_MS,
      '登录测试超时'
    );
    
    if (loginSuccess) {
      return { success: true, message: '连接测试成功，登录正常' };
    } else {
      return { success: false, message: '登录失败，请检查账号密码' };
    }
    
  } catch (error: any) {
    return { success: false, message: `连接失败: ${error.message}` };
  } finally {
    // 强制关闭浏览器
    await forceCloseBrowser(browser, tempDir);
    cleanupTempUserDataDir(tempDir);
  }
}

// ==================== 清理残留进程 ====================
export function cleanupStaleCrawlerProcesses(): void {
  console.log(`[CrawlerEngine] 清理残留爬虫进程...`);
  
  try {
    if (process.platform !== 'win32') {
      // 清理超过 10 分钟的 crawler-engine 临时目录相关进程
      execSync(`pkill -9 -f "crawler-engine-" 2>/dev/null || true`, { stdio: 'ignore' });
      
      // 清理临时目录
      const tmpDir = os.tmpdir();
      const files = fs.readdirSync(tmpDir);
      const now = Date.now();
      const maxAge = 10 * 60 * 1000; // 10 分钟
      
      for (const file of files) {
        if (file.startsWith('crawler-engine-')) {
          const filePath = path.join(tmpDir, file);
          try {
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAge) {
              fs.rmSync(filePath, { recursive: true, force: true });
              console.log(`[CrawlerEngine] 清理过期临时目录: ${file}`);
            }
          } catch (e) {
            // 忽略
          }
        }
      }
    }
  } catch (e: any) {
    console.log(`[CrawlerEngine] 清理残留进程失败: ${e.message}`);
  }
}
