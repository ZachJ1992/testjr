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
const TARGET_COMPANY_ID = '225088';

// ==================== 组织切换逻辑 ====================
function resolveTargetCompanyId(config?: CrawlerRuntimeConfig): string {
  return String(
    config?.targetCompanyId ??
    config?.switchCompanyId ??
    TARGET_COMPANY_ID
  ).trim() || TARGET_COMPANY_ID;
}

function resolveTargetOrgName(config?: CrawlerRuntimeConfig): string {
  return String(config?.targetOrgName ?? TARGET_ORG_NAME).trim() || TARGET_ORG_NAME;
}

function toOrigin(urlLike: string): string {
  try {
    const withProtocol = /^https?:\/\//i.test(urlLike) ? urlLike : `https://${urlLike}`;
    return new URL(withProtocol).origin;
  } catch {
    return 'https://tms25.zo-cloud.cn';
  }
}

function parseSetCookiePairs(setCookieHeaders: string[]): Array<{ name: string; value: string }> {
  const pairs: Array<{ name: string; value: string }> = [];
  for (const rawLine of setCookieHeaders) {
    if (!rawLine) continue;
    const splitLines = rawLine.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g);
    for (const line of splitLines) {
      const firstPart = line.split(';')[0]?.trim();
      if (!firstPart) continue;
      const idx = firstPart.indexOf('=');
      if (idx <= 0) continue;
      const name = firstPart.substring(0, idx).trim();
      const value = firstPart.substring(idx + 1).trim();
      if (!name) continue;
      pairs.push({ name, value });
    }
  }
  return pairs;
}

async function switchAccountByNode(params: {
  origin: string;
  cookieMap: Map<string, string>;
  targetCompanyId: string;
}): Promise<{
  success: boolean;
  cookiePairs: Array<{ name: string; value: string }>;
  switchedCompanyId?: string;
  switchedCompanyName?: string;
  error?: string;
  raw?: string;
}> {
  const userId = params.cookieMap.get('user_id') || params.cookieMap.get('uid') || '';
  const gid = params.cookieMap.get('group_id') || params.cookieMap.get('gid') || '';
  if (!userId || !gid) {
    return {
      success: false,
      cookiePairs: [],
      error: `缺少会话标识: user_id=${userId || 'N/A'}, group_id=${gid || 'N/A'}`,
    };
  }

  const logid = `${userId}${Date.now()}0707`;
  const requestUrl = `${params.origin}/api/Login/Login/switchAccount?logid=${encodeURIComponent(logid)}&gid=${encodeURIComponent(gid)}`;
  const form = new URLSearchParams();
  form.set('req', JSON.stringify({ company_id: params.targetCompanyId }));

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        'origin': params.origin,
        'referer': `${params.origin}/Index/Home`,
        'x-requested-with': 'XMLHttpRequest',
        'cookie': Array.from(params.cookieMap.entries())
          .map(([name, value]) => `${name}=${value}`)
          .join('; '),
        'user-agent': 'Mozilla/5.0',
      },
      body: form,
    });

    const headersAny = response.headers as any;
    const setCookieHeaders: string[] =
      typeof headersAny.getSetCookie === 'function'
        ? headersAny.getSetCookie()
        : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie') as string] : []);
    const cookiePairs = parseSetCookiePairs(setCookieHeaders);

    const raw = await response.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return {
        success: false,
        cookiePairs,
        error: 'switchAccount 响应不是合法 JSON',
        raw: raw.substring(0, 600),
      };
    }

    const switchedCompanyId = String(data?.res?.company_info?.id || '');
    const switchedCompanyName = String(data?.res?.company_info?.short_name || data?.res?.company_info?.company_name || '');

    if (data?.errno === 0) {
      return {
        success: true,
        cookiePairs,
        switchedCompanyId,
        switchedCompanyName,
      };
    }

    return {
      success: false,
      cookiePairs,
      switchedCompanyId,
      switchedCompanyName,
      error: `errno=${data?.errno ?? 'N/A'}, errmsg=${data?.errmsg ?? 'unknown'}`,
      raw: raw.substring(0, 600),
    };
  } catch (e: any) {
    return {
      success: false,
      cookiePairs: [],
      error: e?.message || 'switchAccount 请求异常',
    };
  }
}

async function clickRefreshTipIfPresent(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      return bodyText.includes('已切换到其他组织') || bodyText.includes('请先刷新页面');
    });
  } catch {
    return false;
  }
}

async function switchOrganization(page: Page, config: CrawlerRuntimeConfig): Promise<boolean> {
  const targetCompanyId = resolveTargetCompanyId(config);
  const targetOrgName = resolveTargetOrgName(config);
  console.log(`[zo-cloud] 切换组织到: ${targetOrgName} (company_id=${targetCompanyId})`);

  const origin = toOrigin(page.url() || config.loginUrl || 'https://tms25.zo-cloud.cn');
  const domain = new URL(origin).hostname;

  const initialCookies = await page.cookies();
  const cookieMap = new Map<string, string>();
  for (const cookie of initialCookies) {
    if (!cookie?.name) continue;
    cookieMap.set(cookie.name, cookie.value ?? '');
  }

  const switchResult = await switchAccountByNode({
    origin,
    cookieMap,
    targetCompanyId,
  });

  if (!switchResult.success) {
    console.log(`[zo-cloud] switchAccount 失败: ${switchResult.error || 'unknown'}`);
    if (switchResult.raw) {
      console.log(`[zo-cloud] switchAccount 原始响应: ${switchResult.raw}`);
    }
    return false;
  }

  if (switchResult.switchedCompanyId && switchResult.switchedCompanyId !== targetCompanyId) {
    console.log(
      `[zo-cloud] switchAccount 返回公司ID不一致: expected=${targetCompanyId}, actual=${switchResult.switchedCompanyId}`
    );
    return false;
  }

  // 用接口返回的 Set-Cookie 更新 Puppeteer 会话，并强制兜底设置 company_id。
  for (const pair of switchResult.cookiePairs) {
    cookieMap.set(pair.name, pair.value);
  }
  cookieMap.set('company_id', targetCompanyId);

  const cookieEntries = Array.from(cookieMap.entries())
    .filter(([name]) => Boolean(name))
    .map(([name, value]) => ({
      name,
      value,
      domain,
      path: '/',
    }));
  if (cookieEntries.length > 0) {
    await page.setCookie(...cookieEntries);
  }

  console.log(
    `[zo-cloud] switchAccount 成功: ${switchResult.switchedCompanyName || '-'} (${switchResult.switchedCompanyId || targetCompanyId})`
  );

  // 访问主页触发前端上下文刷新；若出现“请先刷新页面”提示则点击刷新按钮。
  try {
    await page.goto(`${origin}/Index/Home`, { waitUntil: 'networkidle2', timeout: 45000 });
  } catch (e: any) {
    console.log(`[zo-cloud] 切换后访问首页超时，继续: ${e.message}`);
  }
  await new Promise(resolve => setTimeout(resolve, 1200));
  const hasRefreshTip = await clickRefreshTipIfPresent(page);
  if (hasRefreshTip) {
    // 仅做提示，不自动点“刷新”，避免部分账号刷新后回到默认全量口径。
    console.log('[zo-cloud] 检测到“请先刷新页面”提示（保持当前会话，不自动刷新）');
  }

  const cookiesAfter = await page.cookies();
  const companyIdCookie = cookiesAfter.find(c => c.name === 'company_id');
  console.log(`[zo-cloud] 当前 company_id cookie: ${companyIdCookie?.value}`);
  if (companyIdCookie?.value !== targetCompanyId) {
    console.log('[zo-cloud] 切换后 cookie 校验失败');
    return false;
  }

  console.log(`[zo-cloud] 组织切换完成: ${targetOrgName}`);
  return true;
}

