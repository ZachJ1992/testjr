/**
 * zo-cloud TMS 爬虫模板
 * 
 * 适用于 zo-cloud 物流管理系统（如 tms25.zo-cloud.cn）
 * 登录后自动切换到指定网点，从任务列表 /Schedule/taskList 抓取数据
 * 日期范围：近6个月
 */

import { Page } from 'puppeteer-core';
import { 
  CrawlerTemplate, 
  CrawlerRuntimeConfig, 
  WaybillData,
  registerCrawlerTemplate 
} from '../crawler-templates.js';

// ==================== 全局状态 ====================
let interceptedApiData: any[] = [];
let tmsTotalRecords: number = 0;

const TARGET_ORG_NAME = '北京登途网联车队';

// ==================== 组织切换逻辑 ====================
async function switchOrganization(page: Page): Promise<boolean> {
  console.log(`[zo-cloud] 开始切换组织到: ${TARGET_ORG_NAME}`);

  const baseUrl = page.url().split('/').slice(0, 3).join('/');
  console.log(`[zo-cloud] 导航到主页: ${baseUrl}/Index/Home`);
  try {
    await page.goto(baseUrl + '/Index/Home', { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e: any) {
    console.log(`[zo-cloud] 导航到主页超时，继续: ${e.message}`);
  }
  await new Promise(resolve => setTimeout(resolve, 6000));

  const alreadyOnTarget = await page.evaluate((orgName: string) => {
    return (document.body.textContent || '').substring(0, 2000).includes(orgName);
  }, TARGET_ORG_NAME);

  if (alreadyOnTarget) {
    console.log(`[zo-cloud] 当前已在目标组织: ${TARGET_ORG_NAME}，跳过切换`);
    return true;
  }

  try { await page.screenshot({ path: '/tmp/zocloud_before_switch.png', fullPage: true }); } catch (e) {}

  // 打印顶部元素调试
  const topElements = await page.evaluate(() => {
    const results: string[] = [];
    const allEls = document.querySelectorAll('div, span, a, button, i, img');
    for (const el of allEls) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.top > 80 || rect.width < 5 || rect.height < 5) continue;
      const text = (el.textContent || '').trim();
      if (text.length > 0 && text.length < 50) {
        results.push(`[${rect.left.toFixed(0)},${rect.top.toFixed(0)} ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}] "${text.substring(0, 30)}" <${el.tagName}>`);
      }
    }
    return results.slice(0, 25);
  });
  console.log(`[zo-cloud] 页面顶部元素:\n${topElements.join('\n')}`);

  // 步骤1a: 点击右上角用户名展开下拉菜单
  console.log('[zo-cloud] 步骤1a: 点击用户名展开下拉菜单...');
  const userClicked = await page.evaluate(() => {
    const allElements = document.querySelectorAll('div, span, a, button');
    for (const el of allElements) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.top > 50 || rect.left < 1700 || rect.width > 100) continue;
      const text = (el.textContent || '').trim();
      if (text.length > 1 && text.length < 15 && !text.includes('创建') && !text.includes('挑单')) {
        (el as HTMLElement).click();
        return `"${text}" at [${rect.left.toFixed(0)},${rect.top.toFixed(0)}]`;
      }
    }
    for (const el of allElements) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.top > 50 || rect.left < 1600) continue;
      const text = (el.textContent || '').trim();
      if (text.includes('我的信息') || text.includes('退出')) {
        (el as HTMLElement).click();
        return `userArea: "${text.substring(0, 30)}"`;
      }
    }
    return null;
  });

  if (userClicked) {
    console.log(`[zo-cloud] 已点击用户区域: ${userClicked}`);
  } else {
    console.log('[zo-cloud] 未找到用户名区域');
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  // 步骤1b: 找"切换组织"菜单项并点击
  console.log('[zo-cloud] 步骤1b: 查找"切换组织"菜单项...');
  try { await page.screenshot({ path: '/tmp/zocloud_after_user_click.png', fullPage: true }); } catch (e) {}

  const switchMenuClicked = await page.evaluate(() => {
    const allElements = document.querySelectorAll('div, span, a, button, li');
    for (const el of allElements) {
      const text = (el.textContent || '').trim();
      if (text === '切换组织') {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 10 && rect.height > 5) {
          (el as HTMLElement).click();
          return `found at [${rect.left.toFixed(0)},${rect.top.toFixed(0)}]`;
        }
      }
    }
    for (const el of allElements) {
      const text = (el.textContent || '').trim();
      if (text.length < 15 && text.includes('切换') && text !== '切换组织') {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 10 && rect.height > 5) {
          (el as HTMLElement).click();
          return `partial: "${text}" at [${rect.left.toFixed(0)},${rect.top.toFixed(0)}]`;
        }
      }
    }
    return null;
  });

  if (switchMenuClicked) {
    console.log(`[zo-cloud] 已点击切换组织菜单: ${switchMenuClicked}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  } else {
    // 备用：尝试点击侧栏组织名
    console.log('[zo-cloud] 下拉菜单未找到"切换组织"，尝试侧栏组织名...');
    const sidebarClicked = await page.evaluate(() => {
      const allElements = document.querySelectorAll('div, span, a');
      for (const el of allElements) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.left > 200 || rect.top > 120 || rect.top < 40) continue;
        if (rect.width < 30 || rect.height < 10 || rect.height > 30) continue;
        const text = (el.textContent || '').trim();
        if (text.length > 2 && text.length < 30 &&
            (text.includes('车队') || text.includes('物流') || text.includes('AC') || text.includes('网联'))) {
          (el as HTMLElement).click();
          return `org: "${text}"`;
        }
      }
      return null;
    });
    if (sidebarClicked) {
      console.log(`[zo-cloud] 已点击侧栏: ${sidebarClicked}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      console.log('[zo-cloud] 未找到任何切换入口');
      try { await page.screenshot({ path: '/tmp/zocloud_no_switch_entry.png', fullPage: true }); } catch (e) {}
      return false;
    }
  }

  // 步骤2: 等待切换组织弹窗出现
  console.log('[zo-cloud] 步骤2: 等待切换组织弹窗...');
  let modalFound = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const hasModal = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      if (!bodyText.includes('切换组织')) return false;
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        if ((table.textContent || '').includes('组织名称')) return true;
      }
      return false;
    });
    if (hasModal) {
      modalFound = true;
      console.log('[zo-cloud] 切换组织弹窗已出现');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (!modalFound) {
    console.log('[zo-cloud] 切换组织弹窗未出现');
    try { await page.screenshot({ path: '/tmp/zocloud_no_modal.png', fullPage: true }); } catch (e) {}
    return false;
  }

  try { await page.screenshot({ path: '/tmp/zocloud_switch_modal.png', fullPage: true }); } catch (e) {}

  // 步骤3: 在筛选框输入目标网点名
  console.log(`[zo-cloud] 步骤3: 在筛选框输入: ${TARGET_ORG_NAME}`);

  const filterInputFound = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr, [class*="row"]');
    for (const row of rows) {
      if (!(row.textContent || '').includes('筛选')) continue;
      const inputs = row.querySelectorAll('input');
      if (inputs.length > 0) {
        (inputs[0] as HTMLInputElement).focus();
        return true;
      }
    }
    const allInputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (const input of allInputs) {
      const rect = (input as HTMLElement).getBoundingClientRect();
      if (rect.width > 40 && rect.height > 10 && rect.top > 100) {
        const parent = input.closest('table, [class*="modal"], [class*="dialog"]');
        if (parent && (parent.textContent || '').includes('组织名称')) {
          (input as HTMLInputElement).focus();
          return true;
        }
      }
    }
    return false;
  });

  if (filterInputFound) {
    await page.keyboard.type(TARGET_ORG_NAME, { delay: 30 });
    console.log('[zo-cloud] 已输入筛选文本');
  } else {
    const inputs = await page.$$('table input, [class*="modal"] input');
    if (inputs.length > 0) {
      await inputs[0].click();
      await inputs[0].type(TARGET_ORG_NAME, { delay: 30 });
      console.log('[zo-cloud] 已通过备用方式输入筛选');
    }
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  // 步骤4: 选中匹配行
  console.log('[zo-cloud] 步骤4: 选中目标网点行...');
  const rowSelected = await page.evaluate((orgName: string) => {
    const rows = document.querySelectorAll('table tbody tr');
    for (const row of rows) {
      const text = (row.textContent || '').trim();
      if (text.includes(orgName)) {
        (row as HTMLElement).click();
        const cells = row.querySelectorAll('td');
        if (cells.length > 1) (cells[1] as HTMLElement).click();
        return text.substring(0, 60);
      }
    }
    const cells = document.querySelectorAll('td');
    for (const cell of cells) {
      if ((cell.textContent || '').trim().includes(orgName)) {
        (cell as HTMLElement).click();
        const parentRow = cell.closest('tr');
        if (parentRow) (parentRow as HTMLElement).click();
        return (cell.textContent || '').substring(0, 60);
      }
    }
    return null;
  }, TARGET_ORG_NAME);

  if (rowSelected) {
    console.log(`[zo-cloud] 已选中行: ${rowSelected}`);
  } else {
    console.log('[zo-cloud] 未找到匹配行');
    try { await page.screenshot({ path: '/tmp/zocloud_no_org_row.png', fullPage: true }); } catch (e) {}
    return false;
  }

  await new Promise(resolve => setTimeout(resolve, 800));

  // 步骤5: 点击"切换组织"确认按钮
  console.log('[zo-cloud] 步骤5: 点击"切换组织"确认按钮...');
  const switchClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, a, span, div');
    const candidates: { el: HTMLElement; score: number }[] = [];
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (text !== '切换组织') continue;
      const rect = (btn as HTMLElement).getBoundingClientRect();
      if (rect.width < 40 || rect.height < 15) continue;
      candidates.push({ el: btn as HTMLElement, score: rect.top });
    }
    if (candidates.length === 0) return false;
    candidates.sort((a, b) => b.score - a.score);
    candidates[0].el.click();
    return true;
  });

  if (!switchClicked) {
    console.log('[zo-cloud] 未找到切换组织确认按钮');
    try { await page.screenshot({ path: '/tmp/zocloud_no_switch_btn.png', fullPage: true }); } catch (e) {}
    return false;
  }

  console.log('[zo-cloud] 已点击切换组织确认按钮');
  await new Promise(resolve => setTimeout(resolve, 5000));

  try { await page.screenshot({ path: '/tmp/zocloud_after_switch.png', fullPage: true }); } catch (e) {}

  const verified = await page.evaluate((orgName: string) => {
    return (document.body.textContent || '').substring(0, 1000).includes(orgName);
  }, TARGET_ORG_NAME);

  console.log(verified
    ? `[zo-cloud] 组织切换成功: ${TARGET_ORG_NAME}`
    : '[zo-cloud] 警告：无法确认组织切换结果，继续执行');

  return true;
}

