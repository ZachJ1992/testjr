/**
 * Puppeteer 爬虫 - 用于同步 TMS 系统数据
 * 
 * 包含所有历史问题的修复：
 * 1. 唯一临时目录 - 避免 "browser is already running" 错误
 * 2. URL 判断登录 - 避免 "detached Frame" 错误
 * 3. 快捷按钮日期筛选 - 确保六个月数据
 * 4. 文件锁机制 - 防止并发执行
 * 5. PID 追踪 - 确保进程清理
 * 6. 直接页码跳转 - 解决翻页失效问题
 * 7. 智能增量同步 - 基于数量差值优化
 * 8. 充足的等待时间 - 确保页面加载完成
 */

import puppeteer, { Browser, Page } from 'puppeteer-core';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pool } from '../db.js';
import { getCrawlerConfigById, updateCrawlerConfig, createCrawlerSyncLog, updateCrawlerSyncLog } from './crawler-store.js';
import type { CrawlerConfig, TmsRowData, SyncResult } from './crawler-types.js';

// ==================== 全局状态 ====================
let interceptedApiData: any[] = [];
let tmsTotalRecords: number = 0;
let currentBrowserPid: number | null = null;
let currentTempDir: string | null = null;
let isSyncRunning: boolean = false;  // 防止并发同步

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
/**
 * 创建唯一临时用户数据目录 - 修复 "browser is already running" 问题
 */
function createTempUserDataDir(): string {
  const tempDir = path.join(
    os.tmpdir(), 
    `puppeteer-crawler-${Date.now()}-${randomUUID().substring(0, 6)}`
  );
  fs.mkdirSync(tempDir, { recursive: true });
  currentTempDir = tempDir;
  console.log(`[Puppeteer] 创建临时用户数据目录: ${tempDir}`);
  return tempDir;
}

/**
 * 清理临时用户数据目录
 */
function cleanupTempUserDataDir(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`[Puppeteer] 已清理临时目录: ${dirPath}`);
    }
  } catch (e: any) {
    console.log(`[Puppeteer] 清理临时目录失败: ${e.message}`);
  }
}

/**
 * 清理旧的临时目录（超过1小时的）
 */
export function cleanupOldTempDirectories(): void {
  const tempDir = os.tmpdir();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let cleanedCount = 0;
  
  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      if (file.startsWith('puppeteer-crawler-')) {
        const filePath = path.join(tempDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isDirectory() && stat.mtimeMs < oneHourAgo) {
            fs.rmSync(filePath, { recursive: true, force: true });
            cleanedCount++;
          }
        } catch (e) {}
      }
    }
    if (cleanedCount > 0) {
      console.log(`[Puppeteer] 启动清理: 已清理 ${cleanedCount} 个旧临时目录`);
    }
  } catch (e: any) {
    console.log(`[Puppeteer] 清理旧临时目录失败: ${e.message}`);
  }
  
  // 同时清理可能残留的孤立Chrome进程
  cleanupOrphanedChromeProcesses();
}

/**
 * 清理孤立的Chrome爬虫进程 - 解决强制关闭后的进程残留
 */
function cleanupOrphanedChromeProcesses(): void {
  try {
    const { execSync } = require('child_process');
    // 查找所有包含 puppeteer-crawler 用户目录的Chrome进程并终止
    // 只清理超过1小时的旧进程（通过临时目录名中的时间戳判断）
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    // 获取所有Chrome进程的命令行
    const psOutput = execSync('ps aux | grep -E "Chrome.*puppeteer-crawler" | grep -v grep', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (!psOutput) return;
    
    const lines = psOutput.split('\n');
    let killedCount = 0;
    
    for (const line of lines) {
      // 从命令行中提取 puppeteer-crawler-TIMESTAMP-xxx 的时间戳
      const match = line.match(/puppeteer-crawler-(\d+)-/);
      if (match) {
        const processTimestamp = parseInt(match[1], 10);
        // 只清理超过1小时的旧进程
        if (processTimestamp < oneHourAgo) {
          const pidMatch = line.match(/^\s*\S+\s+(\d+)/);
          if (pidMatch) {
            const pid = parseInt(pidMatch[1], 10);
            try {
              process.kill(pid, 'SIGKILL');
              killedCount++;
            } catch (e) {}
          }
        }
      }
    }
    
    if (killedCount > 0) {
      console.log(`[Puppeteer] 启动清理: 已终止 ${killedCount} 个孤立Chrome进程`);
    }
  } catch (e: any) {
    // 可能没有残留进程，忽略错误
  }
}

/**
 * 强制终止浏览器进程 - 修复进程残留问题
 */
function killBrowserProcess(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
    console.log(`[Puppeteer] 已终止浏览器进程: ${pid}`);
  } catch (e) {
    // 进程可能已经退出
  }
}

// ==================== 浏览器启动 ====================
/**
 * 启动浏览器 - 包含所有优化参数
 */
async function launchBrowser(): Promise<{ browser: Browser; userDataDir: string }> {
  console.log('[Puppeteer] 启动浏览器...');
  
  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error('未找到 Chrome 浏览器，请安装 Google Chrome');
  }
  console.log(`[Puppeteer] 找到浏览器: ${chromePath}`);
  
  const userDataDir = createTempUserDataDir();
  console.log(`[Puppeteer] 使用系统 Chrome: ${chromePath}`);
  console.log(`[Puppeteer] 使用独立临时目录: ${userDataDir}`);
  
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      // 减少资源消耗的参数
      '--single-process',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--no-first-run',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
    userDataDir,
  });
  
  // 记录浏览器 PID - 用于强制终止
  const browserProcess = browser.process();
  if (browserProcess?.pid) {
    currentBrowserPid = browserProcess.pid;
    console.log(`[Puppeteer] 浏览器 PID: ${currentBrowserPid}`);
  }
  
  return { browser, userDataDir };
}

// ==================== API 拦截 ====================
/**
 * 设置网络请求拦截，捕获 API 响应和总记录数
 */
async function setupRequestInterception(page: Page): Promise<void> {
  interceptedApiData = [];
  tmsTotalRecords = 0;
  
  // 记录所有网络请求用于调试 - 找出实际的 API URL
  page.on('request', (request) => {
    const url = request.url();
    const method = request.method();
    // 只记录 API 调用（排除静态资源）
    if (method === 'POST' || 
        (method === 'GET' && !url.includes('.js') && !url.includes('.css') && 
         !url.includes('.png') && !url.includes('.jpg') && !url.includes('.svg') &&
         !url.includes('.woff') && !url.includes('.ico') && 
         (url.includes('/api/') || url.includes('/Api/') || url.includes('Schedule') || 
          url.includes('Batch') || url.includes('batch') || url.includes('list')))) {
      console.log(`[Puppeteer] 请求: ${method} ${url.substring(0, 120)}`);
    }
  });
  
  // 记录所有 API 响应 - 注意: response.text() 只能调用一次
  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    
    // 匹配多种可能的 API 端点 - 包括 Table/Search/batchList
    const isTargetApi = url.includes('batchList') || 
                        url.includes('Batch/list') || 
                        url.includes('batch/list') ||
                        url.includes('Table/Search') ||
                        url.includes('taskList') ||
                        url.includes('task/list') ||
                        url.includes('Schedule/') ||
                        url.includes('getBatchList') ||
                        url.includes('getTaskList') ||
                        url.includes('queryList') ||
                        (url.includes('/api/') && (url.includes('batch') || url.includes('task') || url.includes('list')));
    
    
    if (isTargetApi) {
      try {
        const status = response.status();
        
        // 只处理 batchList 相关的 JSON 响应
        if (status === 200 && url.includes('batchList')) {
          const text = await response.text();
          const trimmedText = text.trim();
          if (trimmedText.length > 10 && (trimmedText.startsWith('{') || trimmedText.startsWith('['))) {
            const data = JSON.parse(trimmedText);
            console.log(`[Puppeteer] 拦截到 batchList API: ${url.substring(0, 80)}, 数据长度: ${trimmedText.length}`);
            
            // TMS 返回结构: { errno: 0, res: { data: [...], total: { count: X, ... } } }
            if (data?.res?.data && Array.isArray(data.res.data)) {
              console.log(`[Puppeteer] 从 API 获取到 ${data.res.data.length} 条数据`);
              interceptedApiData = data.res.data;
              // 捕获总记录数 - 用于智能增量同步
              // total 可能是对象 { count: X } 或直接是数字
              if (data.res.total?.count !== undefined) {
                tmsTotalRecords = parseInt(data.res.total.count, 10) || 0;
                console.log(`[Puppeteer] TMS 系统总记录数: ${tmsTotalRecords}`);
              } else if (typeof data.res.total === 'number') {
                tmsTotalRecords = data.res.total;
                console.log(`[Puppeteer] TMS 系统总记录数: ${tmsTotalRecords}`);
              }
            } else if (data?.data && Array.isArray(data.data)) {
              console.log(`[Puppeteer] 从 API 获取到 ${data.data.length} 条数据`);
              interceptedApiData = data.data;
              if (data.total !== undefined) {
                tmsTotalRecords = parseInt(data.total, 10) || 0;
              }
            } else if (Array.isArray(data)) {
              console.log(`[Puppeteer] 从 API 获取到数组 ${data.length} 条数据`);
              interceptedApiData = data;
            } else {
              // 调试：记录数据结构
              const keys = Object.keys(data || {});
              console.log(`[Puppeteer] API 数据结构不匹配，顶级键: ${keys.join(', ')}`);
              if (data?.res) {
                console.log(`[Puppeteer] res 内部键: ${Object.keys(data.res).join(', ')}`);
              }
            }
          }
        }
      } catch (e: any) {
        console.log(`[Puppeteer] API 解析错误: ${e.message}`);
      }
    }
  });
}

