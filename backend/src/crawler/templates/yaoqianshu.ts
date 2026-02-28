/**
 * 摇钱树物流系统 爬虫模板
 * 
 * 适用于摇钱树物流系统（rm.zo-cloud.cn）
 * 登录后自动切换到指定网点，从车辆配载页 /Operate/carStowage 抓取数据
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

const TARGET_ORG_NAME = '嘉上嘉供应链重庆山东A';

// ==================== 组织切换逻辑 ====================
async function switchOrganization(page: Page): Promise<boolean> {
  console.log(`[摇钱树] 开始切换组织到: ${TARGET_ORG_NAME}`);

  const SKIP_TEXTS = ['创建运单', '挑单夹', '查单', '首页', '运单列表', '到车管理', '车辆配载',
    '帮助中心', '退出', '报表中心', '消息中心', '财务中心', '会计中心', '业务中心'];

  // 先导航到主页，确保页面完全加载
  const baseUrl = page.url().split('/').slice(0, 3).join('/') || 'https://rm.zo-cloud.cn';
  console.log(`[摇钱树] 导航到主页: ${baseUrl}/Index/Home`);
  try {
    await page.goto(baseUrl + '/Index/Home', { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e: any) {
    console.log(`[摇钱树] 导航到主页超时，继续: ${e.message}`);
  }
  // 等待页面完全渲染（截图显示页面有loading进度条）
  await new Promise(resolve => setTimeout(resolve, 6000));

  // 检查当前是否已在目标组织
  const alreadyOnTarget = await page.evaluate((orgName: string) => {
    const text = (document.body.textContent || '').substring(0, 2000);
    return text.includes(orgName);
  }, TARGET_ORG_NAME);

  if (alreadyOnTarget) {
    console.log(`[摇钱树] 当前已在目标组织: ${TARGET_ORG_NAME}，跳过切换`);
    return true;
  }

  try {
    await page.screenshot({ path: '/tmp/yaoqianshu_before_switch.png', fullPage: true });
  } catch (e) {}

  // 先打印页面顶部区域的所有可见元素（调试用）
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
    return results.slice(0, 30);
  });
  console.log(`[摇钱树] 页面顶部元素(前30):\n${topElements.join('\n')}`);

  // 步骤1: 先点右上角用户名展开下拉菜单，再点"切换组织"
  console.log('[摇钱树] 步骤1: 查找并点击切换组织入口...');

  // 步骤1a: 点击右上角用户名区域展开下拉菜单
  console.log('[摇钱树] 步骤1a: 点击用户名展开下拉菜单...');
  const userClicked = await page.evaluate(() => {
    const allElements = document.querySelectorAll('div, span, a, button');
    // 找到顶栏最右侧的用户名元素（排除导航/按钮）
    for (const el of allElements) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.top > 50 || rect.left < 1800 || rect.width > 100) continue;
      const text = (el.textContent || '').trim();
      if (text.length > 1 && text.length < 15 && !text.includes('创建') && !text.includes('挑单')) {
        (el as HTMLElement).click();
        return `"${text}" at [${rect.left.toFixed(0)},${rect.top.toFixed(0)}]`;
      }
    }
    // 备用：hover/click右上角用户区域的父容器
    for (const el of allElements) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.top > 50 || rect.left < 1700) continue;
      const text = (el.textContent || '').trim();
      if (text.includes('我的信息') || text.includes('退出')) {
        (el as HTMLElement).click();
        return `userArea: "${text.substring(0, 30)}" at [${rect.left.toFixed(0)},${rect.top.toFixed(0)}]`;
      }
    }
    return null;
  });

  if (userClicked) {
    console.log(`[摇钱树] 已点击用户区域: ${userClicked}`);
  } else {
    console.log('[摇钱树] 未找到用户名区域');
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  // 步骤1b: 在展开的下拉菜单或侧栏中找"切换组织"并点击
  console.log('[摇钱树] 步骤1b: 查找"切换组织"菜单项...');

  // 截图看展开后的状态
  try { await page.screenshot({ path: '/tmp/yaoqianshu_after_user_click.png', fullPage: true }); } catch (e) {}

  const switchMenuClicked = await page.evaluate(() => {
    const allElements = document.querySelectorAll('div, span, a, button, li');
    // 精确找"切换组织"文字
    for (const el of allElements) {
      const text = (el.textContent || '').trim();
      if (text === '切换组织') {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 10 && rect.height > 5) {
          (el as HTMLElement).click();
          return `found: "${text}" at [${rect.left.toFixed(0)},${rect.top.toFixed(0)}]`;
        }
      }
    }
    // 备用：找包含"切换"的较短文本
    for (const el of allElements) {
      const text = (el.textContent || '').trim();
      if (text.length < 15 && text.includes('切换') && !text.includes('切换组织')) {
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
    console.log(`[摇钱树] 已点击切换组织菜单: ${switchMenuClicked}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  } else {
    // 步骤1c: 如果下拉里没有"切换组织"，尝试直接点侧栏组织名
    console.log('[摇钱树] 下拉菜单未找到"切换组织"，尝试点击侧栏组织名...');

    // 重新打印当前可见的所有链接/按钮文字用于调试
    const visibleTexts = await page.evaluate(() => {
      const results: string[] = [];
      const els = document.querySelectorAll('a, button, span, div, li');
      for (const el of els) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width < 5 || rect.height < 5) continue;
        const text = (el.textContent || '').trim();
        if (text.length > 0 && text.length < 30 && text.includes('切换')) {
          results.push(`[${rect.left.toFixed(0)},${rect.top.toFixed(0)} ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}] "${text}" <${el.tagName}>`);
        }
      }
      return results;
    });
    console.log(`[摇钱树] 页面中包含"切换"的元素: ${visibleTexts.length > 0 ? '\n' + visibleTexts.join('\n') : '无'}`);

    // 尝试点击侧栏中的组织名
    const sidebarOrgClicked = await page.evaluate(() => {
      const allElements = document.querySelectorAll('div, span, a');
      for (const el of allElements) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.left > 200 || rect.top > 120 || rect.top < 40) continue;
        if (rect.width < 30 || rect.height < 10 || rect.height > 30) continue;
        const text = (el.textContent || '').trim();
        if (text.length > 2 && text.length < 30 &&
            (text.includes('AC') || text.includes('网') || text.includes('供应链') || text.includes('物流'))) {
          (el as HTMLElement).click();
          return `org: "${text}" at [${rect.left.toFixed(0)},${rect.top.toFixed(0)}]`;
        }
      }
      return null;
    });

    if (sidebarOrgClicked) {
      console.log(`[摇钱树] 已点击侧栏组织: ${sidebarOrgClicked}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      console.log('[摇钱树] 未找到任何切换组织入口');
      try { await page.screenshot({ path: '/tmp/yaoqianshu_no_switch_entry.png', fullPage: true }); } catch (e) {}
      return false;
    }
  }

  // 步骤2: 等待"切换组织"弹窗出现
  console.log('[摇钱树] 步骤2: 等待切换组织弹窗...');

  let modalFound = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const hasModal = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      if (!bodyText.includes('切换组织')) return false;
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        if ((table.textContent || '').includes('组织名称')) return true;
      }
      const modals = document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="popup"], [class*="layer"], [class*="mask"]');
      for (const modal of modals) {
        if ((modal.textContent || '').includes('组织名称') && (modal as HTMLElement).offsetHeight > 100) return true;
      }
      return false;
    });

    if (hasModal) {
      modalFound = true;
      console.log('[摇钱树] 切换组织弹窗已出现');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (!modalFound) {
    console.log('[摇钱树] 切换组织弹窗未出现');
    try { await page.screenshot({ path: '/tmp/yaoqianshu_no_modal.png', fullPage: true }); } catch (e) {}
    return false;
  }

  try { await page.screenshot({ path: '/tmp/yaoqianshu_switch_modal.png', fullPage: true }); } catch (e) {}

  // 步骤3: 在"组织名称"筛选列输入目标网点名
  console.log(`[摇钱树] 步骤3: 在筛选框输入: ${TARGET_ORG_NAME}`);

  // 使用 Puppeteer 原生 type 方法，确保事件完整触发
  const filterInputFound = await page.evaluate(() => {
    // 查找表格筛选行中的输入框（"筛选"标签所在行的输入框）
    const rows = document.querySelectorAll('tr, [class*="row"]');
    for (const row of rows) {
      const rowText = (row.textContent || '').trim();
      if (!rowText.includes('筛选')) continue;
      const inputs = row.querySelectorAll('input');
      if (inputs.length > 0) {
        // 第一个输入框通常对应"组织名称"列
        (inputs[0] as HTMLInputElement).focus();
        (inputs[0] as HTMLInputElement).scrollIntoView({ block: 'center' });
        return true;
      }
    }

    // 备用：查找弹窗区域内的第一个可见文本输入框
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
    console.log('[摇钱树] 已输入筛选文本');
  } else {
    console.log('[摇钱树] 未找到筛选输入框，尝试使用选择器...');
    const inputs = await page.$$('table input, [class*="modal"] input, [class*="dialog"] input');
    if (inputs.length > 0) {
      await inputs[0].click();
      await inputs[0].type(TARGET_ORG_NAME, { delay: 30 });
      console.log('[摇钱树] 已通过备用方式输入筛选文本');
    } else {
      console.log('[摇钱树] 警告：无法找到筛选输入框');
    }
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  try { await page.screenshot({ path: '/tmp/yaoqianshu_after_filter.png', fullPage: true }); } catch (e) {}

  // 步骤4: 选中匹配的网点行
  console.log('[摇钱树] 步骤4: 选中目标网点行...');

  const rowSelected = await page.evaluate((orgName: string) => {
    const rows = document.querySelectorAll('table tbody tr');
    for (const row of rows) {
      const text = (row.textContent || '').trim();
      if (text.includes(orgName)) {
        (row as HTMLElement).click();
        // 同时尝试点击行内的单元格
        const cells = row.querySelectorAll('td');
        if (cells.length > 1) {
          (cells[1] as HTMLElement).click();
        }
        return text.substring(0, 60);
      }
    }
    // 备用：查找包含目标名称的任何单元格
    const cells = document.querySelectorAll('td, [class*="cell"]');
    for (const cell of cells) {
      const t = (cell.textContent || '').trim();
      if (t === orgName || t.includes(orgName)) {
        (cell as HTMLElement).click();
        const parentRow = cell.closest('tr');
        if (parentRow) (parentRow as HTMLElement).click();
        return t.substring(0, 60);
      }
    }
    return null;
  }, TARGET_ORG_NAME);

  if (rowSelected) {
    console.log(`[摇钱树] 已选中行: ${rowSelected}`);
  } else {
    console.log('[摇钱树] 未找到匹配的网点行');
    try { await page.screenshot({ path: '/tmp/yaoqianshu_no_org_row.png', fullPage: true }); } catch (e) {}
    return false;
  }

  await new Promise(resolve => setTimeout(resolve, 800));

  // 步骤5: 点击"切换组织"确认按钮（弹窗底部的蓝色按钮）
  console.log('[摇钱树] 步骤5: 点击"切换组织"确认按钮...');

  const switchClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, a, span, div');
    const candidates: { el: HTMLElement; score: number }[] = [];

    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (text !== '切换组织') continue;
      const rect = (btn as HTMLElement).getBoundingClientRect();
      if (rect.width < 40 || rect.height < 15) continue;
      // 给底部位置更高的优先级（确认按钮通常在弹窗底部）
      const score = rect.top;
      candidates.push({ el: btn as HTMLElement, score });
    }

    if (candidates.length === 0) return false;

    // 选择位置最靠下的那个（弹窗底部的确认按钮）
    candidates.sort((a, b) => b.score - a.score);
    candidates[0].el.click();
    return true;
  });

  if (switchClicked) {
    console.log('[摇钱树] 已点击切换组织确认按钮');
  } else {
    console.log('[摇钱树] 未找到切换组织按钮');
    try { await page.screenshot({ path: '/tmp/yaoqianshu_no_switch_btn.png', fullPage: true }); } catch (e) {}
    return false;
  }

  // 等待组织切换完成（页面可能刷新）
  console.log('[摇钱树] 等待组织切换完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    await page.screenshot({ path: '/tmp/yaoqianshu_after_switch.png', fullPage: true });
    console.log('[摇钱树] 已保存组织切换后截图');
  } catch (e) {}

  // 验证切换结果
  const switchVerified = await page.evaluate((orgName: string) => {
    const text = (document.body.textContent || '').substring(0, 1000);
    return text.includes(orgName);
  }, TARGET_ORG_NAME);

  if (switchVerified) {
    console.log(`[摇钱树] 组织切换成功: ${TARGET_ORG_NAME}`);
  } else {
    console.log('[摇钱树] 警告：无法确认组织切换结果，继续执行');
  }

  return true;
}

// ==================== 登录逻辑 ====================
async function login(page: Page, config: CrawlerRuntimeConfig): Promise<boolean> {
  console.log(`[摇钱树] 开始登录 - 用户名: ${config.username}`);
  
  const loginUrl = config.loginUrl || 'https://rm.zo-cloud.cn';
  
  console.log(`[摇钱树] 访问登录页面: ${loginUrl}`);
  try {
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (e: any) {
    console.log(`[摇钱树] 访问登录页面失败: ${e.message}`);
    return false;
  }
  
  try {
    await page.screenshot({ path: '/tmp/yaoqianshu_before_login.png', fullPage: true });
    console.log('[摇钱树] 已保存登录前截图');
  } catch (e) {}
  
  // 检查是否已经登录
  const currentUrl = page.url();
  if (currentUrl.includes('/Order') || currentUrl.includes('/Index') || currentUrl.includes('/Home') || currentUrl.includes('/Operate')) {
    console.log('[摇钱树] 已经登录，无需重新登录');
    console.log('[摇钱树] 执行组织切换...');
    const switchResult = await switchOrganization(page);
    if (!switchResult) {
      console.log('[摇钱树] 组织切换失败');
      return false;
    }
    return true;
  }
  
  // 尝试点击右上角的"登录"按钮打开登录弹窗
  console.log('[摇钱树] 尝试点击登录按钮打开登录弹窗...');
  const loginButtonClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, a, span, div');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text === '登录' || text === '登 录' || text.includes('login')) {
        (btn as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  
  if (loginButtonClicked) {
    console.log('[摇钱树] 已点击登录按钮，等待弹窗出现...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // 查找并填写登录表单
  console.log('[摇钱树] 查找登录表单...');
  
  let loginFormFound = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[摇钱树] 尝试查找登录表单 (第${attempt}次)...`);
    
    if (attempt > 1) {
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a, span, div');
        for (const btn of buttons) {
          const text = btn.textContent?.trim() || '';
          if (text === '登录' || text === '登 录') {
            (btn as HTMLElement).click();
            break;
          }
        }
      });
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    const inputsCount = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])');
      return inputs.length;
    });
    
    console.log(`[摇钱树] 找到 ${inputsCount} 个输入框`);
    
    if (inputsCount >= 2) {
      loginFormFound = true;
      
      console.log('[摇钱树] 使用 Puppeteer 原生方法填写表单...');
      
      try {
        const usernameSelectors = [
          'input[placeholder="请输入账号"]',
          'input[placeholder*="账号"]',
          'input[placeholder*="用户"]',
          'input[placeholder*="手机"]',
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="password"]):first-of-type'
        ];
        
        let usernameInput = null;
        for (const selector of usernameSelectors) {
          usernameInput = await page.$(selector);
          if (usernameInput) {
            console.log(`[摇钱树] 找到账号输入框: ${selector}`);
            break;
          }
        }
        
        if (usernameInput) {
          await usernameInput.click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await usernameInput.type(config.username, { delay: 30 });
          console.log(`[摇钱树] 用户名已填写: ${config.username}`);
        } else {
          console.log('[摇钱树] 未找到账号输入框');
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const passwordSelectors = [
          'input[placeholder="请输入密码"]',
          'input[placeholder*="密码"]',
          'input[type="password"]',
          'input[placeholder*="password"]'
        ];
        
        let passwordInput = null;
        for (const selector of passwordSelectors) {
          passwordInput = await page.$(selector);
          if (passwordInput) {
            console.log(`[摇钱树] 找到密码输入框: ${selector}`);
            break;
          }
        }
        
        if (passwordInput) {
          await passwordInput.click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await passwordInput.type(config.password, { delay: 30 });
          console.log('[摇钱树] 密码已填写');
        } else {
          console.log('[摇钱树] 使用备选方法查找密码输入框...');
          const allInputs = await page.$$('input:not([type="hidden"]):not([type="checkbox"])');
          console.log(`[摇钱树] 共找到 ${allInputs.length} 个输入框`);
          if (allInputs.length >= 2) {
            await allInputs[1].click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            await allInputs[1].type(config.password, { delay: 30 });
            console.log('[摇钱树] 密码已填写（使用第二个输入框）');
          } else {
            console.log('[摇钱树] 警告：未找到密码输入框！');
          }
        }
      } catch (e: any) {
        console.log(`[摇钱树] 填写表单时出错: ${e.message}`);
      }
      
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  if (!loginFormFound) {
    console.log('[摇钱树] 未找到登录表单');
    try { await page.screenshot({ path: '/tmp/yaoqianshu_no_form.png', fullPage: true }); } catch (e) {}
    return false;
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  try {
    await page.screenshot({ path: '/tmp/yaoqianshu_form_filled.png', fullPage: true });
    console.log('[摇钱树] 已保存填写后截图');
  } catch (e) {}
  
  // 点击登录按钮
  console.log('[摇钱树] 查找并点击登录按钮...');
  const loginClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, input[type="submit"], a.btn, [class*="login-btn"], [class*="submit"]');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      const value = (btn as HTMLInputElement).value || '';
      if (text.includes('登录') || text.includes('Login') || value.includes('登录')) {
        (btn as HTMLElement).click();
        return text || value;
      }
    }
    
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const text = (btn.textContent || '').trim();
      if (text && text.length < 10 && !text.includes('注册')) {
        (btn as HTMLElement).click();
        return text;
      }
    }
    
    const form = document.querySelector('form');
    if (form) {
      form.submit();
      return 'form-submit';
    }
    
    return null;
  });
  
  if (loginClicked) {
    console.log(`[摇钱树] 已点击登录按钮: ${loginClicked}`);
  } else {
    console.log('[摇钱树] 未找到登录按钮，尝试按回车');
    await page.keyboard.press('Enter');
  }
  
  // 等待登录完成
  console.log('[摇钱树] 等待登录完成和页面跳转...');
  let loginSuccess = false;
  const startUrl = page.url();
  
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const nowUrl = page.url();
    
    if (nowUrl !== startUrl) {
      console.log(`[摇钱树] 检测到URL变化: ${nowUrl}`);
    }
    
    if (nowUrl.includes('/Order') || 
        nowUrl.includes('/Index') || 
        nowUrl.includes('/Home') ||
        nowUrl.includes('/Schedule') ||
        nowUrl.includes('/Operate')) {
      console.log(`[摇钱树] 登录成功！跳转到: ${nowUrl}`);
      loginSuccess = true;
      break;
    }
    
    const hasError = await page.evaluate(() => {
      const errorSelectors = [
        '.el-message--error',
        '.error',
        '[class*="error"]',
        '.ant-message-error',
        '.toast-error'
      ];
      
      for (const selector of errorSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = (el.textContent || '').trim();
          if (text.length > 0 && text.length < 100) {
            return text;
          }
        }
      }
      return null;
    });
    
    if (hasError) {
      console.log(`[摇钱树] 登录错误: ${hasError}`);
      break;
    }
    
    if (i === 5 || i === 10 || i === 15) {
      console.log(`[摇钱树] 等待跳转中... (${i}s)`);
    }
  }
  
  try {
    await page.screenshot({ path: '/tmp/yaoqianshu_after_login.png', fullPage: true });
    console.log('[摇钱树] 已保存登录后截图');
  } catch (e) {}
  
  if (!loginSuccess) {
    console.log('[摇钱树] 尝试直接访问主页...');
    try {
      await page.goto(loginUrl + '/Index/Home', { waitUntil: 'networkidle2', timeout: 15000 });
      const newUrl = page.url();
      console.log(`[摇钱树] 直接访问后URL: ${newUrl}`);
      
      if (newUrl.includes('/Index') || newUrl.includes('/Home') || newUrl.includes('/Operate')) {
        console.log('[摇钱树] 直接访问主页成功！');
        loginSuccess = true;
      }
    } catch (e: any) {
      console.log(`[摇钱树] 直接访问主页失败: ${e.message}`);
    }
  }
  
  if (loginSuccess) {
    console.log('[摇钱树] 登录成功，执行组织切换...');
    const switchResult = await switchOrganization(page);
    if (!switchResult) {
      console.log('[摇钱树] 组织切换失败');
      return false;
    }
  }
  
  return loginSuccess;
}

// ==================== DOM 抓取备用方法 ====================
async function extractDataFromDOM(page: Page): Promise<any[]> {
  console.log('[摇钱树] 开始 DOM 抓取...');
  
  const data = await page.evaluate(() => {
    const rows: any[] = [];
    
    const tableRows = document.querySelectorAll('table tbody tr, .el-table__body tbody tr, [class*="table"] [class*="row"]');
    
    tableRows.forEach((row, index) => {
      const cells = row.querySelectorAll('td, [class*="cell"]');
      if (cells.length > 5) {
        // carStowage 表格: 发车批次, 车辆路线, 批次状态, 最新操作网点, 发车时间, 下站到站时间, 车牌号, 主驾司机, 主驾电话, 集车件数, 集车重量
        const rowData: any = {
          _index: index,
          car_batch: cells[1]?.textContent?.trim() || '',
          route_text: cells[2]?.textContent?.trim() || '',
          batch_st: cells[3]?.textContent?.trim() || '',
          create_time: cells[5]?.textContent?.trim() || '',
          b_tr_num: cells[7]?.textContent?.trim() || '',
          b_dr_name: cells[8]?.textContent?.trim() || '',
        };
        
        if (rowData.car_batch && rowData.car_batch.length > 3) {
          rows.push(rowData);
        }
      }
    });
    
    return rows;
  });
  
  console.log(`[摇钱树] DOM 抓取完成，找到 ${data.length} 条数据`);
  return data;
}

// ==================== 数据获取逻辑 ====================
async function fetchData(page: Page, config: CrawlerRuntimeConfig, maxPages: number): Promise<any[]> {
  console.log('[摇钱树] 开始获取数据...');
  
  interceptedApiData = [];
  tmsTotalRecords = 0;
  
  const loginUrl = config.loginUrl || 'https://rm.zo-cloud.cn';
  
  // 设置 API 拦截
  await page.setRequestInterception(true);
  
  page.on('request', request => {
    request.continue();
  });
  
  page.on('response', async response => {
    const url = response.url();
    
    if (url.includes('rm.zo-cloud.cn') && url.includes('api/')) {
      console.log(`[摇钱树] API 响应: ${url.substring(0, 120)}`);
    }
    
    // 配载页 API 端点: /api/Table/Search/batchList
    if (url.includes('Table/Search/batchList') || url.includes('batchList') ||
        url.includes('Batch/list') || url.includes('batch/list') ||
        url.includes('Table/Search/orderList') || url.includes('orderList') ||
        url.includes('carStowage') || url.includes('getList')) {
      console.log(`[摇钱树] 检测到数据API: ${url.substring(0, 80)}...`);
      try {
        let text = '';
        try {
          const buffer = await response.buffer();
          text = buffer.toString('utf-8');
        } catch (bufferErr) {
          console.log(`[摇钱树] buffer() 失败，尝试 text(): ${(bufferErr as any).message}`);
          text = await response.text();
        }
        console.log(`[摇钱树] API 响应长度: ${text.length} 字符`);
        if (text.length < 100) {
          console.log(`[摇钱树] 响应内容: ${text}`);
        }
        const data = JSON.parse(text);
        
        let records: any[] = [];
        let total = 0;
        
        if (data.res && data.res.data && Array.isArray(data.res.data)) {
          records = data.res.data;
          total = data.res.total?.count || data.res.total || records.length;
          console.log(`[摇钱树] 匹配到 res.data 格式`);
        } else if (data.data && Array.isArray(data.data.datas)) {
          records = data.data.datas;
          total = data.data.total || 0;
        } else if (data.data && Array.isArray(data.data.list)) {
          records = data.data.list;
          total = data.data.total || 0;
        } else if (data.data && Array.isArray(data.data)) {
          records = data.data;
          total = data.total || 0;
        } else if (data.datas && Array.isArray(data.datas)) {
          records = data.datas;
          total = data.total || 0;
        } else if (data.list && Array.isArray(data.list)) {
          records = data.list;
          total = data.total || 0;
        } else if (Array.isArray(data)) {
          records = data;
        }
        
        if (records.length > 0) {
          console.log(`[摇钱树] 拦截到 API 数据: ${records.length} 条, 总数: ${total}`);
          interceptedApiData.push(...records);
          tmsTotalRecords = total || tmsTotalRecords;
        } else {
          console.log(`[摇钱树] 未能从响应中解析到数据`);
        }
      } catch (e: any) {
        console.log(`[摇钱树] 解析响应失败: ${e.message}`);
      }
    }
  });
  
  // 访问车辆配载页面
  const carStowageUrl = loginUrl + '/Operate/carStowage';
  console.log(`[摇钱树] 访问车辆配载页面: ${carStowageUrl}`);
  
  try {
    await page.goto(carStowageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e: any) {
    console.log(`[摇钱树] 访问配载页面超时，继续处理: ${e.message}`);
  }
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 点击"全部" tab 确保获取所有数据
  console.log('[摇钱树] 查找并点击"全部" tab...');
  try {
    const clickedTab = await page.evaluate(() => {
      const tabs = document.querySelectorAll('div, span, a, li, button');
      for (const tab of tabs) {
        const text = (tab.textContent || '').trim();
        if (text === '全部' || text === '全部运单') {
          (tab as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    
    if (clickedTab) {
      console.log('[摇钱树] 已点击"全部" tab，等待数据加载...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log('[摇钱树] 未找到"全部" tab');
    }
  } catch (e: any) {
    console.log(`[摇钱树] 点击 tab 失败: ${e.message}`);
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    await page.screenshot({ path: '/tmp/yaoqianshu_car_stowage.png', fullPage: true });
    console.log('[摇钱树] 已保存配载页截图');
  } catch (e) {}
  
  // 尝试设置日期范围
  console.log('[摇钱树] 尝试设置日期范围...');
  try {
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, span, a, div');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        if (text === '近半年' || text === '半年' || text === '6个月' || 
            text === '近三个月' || text === '3个月' || text === '全部') {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (e) {
    console.log('[摇钱树] 日期设置失败，使用默认范围');
  }
  
  console.log('[摇钱树] 等待初始数据加载...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const allData: any[] = [];
  
  // 直接 API 调用获取全量数据
  console.log('[摇钱树] 使用 API 直接获取数据...');
  
  const pageSize = 500;
  let currentPage = 1;
  let totalRecords = 0;
  let hasMore = true;
  
  while (hasMore && currentPage <= maxPages) {
    console.log(`[摇钱树] 请求第 ${currentPage} 页 (每页${pageSize}条)...`);
    
    try {
      const pageResult = await page.evaluate(async (params: { page: number; pageSize: number }) => {
        try {
          const apiUrl = '/api/Table/Search/batchList';
          
          const requestBody = {
            page: params.page,
            page_size: params.pageSize,
            sort_field: 'create_time',
            sort_type: 'desc'
          };
          
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(requestBody),
            credentials: 'include'
          });
          
          if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
          }
          
          const data = await response.json();
          
          // 摇钱树格式: { errno: 0, res: { data: [...], total: N|{count:N} } }
          if (data.errno === 0 && data.res && data.res.data) {
            const total = data.res.total?.count || data.res.total || 0;
            return {
              success: true,
              records: data.res.data,
              total,
              count: data.res.data.length
            };
          }
          
          if (data.data && Array.isArray(data.data)) {
            return {
              success: true,
              records: data.data,
              total: data.total || 0,
              count: data.data.length
            };
          }
          
          return { success: false, error: 'Unknown response format', raw: JSON.stringify(data).substring(0, 200) };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      }, { page: currentPage, pageSize });
      
      if (pageResult.success && pageResult.records && pageResult.records.length > 0) {
        allData.push(...pageResult.records);
        totalRecords = pageResult.total || totalRecords;
        
        console.log(`[摇钱树] 第 ${currentPage} 页获取 ${pageResult.count} 条，累计 ${allData.length}/${totalRecords}`);
        
        if (pageResult.count < pageSize || allData.length >= totalRecords) {
          hasMore = false;
          console.log(`[摇钱树] 已获取全部数据`);
        }
        
        currentPage++;
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.log(`[摇钱树] API 请求失败或无数据: ${pageResult.error || 'no data'}`);
        if (pageResult.raw) {
          console.log(`[摇钱树] 原始响应: ${pageResult.raw}`);
        }
        
        if (currentPage === 1 && interceptedApiData.length > 0) {
          console.log(`[摇钱树] 使用 API 拦截的 ${interceptedApiData.length} 条数据`);
          allData.push(...interceptedApiData);
          interceptedApiData = [];
        }
        
        hasMore = false;
      }
    } catch (apiError: any) {
      console.log(`[摇钱树] API 调用异常: ${apiError.message}`);
      
      if (interceptedApiData.length > 0) {
        console.log(`[摇钱树] 回退使用 API 拦截的 ${interceptedApiData.length} 条数据`);
        allData.push(...interceptedApiData);
        interceptedApiData = [];
      }
      
      hasMore = false;
    }
  }
  
  // 兜底：拦截数据或 DOM 抓取
  if (allData.length === 0) {
    if (interceptedApiData.length > 0) {
      console.log(`[摇钱树] 使用 API 拦截的 ${interceptedApiData.length} 条数据`);
      allData.push(...interceptedApiData);
    } else {
      console.log('[摇钱树] 尝试从 DOM 抓取...');
      const domData = await extractDataFromDOM(page);
      if (domData.length > 0) {
        console.log(`[摇钱树] 从 DOM 抓取到 ${domData.length} 条数据`);
        allData.push(...domData);
      }
    }
  }
  
  console.log(`[摇钱树] 数据获取完成，共 ${allData.length} 条`);
  console.log(`[摇钱树] interceptedApiData 最终长度: ${interceptedApiData.length}`);
  if (allData.length > 0) {
    console.log(`[摇钱树] 第一条数据键: ${Object.keys(allData[0]).slice(0, 15).join(', ')}`);
  }
  return allData;
}

// ==================== 辅助函数：安全解析数字 ====================
function parseNumber(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

// ==================== 字段映射逻辑 ====================
// batchList API 实际返回的费用字段（_s 后缀为汇总值）：
//   应收: b_tr_pay_receipt_s(签单付), b_tr_pay_arrival_s(到付), b_tr_pay_billing_s(开单付),
//         b_tr_pay_monthly_s(月结), b_tr_pay_credit_s(赊欠), b_spot_fee(现付),
//         b_tr_co_delivery_s(送货费), b_tr_cashreturn_s(返现), b_tr_total_price_s(总价)
//   应付: b_arr_f_total(到付合计), b_fuel_card_f_total(油卡合计),
//         b_billing_f_total(开单合计), b_receipt_f_total(签单合计)
//   其他: b_tr_trans_f_s(运费), b_tr_d_profit_head_f(毛利), b_profit(利润)
function mapFields(rawData: any): WaybillData {
  const item = rawData;
  
  const statusMap: Record<string, string> = {
    '0': 'cancelled',
    '1': 'pending',
    '2': 'in_transit',
    '3': 'delivered',
    '4': 'completed',
    '10': 'pending',
  };
  
  const waybillNumber = String(item.car_batch || item.id || '').trim();
  
  // 路线 → 发站/到站
  let departurePlace = '';
  let arrivalPlace = '';
  if (item.route_text) {
    const parts = item.route_text.split('->');
    if (parts.length >= 2) {
      departurePlace = parts[0].trim();
      arrivalPlace = parts[parts.length - 1].trim();
    }
  }

  // ========== 应收费用（精确匹配 batchList 字段） ==========
  const receivableCash    = parseNumber(item.b_spot_fee);                // 现付
  const receivableCollect = parseNumber(item.b_tr_pay_arrival_s);        // 到付
  const receivableMonthly = parseNumber(item.b_tr_pay_monthly_s);        // 月结
  const receivableReturn  = parseNumber(item.b_tr_cashreturn_s);         // 返现/回付
  const receivableTransport = parseNumber(item.b_tr_trans_f_s);          // 运费

  // 签单付 + 开单付 + 赊欠 + 送货费（非核心但参与总计）
  const receiptPay  = parseNumber(item.b_tr_pay_receipt_s);              // 签单付/回单付
  const billingPay  = parseNumber(item.b_tr_pay_billing_s);              // 开单付
  const creditPay   = parseNumber(item.b_tr_pay_credit_s);               // 赊欠
  const coDelivery  = parseNumber(item.b_tr_co_delivery_s);              // 送货费

  // 应收总计 = 优先用 b_tr_total_price_s，否则累加各项
  let receivableTotal = parseNumber(item.b_tr_total_price_s);
  if (receivableTotal === 0) {
    receivableTotal = receivableCash + receivableCollect + receivableMonthly
                    + receivableReturn + receiptPay + billingPay + creditPay + coDelivery;
  }

  // ========== 应付费用 ==========
  const payableArrival  = parseNumber(item.b_arr_f_total);               // 应付到付合计
  const payableFuelCard = parseNumber(item.b_fuel_card_f_total);         // 应付油卡合计
  const payableBilling  = parseNumber(item.b_billing_f_total);           // 应付开单合计
  const payableReceipt  = parseNumber(item.b_receipt_f_total);           // 应付签单合计
  const payableTotal    = payableArrival + payableFuelCard + payableBilling + payableReceipt;

  // 状态
  const rawStatus = String(item.batch_st || '1');
  const status = statusMap[rawStatus] || 'pending';

  // 发车时间（用作运单日期和shipTime）
  const truckTime = item.truck_t || item.head_truck_t || item.cur_truck_t || null;

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
const yaoqianshuTemplate: CrawlerTemplate = {
  id: 'yaoqianshu',
  name: '摇钱树物流系统',
  description: '摇钱树物流管理系统（rm.zo-cloud.cn），自动切换到指定网点后从车辆配载页抓取数据',
  requiredFields: [
    { 
      key: 'loginUrl', 
      label: '登录地址', 
      type: 'text', 
      required: true,
      placeholder: '例如: https://rm.zo-cloud.cn',
      defaultValue: 'https://rm.zo-cloud.cn'
    },
    { 
      key: 'username', 
      label: '用户名/手机号', 
      type: 'text', 
      required: true,
      placeholder: '登录用户名或手机号（如：15441）'
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
registerCrawlerTemplate(yaoqianshuTemplate);

export default yaoqianshuTemplate;