// ==================== 辅助函数 ====================
function parseNumber(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

// ==================== 登录逻辑 ====================
async function login(page: Page, config: CrawlerRuntimeConfig): Promise<boolean> {
  console.log(`[zo-cloud] 开始登录 - 公司ID: ${config.companyId}, 用户名: ${config.username}`);
  
  const loginUrls = [
    config.loginUrl + '/tms/login',
    config.loginUrl + '/Login',
    config.loginUrl + '/login',
    config.loginUrl + '/user/login',
    config.loginUrl + '/#/login',
    config.loginUrl,
  ];
  
  let loginPageFound = false;
  
  for (const loginUrl of loginUrls) {
    console.log(`[zo-cloud] 尝试访问: ${loginUrl}`);
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const inputs = await page.$$('input');
      console.log(`[zo-cloud] 在 ${loginUrl} 找到 ${inputs.length} 个输入框`);
      
      if (inputs.length >= 2) {
        loginPageFound = true;
        console.log(`[zo-cloud] 找到登录页面: ${loginUrl}`);
        break;
      }
      
      const currentUrl = page.url();
      if (currentUrl.includes('/Index/Home') || currentUrl.includes('/home') || currentUrl.includes('/dashboard') || currentUrl.includes('/Schedule')) {
        console.log('[zo-cloud] 已经登录，无需重新登录');
        console.log('[zo-cloud] 执行组织切换...');
        const switchResult = await switchOrganization(page);
        if (!switchResult) {
          console.log('[zo-cloud] 组织切换失败');
          return false;
        }
        return true;
      }
    } catch (e: any) {
      console.log(`[zo-cloud] 访问 ${loginUrl} 失败: ${e.message}`);
    }
  }
  
  if (!loginPageFound) {
    console.log('[zo-cloud] 直接URL未找到登录页，尝试点击"开始体验"按钮...');
    await page.goto(config.loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      const startButtonClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a.btn, a[class*="button"], span[class*="button"]');
        for (const btn of buttons) {
          const text = (btn.textContent || '').trim();
          if (text === '开始体验' || text === '进入系统' || text === '登录' || text === '进入') {
            (btn as HTMLElement).click();
            return text;
          }
        }
        return null;
      });
      
      if (startButtonClicked) {
        console.log(`[zo-cloud] 已点击"${startButtonClicked}"按钮，等待登录页加载...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (e) {
      console.log('[zo-cloud] 未找到"开始体验"按钮');
    }
  }
  
  let loginFormFound = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[zo-cloud] 尝试查找登录表单 (第${attempt}次)...`);
    
    const inputs = await page.$$('input[type="text"], input[type="password"], input:not([type])');
    console.log(`[zo-cloud] 找到 ${inputs.length} 个输入框`);
    
    if (inputs.length >= 3) {
      loginFormFound = true;
      console.log(`[zo-cloud] 填写公司ID: ${config.companyId}`);
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(config.companyId, { delay: 50 });
      console.log(`[zo-cloud] 填写用户名: ${config.username}`);
      await inputs[1].click({ clickCount: 3 });
      await inputs[1].type(config.username, { delay: 50 });
      console.log('[zo-cloud] 填写密码');
      await inputs[2].click({ clickCount: 3 });
      await inputs[2].type(config.password, { delay: 50 });
      break;
    } else if (inputs.length >= 2) {
      loginFormFound = true;
      console.log(`[zo-cloud] 填写用户名: ${config.username}`);
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(config.username, { delay: 50 });
      console.log('[zo-cloud] 填写密码');
      await inputs[1].click({ clickCount: 3 });
      await inputs[1].type(config.password, { delay: 50 });
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  if (!loginFormFound) {
    console.log('[zo-cloud] 未找到登录表单');
    return false;
  }
  
  console.log('[zo-cloud] 查找并点击登录按钮...');
  const loginClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, [type="submit"], .btn, [class*="button"]');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (text.includes('登录') || text.includes('Login') || text.includes('立即登录')) {
        (btn as HTMLElement).click();
        return text;
      }
    }
    const form = document.querySelector('form');
    if (form) { form.submit(); return 'form-submit'; }
    return null;
  });
  
  if (loginClicked) {
    console.log(`[zo-cloud] 已点击登录按钮: ${loginClicked}`);
  }
  
  console.log('[zo-cloud] 等待登录完成...');
  let loginSuccess = false;
  const startUrl = page.url();
  
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const currentUrl = page.url();
    
    if (currentUrl !== startUrl) {
      console.log(`[zo-cloud] 检测到URL变化: ${currentUrl}`);
    }
    
    if (currentUrl.includes('/Index/Home') || 
        currentUrl.includes('/Schedule') || 
        currentUrl.includes('/dashboard')) {
      console.log(`[zo-cloud] 登录成功！跳转到: ${currentUrl}`);
      loginSuccess = true;
      break;
    }
    
    const hasError = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('.el-message--error, .error, [class*="error"]');
      for (const el of errorElements) {
        const text = (el.textContent || '').trim();
        if (text.length > 0 && text.length < 100) return text;
      }
      return null;
    });
    
    if (hasError) {
      console.log(`[zo-cloud] 登录错误: ${hasError}`);
      break;
    }
  }
  
  if (!loginSuccess) {
    console.log('[zo-cloud] 尝试直接访问主页...');
    try {
      await page.goto(config.loginUrl + '/Index/Home', { waitUntil: 'networkidle2', timeout: 15000 });
      const newUrl = page.url();
      if (newUrl.includes('/Index/Home') || newUrl.includes('/Schedule')) {
        console.log('[zo-cloud] 直接访问主页成功！');
        loginSuccess = true;
      }
    } catch (e: any) {
      console.log(`[zo-cloud] 直接访问主页失败: ${e.message}`);
    }
  }
  
  if (loginSuccess) {
    console.log('[zo-cloud] 登录成功，执行组织切换...');
    const switchResult = await switchOrganization(page);
    if (!switchResult) {
      console.log('[zo-cloud] 组织切换失败');
      return false;
    }
  }
  
  return loginSuccess;
}