// ==================== 登录逻辑 ====================
/**
 * 登录 TMS 系统 - 修复 "detached Frame" 问题，使用 URL 判断登录成功
 */
async function loginToTms(page: Page, config: CrawlerConfig): Promise<boolean> {
  const { companyId, username, password } = config.loginConfig;
  console.log(`[Puppeteer] 登录配置 - 公司ID: ${companyId}, 用户名: ${username}`);
  
  console.log('[Puppeteer] 开始登录TMS系统...');
  
  // 尝试多个可能的登录URL
  const loginUrls = [
    config.baseUrl + '/tms/login',
    config.baseUrl + '/Login',
    config.baseUrl + '/login',
    config.baseUrl + '/user/login',
    config.baseUrl + '/#/login',
    config.baseUrl,
  ];
  
  let loginPageFound = false;
  
  for (const loginUrl of loginUrls) {
    console.log(`[Puppeteer] 尝试访问: ${loginUrl}`);
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 检查是否有登录表单
      const inputs = await page.$$('input');
      console.log(`[Puppeteer] 在 ${loginUrl} 找到 ${inputs.length} 个输入框`);
      
      if (inputs.length >= 2) {
        loginPageFound = true;
        console.log(`[Puppeteer] 找到登录页面: ${loginUrl}`);
        break;
      }
      
      // 检查是否已经登录（URL包含Home或dashboard）
      const currentUrl = page.url();
      if (currentUrl.includes('/Index/Home') || currentUrl.includes('/home') || currentUrl.includes('/dashboard')) {
        console.log('[Puppeteer] 已经登录，无需重新登录');
        return true;
      }
    } catch (e: any) {
      console.log(`[Puppeteer] 访问 ${loginUrl} 失败: ${e.message}`);
    }
  }
  
  // 如果没有找到登录页面，尝试点击"开始体验"按钮
  if (!loginPageFound) {
    console.log('[Puppeteer] 直接URL未找到登录页，尝试点击"开始体验"按钮...');
    await page.goto(config.baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      const startButtonClicked = await page.evaluate(() => {
        // 只查找小范围的"开始体验"按钮，避免匹配整个页面
        const buttons = document.querySelectorAll('button, a.btn, a[class*="button"], span[class*="button"]');
      for (const btn of buttons) {
          const text = (btn.textContent || '').trim();
          if (text === '开始体验' || text === '进入系统' || text === '登录' || text === '进入') {
            (btn as HTMLElement).click();
            return text;
          }
        }
        // 尝试链接
        const links = document.querySelectorAll('a');
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          const text = (link.textContent || '').trim();
          if (href.includes('login') || href.includes('tms') || text === '开始体验') {
            (link as HTMLElement).click();
            return text || href;
        }
      }
      return null;
    });
    
      if (startButtonClicked) {
        console.log(`[Puppeteer] 已点击"${startButtonClicked}"按钮，等待登录页加载...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (e) {
      console.log('[Puppeteer] 未找到"开始体验"按钮');
    }
  }
  
  // 截图调试
  try {
    await page.screenshot({ path: '/tmp/tms_before_login.png', fullPage: true });
    console.log('[Puppeteer] 已保存登录前截图到 /tmp/tms_before_login.png');
  } catch (e) {}
  
  // 步骤2: 多次尝试查找登录表单
  let loginFormFound = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[Puppeteer] 尝试查找登录表单 (第${attempt}次)...`);
    
    // 查找所有输入框
    const inputs = await page.$$('input[type="text"], input[type="password"], input:not([type])');
    console.log(`[Puppeteer] 找到 ${inputs.length} 个输入框`);
    
    if (inputs.length >= 3) {
      loginFormFound = true;
      
      // 填写公司ID
      console.log(`[Puppeteer] 填写公司ID: ${companyId}`);
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(companyId, { delay: 50 });
      
      // 填写用户名
      console.log(`[Puppeteer] 填写用户名: ${username}`);
      await inputs[1].click({ clickCount: 3 });
      await inputs[1].type(username, { delay: 50 });
      
      // 填写密码
      console.log('[Puppeteer] 填写密码');
      await inputs[2].click({ clickCount: 3 });
      await inputs[2].type(password, { delay: 50 });
      
      break;
    } else if (inputs.length >= 2) {
      loginFormFound = true;
      
      // 可能没有公司ID字段
      console.log(`[Puppeteer] 填写用户名: ${username}`);
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(username, { delay: 50 });
      
      console.log('[Puppeteer] 填写密码');
      await inputs[1].click({ clickCount: 3 });
      await inputs[1].type(password, { delay: 50 });
      
      break;
    }
    
    // 等待更长时间后重试
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  if (!loginFormFound) {
    console.log('[Puppeteer] 未找到登录表单');
    try {
      await page.screenshot({ path: '/tmp/tms_no_login_form.png', fullPage: true });
    } catch (e) {}
    return false;
  }
  
  // 截图
  try {
    await page.screenshot({ path: '/tmp/tms_login_filled.png', fullPage: true });
    console.log('[Puppeteer] 已保存填写后截图到 /tmp/tms_login_filled.png');
  } catch (e) {}
  
  // 步骤3: 点击登录按钮
  console.log('[Puppeteer] 查找并点击登录按钮...');
  const loginClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, [type="submit"], .btn, [class*="button"]');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (text.includes('登录') || text.includes('Login') || text.includes('立即登录')) {
        (btn as HTMLElement).click();
        return text;
      }
    }
    // 尝试提交表单
    const form = document.querySelector('form');
    if (form) {
      form.submit();
      return 'form-submit';
    }
    return null;
  });
  
  if (loginClicked) {
    console.log(`[Puppeteer] 已点击登录按钮: ${loginClicked}`);
  }
  
  // 步骤4: 等待登录完成并验证 - 等待页面跳转
  console.log('[Puppeteer] 等待登录完成和页面跳转...');
  
  // 等待页面跳转到 /Index/Home 或类似页面
  let loginSuccess = false;
  const startUrl = page.url();
  
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const currentUrl = page.url();
    
    if (currentUrl !== startUrl) {
      console.log(`[Puppeteer] 检测到URL变化: ${currentUrl}`);
    }
    
    // 检查是否跳转到了主页面
    if (currentUrl.includes('/Index/Home') || 
        currentUrl.includes('/Schedule') || 
        currentUrl.includes('/dashboard')) {
      console.log(`[Puppeteer] 登录成功！跳转到: ${currentUrl}`);
      loginSuccess = true;
      break;
    }
    
    // 检查是否有登录错误提示
    const hasError = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('.el-message--error, .error, [class*="error"]');
      for (const el of errorElements) {
        const text = (el.textContent || '').trim();
        if (text.length > 0 && text.length < 100) {
          return text;
        }
      }
      return null;
    });
    
    if (hasError) {
      console.log(`[Puppeteer] 登录错误: ${hasError}`);
      break;
    }
    
    if (i === 5 || i === 10 || i === 15) {
      console.log(`[Puppeteer] 等待跳转中... (${i}s)`);
    }
  }
  
  // 截图
  try {
    await page.screenshot({ path: '/tmp/tms_after_login.png', fullPage: true });
    console.log('[Puppeteer] 已保存登录后截图到 /tmp/tms_after_login.png');
  } catch (e) {}
  
  const finalUrl = page.url();
  console.log(`[Puppeteer] 最终URL: ${finalUrl}`);
  
  // 如果没有跳转，可能是登录失败或者需要手动导航
  if (!loginSuccess) {
    // 尝试直接访问主页
    console.log('[Puppeteer] 尝试直接访问主页...');
    try {
      await page.goto(config.baseUrl + '/Index/Home', { waitUntil: 'networkidle2', timeout: 15000 });
      const newUrl = page.url();
      console.log(`[Puppeteer] 直接访问后URL: ${newUrl}`);
      
      if (newUrl.includes('/Index/Home') || newUrl.includes('/Schedule')) {
        console.log('[Puppeteer] 直接访问主页成功！');
        loginSuccess = true;
      }
    } catch (e: any) {
      console.log(`[Puppeteer] 直接访问主页失败: ${e.message}`);
    }
  }
  
  if (loginSuccess) {
    console.log('[Puppeteer] 登录验证成功！');
  } else {
    console.log('[Puppeteer] 登录验证失败');
  }
  
  return loginSuccess;
}