// ==================== 原 UI 切换逻辑（保留备用） ====================
async function _switchOrganizationViaUI(page: Page): Promise<boolean> {
  console.log(`[zo-cloud] [UI模式] 开始切换组织到: ${TARGET_ORG_NAME}`);

  const baseUrl = page.url().split('/').slice(0, 3).join('/') || 'https://tms25.zo-cloud.cn';
  console.log(`[zo-cloud] 导航到主页: ${baseUrl}/Index/Home`);
  try {
    await page.goto(baseUrl + '/Index/Home', { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e: any) {
    console.log(`[zo-cloud] 导航到主页超时，继续: ${e.message}`);
  }
  // tms25 在服务器上加载非常慢（截图显示停在99%进度条），需要等待实际页面内容渲染
  console.log('[zo-cloud] 等待页面内容渲染...');
  for (let w = 0; w < 30; w++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const pageState = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      // 检查页面是否有实际业务内容（不只是加载进度条）
      const hasNav = bodyText.includes('首页') || bodyText.includes('订单管理') || bodyText.includes('运单管理');
      const hasUser = bodyText.includes('我的信息') || bodyText.includes('退出');
      const hasSidebar = document.querySelectorAll('[class*="sidebar"], [class*="menu"], [class*="nav"]').length > 0;
      return { hasNav, hasUser, hasSidebar, bodyLen: bodyText.length };
    });
    if (pageState.hasNav || pageState.hasUser) {
      console.log(`[zo-cloud] 页面已加载 (等待${(w+1)*3}秒): nav=${pageState.hasNav}, user=${pageState.hasUser}, bodyLen=${pageState.bodyLen}`);
      break;
    }
    if (w % 5 === 4) {
      console.log(`[zo-cloud] 页面仍在加载... (${(w+1)*3}秒), bodyLen=${pageState.bodyLen}`);
    }
    if (w === 29) {
      console.log(`[zo-cloud] 等待90秒仍未渲染，尝试刷新...`);
      try {
        await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (e) {}
    }
  }

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
  try { await page.screenshot({ path: '/tmp/zocloud_after_user_click.png', fullPage: true }); } catch (e) {}

  // 检查点击用户名后弹窗是否已直接打开（tms25 上点用户名直接弹出切换组织弹窗）
  // 多等一会，弹窗可能有动画
  await new Promise(resolve => setTimeout(resolve, 2000));

  const modalCheckResult = await page.evaluate(() => {
    const bodyText = document.body.textContent || '';
    const has切换 = bodyText.includes('切换组织');
    // tms25 的弹窗可能不用 <table>，用 div 表格或 layui 组件
    // 检查任何包含"组织名称"或"筛选"文字且高度>100 的可见弹层
    const allEls = document.querySelectorAll('[class*="layer"], [class*="modal"], [class*="dialog"], [class*="popup"], [class*="layui"], [class*="content"]');
    let layerWithOrg = false;
    for (const el of allEls) {
      const h = (el as HTMLElement).offsetHeight;
      if (h < 100) continue;
      const text = (el.textContent || '');
      if (text.includes('组织名称') || (text.includes('筛选') && text.includes('负责人'))) {
        layerWithOrg = true;
        break;
      }
    }
    // 也直接检查 table
    const tables = document.querySelectorAll('table');
    let tableWithOrg = false;
    for (const table of tables) {
      const text = table.textContent || '';
      if (text.includes('组织名称') || text.includes('筛选')) { tableWithOrg = true; break; }
    }
    // 最宽松检查：页面上同时有"切换组织"和"筛选"和列表行
    const hasFilterAndRows = has切换 && bodyText.includes('筛选') && (
      document.querySelectorAll('tr').length > 3 || 
      document.querySelectorAll('[class*="row"], [class*="item"]').length > 5
    );
    return { has切换, tableWithOrg, layerWithOrg, hasFilterAndRows };
  });

  console.log(`[zo-cloud] 弹窗检测: ${JSON.stringify(modalCheckResult)}`);
  const modalAlreadyOpen = modalCheckResult.has切换 && (
    modalCheckResult.tableWithOrg || modalCheckResult.layerWithOrg || modalCheckResult.hasFilterAndRows
  );

  if (modalAlreadyOpen) {
    console.log('[zo-cloud] 点击用户名后弹窗已直接打开，跳过步骤1b');
  } else {
    // 步骤1b: 弹窗未直接打开，在下拉菜单中找"切换组织"并点击
    console.log('[zo-cloud] 步骤1b: 查找"切换组织"菜单项...');

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
      return null;
    });

    if (switchMenuClicked) {
      console.log(`[zo-cloud] 已点击切换组织菜单: ${switchMenuClicked}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      console.log('[zo-cloud] 未找到切换组织菜单项');
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
      // 宽松检测：只要页面同时包含"切换组织"和"筛选"就认为弹窗已打开
      if (bodyText.includes('筛选') && (bodyText.includes('组织名称') || bodyText.includes('负责人'))) return true;
      // 检查 table 或 layer 中有列表数据
      if (document.querySelectorAll('tr').length > 3) return true;
      const layers = document.querySelectorAll('[class*="layer"], [class*="modal"], [class*="dialog"]');
      for (const l of layers) {
        if ((l as HTMLElement).offsetHeight > 100 && (l.textContent || '').includes('筛选')) return true;
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
    // 查找"筛选"行中的输入框（支持 table tr 和 div 布局）
    const rows = document.querySelectorAll('tr, [class*="row"], [class*="filter"]');
    for (const row of rows) {
      if (!(row.textContent || '').includes('筛选')) continue;
      const inputs = row.querySelectorAll('input');
      if (inputs.length > 0) {
        (inputs[0] as HTMLInputElement).focus();
        return 'filter-row';
      }
    }
    // 备用：弹窗/layer 中可见的输入框
    const allInputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (const input of allInputs) {
      const rect = (input as HTMLElement).getBoundingClientRect();
      if (rect.width > 40 && rect.height > 10 && rect.top > 100 && rect.top < 600) {
        const parent = input.closest('[class*="layer"], [class*="modal"], [class*="dialog"], [class*="content"], table');
        if (parent && ((parent.textContent || '').includes('组织名称') || (parent.textContent || '').includes('筛选'))) {
          (input as HTMLInputElement).focus();
          return 'modal-input';
        }
      }
    }
    return null;
  });

  if (filterInputFound) {
    await page.keyboard.type(TARGET_ORG_NAME, { delay: 30 });
    console.log(`[zo-cloud] 已输入筛选文本 (${filterInputFound})`);
  } else {
    console.log('[zo-cloud] 未找到筛选框，尝试备用选择器...');
    const inputs = await page.$$('[class*="layer"] input, [class*="modal"] input, [class*="dialog"] input, table input');
    if (inputs.length > 0) {
      await inputs[0].click();
      await inputs[0].type(TARGET_ORG_NAME, { delay: 30 });
      console.log('[zo-cloud] 已通过备用方式输入筛选');
    } else {
      console.log('[zo-cloud] 警告：未找到任何筛选输入框');
    }
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  // 步骤4: 选中匹配行
  console.log('[zo-cloud] 步骤4: 选中目标网点行并提取 group_id...');
  const rowResult = await page.evaluate((orgName: string) => {
    // 搜索 table 行和 div 行
    const rows = document.querySelectorAll('table tbody tr, tr');
    for (const row of rows) {
      const text = (row.textContent || '').trim();
      if (text.includes(orgName)) {
        (row as HTMLElement).click();
        const cells = row.querySelectorAll('td');
        if (cells.length > 1) (cells[1] as HTMLElement).click();
        // 提取行数据属性或隐藏字段中的 group_id
        const rowId = (row as HTMLElement).getAttribute('data-id') || 
                      (row as HTMLElement).getAttribute('data-gid') || '';
        return { text: text.substring(0, 60), rowId };
      }
    }
    const allEls = document.querySelectorAll('td, [class*="cell"], [class*="row"], div, span');
    for (const el of allEls) {
      const t = (el.textContent || '').trim();
      if (t === orgName || (t.includes(orgName) && t.length < orgName.length + 20)) {
        (el as HTMLElement).click();
        const parentRow = el.closest('tr, [class*="row"]');
        if (parentRow) (parentRow as HTMLElement).click();
        return { text: t.substring(0, 60), rowId: '' };
      }
    }
    return null;
  }, TARGET_ORG_NAME);

  const rowSelected = rowResult?.text || null;

  if (rowSelected) {
    console.log(`[zo-cloud] 已选中行: ${rowSelected}`);
  } else {
    console.log('[zo-cloud] 未找到匹配行');
    try { await page.screenshot({ path: '/tmp/zocloud_no_org_row.png', fullPage: true }); } catch (e) {}
    return false;
  }

  await new Promise(resolve => setTimeout(resolve, 800));

  // 步骤5: 监控网络并点击"切换组织"确认按钮
  console.log('[zo-cloud] 步骤5: 监控网络请求并点击"切换组织"确认按钮...');

  // 开启请求拦截，记录切换触发的 API 调用
  const switchApiCalls: string[] = [];
  const reqListener = (req: any) => {
    const url = req.url();
    if (url.includes('/api/') || url.includes('switch') || url.includes('group') || url.includes('org')) {
      switchApiCalls.push(`${req.method()} ${url.substring(0, 150)}`);
    }
  };
  page.on('request', reqListener);

  // 记录切换前的 cookies
  const cookiesBefore = await page.cookies();
  const gidBefore = cookiesBefore.find(c => c.name === 'group_id' || c.name === 'gid');
  console.log(`[zo-cloud] 切换前 cookies: group_id=${gidBefore?.value || 'N/A'}`);

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
    page.off('request', reqListener);
    try { await page.screenshot({ path: '/tmp/zocloud_no_switch_btn.png', fullPage: true }); } catch (e) {}
    return false;
  }

  console.log('[zo-cloud] 已点击切换组织确认按钮，等待 API 响应...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  page.off('request', reqListener);
  console.log(`[zo-cloud] 切换期间的 API 调用(${switchApiCalls.length}):\n${switchApiCalls.join('\n')}`);

  // 检查 cookies 是否变化
  const cookiesAfter = await page.cookies();
  const gidAfter = cookiesAfter.find(c => c.name === 'group_id' || c.name === 'gid');
  console.log(`[zo-cloud] 切换后 cookies: group_id=${gidAfter?.value || 'N/A'}`);

  if (gidBefore?.value && gidAfter?.value && gidBefore.value !== gidAfter.value) {
    console.log(`[zo-cloud] group_id 已变更: ${gidBefore.value} → ${gidAfter.value}`);
  } else {
    console.log('[zo-cloud] group_id 未变化，尝试通过 API 直接切换...');

    // 从弹窗中提取目标组织的 group_id
    const targetGroupId = await page.evaluate((orgName: string) => {
      // 尝试从行数据中提取 ID
      const rows = document.querySelectorAll('tr');
      for (const row of rows) {
        const text = (row.textContent || '').trim();
        if (text.includes(orgName)) {
          // 尝试从行属性获取
          const id = (row as HTMLElement).getAttribute('data-id') || 
                     (row as HTMLElement).getAttribute('data-gid') || '';
          if (id) return id;
          // 尝试从行中的隐藏 input 获取
          const input = row.querySelector('input[type="hidden"], input[type="radio"]');
          if (input) return (input as HTMLInputElement).value;
          // 尝试从第一个 td 获取序号对应的 ID
          const cells = row.querySelectorAll('td');
          if (cells.length > 0) {
            const firstCellText = (cells[0]?.textContent || '').trim();
            if (/^\d+$/.test(firstCellText)) return firstCellText;
          }
        }
      }
      return null;
    }, TARGET_ORG_NAME);

    console.log(`[zo-cloud] 从弹窗提取的 ID: ${targetGroupId || 'N/A'}`);

    // 尝试通过 page.evaluate 调用切换 API
    const switchApiResult = await page.evaluate(async (orgName: string) => {
      // 尝试多个可能的切换 API
      const apis = [
        { url: '/api/Basic/Org/switchGroup', body: { group_name: orgName } },
        { url: '/api/Basic/Org/switchOrg', body: { org_name: orgName } },
        { url: '/api/Basic/Index/switchGroup', body: { group_name: orgName } },
      ];
      
      for (const api of apis) {
        try {
          const resp = await fetch(api.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(api.body),
            credentials: 'include'
          });
          const data = await resp.json();
          if (data.errno === 0 || data.success) {
            return { success: true, api: api.url, data: JSON.stringify(data).substring(0, 200) };
          }
          return { success: false, api: api.url, data: JSON.stringify(data).substring(0, 200) };
        } catch (e: any) {
          continue;
        }
      }
      return { success: false, api: 'none', data: 'all APIs failed' };
    }, TARGET_ORG_NAME);

    console.log(`[zo-cloud] API 切换结果: ${JSON.stringify(switchApiResult)}`);

    // 重新检查 cookies
    const cookiesFinal = await page.cookies();
    const gidFinal = cookiesFinal.find(c => c.name === 'group_id' || c.name === 'gid');
    console.log(`[zo-cloud] 最终 group_id: ${gidFinal?.value || 'N/A'}`);
  }

  const allCookieNames = cookiesAfter.map(c => `${c.name}=${c.value}`).join('; ');
  console.log(`[zo-cloud] 当前 cookies: ${allCookieNames.substring(0, 300)}`);

  try { await page.screenshot({ path: '/tmp/zocloud_after_switch.png', fullPage: true }); } catch (e) {}

  console.log('[zo-cloud] 组织切换操作完成');
  return true;
}

// ==================== 辅助函数 ====================
function parseNumber(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

function pickFirstPositiveNumber(candidates: any[]): number {
  for (const candidate of candidates) {
    const value = parseNumber(candidate);
    if (value > 0) return value;
  }
  return 0;
}

function normalizeBaseUrl(loginUrl: string): string {
  const withProtocol = /^https?:\/\//i.test(loginUrl) ? loginUrl : `https://${loginUrl}`;
  return withProtocol.replace(/\/+$/, '');
}

function formatDateYmd(date: Date): string {
  return date.toISOString().split('T')[0];
}

function buildCookieHeader(
  cookies: Array<{ name: string; value: string }>,
  forceCompanyId?: string
): {
  cookieMap: Map<string, string>;
  cookieHeader: string;
} {
  const cookieMap = new Map<string, string>();

  for (const cookie of cookies) {
    if (!cookie?.name) continue;
    cookieMap.set(cookie.name, cookie.value ?? '');
  }

  // 可选地强制覆盖 company_id，确保 API 请求上下文一致
  if (forceCompanyId) {
    cookieMap.set('company_id', forceCompanyId);
  }

  const cookieHeader = Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return { cookieMap, cookieHeader };
}

function extractRecordTime(raw: any): number | null {
  const rawTime = raw?.truck_t || raw?.head_truck_t || raw?.cur_truck_t || raw?.create_time || raw?.created_time;
  if (!rawTime) return null;
  const ts = new Date(rawTime).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function extractOutletName(raw: any): string {
  const candidates = [
    raw?.down_line_text,
    raw?.n_company_name,
    raw?.next_company_name,
    raw?.company_name,
    raw?.org_name,
    raw?.net_point_name,
    raw?.team_name,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    const text = String(candidate).trim();
    if (!text) continue;
    if (text.includes('->')) return text.split('->')[0].trim();
    if (text.includes('→')) return text.split('→')[0].trim();
    return text;
  }

  return '';
}

function parseBatchListResponse(data: any): {
  success: boolean;
  records: any[];
  total: number;
  error?: string;
  raw?: string;
} {
  if (data?.errno === 0 && Array.isArray(data?.res?.data)) {
    const records = data.res.data;
    const total = data.res.total?.count || data.res.total || records.length;
    return { success: true, records, total: Number(total) || records.length };
  }

  if (Array.isArray(data?.data?.datas)) {
    const records = data.data.datas;
    const total = data.data.total || records.length;
    return { success: true, records, total: Number(total) || records.length };
  }

  if (Array.isArray(data?.datas)) {
    const records = data.datas;
    const total = data.total || records.length;
    return { success: true, records, total: Number(total) || records.length };
  }

  const errno = data?.errno;
  const errmsg = data?.errmsg;
  return {
    success: false,
    records: [],
    total: 0,
    error: `errno=${errno ?? 'N/A'}, errmsg=${errmsg ?? 'unknown'}`,
    raw: JSON.stringify(data).substring(0, 600),
  };
}

function parseObjectLike(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch (e) {
      // 忽略 JSON 解析错误，回退为空对象
    }
  }
  return {};
}

function parseDateInput(input: any): string | null {
  if (input === null || input === undefined || input === '') return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateYmd(date);
}

function buildBusinessCriteria(config: CrawlerRuntimeConfig): {
  startDate: string;
  endDate: string;
  query: Record<string, any>;
  filter: Record<string, any>;
  local: {
    outletCompanyId: string;
    outletName: string;
    batchNumber: string;
    driverName: string;
    vehiclePlate: string;
    routeKeyword: string;
    statusCodes: string[];
  };
} {
  const configuredStart = parseDateInput(config.filterStartDate ?? config.startDate);
  const configuredEnd = parseDateInput(config.filterEndDate ?? config.endDate);

  const now = new Date();
  const endBase = configuredEnd ? new Date(`${configuredEnd}T00:00:00`) : now;

  const dateRangeDaysRaw = Number(config.dateRangeDays ?? config.fetchDays ?? 180);
  const dateRangeDays = Number.isFinite(dateRangeDaysRaw) && dateRangeDaysRaw > 0 ? Math.floor(dateRangeDaysRaw) : 180;

  const startBase = configuredStart
    ? new Date(`${configuredStart}T00:00:00`)
    : new Date(endBase.getTime() - (dateRangeDays - 1) * 24 * 60 * 60 * 1000);

  const startDate = formatDateYmd(startBase);
  const endDate = formatDateYmd(endBase);

  const outletCompanyId = resolveTargetCompanyId(config);
  const outletName = String(
    config.outletName ??
    config.targetOutletName ??
    config.targetOrgName ??
    TARGET_ORG_NAME
  ).trim();
  const batchNumber = String(config.batchNumber ?? config.targetBatchNumber ?? config.carBatch ?? '').trim();
  const driverName = String(config.driverName ?? '').trim();
  const vehiclePlate = String(config.vehiclePlate ?? '').trim();
  const routeKeyword = String(config.routeKeyword ?? '').trim();
  const statusCodes = String(config.statusCodes ?? config.batchStatusCodes ?? '')
    .split(',')
    .map((x: string) => x.trim())
    .filter(Boolean);

  const query: Record<string, any> = {};
  if (outletCompanyId) query.company_id = outletCompanyId;
  if (batchNumber) query.car_batch = batchNumber;
  if (driverName) query.b_dr_name = driverName;
  if (vehiclePlate) query.b_tr_num = vehiclePlate;
  if (routeKeyword) query.route_text = routeKeyword;

  const filter: Record<string, any> = {
    create_time: [
      ['>=', `${startDate} 00:00:00`],
      ['<=', `${endDate} 23:59:59`],
    ],
  };
  if (statusCodes.length === 1) {
    filter.batch_st = [['=', statusCodes[0]]];
  } else if (statusCodes.length > 1) {
    filter.batch_st = [['in', statusCodes]];
  }

  // 支持在 crawler_config 中直接覆盖/扩展 query 与 filter（对象或 JSON 字符串）
  const customQuery = parseObjectLike(config.reqQuery ?? config.batchListQuery);
  const customFilter = parseObjectLike(config.reqFilter ?? config.batchListFilter);

  const mergedQuery = { ...query, ...customQuery };
  const mergedFilter = { ...filter, ...customFilter };

  return {
    startDate,
    endDate,
    query: mergedQuery,
    filter: mergedFilter,
    local: { outletCompanyId, outletName, batchNumber, driverName, vehiclePlate, routeKeyword, statusCodes },
  };
}

async function fetchBatchListPageByNode(params: {
  baseUrl: string;
  cookieHeader: string;
  logid: string;
  gid: string;
  page: number;
  pageSize: number;
  startDate: string;
  endDate: string;
  query: Record<string, any>;
  filter: Record<string, any>;
}): Promise<{
  success: boolean;
  records: any[];
  total: number;
  error?: string;
  raw?: string;
}> {
  try {
    const apiUrl = new URL('/api/Table/Search/batchList', params.baseUrl);
    apiUrl.searchParams.set('logid', params.logid);
    apiUrl.searchParams.set('gid', params.gid);
    apiUrl.searchParams.set('btnLoadingTag', 'off');

    const reqPayload = {
      category: 'Batch',
      tab: 'transport_task_batch',
      sort: { create_time: 'desc' },
      page_num: params.page,
      page_size: params.pageSize,
      cid: '',
      query: params.query,
      filter: params.filter,
      fetch_mode: 'body',
    };

    const bodyParams = new URLSearchParams();
    bodyParams.append('req', JSON.stringify(reqPayload));

    const response = await fetch(apiUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': params.cookieHeader,
        'Accept': 'application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Origin': params.baseUrl,
        'Referer': `${params.baseUrl}/Schedule/taskList`,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: bodyParams.toString(),
    });

    const rawText = await response.text();

    if (!response.ok) {
      return {
        success: false,
        records: [],
        total: 0,
        error: `HTTP ${response.status}`,
        raw: rawText.substring(0, 600),
      };
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      return {
        success: false,
        records: [],
        total: 0,
        error: '响应不是合法 JSON',
        raw: rawText.substring(0, 600),
      };
    }

    return parseBatchListResponse(data);
  } catch (e: any) {
    return {
      success: false,
      records: [],
      total: 0,
      error: e?.message || '请求异常',
    };
  }
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
        const switchResult = await switchOrganization(page, config);
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
    const switchResult = await switchOrganization(page, config);
    if (!switchResult) {
      console.log('[zo-cloud] 组织切换失败');
      return false;
    }
  }
  
  return loginSuccess;
}