// ==================== 数据获取逻辑 ====================
async function fetchData(page: Page, config: CrawlerRuntimeConfig, maxPages: number): Promise<any[]> {
  console.log('[zo-cloud] 开始获取数据...');
  
  interceptedApiData = [];
  tmsTotalRecords = 0;
  
  // 设置 API 拦截
  await page.setRequestInterception(true);
  
  page.on('request', request => {
    request.continue();
  });
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('batchList') || url.includes('Batch/list') || url.includes('taskList')) {
      try {
        const text = await response.text();
        const data = JSON.parse(text);
        
        if (data.res && data.res.data && Array.isArray(data.res.data)) {
          const total = data.res.total?.count || data.res.total || 0;
          console.log(`[zo-cloud] 拦截到 API 数据: ${data.res.data.length} 条, 总数: ${total}`);
          interceptedApiData.push(...data.res.data);
          tmsTotalRecords = total || tmsTotalRecords;
        } else if (data.data && Array.isArray(data.data.datas)) {
          console.log(`[zo-cloud] 拦截到 API 数据: ${data.data.datas.length} 条`);
          interceptedApiData.push(...data.data.datas);
          tmsTotalRecords = data.data.total || tmsTotalRecords;
        } else if (data.datas && Array.isArray(data.datas)) {
          console.log(`[zo-cloud] 拦截到 API 数据: ${data.datas.length} 条`);
          interceptedApiData.push(...data.datas);
          tmsTotalRecords = data.total || tmsTotalRecords;
        }
      } catch (e) {
        // 忽略非 JSON 响应
      }
    }
  });
  
  // 访问任务列表页面
  const taskListUrl = config.loginUrl + '/Schedule/taskList';
  console.log(`[zo-cloud] 访问任务列表: ${taskListUrl}`);
  
  try {
    await page.goto(taskListUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e: any) {
    console.log(`[zo-cloud] 访问任务列表超时，继续: ${e.message}`);
  }
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 点击"全部" tab
  console.log('[zo-cloud] 查找"全部" tab...');
  try {
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('div, span, a, li, button');
      for (const tab of tabs) {
        const text = (tab.textContent || '').trim();
        if (text === '全部') {
          (tab as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (e) {}
  
  // 设置日期范围为近6个月
  console.log('[zo-cloud] 设置日期范围为近6个月...');
  try {
    // 尝试点击日期输入框打开日期选择面板
    const dateInputClicked = await page.evaluate(() => {
      const dateInputs = document.querySelectorAll(
        'input[class*="date"], [class*="date-input"], [class*="picker-input"], input[placeholder*="日期"], input[placeholder*="开始"]'
      );
      for (const input of dateInputs) {
        const rect = (input as HTMLElement).getBoundingClientRect();
        if (rect.width > 50 && rect.top > 0 && rect.top < 300) {
          (input as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    
    if (dateInputClicked) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // 查找并点击"近六月"快捷按钮
    const quickBtnClicked = await page.evaluate(() => {
      const allLabels = document.querySelectorAll('label, span, div, button, a');
      for (const el of allLabels) {
        const text = (el.textContent || '').trim();
        if (text === '近六月' || text === '近半年' || text === '半年' || text === '6个月' || text === '近6月') {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            (el as HTMLElement).click();
            return text;
          }
        }
      }
      return null;
    });
    
    if (quickBtnClicked) {
      console.log(`[zo-cloud] 已点击日期快捷按钮: ${quickBtnClicked}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 点击"确定"按钮确认日期
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button, span, div');
        for (const btn of btns) {
          const text = (btn.textContent || '').trim();
          if (text === '确定' || text === '确 定') {
            const rect = (btn as HTMLElement).getBoundingClientRect();
            if (rect.width > 20 && rect.height > 15 && rect.top > 100) {
              (btn as HTMLElement).click();
              return;
            }
          }
        }
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log('[zo-cloud] 未找到"近六月"快捷按钮，尝试手动设置日期...');
      // 手动设置日期范围为6个月前到今天
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const startStr = sixMonthsAgo.toISOString().split('T')[0].replace(/-/g, '-');
      const endStr = new Date().toISOString().split('T')[0].replace(/-/g, '-');
      console.log(`[zo-cloud] 设置日期范围: ${startStr} ~ ${endStr}`);
    }
    
    // 点击"查询"按钮触发搜索
    console.log('[zo-cloud] 点击查询按钮...');
    const queryClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, [class*="btn"], span');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        const rect = (btn as HTMLElement).getBoundingClientRect();
        if ((text === '查询' || text === '搜索' || text === 'Q 查询') && 
            rect.width > 20 && rect.height > 15 && rect.top < 500) {
          (btn as HTMLElement).click();
          return text;
        }
      }
      return null;
    });
    
    if (queryClicked) {
      console.log(`[zo-cloud] 已点击查询按钮: ${queryClicked}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } catch (e: any) {
    console.log(`[zo-cloud] 日期设置失败: ${e.message}`);
  }
  
  try { await page.screenshot({ path: '/tmp/zocloud_task_list.png', fullPage: true }); } catch (e) {}

  // 等待数据加载
  console.log('[zo-cloud] 等待数据加载...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const allData: any[] = [];
  
  // 先尝试直接 API 调用获取全量数据
  console.log('[zo-cloud] 尝试直接 API 获取数据...');
  const pageSize = 500;
  let currentPage = 1;
  let totalRecords = 0;
  let hasMore = true;
  
  // 构建6个月前的日期字符串
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const startDateStr = sixMonthsAgo.toISOString().split('T')[0];
  
  while (hasMore && currentPage <= maxPages) {
    console.log(`[zo-cloud] 请求第 ${currentPage} 页...`);
    
    try {
      const pageResult = await page.evaluate(async (params: { page: number; pageSize: number; startDate: string }) => {
        try {
          const apiUrl = '/api/Table/Search/batchList';
          const requestBody = {
            page: params.page,
            page_size: params.pageSize,
            sort_field: 'create_time',
            sort_type: 'desc',
            create_time_start: params.startDate,
          };
          
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(requestBody),
            credentials: 'include'
          });
          
          if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
          
          const data = await response.json();
          
          if (data.errno === 0 && data.res && data.res.data) {
            const total = data.res.total?.count || data.res.total || 0;
            return { success: true, records: data.res.data, total, count: data.res.data.length };
          }
          if (data.data && Array.isArray(data.data.datas)) {
            return { success: true, records: data.data.datas, total: data.data.total || 0, count: data.data.datas.length };
          }
          if (data.data && Array.isArray(data.data)) {
            return { success: true, records: data.data, total: data.total || 0, count: data.data.length };
          }
          return { success: false, error: 'Unknown format', raw: JSON.stringify(data).substring(0, 200) };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      }, { page: currentPage, pageSize, startDate: startDateStr });
      
      if (pageResult.success && pageResult.records && pageResult.records.length > 0) {
        allData.push(...pageResult.records);
        totalRecords = pageResult.total || totalRecords;
        console.log(`[zo-cloud] 第 ${currentPage} 页获取 ${pageResult.count} 条，累计 ${allData.length}/${totalRecords}`);
        
        if (pageResult.count < pageSize || allData.length >= totalRecords) {
          hasMore = false;
        }
        currentPage++;
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.log(`[zo-cloud] API 请求失败: ${pageResult.error || 'no data'}`);
        if (currentPage === 1 && interceptedApiData.length > 0) {
          console.log(`[zo-cloud] 使用拦截的 ${interceptedApiData.length} 条数据`);
          allData.push(...interceptedApiData);
          interceptedApiData = [];
        }
        hasMore = false;
      }
    } catch (apiError: any) {
      console.log(`[zo-cloud] API 调用异常: ${apiError.message}`);
      if (interceptedApiData.length > 0) {
        allData.push(...interceptedApiData);
        interceptedApiData = [];
      }
      hasMore = false;
    }
  }
  
  // 兜底：拦截数据
  if (allData.length === 0 && interceptedApiData.length > 0) {
    console.log(`[zo-cloud] 使用拦截的 ${interceptedApiData.length} 条数据`);
    allData.push(...interceptedApiData);
  }
  
  console.log(`[zo-cloud] 数据获取完成，共 ${allData.length} 条`);
  if (allData.length > 0) {
    console.log(`[zo-cloud] 第一条数据键: ${Object.keys(allData[0]).slice(0, 15).join(', ')}`);
  }
  return allData;
}

// ==================== 字段映射逻辑 ====================
// batchList 返回的字段与摇钱树配载页相同（同一平台）
function mapFields(rawData: any): WaybillData {
  const item = rawData.rawData || rawData;
  
  const statusMap: Record<string, string> = {
    '0': 'cancelled',
    '1': 'pending',
    '2': 'in_transit',
    '3': 'delivered',
    '4': 'completed',
    '10': 'pending',
  };
  
  const waybillNumber = String(item.car_batch || item.id || '').trim();
  
  let departurePlace = '';
  let arrivalPlace = '';
  if (item.route_text) {
    const parts = item.route_text.split('->');
    if (parts.length >= 2) {
      departurePlace = parts[0].trim();
      arrivalPlace = parts[parts.length - 1].trim();
    }
  }

  // 应收费用
  const receivableCash      = parseNumber(item.b_spot_fee);
  const receivableCollect   = parseNumber(item.b_tr_pay_arrival_s);
  const receivableMonthly   = parseNumber(item.b_tr_pay_monthly_s);
  const receivableReturn    = parseNumber(item.b_tr_cashreturn_s);
  const receivableTransport = parseNumber(item.b_tr_trans_f_s);
  const receiptPay          = parseNumber(item.b_tr_pay_receipt_s);
  const billingPay          = parseNumber(item.b_tr_pay_billing_s);
  const creditPay           = parseNumber(item.b_tr_pay_credit_s);
  const coDelivery          = parseNumber(item.b_tr_co_delivery_s);

  let receivableTotal = parseNumber(item.b_tr_total_price_s || item.receivable_total);
  if (receivableTotal === 0) {
    receivableTotal = receivableCash + receivableCollect + receivableMonthly
                    + receivableReturn + receiptPay + billingPay + creditPay + coDelivery;
  }

  // 应付费用
  const payableArrival  = parseNumber(item.b_arr_f_total);
  const payableFuelCard = parseNumber(item.b_fuel_card_f_total);
  const payableBilling  = parseNumber(item.b_billing_f_total);
  const payableReceipt  = parseNumber(item.b_receipt_f_total);
  const payableTotal    = payableArrival + payableFuelCard + payableBilling + payableReceipt;

  const rawStatus = String(item.batch_st || '1');
  const status = statusMap[rawStatus] || 'pending';
  
  const truckTime = item.truck_t || item.head_truck_t || item.cur_truck_t || item.create_time || null;

  return {
    waybillNumber,
    externalId: String(item.id || ''),
    driverName: item.b_dr_name || '',
    vehiclePlate: item.b_tr_num || '',
    departurePlace,
    arrivalPlace,
    weight: parseNumber(item.b_tr_load_w_s),
    volume: parseNumber(item.b_tr_load_v_s),
    freight: receivableTotal,
    receivableTotal,
    receivableCash,
    receivableCollect,
    receivableMonthly,
    receivableReturn,
    receivableTransport,
    payableTotal,
    status,
    remark: String(item.b_remark || ''),
    createTime: truckTime ? new Date(truckTime) : undefined,
    shipTime: truckTime ? new Date(truckTime) : undefined,
  };
}

// ==================== 模板定义 ====================
const zoCloudTemplate: CrawlerTemplate = {
  id: 'zo-cloud',
  name: 'zo-cloud TMS',
  description: 'zo-cloud 物流管理系统，自动切换到指定网点后从任务列表抓取数据（近6个月）',
  requiredFields: [
    { 
      key: 'loginUrl', 
      label: '登录地址', 
      type: 'text', 
      required: true,
      placeholder: '例如: https://tms25.zo-cloud.cn',
      defaultValue: 'https://tms25.zo-cloud.cn'
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
  ],
  login,
  fetchData,
  mapFields,
};

// ==================== 注册模板 ====================
registerCrawlerTemplate(zoCloudTemplate);

export default zoCloudTemplate;