// ==================== 日期筛选 ====================
/**
 * 设置日期筛选为过去半年 - 直接设置日期值，修复 64 页问题
 * 基于截图分析：日期区域显示 "创建时间 25-12-25 ~ 26-01-25"
 */
async function setDateFilterToHalfYear(page: Page): Promise<boolean> {
  console.log('[Puppeteer] 设置时间筛选为过去半年...');
  
  interceptedApiData = [];
  
  // 计算六个月前的日期
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  
  const formatDate = (d: Date) => {
    const y = d.getFullYear().toString().slice(-2);
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  
  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);
  console.log(`[Puppeteer] 目标日期范围: ${startDateStr} ~ ${endDateStr}`);
  
  // 步骤1: 点击日期区域打开日期选择器
  console.log('[Puppeteer] 步骤1: 点击日期区域打开日期选择器...');
  
  // 找到包含"创建时间"的区域并点击日期输入
  const dateClicked = await page.evaluate(() => {
    // 查找创建时间标签旁边的日期输入
    const labels = document.querySelectorAll('span, label, div');
    for (const label of labels) {
      const text = (label.textContent || '').trim();
      if (text === '创建时间' || text.includes('创建时间')) {
        // 找到相邻的日期输入元素
        const parent = label.closest('.fn-search') || label.closest('.fn-filter') || 
                       label.closest('[class*="filter"]') || label.closest('[class*="search"]') ||
                       label.parentElement?.parentElement;
        if (parent) {
          const dateInputs = parent.querySelectorAll('input, [class*="date"], [class*="picker"]');
          for (const input of dateInputs) {
            const rect = (input as HTMLElement).getBoundingClientRect();
            if (rect.width > 30 && rect.height > 10) {
              (input as HTMLElement).click();
              return { success: true, method: 'near-label', selector: input.className };
            }
          }
        }
      }
    }
    
    // 备用：直接查找日期输入框
    const dateInputs = document.querySelectorAll(
      'input[class*="date"], input[placeholder*="开始"], input[placeholder*="结束"], ' +
      '[class*="date-picker"], [class*="datepicker"], [class*="range-picker"]'
    );
    for (const input of dateInputs) {
      const rect = (input as HTMLElement).getBoundingClientRect();
      if (rect.width > 50 && rect.height > 15 && rect.top > 0 && rect.top < 300) {
        (input as HTMLElement).click();
        return { success: true, method: 'date-input', selector: (input as HTMLElement).className };
      }
    }
    
    // 备用2：查找包含日期格式的文本元素
    const allElements = document.querySelectorAll('span, div, input');
    for (const el of allElements) {
      const text = (el.textContent || el.getAttribute('value') || '').trim();
      if (text.match(/\d{2}-\d{2}-\d{2}\s*~\s*\d{2}-\d{2}-\d{2}/) || 
          text.match(/\d{4}-\d{2}-\d{2}/)) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 50 && rect.top > 0 && rect.top < 300) {
          (el as HTMLElement).click();
          return { success: true, method: 'date-text', selector: (el as HTMLElement).className };
        }
      }
    }
    
    return { success: false, method: '', selector: '' };
  });
  
  console.log(`[Puppeteer] 日期区域点击结果:`, dateClicked);
  
  // 等待日期选择器展开
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 截图
  try {
    await page.screenshot({ path: '/tmp/tms_after_date_click.png', fullPage: true });
    console.log('[Puppeteer] 已保存日期点击后截图到 /tmp/tms_after_date_click.png');
  } catch (e) {}
  
  // 步骤2: 在弹出的日期选择器中查找快捷按钮
  // 基于截图分析：弹窗底部有 今天、近一周、近一月、本月、上月、近三月、近六月 按钮
  console.log('[Puppeteer] 步骤2: 查找并点击"近六月"按钮...');
  
  // 先获取当前页面上所有可能的快捷按钮文本
  const quickButtonResult = await page.evaluate(() => {
    // 查找弹出层 - 基于截图，日期选择器会显示日历和快捷按钮
    // 通常这类弹窗会有特定的class或在body下方新增元素
    const popupSelectors = [
      '.fn-calendar',
      '.fn-date-picker',
      '.fn-datetime-picker', 
      '[class*="calendar"]',
      '[class*="date-picker"]',
      '[class*="picker-panel"]',
      '[class*="dropdown"]',
      '[class*="popover"]',
      '[class*="popup"]',
      '.el-picker-panel',
      '.ant-picker-dropdown',
    ];
    
    let popup: Element | null = null;
    for (const selector of popupSelectors) {
      const found = document.querySelector(selector);
      if (found) {
        const rect = (found as HTMLElement).getBoundingClientRect();
        // 确保是可见的弹窗
        if (rect.width > 100 && rect.height > 100) {
          popup = found;
            break;
          }
        }
    }
    
    const foundButtons: string[] = [];
    
    // 搜索范围：优先在弹窗内，否则在整个页面
    const searchRoot = popup || document.body;
    
    // 查找所有可能的快捷按钮（通常是 label 或 span）
    const allLabels = searchRoot.querySelectorAll('label, span, div, button, a');
    for (const el of allLabels) {
      const text = (el.textContent || '').trim();
      // 快捷按钮通常是2-4个字符
      if (text.length >= 2 && text.length <= 6) {
        if (text === '今天' || text === '近一周' || text === '近一月' || 
            text === '本月' || text === '上月' || text === '近三月' || text === '近六月') {
          foundButtons.push(text);
        }
      }
    }
    
    // 尝试点击"近六月"按钮 - 精确匹配
    for (const el of allLabels) {
      const text = (el.textContent || '').trim();
      if (text === '近六月') {
        // 确保元素可见
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          (el as HTMLElement).click();
          return { success: true, buttonText: text, foundButtons, popupFound: !!popup };
        }
      }
    }
    
    // 备用：尝试"近三月"
    for (const el of allLabels) {
      const text = (el.textContent || '').trim();
      if (text === '近三月') {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          (el as HTMLElement).click();
          return { success: true, buttonText: text, foundButtons, popupFound: !!popup };
        }
      }
    }
    
    return { success: false, buttonText: '', foundButtons, popupFound: !!popup };
  });
  
  console.log(`[Puppeteer] 弹窗检测:`, quickButtonResult.popupFound ? '已找到' : '未找到');
  console.log(`[Puppeteer] 找到的快捷按钮:`, quickButtonResult.foundButtons);
  console.log(`[Puppeteer] 快捷按钮点击结果:`, { 
    success: quickButtonResult.success, 
    buttonText: quickButtonResult.buttonText 
  });
  
  // 如果没有找到快捷按钮，可能是弹窗未正确打开，再次尝试
  if (!quickButtonResult.success && quickButtonResult.foundButtons.length === 0) {
    console.log('[Puppeteer] 未检测到快捷按钮，尝试再次点击日期输入框...');
    
    // 再次点击日期输入框
    await page.evaluate(() => {
      const dateInputs = document.querySelectorAll(
        'input[class*="date"], [class*="date-input"], [class*="picker-input"]'
      );
      for (const input of dateInputs) {
        const rect = (input as HTMLElement).getBoundingClientRect();
        if (rect.width > 50 && rect.top > 0 && rect.top < 300) {
          (input as HTMLElement).click();
          return;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 再次尝试查找并点击快捷按钮
    const retryResult = await page.evaluate(() => {
      const allLabels = document.querySelectorAll('label, span, div, button');
      for (const el of allLabels) {
        const text = (el.textContent || '').trim();
        if (text === '近六月') {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            (el as HTMLElement).click();
            return { success: true, buttonText: text };
          }
        }
      }
      return { success: false, buttonText: '' };
    });
    
    if (retryResult.success) {
      console.log(`[Puppeteer] 重试成功，点击了: ${retryResult.buttonText}`);
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 步骤3: 点击"确定"按钮 - 基于截图，按钮文本是"确定"，在弹窗底部
  console.log('[Puppeteer] 步骤3: 查找并点击"确定"按钮...');
  
  const confirmResult = await page.evaluate(() => {
    // 查找所有可能是"确定"按钮的元素
    const allElements = document.querySelectorAll('button, span, div, a, label');
    
    for (const el of allElements) {
      const text = (el.textContent || '').trim();
      // 精确匹配"确定"按钮
      if (text === '确定') {
        const rect = (el as HTMLElement).getBoundingClientRect();
        // 确保按钮可见且在合理位置（不是页面最顶部）
        if (rect.width > 20 && rect.height > 15 && rect.top > 100) {
          (el as HTMLElement).click();
          return { success: true, buttonText: text, position: { top: rect.top, left: rect.left } };
        }
      }
    }
    
    // 备用：查找包含"确"的按钮
    for (const el of allElements) {
      const text = (el.textContent || '').trim();
      if (text === '确 定' || text === '确认') {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 20 && rect.height > 15) {
          (el as HTMLElement).click();
          return { success: true, buttonText: text, position: { top: rect.top, left: rect.left } };
        }
      }
    }
    
    return { success: false, buttonText: '', position: null };
  });
  
  console.log(`[Puppeteer] 确定按钮点击结果:`, confirmResult);
  
  // 等待"确定"按钮点击后的数据加载
  if (confirmResult.success || quickButtonResult.success) {
    console.log('[Puppeteer] 等待日期筛选数据加载...');
    let waitTime = 0;
    const maxWait2 = 8000;
    while (interceptedApiData.length === 0 && waitTime < maxWait2) {
      await new Promise(resolve => setTimeout(resolve, 500));
      waitTime += 500;
      if (waitTime % 2000 === 0) {
        console.log(`[Puppeteer] 等待数据... ${waitTime/1000}s, 拦截数据: ${interceptedApiData.length} 条`);
      }
    }
    
    if (interceptedApiData.length > 0) {
      console.log(`[Puppeteer] 日期筛选后已获取到 ${interceptedApiData.length} 条数据，跳过查询按钮`);
      
      // 获取总页数
      const newTotalPages = await page.evaluate(() => {
        const pageInfo = document.body.innerText.match(/共\s*(\d+)\s*页/);
        return pageInfo ? parseInt(pageInfo[1], 10) : 0;
      });
      console.log(`[Puppeteer] 筛选后总页数: ${newTotalPages}`);
      
      return true;
    }
  }
  
  // 如果没有数据，尝试点击查询按钮
  console.log('[Puppeteer] 步骤4: 点击查询按钮...');
  
  // 在点击之前清除数据
  interceptedApiData = [];
  
  const queryClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, [class*="btn"], span, div');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      const rect = (btn as HTMLElement).getBoundingClientRect();
      // 确保是可见的按钮
      if ((text === '查询' || text === '搜索' || text === 'Search' || text === '查 询') && 
          rect.width > 20 && rect.height > 15 && rect.top > 0 && rect.top < 500) {
        (btn as HTMLElement).click();
        return { success: true, buttonText: text };
      }
    }
    return { success: false, buttonText: '' };
  });
  
  console.log(`[Puppeteer] 查询按钮点击结果:`, queryClicked);
  
  if (queryClicked.success) {
    console.log('[Puppeteer] 等待筛选结果加载...');
    let waitTime = 0;
    const maxWait3 = 10000;
    while (interceptedApiData.length === 0 && waitTime < maxWait3) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      waitTime += 1000;
      if (waitTime % 3000 === 0) {
        console.log(`[Puppeteer] 等待中... ${waitTime/1000}s, 拦截数据: ${interceptedApiData.length} 条`);
      }
    }
    
    console.log('[Puppeteer] 筛选后拦截到数据:', interceptedApiData.length, '条');
    
    // 获取新的总页数
    const newTotalPages = await page.evaluate(() => {
      const pageInfo = document.body.innerText.match(/共\s*(\d+)\s*页/);
      return pageInfo ? parseInt(pageInfo[1], 10) : 0;
    });
    console.log(`[Puppeteer] 筛选后总页数: ${newTotalPages}`);
  }
  
  return quickButtonResult.success || queryClicked.success;
}