// ==================== 数据获取逻辑 ====================
async function _fetchDataViaPage(page: Page, config: CrawlerRuntimeConfig, maxPages: number): Promise<any[]> {
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

  // 等待 taskList 页面实际渲染
  console.log('[zo-cloud] 等待任务列表页面渲染...');
  for (let w = 0; w < 30; w++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const ready = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      return bodyText.includes('批次号') || bodyText.includes('创建时间') || bodyText.includes('全部');
    });
    if (ready) {
      console.log(`[zo-cloud] 任务列表页面已渲染 (${(w+1)*3}秒)`);
      break;
    }
    if (w % 5 === 4) console.log(`[zo-cloud] 页面仍在加载... ${(w+1)*3}秒`);
  }

  // 关闭可能弹出的提示框（截图显示有个带蓝色按钮的弹窗挡住了页面）
  try { await page.screenshot({ path: '/tmp/zocloud_before_dialog_check.png', fullPage: true }); } catch (e) {}

  for (let d = 0; d < 3; d++) {
    const dialogClosed = await page.evaluate(() => {
      // 策略1: 找居中的小型按钮（弹窗确认按钮通常在页面中央附近）
      const btns = document.querySelectorAll('button, a, [class*="btn"]');
      const vw = window.innerWidth;
      for (const btn of btns) {
        const rect = (btn as HTMLElement).getBoundingClientRect();
        // 居中区域 (水平中间1/3, 垂直中间1/3)
        if (rect.left > vw * 0.3 && rect.right < vw * 0.7 &&
            rect.top > 200 && rect.top < 500 &&
            rect.width > 30 && rect.width < 200 && rect.height > 20 && rect.height < 60) {
          const text = (btn.textContent || '').trim();
          (btn as HTMLElement).click();
          return `centered-btn: "${text}" at [${rect.left.toFixed(0)},${rect.top.toFixed(0)}]`;
        }
      }
      // 策略2: 查找关闭图标（×）
      const closeIcons = document.querySelectorAll('[class*="close"], [class*="layui-layer-close"]');
      for (const icon of closeIcons) {
        const rect = (icon as HTMLElement).getBoundingClientRect();
        if (rect.width > 5 && rect.height > 5 && rect.top > 100 && rect.top < 500) {
          (icon as HTMLElement).click();
          return `close-icon at [${rect.left.toFixed(0)},${rect.top.toFixed(0)}]`;
        }
      }
      return null;
    });

    if (dialogClosed) {
      console.log(`[zo-cloud] 已关闭弹窗: ${dialogClosed}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      break;
    }
  }

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const clickByKeywords = async (
    keywords: string[],
    stepName: string,
    options: { attempts?: number; waitAfterMs?: number; topMin?: number; topMax?: number } = {}
  ): Promise<boolean> => {
    const attempts = options.attempts ?? 4;
    const waitAfterMs = options.waitAfterMs ?? 1500;
    const topMin = options.topMin ?? null;
    const topMax = options.topMax ?? null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const candidate = await page.evaluate((params: {
        keywords: string[];
        topMin: number | null;
        topMax: number | null;
      }) => {
        const normalize = (s: string) => s.replace(/\s+/g, '').trim();
        const targets = params.keywords.map(normalize);
        const allEls = Array.from(document.querySelectorAll('button, a, span, div, li, label, input'));

        let best: { x: number; y: number; text: string; tag: string; score: number } | null = null;

        for (const el of allEls) {
          const htmlEl = el as HTMLElement;
          const rect = htmlEl.getBoundingClientRect();
          if (rect.width < 12 || rect.height < 12) continue;
          if (rect.top < -5 || rect.left < -5) continue;
          if (rect.right > window.innerWidth + 5 || rect.bottom > window.innerHeight + 5) continue;
          if (params.topMin !== null && rect.top < params.topMin) continue;
          if (params.topMax !== null && rect.top > params.topMax) continue;

          const style = window.getComputedStyle(htmlEl);
          if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.05) continue;

          const rawText = (((htmlEl as HTMLInputElement).value || htmlEl.textContent || '') as string).trim();
          if (!rawText) continue;

          const normalizedText = normalize(rawText);
          const matched = targets.some(t => normalizedText === t || normalizedText.includes(t) || t.includes(normalizedText));
          if (!matched) continue;

          const tag = htmlEl.tagName.toLowerCase();
          const clickableBoost = (tag === 'button' || tag === 'a' || htmlEl.getAttribute('role') === 'button') ? 100 : 0;
          const score = clickableBoost + rect.width + Math.max(0, 400 - Math.abs(rect.top - 220));

          if (!best || score > best.score) {
            best = {
              x: Math.min(window.innerWidth - 2, Math.max(2, rect.left + rect.width / 2)),
              y: Math.min(window.innerHeight - 2, Math.max(2, rect.top + rect.height / 2)),
              text: rawText.substring(0, 40),
              tag,
              score,
            };
          }
        }

        if (!best) return null;

        const pointEl = document.elementFromPoint(best.x, best.y) as HTMLElement | null;
        const finalEl = pointEl || null;
        if (finalEl) {
          finalEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          finalEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          finalEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          finalEl.click();
        }

        return best;
      }, { keywords, topMin, topMax });

      if (candidate) {
        console.log(`[zo-cloud] ${stepName} 第${attempt}次命中: "${candidate.text}" <${candidate.tag}>`);
        try {
          await page.mouse.move(candidate.x, candidate.y);
          await page.mouse.click(candidate.x, candidate.y, { delay: 60 });
        } catch (e) {}
        await sleep(waitAfterMs);
        return true;
      }

      console.log(`[zo-cloud] ${stepName} 第${attempt}次未命中，继续重试...`);
      await sleep(800);
    }

    console.log(`[zo-cloud] ${stepName} 点击失败`);
    return false;
  };

  const clickDateTrigger = async (): Promise<boolean> => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const candidate = await page.evaluate(() => {
        const isVisible = (el: HTMLElement) => {
          const rect = el.getBoundingClientRect();
          if (rect.width < 40 || rect.height < 14) return false;
          if (rect.top < -5 || rect.left < -5 || rect.top > 300) return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.05;
        };

        const pickTarget = (el: HTMLElement) => {
          const rect = el.getBoundingClientRect();
          return {
            x: Math.min(window.innerWidth - 2, Math.max(2, rect.left + rect.width / 2)),
            y: Math.min(window.innerHeight - 2, Math.max(2, rect.top + rect.height / 2)),
            text: ((el as HTMLInputElement).value || el.textContent || '').trim().substring(0, 40),
            tag: el.tagName.toLowerCase(),
          };
        };

        // 优先找“创建时间”所在区域里的日期控件
        const labels = Array.from(document.querySelectorAll('label, span, div'));
        for (const node of labels) {
          const txt = (node.textContent || '').replace(/\s+/g, '');
          if (!txt.includes('创建时间')) continue;
          const container = (node as HTMLElement).closest('tr, form, [class*="row"], [class*="item"], [class*="search"]') as HTMLElement | null;
          const scope = container || (node as HTMLElement).parentElement;
          if (!scope) continue;
          const target = scope.querySelector('input, [class*="date"], [class*="picker"], [class*="range"]') as HTMLElement | null;
          if (target && isVisible(target)) return pickTarget(target);
        }

        // 其次：根据日期字符串特征匹配
        const allCandidates = Array.from(document.querySelectorAll('input, span, div, i'));
        for (const node of allCandidates) {
          const el = node as HTMLElement;
          if (!isVisible(el)) continue;
          const text = (((el as HTMLInputElement).value || el.textContent || '') as string).trim();
          if (/\d{2,4}-\d{1,2}-\d{1,2}/.test(text) || text.includes('创建时间')) {
            return pickTarget(el);
          }
        }

        // 最后：找日期类控件
        const dateLike = document.querySelector(
          'input[class*="date"], input[placeholder*="日期"], input[placeholder*="时间"], [class*="date-editor"], [class*="date-input"], [class*="picker"]'
        ) as HTMLElement | null;
        if (dateLike && isVisible(dateLike)) return pickTarget(dateLike);

        return null;
      });

      if (candidate) {
        console.log(`[zo-cloud] 日期触发区第${attempt}次命中: "${candidate.text}" <${candidate.tag}>`);
        try {
          await page.mouse.move(candidate.x, candidate.y);
          await page.mouse.click(candidate.x, candidate.y, { delay: 60 });
        } catch (e) {}
        await sleep(1200);
        return true;
      }

      console.log(`[zo-cloud] 日期触发区第${attempt}次未命中，继续重试...`);
      await sleep(800);
    }

    console.log('[zo-cloud] 未找到日期触发区');
    return false;
  };

  // 点击"全部" tab
  console.log('[zo-cloud] 查找"全部" tab...');
  await clickByKeywords(['全部'], '"全部" tab', { attempts: 5, waitAfterMs: 2500, topMax: 260 });
  
  // 设置日期范围：点击日期输入框 → 选择"近六月" → 点击"确定"
  console.log('[zo-cloud] 设置日期范围为近6个月...');
  try {
    const opened = await clickDateTrigger();
    if (!opened) {
      console.log('[zo-cloud] 日期面板未打开，继续尝试后续步骤');
    }

    try { await page.screenshot({ path: '/tmp/zocloud_date_picker.png', fullPage: true }); } catch (e) {}

    let quickBtnClicked = await clickByKeywords(
      ['近六月', '近6月', '近半年', '半年', '6个月'],
      '日期快捷按钮',
      { attempts: 5, waitAfterMs: 1500, topMin: 120 }
    );

    let confirmClicked = await clickByKeywords(
      ['确定', '确 定'],
      '日期确定按钮',
      { attempts: 4, waitAfterMs: 1800, topMin: 180 }
    );

    // 首轮没点上，重新开一次面板再点
    if (!quickBtnClicked || !confirmClicked) {
      console.log('[zo-cloud] 首轮日期点击未完成，重试一次完整流程...');
      await clickDateTrigger();
      if (!quickBtnClicked) {
        quickBtnClicked = await clickByKeywords(
          ['近六月', '近6月', '近半年', '半年', '6个月'],
          '日期快捷按钮(重试)',
          { attempts: 4, waitAfterMs: 1200, topMin: 120 }
        );
      }
      if (!confirmClicked) {
        confirmClicked = await clickByKeywords(
          ['确定', '确 定'],
          '日期确定按钮(重试)',
          { attempts: 4, waitAfterMs: 1500, topMin: 180 }
        );
      }
    }

    // 点击查询
    const queryClicked = await clickByKeywords(
      ['查询'],
      '查询按钮',
      { attempts: 6, waitAfterMs: 4000, topMax: 560 }
    );
    if (!queryClicked) {
      console.log('[zo-cloud] 未找到查询按钮，尝试回车触发查询');
      try {
        await page.keyboard.press('Enter');
      } catch (e) {}
      await sleep(3000);
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
          // 从 cookie 中提取 logid 和 gid
          const cookies = document.cookie.split(';').reduce((acc: any, c) => {
            const [k, v] = c.trim().split('=');
            acc[k] = v;
            return acc;
          }, {});
          const logid = cookies.user_id || '0';
          const gid = cookies.group_id || '0';

          const apiUrl = `/api/Table/Search/batchList?logid=${logid}&gid=${gid}`;

          const formParams = new URLSearchParams();
          formParams.append('page', String(params.page));
          formParams.append('page_size', String(params.pageSize));

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formParams.toString(),
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
          return { success: false, error: 'Unknown format', raw: JSON.stringify(data).substring(0, 500) };
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
        if (pageResult.raw) console.log(`[zo-cloud] API 原始响应: ${pageResult.raw}`);
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

/**
 * Node.js 直连 API 抓取（不依赖页面 evaluate / UI 点击）
 * 仅使用 Puppeteer 完成登录与会话 cookie 获取。
 */
async function fetchData(page: Page, config: CrawlerRuntimeConfig, maxPages: number): Promise<any[]> {
  console.log('[zo-cloud] 开始获取数据（Node 直连 API 模式）...');

  const baseUrl = normalizeBaseUrl(config.loginUrl);
  const taskListUrl = `${baseUrl}/Schedule/taskList`;

  // 导航一次任务页，确保会话 cookie 完整
  try {
    await page.goto(taskListUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e: any) {
    console.log(`[zo-cloud] 访问任务页超时，继续直连 API: ${e.message}`);
  }
  await new Promise(resolve => setTimeout(resolve, 2000));

  const cookies = await page.cookies();
  const { cookieMap, cookieHeader } = buildCookieHeader(
    cookies.map(c => ({ name: c.name, value: c.value })),
    resolveTargetCompanyId(config)
  );

  const phpSession = cookieMap.get('PHPSESSID') || '';
  const userId = cookieMap.get('user_id') || cookieMap.get('uid') || config.companyId || '';
  const gid = cookieMap.get('group_id') || cookieMap.get('gid') || config.companyId || '100020';

  console.log(
    `[zo-cloud] 直连上下文: cookies=${cookieMap.size}, PHPSESSID=${phpSession ? 'OK' : 'MISSING'}, user_id=${userId || 'N/A'}, group_id=${gid || 'N/A'}, company_id=${cookieMap.get('company_id') || 'N/A'}`
  );

  const criteria = buildBusinessCriteria(config);
  const startDateStr = criteria.startDate;
  const endDateStr = criteria.endDate;
  const startTs = new Date(`${startDateStr}T00:00:00`).getTime();
  const endTs = new Date(`${endDateStr}T23:59:59`).getTime();
  const effectiveMaxPages = criteria.local.batchNumber ? Math.min(maxPages, 20) : maxPages;

  console.log(
    `[zo-cloud] 业务筛选口径: date=${startDateStr}~${endDateStr}, outletId=${criteria.local.outletCompanyId || '-'}, outlet=${criteria.local.outletName || '-'}, batch=${criteria.local.batchNumber || '-'}, driver=${criteria.local.driverName || '-'}, plate=${criteria.local.vehiclePlate || '-'}, route=${criteria.local.routeKeyword || '-'}, status=${criteria.local.statusCodes.join(',') || '-'}`
  );

  const pageSize = 100;
  let currentPage = 1;
  let totalRecords = 0;
  let hasMore = true;
  const allData: any[] = [];

  const logidCandidates = Array.from(
    new Set([
      userId ? `${userId}${Date.now()}0707` : '',
      userId,
      `${Date.now()}`,
    ].filter(Boolean))
  );
  if (logidCandidates.length === 0) {
    logidCandidates.push(`${Date.now()}`);
  }

  while (hasMore && currentPage <= effectiveMaxPages) {
    console.log(`[zo-cloud] Node 直连请求第 ${currentPage} 页...`);

    let pageResult: {
      success: boolean;
      records: any[];
      total: number;
      error?: string;
      raw?: string;
    } | null = null;

    for (let i = 0; i < logidCandidates.length; i++) {
      const currentResult = await fetchBatchListPageByNode({
        baseUrl,
        cookieHeader,
        logid: logidCandidates[i],
        gid,
        page: currentPage,
        pageSize,
        startDate: startDateStr,
        endDate: endDateStr,
        query: criteria.query,
        filter: criteria.filter,
      });

      if (currentResult.success) {
        if (i > 0) {
          console.log(`[zo-cloud] 第 ${currentPage} 页使用备用 logid #${i + 1} 成功`);
        }
        pageResult = currentResult;
        break;
      }

      console.log(`[zo-cloud] 第 ${currentPage} 页 logid #${i + 1} 失败: ${currentResult.error || 'unknown'}`);
      if (i === logidCandidates.length - 1 && currentResult.raw) {
        console.log(`[zo-cloud] API 原始响应: ${currentResult.raw}`);
      }
    }

    if (!pageResult || !pageResult.success) {
      console.log(`[zo-cloud] 第 ${currentPage} 页请求失败，终止分页`);
      break;
    }

    const records = pageResult.records || [];
    totalRecords = pageResult.total || totalRecords;
    allData.push(...records);

    console.log(`[zo-cloud] 第 ${currentPage} 页获取 ${records.length} 条，累计 ${allData.length}/${totalRecords || '?'}`);

    if (records.length < pageSize || (totalRecords > 0 && allData.length >= totalRecords)) {
      hasMore = false;
    } else {
      currentPage++;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }

  // 本地兜底过滤：按时间窗 + 指定业务口径过滤（防止服务端过滤未生效）
  const filteredData = allData.filter(item => {
    const ts = extractRecordTime(item);
    if (ts !== null && (ts < startTs || ts > endTs)) return false;

    if (criteria.local.outletCompanyId) {
      const companyId = String(item?.company_id || '').trim();
      if (companyId && companyId !== criteria.local.outletCompanyId) return false;
    }

    if (criteria.local.outletName) {
      const outlet = extractOutletName(item);
      if (!outlet.includes(criteria.local.outletName)) return false;
    }

    if (criteria.local.batchNumber) {
      const batchNo = String(item?.car_batch || item?.batch_num || '').trim();
      if (batchNo !== criteria.local.batchNumber) return false;
    }

    if (criteria.local.driverName) {
      const name = String(item?.b_dr_name || '').trim();
      if (!name.includes(criteria.local.driverName)) return false;
    }

    if (criteria.local.vehiclePlate) {
      const plate = String(item?.b_tr_num || '').trim();
      if (!plate.includes(criteria.local.vehiclePlate)) return false;
    }

    if (criteria.local.routeKeyword) {
      const route = String(item?.route_text || '').trim();
      if (!route.includes(criteria.local.routeKeyword)) return false;
    }

    if (criteria.local.statusCodes.length > 0) {
      const st = String(item?.batch_st || '').trim();
      if (!criteria.local.statusCodes.includes(st)) return false;
    }

    return true;
  });

  if (filteredData.length !== allData.length) {
    console.log(`[zo-cloud] 本地业务口径过滤: ${allData.length} -> ${filteredData.length}`);
  }

  console.log(`[zo-cloud] Node 直连抓取完成，共 ${filteredData.length} 条`);
  if (filteredData.length > 0) {
    console.log(`[zo-cloud] 第一条数据键: ${Object.keys(filteredData[0]).slice(0, 15).join(', ')}`);
  }

  return filteredData;
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
  // “应收合计”优先取“实际运费”（不同接口命名可能不同）
  const actualFreight = pickFirstPositiveNumber([
    item.b_tr_trans_f_s,
    item.receivable_trans_f,
    item.actual_freight,
    item.actualFreight,
    item.real_freight,
    item.realFreight,
    item['实际运费'],
  ]);
  const receivableTransport = actualFreight || parseNumber(item.b_tr_trans_f_s);
  const receiptPay          = parseNumber(item.b_tr_pay_receipt_s);
  const billingPay          = parseNumber(item.b_tr_pay_billing_s);
  const creditPay           = parseNumber(item.b_tr_pay_credit_s);
  const coDelivery          = parseNumber(item.b_tr_co_delivery_s);

  // 应收总计 = 优先使用“实际运费”，其次总价，再其次累加各项
  let receivableTotal = actualFreight;
  if (receivableTotal === 0) {
    receivableTotal = parseNumber(item.b_tr_total_price_s || item.receivable_total);
  }
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
  description: 'zo-cloud 物流管理系统，支持 switchAccount 切网点与按“网点字段”本地过滤后入库',
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
      key: 'targetCompanyId',
      label: '切换网点公司ID',
      type: 'text',
      required: false,
      placeholder: '默认 225088（北京登途网联车队）',
      defaultValue: TARGET_COMPANY_ID
    },
    {
      key: 'outletName',
      label: '网点筛选名称',
      type: 'text',
      required: false,
      placeholder: '默认 北京登途网联车队（按网点字段过滤）',
      defaultValue: TARGET_ORG_NAME
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
    {
      key: 'dateRangeDays',
      label: '抓取时间范围(天)',
      type: 'number',
      required: false,
      placeholder: '默认180，表示近180天'
    },
    {
      key: 'batchNumber',
      label: '指定批次号(可选)',
      type: 'text',
      required: false,
      placeholder: '例如: JJGDSH251208010'
    },
    {
      key: 'driverName',
      label: '司机姓名关键词(可选)',
      type: 'text',
      required: false,
      placeholder: '例如: 张三'
    },
    {
      key: 'vehiclePlate',
      label: '车牌关键词(可选)',
      type: 'text',
      required: false,
      placeholder: '例如: 渝A'
    },
    {
      key: 'routeKeyword',
      label: '线路关键词(可选)',
      type: 'text',
      required: false,
      placeholder: '例如: 遂宁'
    },
    {
      key: 'statusCodes',
      label: '批次状态码(可选)',
      type: 'text',
      required: false,
      placeholder: '逗号分隔，例如: 10,1'
    },
  ],
  login,
  fetchData,
  mapFields,
};

// ==================== 注册模板 ====================
registerCrawlerTemplate(zoCloudTemplate);

export default zoCloudTemplate;