// ==================== 数据提取 ====================
/**
 * 映射 API 数据到行数据格式
 */
function mapApiDataToRow(item: any): TmsRowData {
  return {
    waybillNumber: item.batchNumber || item.batch_number || item.car_batch || '',
    operator: item.operator || item.mgr_id || '',
    driverName: item.driverName || item.driver_name || item.b_dr_name || '',
    coDriver: item.coDriver || item.co_driver || item.b_dr_assistant_id || '',
    vehiclePlate: item.vehiclePlate || item.vehicle_plate || item.b_tr_num || '',
    monthlyCost: parseFloat(item.monthlyCost || item.monthly_cost || 0),
    createdTime: item.createTime || item.created_time || item.create_time || '',
    departureTime: item.departureTime || item.departure_time || item.truck_t || '',
    remark: item.remark || item.b_remark || '',
    customerName: item.customerName || item.customer_name || '',
    receivableTotal: parseFloat(item.receivableTotal || item.receivable_total || 0),
    receivableTransport: parseFloat(item.receivableTransport || item.receivable_transport || item.receivable_trans_f || 0),
    payableTotal: parseFloat(item.payableTotal || item.payable_total || 0),
    driverPieceRate: parseFloat(item.driverPieceRate || item.driver_piece_rate || 0),
    coDriverPieceRate: parseFloat(item.coDriverPieceRate || item.co_driver_piece_rate || 0),
    payableOilCard: parseFloat(item.payableOilCard || item.payable_oil_card || item.b_fuel_card_f || 0),
    etcFee: parseFloat(item.etcFee || item.etc_fee || 0),
    profit: parseFloat(item.profit || item.tt_profit || 0),
    profitRate: parseFloat(item.profitRate || item.profit_rate || 0),
    receivableReturn: parseFloat(item.receivableReturn || item.receivable_return || 0),
  };
}

/**
 * 获取当前页的表格数据
 */
async function getTableData(page: Page): Promise<TmsRowData[]> {
  console.log(`[Puppeteer] getTableData 开始: interceptedApiData.length = ${interceptedApiData.length}`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log(`[Puppeteer] getTableData 等待后: interceptedApiData.length = ${interceptedApiData.length}`);
  
  if (interceptedApiData.length > 0) {
    console.log(`[Puppeteer] 使用拦截到的 API 数据: ${interceptedApiData.length} 条`);
    
    // 调试：输出第一条数据的结构
    if (interceptedApiData.length > 0) {
      const firstItem = interceptedApiData[0];
      const keys = Object.keys(firstItem).slice(0, 15);
      console.log(`[Puppeteer] 数据字段示例: ${keys.join(', ')}`);
      console.log(`[Puppeteer] 运单号字段: batchNumber=${firstItem.batchNumber}, batch_number=${firstItem.batch_number}, car_batch=${firstItem.car_batch}`);
      console.log(`[Puppeteer] 创建时间: createTime=${firstItem.createTime}, create_time=${firstItem.create_time}`);
    }
    
    const results = interceptedApiData.map(item => mapApiDataToRow(item));
    
    // 调试：输出映射后的第一条数据
    if (results.length > 0) {
      console.log(`[Puppeteer] 映射后第一条: 运单号=${results[0].waybillNumber}, 创建时间=${results[0].createdTime}`);
    }
    
    const data = [...results];
    interceptedApiData = [];
    return data;
  }
  
  console.log('[Puppeteer] 未拦截到 API 数据，返回空数组');
  return [];
}

// ==================== 分页处理 ====================
/**
 * 获取总页数
 */
async function getTotalPages(page: Page): Promise<number> {
  const result = await page.evaluate(() => {
    const text = document.body.innerText;
    
    let match = text.match(/共\s*(\d+)\s*页/);
    if (match) {
      return { pages: parseInt(match[1], 10), format: '共X页' };
    }
    
    match = text.match(/(\d+)\s*\/\s*(\d+)\s*页?/);
    if (match) {
      return { pages: parseInt(match[2], 10), format: 'X/Y' };
    }
    
    // 尝试从总条数计算
    match = text.match(/共\s*(\d+)\s*条/);
    if (match) {
      const total = parseInt(match[1], 10);
      return { pages: Math.ceil(total / 100), format: '共X条' };
    }
    
    return { pages: 1, format: 'default' };
  });
  
  console.log(`[Puppeteer] 总页数检测: ${result.pages} (格式: ${result.format})`);
  return result.pages;
}

/**
 * 获取当前页码 - 修复版本
 * 基于截图格式: "1页 页/共62页" 或 "第1页 / 共62页"
 */
async function getCurrentPageNumber(page: Page): Promise<number> {
  return page.evaluate(() => {
    // 方法1: 查找分页容器中的活动页码
    const activeEl = document.querySelector(
      '.el-pager li.active, .el-pager li.is-active, ' +
      '[class*="pager"] .active, [class*="pagination"] .active'
    );
    if (activeEl) {
      const num = parseInt(activeEl.textContent || '1', 10);
      if (!isNaN(num) && num > 0) return num;
    }
    
    // 方法2: 查找分页容器中的输入框值
    const pagerContainers = document.querySelectorAll(
      '.fn-page, .jump__page, [class*="pagination"], [class*="pager"]'
    );
    for (const container of pagerContainers) {
      const inputs = container.querySelectorAll('input');
      for (const input of inputs) {
        const val = (input as HTMLInputElement).value;
        const num = parseInt(val, 10);
        if (!isNaN(num) && num > 0) return num;
      }
    }
    
    // 方法3: 从文本匹配
    const pageText = document.body.innerText;
    
    // 匹配 "1页 页/共62页" 格式
    let match = pageText.match(/(\d+)页\s*页?\/共\d+页/);
    if (match) return parseInt(match[1], 10);
    
    // 匹配 "第1页 / 共62页" 格式
    match = pageText.match(/第\s*(\d+)\s*页/);
    if (match) return parseInt(match[1], 10);
    
    // 匹配 "1 / 62" 格式
    match = pageText.match(/(\d+)\s*\/\s*\d+\s*页?/);
    if (match) return parseInt(match[1], 10);
    
    // 匹配 "Page 1 of 62" 格式
    match = pageText.match(/Page\s*(\d+)\s*of/i);
    if (match) return parseInt(match[1], 10);
    
    return 1;
  });
}

/**
 * 检查页面是否有效（未被 detached）
 */
async function isPageValid(page: Page): Promise<boolean> {
  try {
    await page.evaluate(() => document.readyState);
    return true;
  } catch (e: any) {
    if (e.message.includes('detached') || e.message.includes('Execution context')) {
      return false;
    }
    throw e;
  }
}

/**
 * 翻到下一页 - 增强版本，包含错误恢复机制
 * 分页区域格式: "1页 页/共62页" + 输入框 + 箭头按钮
 */
async function goToNextPage(page: Page, retryCount: number = 0): Promise<boolean> {
  const MAX_RETRIES = 3;
  
  try {
    // 首先检查页面是否有效
    if (!await isPageValid(page)) {
      console.log('[Puppeteer] 检测到页面已 detached，等待恢复...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!await isPageValid(page)) {
        console.log('[Puppeteer] 页面无法恢复');
        return false;
      }
    }
    
    const currentPage = await getCurrentPageNumber(page);
    console.log(`[Puppeteer] 当前页码: ${currentPage}`);
    
    interceptedApiData = [];
    
    // 滚动到底部确保分页可见
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 点击下一页按钮 - 根据截图分析，箭头按钮在分页区域右侧
    const clickResult = await page.evaluate(() => {
      // 查找分页容器
      const pageContainers = document.querySelectorAll(
        '.fn-page, .jump__page, [class*="pagination"], [class*="pager"], ' +
        '[class*="page-nav"], .el-pagination'
      );
      
      // 如果没有找到容器，搜索整个页面底部
      const containers = pageContainers.length > 0 ? pageContainers : [document.body];
      
      for (const container of containers) {
        // 方法1: 查找右箭头图标 (i 标签，class 包含 arrow 或 right)
        const icons = container.querySelectorAll('i, span, svg');
        for (const icon of icons) {
          const cls = (icon as HTMLElement).className || '';
          const isNextIcon = (cls.includes('arrow-r') || cls.includes('arrow_r') || 
                              cls.includes('right') || cls.includes('next') ||
                              cls.includes('fn-icon-arrowRight') || cls.includes('el-icon-arrow-right'));
          
          if (isNextIcon && !cls.includes('disabled') && !cls.includes('forward')) {
            // 点击图标的父元素（通常是按钮）
            const clickTarget = icon.closest('button') || icon.closest('[class*="btn"]') || icon;
            (clickTarget as HTMLElement).click();
            return { success: true, method: 'arrow-icon', selector: cls.substring(0, 50) };
          }
        }
        
        // 方法2: 查找"下一页"文本按钮
        const buttons = container.querySelectorAll('button, span, a, div');
        for (const btn of buttons) {
          const text = (btn.textContent || '').trim();
          if (text === '下一页' || text === '>>' || text === '>' || text === 'Next') {
            (btn as HTMLElement).click();
            return { success: true, method: 'next-button', text };
          }
        }
        
        // 方法3: 查找带有 class 包含 next 的元素
        const nextBtns = container.querySelectorAll('[class*="next"]:not([class*="disabled"])');
        for (const btn of nextBtns) {
          const rect = (btn as HTMLElement).getBoundingClientRect();
          if (rect.width > 10 && rect.height > 10) {
            (btn as HTMLElement).click();
            return { success: true, method: 'next-class', selector: (btn as HTMLElement).className.substring(0, 50) };
          }
        }
      }
      
      return { success: false, method: 'not-found' };
    });
    
    console.log(`[Puppeteer] 点击下一页结果:`, clickResult);
    
    if (!clickResult.success) {
      console.log('[Puppeteer] 未找到下一页按钮');
      return false;
    }
      
    console.log('[Puppeteer] 已点击下一页，等待 API 响应...');
    
    // 等待 API 响应
    let waitTime = 0;
    const maxWait = 10000;
    while (waitTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 500));
      waitTime += 500;
      
      if (interceptedApiData.length > 0) {
        console.log(`[Puppeteer] 检测到新 API 数据: ${interceptedApiData.length} 条`);
        await new Promise(resolve => setTimeout(resolve, 500));
        return true;
      }
    }
    
    // 检查页码是否已变化
    const newPage = await getCurrentPageNumber(page);
    if (newPage > currentPage) {
      console.log(`[Puppeteer] 页码已更新: ${currentPage} -> ${newPage}`);
      return true;
    }
    
    console.log(`[Puppeteer] 翻页后页码未变化: ${newPage}`);
    return false;
  } catch (error: any) {
    const isDetachedError = error.message.includes('detached') || 
                            error.message.includes('Execution context');
    
    console.error(`[Puppeteer] 翻页失败 (重试 ${retryCount}/${MAX_RETRIES}):`, error.message);
    
    // 如果是 detached 错误且还有重试次数，等待后重试
    if (isDetachedError && retryCount < MAX_RETRIES) {
      console.log(`[Puppeteer] 检测到 detached 错误，等待 ${(retryCount + 1) * 2} 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return goToNextPage(page, retryCount + 1);
    }
    
    return false;
  }
}

/**
 * 直接跳转到指定页码 - 增强版本，包含错误恢复机制
 * 基于截图分析：分页区域有输入框，格式 "1页 页/共62页"
 */
async function jumpToPage(page: Page, targetPage: number, retryCount: number = 0): Promise<boolean> {
  const MAX_RETRIES = 3;
  
  try {
    // 首先检查页面是否有效
    if (!await isPageValid(page)) {
      console.log('[Puppeteer] 跳转前检测到页面已 detached，等待恢复...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!await isPageValid(page)) {
        console.log('[Puppeteer] 页面无法恢复');
        return false;
      }
    }
    
    console.log(`[Puppeteer] 尝试直接跳转到第 ${targetPage} 页...`);
    
    interceptedApiData = [];
    
    // 首先尝试使用 Puppeteer 的原生方法输入页码
    const pageInput = await page.evaluate(() => {
      // 查找分页容器
      const containers = document.querySelectorAll(
        '.fn-page, .jump__page, [class*="pagination"], [class*="pager"]'
      );
      
      for (const container of containers) {
        // 在容器中查找输入框
        const inputs = container.querySelectorAll('input');
        for (const input of inputs) {
          const el = input as HTMLInputElement;
          const rect = el.getBoundingClientRect();
          // 页码输入框通常较小
          if (rect.width > 20 && rect.width < 100 && rect.height > 15) {
            return {
              found: true,
              selector: el.className || el.id || '',
              rect: { top: rect.top, left: rect.left, width: rect.width }
            };
          }
        }
      }
      
      // 备用：在页面底部查找输入框
      const allInputs = document.querySelectorAll('input');
      for (const input of allInputs) {
        const el = input as HTMLInputElement;
        const rect = el.getBoundingClientRect();
        // 在页面下半部分的小输入框可能是页码输入框
        if (rect.top > window.innerHeight * 0.5 && 
            rect.width > 20 && rect.width < 100 && rect.height > 15) {
          const parent = el.closest('[class*="page"]');
          if (parent) {
            return {
              found: true,
              selector: el.className || el.id || '',
              rect: { top: rect.top, left: rect.left, width: rect.width }
            };
          }
        }
      }
      
      return { found: false, selector: '', rect: null };
    });
    
    console.log(`[Puppeteer] 页码输入框检测:`, pageInput);
    
    // 使用 page.type 方法输入页码（更可靠）
    const jumped = await page.evaluate((target) => {
      const containers = document.querySelectorAll(
        '.fn-page, .jump__page, [class*="pagination"], [class*="pager"]'
      );
      
      for (const container of containers) {
        const inputs = container.querySelectorAll('input');
        for (const input of inputs) {
          const el = input as HTMLInputElement;
          const rect = el.getBoundingClientRect();
          if (rect.width > 20 && rect.width < 100 && rect.height > 15) {
            // 清空并聚焦
            el.value = '';
            el.focus();
            el.select();
            return { found: true, className: el.className };
          }
        }
      }
      return { found: false, className: '' };
    }, targetPage);
    
    if (jumped.found) {
      // 使用 Puppeteer 的 keyboard 方法输入
      await page.keyboard.type(targetPage.toString(), { delay: 100 });
      await new Promise(resolve => setTimeout(resolve, 300));
      await page.keyboard.press('Enter');
      console.log(`[Puppeteer] 已输入页码 ${targetPage} 并按下 Enter`);
    } else {
      // 备用方案：尝试直接点击页码按钮
      const buttonClicked = await page.evaluate((target) => {
        const containers = document.querySelectorAll(
          '.fn-page, .jump__page, [class*="pagination"], [class*="pager"], .el-pager'
        );
        
        for (const container of containers) {
          const buttons = container.querySelectorAll('li, span, button, a');
          for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            if (text === target.toString()) {
              (btn as HTMLElement).click();
              return { success: true, method: 'page-number-click' };
            }
          }
        }
        return { success: false, method: '' };
      }, targetPage);
      
      if (!buttonClicked.success) {
        console.log('[Puppeteer] 未找到页码跳转方式');
        return false;
      }
      console.log(`[Puppeteer] 通过点击页码按钮跳转`);
    }
    
    // 等待 API 响应
    let waitTime = 0;
    const maxWait = 10000;
    while (waitTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 500));
      waitTime += 500;
      
      if (interceptedApiData.length > 0) {
        console.log(`[Puppeteer] 跳转成功，获取到 ${interceptedApiData.length} 条数据`);
        await new Promise(resolve => setTimeout(resolve, 500));
      return true;
      }
    }
    
    // 检查页码是否已变化
    const newPage = await getCurrentPageNumber(page);
    if (newPage === targetPage) {
      console.log(`[Puppeteer] 页码已更新到 ${newPage}`);
      return true;
    }
    
    console.log(`[Puppeteer] 跳转超时，当前页码: ${newPage}，目标: ${targetPage}`);
    return false;
  } catch (error: any) {
    const isDetachedError = error.message.includes('detached') || 
                            error.message.includes('Execution context');
    
    console.error(`[Puppeteer] 跳转页码失败 (重试 ${retryCount}/${MAX_RETRIES}):`, error.message);
    
    // 如果是 detached 错误且还有重试次数，等待后重试
    if (isDetachedError && retryCount < MAX_RETRIES) {
      console.log(`[Puppeteer] 检测到 detached 错误，等待 ${(retryCount + 1) * 2} 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return jumpToPage(page, targetPage, retryCount + 1);
    }
    
    return false;
  }
}

// ==================== 数据库操作 ====================
function formatMySQLDateTime(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * 获取运单数据范围 - 用于智能增量同步
 */
async function getWaybillDataRange(financierId: string): Promise<{
  count: number;
  earliestDate: Date | null;
  latestDate: Date | null;
}> {
  const [rows] = await pool.query<any[]>(
    `SELECT 
      COUNT(*) as count,
      MIN(created_time) as earliest_date,
      MAX(created_time) as latest_date
    FROM waybills 
    WHERE financier_id = ?`,
    [financierId]
  );
  
  const row = rows[0] || { count: 0, earliest_date: null, latest_date: null };
  return {
    count: parseInt(row.count, 10) || 0,
    earliestDate: row.earliest_date ? new Date(row.earliest_date) : null,
    latestDate: row.latest_date ? new Date(row.latest_date) : null,
  };
}

/**
 * 需要比较和更新的关键字段
 */
const UPDATEABLE_FIELDS = [
  'receivable_total',
  'receivable_transport', 
  'payable_total',
  'payable_oil_card',
  'etc_fee',
  'profit',
  'profit_rate',
  'receivable_return',
  'driver_piece_rate',
  'co_driver_piece_rate',
  'monthly_cost',
  'remark',
] as const;

/**
 * 已存在运单的数据结构
 */
interface ExistingWaybill {
  id: string;
  receivable_total: number;
  receivable_transport: number;
  payable_total: number;
  payable_oil_card: number;
  etc_fee: number;
  profit: number;
  profit_rate: number;
  receivable_return: number;
  driver_piece_rate: number;
  co_driver_piece_rate: number;
  monthly_cost: number;
  remark: string;
}

/**
 * 检查运单是否存在，如果存在则返回关键字段用于比较
 */
async function getExistingWaybill(waybillNumber: string): Promise<ExistingWaybill | null> {
  const [rows] = await pool.query<any[]>(
    `SELECT id, receivable_total, receivable_transport, payable_total,
            payable_oil_card, etc_fee, profit, profit_rate, receivable_return,
            driver_piece_rate, co_driver_piece_rate, monthly_cost, remark
     FROM waybills WHERE waybill_number = ? LIMIT 1`,
    [waybillNumber]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 比较两个数值是否有显著差异（考虑浮点数精度）
 */
function hasNumericChange(oldVal: number | null, newVal: number | null, precision: number = 2): boolean {
  const old = oldVal ?? 0;
  const curr = newVal ?? 0;
  return Math.abs(old - curr) > Math.pow(10, -precision);
}

/**
 * 检查运单是否需要更新
 */
function shouldUpdateWaybill(existing: ExistingWaybill, newData: TmsRowData): boolean {
  // 比较数值字段
  if (hasNumericChange(existing.receivable_total, newData.receivableTotal)) return true;
  if (hasNumericChange(existing.receivable_transport, newData.receivableTransport)) return true;
  if (hasNumericChange(existing.payable_total, newData.payableTotal)) return true;
  if (hasNumericChange(existing.payable_oil_card, newData.payableOilCard)) return true;
  if (hasNumericChange(existing.etc_fee, newData.etcFee)) return true;
  if (hasNumericChange(existing.profit, newData.profit)) return true;
  if (hasNumericChange(existing.profit_rate, newData.profitRate)) return true;
  if (hasNumericChange(existing.receivable_return, newData.receivableReturn)) return true;
  if (hasNumericChange(existing.driver_piece_rate, newData.driverPieceRate)) return true;
  if (hasNumericChange(existing.co_driver_piece_rate, newData.coDriverPieceRate)) return true;
  if (hasNumericChange(existing.monthly_cost, newData.monthlyCost)) return true;
  
  // 比较备注字段
  const oldRemark = (existing.remark || '').trim();
  const newRemark = (newData.remark || '').trim();
  if (oldRemark !== newRemark) return true;
  
  return false;
}

/**
 * 更新已存在的运单
 */
async function updateWaybill(id: string, data: TmsRowData): Promise<boolean> {
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    await pool.query(
      `UPDATE waybills SET
        receivable_total = ?,
        receivable_transport = ?,
        payable_total = ?,
        payable_oil_card = ?,
        etc_fee = ?,
        profit = ?,
        profit_rate = ?,
        receivable_return = ?,
        driver_piece_rate = ?,
        co_driver_piece_rate = ?,
        monthly_cost = ?,
        remark = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        data.receivableTotal || 0,
        data.receivableTransport || 0,
        data.payableTotal || 0,
        data.payableOilCard || 0,
        data.etcFee || 0,
        data.profit || 0,
        data.profitRate || 0,
        data.receivableReturn || 0,
        data.driverPieceRate || 0,
        data.coDriverPieceRate || 0,
        data.monthlyCost || 0,
        data.remark || '',
        now,
        id
      ]
    );
    return true;
  } catch (error: any) {
    console.error('[Puppeteer] 更新运单失败:', error.message);
    return false;
  }
}

/**
 * 保存运单到数据库
 */
async function saveWaybill(data: TmsRowData, financierId: string): Promise<boolean> {
  try {
    const id = randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    // 处理空的日期时间值
    const departureTime = data.departureTime && data.departureTime.trim() !== '' 
      ? data.departureTime 
      : null;
    const createdTime = data.createdTime && data.createdTime.trim() !== '' 
      ? data.createdTime 
      : now;
    // waybill_date 使用 created_time 的日期部分
    const waybillDate = createdTime ? createdTime.slice(0, 10) : now.slice(0, 10);
    
    await pool.query(
      `INSERT INTO waybills (
        id, financier_id, waybill_number, operator, driver_name, co_driver,
        vehicle_plate, monthly_cost, created_time, departure_time, remark,
        customer_name, customer_id, business_mode, status,
        departure_place, arrival_place, vehicle_route, waybill_date,
        receivable_total, receivable_transport, payable_total,
        driver_piece_rate, co_driver_piece_rate, payable_oil_card, etc_fee,
        profit, profit_rate, receivable_return,
        batch_status, assign_status, dispatch_status, batch_source, load_type,
        branch, total_volume, goods_weight
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, financierId, data.waybillNumber, data.operator || '', data.driverName || '', data.coDriver || '',
        data.vehiclePlate || '', data.monthlyCost || 0, createdTime, departureTime, data.remark || '',
        data.customerName || '', financierId, // customer_id 设为 financierId
        'brokerage', // business_mode 默认值
        'pending',   // status 默认值
        '',  // departure_place
        '',  // arrival_place
        '',  // vehicle_route
        waybillDate, // waybill_date
        data.receivableTotal || 0, data.receivableTransport || 0, data.payableTotal || 0,
        data.driverPieceRate || 0, data.coDriverPieceRate || 0, data.payableOilCard || 0, data.etcFee || 0,
        data.profit || 0, data.profitRate || 0, data.receivableReturn || 0,
        '10',   // batch_status 默认值
        '200',  // assign_status 默认值  
        '300',  // dispatch_status 默认值
        '2',    // batch_source 默认值
        '2',    // load_type 默认值
        '',     // branch
        0,      // total_volume
        0       // goods_weight
      ]
    );
    return true;
  } catch (error: any) {
    // 忽略重复键错误
    if (!error.message.includes('Duplicate')) {
      console.error('[Puppeteer] 保存运单失败:', error.message);
    }
    return false;
  }
}

// ==================== 主同步函数 ====================
/**
 * 主同步函数 - 包含智能增量同步逻辑
 */
export async function syncWithPuppeteer(
  configId: string,
  maxPages: number = 150  // 默认 150 页，确保能获取全部 126 页
): Promise<SyncResult> {
  const result: SyncResult = {
      success: false,
      totalFetched: 0,
      newCount: 0,
      updatedCount: 0,
      skippedCount: 0,
    errorCount: 0,
    errors: [],
  };

  // 检查是否已有同步任务在运行
  if (isSyncRunning) {
    console.log('[Puppeteer] 已有同步任务在运行，跳过本次请求');
    result.errors.push('已有同步任务在运行');
    return result;
  }
  
  // 设置运行标志
  isSyncRunning = true;
  console.log('[Puppeteer] 开始同步任务，设置运行锁');

  let browser: Browser | null = null;
  let userDataDir: string | null = null;
  
  const config = await getCrawlerConfigById(configId);
  if (!config) {
    result.errors.push('配置不存在');
    return result;
  }

  // 创建同步日志
  const syncLog = await createCrawlerSyncLog({
    configId: config.id,
    startTime: formatMySQLDateTime(),
    status: 'running',
  });

  // 更新配置状态
  await updateCrawlerConfig(config.id, { lastSyncStatus: 'running' });

  try {
    console.log(`[Puppeteer] 同步融资方: ${config.financierName || config.name} (${config.financierId})`);

    // 启动浏览器
    const launchResult = await launchBrowser();
    browser = launchResult.browser;
    userDataDir = launchResult.userDataDir;
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // 设置请求拦截
    await setupRequestInterception(page);
    
    // 登录
    const loginSuccess = await loginToTms(page, config);
    if (!loginSuccess) {
      throw new Error('登录失败');
    }

    // 导航到任务列表
    console.log('[Puppeteer] 导航到任务列表页面...');
    const taskListUrl = config.baseUrl.replace(/\/$/, '') + '/Schedule/taskList';
    console.log(`[Puppeteer] 访问: ${taskListUrl}`);
    await page.goto(taskListUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // 等待数据加载
    console.log('[Puppeteer] 等待 API 数据加载...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    console.log('[Puppeteer] 页面URL:', page.url());
    console.log('[Puppeteer] 已拦截到 API 数据:', interceptedApiData.length, '条');
    
    // 如果没有拦截到数据，尝试刷新页面
    if (interceptedApiData.length === 0) {
      console.log('[Puppeteer] 未检测到数据，尝试刷新页面...');
      await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('[Puppeteer] 刷新后 API 数据:', interceptedApiData.length, '条');
    }
    
    // 截图
    try {
      await page.screenshot({ path: '/tmp/tms_tasklist_page.png', fullPage: true });
      console.log('[Puppeteer] 已保存任务列表截图到 /tmp/tms_tasklist_page.png');
    } catch (e) {}
    
    // 先尝试点击查询按钮加载初始数据
    console.log('[Puppeteer] 尝试点击查询按钮加载数据...');
    const queryClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, [class*="btn"], span, div');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        if (text === '查询' || text === '搜索' || text === 'Search' || text === '查 询') {
          (btn as HTMLElement).click();
          return text;
        }
      }
      return null;
    });
    
    if (queryClicked) {
      console.log(`[Puppeteer] 已点击"${queryClicked}"按钮`);
      // 等待数据加载
      let waitTime = 0;
      while (interceptedApiData.length === 0 && waitTime < 10000) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        waitTime += 1000;
        console.log(`[Puppeteer] 等待初始数据... ${waitTime/1000}s, 数据: ${interceptedApiData.length} 条`);
      }
    } else {
      console.log('[Puppeteer] 未找到查询按钮');
    }
    
    // 设置日期筛选
    const dateFilterSuccess = await setDateFilterToHalfYear(page);
    if (!dateFilterSuccess) {
      console.log('[Puppeteer] 使用系统默认时间筛选（最近一个月）');
    }
    
    console.log('[Puppeteer] 任务列表页面加载完成');
    console.log(`[Puppeteer] 调试: setDateFilterToHalfYear 后 interceptedApiData.length = ${interceptedApiData.length}`);

    // 获取总页数
    const totalPages = await getTotalPages(page);
    console.log(`[Puppeteer] 总页数: ${totalPages}`);
    
    const pagesToFetch = Math.min(totalPages, maxPages);
    
    // ========== 智能增量同步 ==========
    const dataRange = await getWaybillDataRange(config.financierId);
    console.log(`[Puppeteer] 现有数据: ${dataRange.count} 条`);
    
    // 计算目标同步范围（半年前）
    const targetStartDate = new Date();
    targetStartDate.setMonth(targetStartDate.getMonth() - 6);
    
    // 判断是否需要全量同步
    const expectedMinCount = Math.floor(totalPages * 100 * 0.8); // 总页数 * 每页条数 * 80%
    const needFullSync = dataRange.count < expectedMinCount || 
      (dataRange.earliestDate && dataRange.earliestDate > targetStartDate);
    
    console.log(`[Puppeteer] 预期最少 ${expectedMinCount} 条，当前 ${dataRange.count} 条，需要全量同步: ${needFullSync}`);
    
    // 智能增量：如果 TMS 总数已知，计算差值
    let estimatedNewRecords = 0;
    if (tmsTotalRecords > 0 && dataRange.count > 0) {
      estimatedNewRecords = tmsTotalRecords - dataRange.count;
      console.log(`[Puppeteer] TMS总数: ${tmsTotalRecords}, 本地总数: ${dataRange.count}, 预估新增: ${estimatedNewRecords}`);
    }
    
    // 全量同步时不提前停止
    const STOP_THRESHOLD = needFullSync ? Infinity : 5;
    
    if (needFullSync) {
      console.log('[Puppeteer] 需要全量同步（数据不完整或范围不足半年）');
    } else {
      console.log('[Puppeteer] 使用增量同步模式');
    }
    
    // 增量同步标记
    let reachedExistingData = false;
    let consecutiveExistingCount = 0;

    // 遍历每一页
    for (let pageNum = 1; pageNum <= pagesToFetch; pageNum++) {
      if (reachedExistingData) {
        console.log('[Puppeteer] 已到达历史数据边界，跳过后续页面');
        break;
      }
      
      console.log(`[Puppeteer] 正在处理第 ${pageNum}/${pagesToFetch} 页...`);

      // 获取当前页数据
      const pageData = await getTableData(page);
      
      // 调试：输出当前页数据量
      console.log(`[Puppeteer] 当前页获取到 ${pageData.length} 条数据`);

      for (const row of pageData) {
        if (!row.waybillNumber) {
          console.log(`[Puppeteer] 跳过无运单号的数据`);
          continue;
        }

        result.totalFetched++;
          
        // 检查运单是否已存在，并获取现有数据用于比较
        const existingWaybill = await getExistingWaybill(row.waybillNumber);
        
        // 调试: 前5条记录输出详细信息
        if (result.totalFetched <= 5) {
          console.log(`[Puppeteer] 调试: 运单号=${row.waybillNumber}, 已存在=${!!existingWaybill}, 创建时间=${row.createdTime}`);
        }
        
        if (existingWaybill) {
          // 运单已存在，检查是否需要更新
          const needsUpdate = shouldUpdateWaybill(existingWaybill, row);
          
          if (needsUpdate) {
            // 数据有变化，执行更新
            const updated = await updateWaybill(existingWaybill.id, row);
            if (updated) {
              result.updatedCount = (result.updatedCount || 0) + 1;
              if (result.updatedCount <= 5 || result.updatedCount % 50 === 0) {
                console.log(`[Puppeteer] 更新第 ${result.updatedCount} 条: ${row.waybillNumber}`);
              }
              // 有更新说明数据有变化，重置连续无变化计数
              consecutiveExistingCount = 0;
            } else {
              result.errorCount++;
            }
          } else {
            // 数据无变化，跳过
            result.skippedCount++;
            consecutiveExistingCount++;
            
            // 只有连续"无变化跳过"才触发停止
            if (consecutiveExistingCount >= STOP_THRESHOLD) {
              console.log(`[Puppeteer] 连续 ${STOP_THRESHOLD} 条记录无变化，停止增量同步`);
              reachedExistingData = true;
              break;
            }
          }
          continue;
        }

        // 重置连续计数（新增记录）
        consecutiveExistingCount = 0;

        // 保存新记录
        const saved = await saveWaybill(row, config.financierId);
        if (saved) {
          result.newCount++;
          if (result.newCount <= 5 || result.newCount % 100 === 0) {
            console.log(`[Puppeteer] 新增第 ${result.newCount} 条: ${row.waybillNumber}`);
          }
        } else {
          result.errorCount++;
        }
      }
      
      // 每页处理完后输出统计
      if (pageNum % 10 === 0 || pageNum === 1) {
        console.log(`[Puppeteer] 进度: 页${pageNum}, 总获取${result.totalFetched}, 新增${result.newCount}, 更新${result.updatedCount || 0}, 跳过${result.skippedCount}`);
      }

      if (reachedExistingData) {
          break;
      }

      // 翻到下一页 - 包含翻页验证和直接跳转备用方案
      if (pageNum < pagesToFetch) {
        const targetPage = pageNum + 1;
        let hasNext = await goToNextPage(page);
        
        // 验证翻页是否成功
        if (hasNext) {
          const actualPage = await getCurrentPageNumber(page);
          if (actualPage !== targetPage && actualPage <= pageNum) {
            console.log(`[Puppeteer] 翻页验证失败: 期望第${targetPage}页，实际第${actualPage}页`);
            hasNext = await jumpToPage(page, targetPage);
          }
        }
        
        if (!hasNext) {
          // 最后尝试直接跳转
          console.log(`[Puppeteer] 尝试直接跳转到第 ${targetPage} 页...`);
          hasNext = await jumpToPage(page, targetPage);
          if (!hasNext) {
            console.log('[Puppeteer] 没有更多页面或翻页失败');
        break;
          }
        }
      }
    }

    result.success = true;

    // 更新配置
    await updateCrawlerConfig(config.id, {
      lastSyncTime: formatMySQLDateTime(),
      lastSyncCount: result.newCount,
      lastSyncStatus: 'success',
      lastSyncError: undefined,
    });

    // 更新日志
    await updateCrawlerSyncLog(syncLog.id, {
      endTime: formatMySQLDateTime(),
      status: 'success',
      totalFetched: result.totalFetched,
      newCount: result.newCount,
      updatedCount: result.updatedCount || 0,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
    });

    const syncMode = reachedExistingData ? '增量同步(到达历史边界)' : '全量同步';
    console.log(`[Puppeteer] ${syncMode}完成! 获取: ${result.totalFetched}, 新增: ${result.newCount}, 更新: ${result.updatedCount || 0}, 跳过: ${result.skippedCount}`);

  } catch (error: any) {
    console.error('[Puppeteer] 同步失败:', error.message);
    result.success = false;
    result.errors.push(error.message);

    await updateCrawlerConfig(config.id, {
      lastSyncTime: formatMySQLDateTime(),
      lastSyncStatus: 'failed',
      lastSyncError: error.message,
    });

    await updateCrawlerSyncLog(syncLog.id, {
      endTime: formatMySQLDateTime(),
      status: 'failed',
      totalFetched: result.totalFetched,
      newCount: result.newCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      errorMessage: error.message,
    });

  } finally {
    // 关闭浏览器
    if (browser) {
      try {
      await browser.close();
      console.log('[Puppeteer] 浏览器已关闭');
      } catch (e) {
        // 如果正常关闭失败，强制终止进程
        if (currentBrowserPid) {
          killBrowserProcess(currentBrowserPid);
        }
      }
    }
    
    // 清理临时目录
    if (userDataDir) {
      cleanupTempUserDataDir(userDataDir);
    }
    
    currentBrowserPid = null;
    currentTempDir = null;
    
    // 释放运行锁
    isSyncRunning = false;
    console.log('[Puppeteer] 同步任务结束，释放运行锁');
  }

  return result;
}

/**
 * 测试连接
 */
export async function testPuppeteerConnection(configId: string): Promise<{
  success: boolean;
  message: string;
  sampleData?: any[];
}> {
  let browser: Browser | null = null;
  let userDataDir: string | null = null;
  
  try {
    const config = await getCrawlerConfigById(configId);
    if (!config) {
      return { success: false, message: '配置不存在' };
    }

    const launchResult = await launchBrowser();
    browser = launchResult.browser;
    userDataDir = launchResult.userDataDir;
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await setupRequestInterception(page);
    
    const loginSuccess = await loginToTms(page, config);
    if (!loginSuccess) {
      return { success: false, message: '登录失败' };
    }
    
    const taskListUrl = config.baseUrl.replace(/\/$/, '') + '/Schedule/taskList';
    await page.goto(taskListUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    const totalPages = await getTotalPages(page);
    const sampleData = await getTableData(page);

    return {
      success: true,
      message: `连接成功！共 ${totalPages} 页，当前页 ${sampleData.length} 条记录`,
      sampleData: sampleData.slice(0, 3),
    };

  } catch (error: any) {
    return { success: false, message: `连接失败: ${error.message}` };
  } finally {
    if (browser) {
      try {
      await browser.close();
      } catch (e) {
        if (currentBrowserPid) {
          killBrowserProcess(currentBrowserPid);
        }
      }
    }
    if (userDataDir) {
      cleanupTempUserDataDir(userDataDir);
    }
  }
}
