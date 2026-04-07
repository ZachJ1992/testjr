/**
 * zo-cloud TMS 运单列表爬虫模板
 * 
 * 抓取 zo-cloud 运单列表页 (/Order/orderList) 数据
 * 复用 zo-cloud 模板的登录和组织切换逻辑
 */

import { Page } from 'puppeteer-core';
import { 
  CrawlerTemplate, 
  CrawlerRuntimeConfig, 
  WaybillData,
  registerCrawlerTemplate 
} from '../crawler-templates.js';

const TARGET_ORG_NAME = '北京登途网联车队';
const TARGET_COMPANY_ID = '225088';
const ORDER_START_DATE = '2026-03-01';

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

function parseNumber(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

function normalizeBaseUrl(loginUrl: string): string {
  const withProtocol = /^https?:\/\//i.test(loginUrl) ? loginUrl : `https://${loginUrl}`;
  return withProtocol.replace(/\/+$/, '');
}

function formatDateYmd(date: Date): string {
  return date.toISOString().split('T')[0];
}

function firstNonEmptyText(...values: any[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (!text) continue;
    return text;
  }
  return '';
}

function resolveWaybillNumber(item: any): string {
  return firstNonEmptyText(item.order_num, item.od_id, item.id);
}

function resolveStatusText(item: any): string {
  const directText = firstNonEmptyText(
    item.order_status_text,
    item.order_st_text,
    item.b_tr_state_text,
    item.b_tr_state
  );
  if (directText && /[\u4e00-\u9fa5]/.test(directText)) {
    return directText;
  }

  const code = firstNonEmptyText(item.order_status, item.order_st, item.b_tr_state);
  const statusCodeMap: Record<string, string> = {
    '0': '待处理',
    '1': '已发布',
    '2': '运输中',
    '3': '已完成',
    '4': '已作废',
    '5': '已签收',
    '10': '待处理',
  };
  return statusCodeMap[code] || directText || '待处理';
}

function parseDateYmdFromRaw(value: any): string {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';
  const direct = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatDateYmd(parsed);
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

function buildCookieHeader(
  cookies: Array<{ name: string; value: string }>,
  forceCompanyId?: string
): { cookieMap: Map<string, string>; cookieHeader: string } {
  const cookieMap = new Map<string, string>();
  for (const cookie of cookies) {
    if (!cookie?.name) continue;
    cookieMap.set(cookie.name, cookie.value ?? '');
  }
  if (forceCompanyId) {
    cookieMap.set('company_id', forceCompanyId);
  }
  const cookieHeader = Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  return { cookieMap, cookieHeader };
}

// ==================== 组织切换（复用 zo-cloud 逻辑） ====================

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
}> {
  const userId = params.cookieMap.get('user_id') || params.cookieMap.get('uid') || '';
  const gid = params.cookieMap.get('group_id') || params.cookieMap.get('gid') || '';
  if (!userId || !gid) {
    return { success: false, cookiePairs: [], error: `缺少会话标识: user_id=${userId || 'N/A'}, group_id=${gid || 'N/A'}` };
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
        'cookie': Array.from(params.cookieMap.entries()).map(([n, v]) => `${n}=${v}`).join('; '),
      },
      body: form.toString(),
      redirect: 'manual',
    });

    const setCookieRaw = response.headers.getSetCookie?.() ?? [];
    const cookiePairs = parseSetCookiePairs(setCookieRaw);
    const bodyText = await response.text();
    let body: any = {};
    try { body = JSON.parse(bodyText); } catch {}

    const switchedId = cookiePairs.find(p => p.name === 'company_id')?.value
      || body?.res?.company_id || body?.company_id;
    const switchedName = body?.res?.company_name || body?.company_name || '';

    if (body?.errno === 0 || switchedId) {
      return { success: true, cookiePairs, switchedCompanyId: switchedId || params.targetCompanyId, switchedCompanyName: switchedName };
    }

    return { success: false, cookiePairs, error: `API errno=${body?.errno}, errmsg=${body?.errmsg || 'unknown'}` };
  } catch (e: any) {
    return { success: false, cookiePairs: [], error: e?.message || '请求异常' };
  }
}

async function switchOrganization(page: Page, config: CrawlerRuntimeConfig): Promise<boolean> {
  const targetCompanyId = resolveTargetCompanyId(config);
  const targetOrgName = resolveTargetOrgName(config);
  const origin = toOrigin(config.loginUrl);

  console.log(`[zo-cloud-orders] 切换组织到: ${targetOrgName} (company_id=${targetCompanyId})`);

  const cookies = await page.cookies();
  const cookieMap = new Map<string, string>();
  for (const c of cookies) { cookieMap.set(c.name, c.value); }

  const result = await switchAccountByNode({ origin, cookieMap: cookieMap, targetCompanyId });
  if (result.success) {
    console.log(`[zo-cloud-orders] switchAccount 成功: ${result.switchedCompanyName || targetOrgName} (${result.switchedCompanyId || targetCompanyId})`);
    for (const pair of result.cookiePairs) {
      cookieMap.set(pair.name, pair.value);
    }
    cookieMap.set('company_id', targetCompanyId);
    const domain = new URL(origin).hostname;
    for (const [name, value] of cookieMap) {
      try { await page.setCookie({ name, value, domain, path: '/' }); } catch {}
    }

    try {
      await page.goto(`${origin}/Index/Home`, { waitUntil: 'networkidle2', timeout: 15000 });
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));

    const hasRefreshHint = await page.evaluate(() =>
      (document.body.textContent || '').includes('请先刷新页面')
    );
    if (hasRefreshHint) {
      console.log('[zo-cloud-orders] 检测到"请先刷新页面"提示（保持当前会话，不自动刷新）');
    }

    const currentCid = (await page.cookies()).find(c => c.name === 'company_id')?.value;
    console.log(`[zo-cloud-orders] 当前 company_id cookie: ${currentCid || 'N/A'}`);
    console.log(`[zo-cloud-orders] 组织切换完成: ${targetOrgName}`);
    return true;
  }

  console.log(`[zo-cloud-orders] switchAccount 失败: ${result.error}`);
  return false;
}

// ==================== 登录逻辑（复用 zo-cloud） ====================

async function login(page: Page, config: CrawlerRuntimeConfig): Promise<boolean> {
  console.log(`[zo-cloud-orders] 开始登录 - 公司ID: ${config.companyId}, 用户名: ${config.username}`);

  const loginUrls = [
    config.loginUrl + '/tms/login',
    config.loginUrl + '/Login',
    config.loginUrl + '/login',
    config.loginUrl,
  ];

  let loginPageFound = false;

  for (const loginUrl of loginUrls) {
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      const inputs = await page.$$('input');
      if (inputs.length >= 2) {
        loginPageFound = true;
        console.log(`[zo-cloud-orders] 找到登录页面: ${loginUrl}`);
        break;
      }

      const currentUrl = page.url();
      if (currentUrl.includes('/Index/Home') || currentUrl.includes('/Schedule')) {
        console.log('[zo-cloud-orders] 已经登录');
        return true;
      }
    } catch (e: any) {
      console.log(`[zo-cloud-orders] 访问 ${loginUrl} 失败: ${e.message}`);
    }
  }

  if (!loginPageFound) {
    console.log('[zo-cloud-orders] 尝试点击"开始体验"...');
    await page.goto(config.loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a.btn, a[class*="button"], span[class*="button"]');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        if (['开始体验', '进入系统', '登录', '进入'].includes(text)) {
          (btn as HTMLElement).click();
          return;
        }
      }
    });
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  let loginFormFound = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const inputs = await page.$$('input[type="text"], input[type="password"], input:not([type])');
    if (inputs.length >= 3) {
      loginFormFound = true;
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(config.companyId, { delay: 50 });
      await inputs[1].click({ clickCount: 3 });
      await inputs[1].type(config.username, { delay: 50 });
      await inputs[2].click({ clickCount: 3 });
      await inputs[2].type(config.password, { delay: 50 });
      break;
    } else if (inputs.length >= 2) {
      loginFormFound = true;
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(config.username, { delay: 50 });
      await inputs[1].click({ clickCount: 3 });
      await inputs[1].type(config.password, { delay: 50 });
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  if (!loginFormFound) {
    console.log('[zo-cloud-orders] 未找到登录表单');
    return false;
  }

  const loginClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, [type="submit"], .btn, [class*="button"]');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (text.includes('登录') || text.includes('Login')) {
        (btn as HTMLElement).click();
        return text;
      }
    }
    const form = document.querySelector('form');
    if (form) { form.submit(); return 'form-submit'; }
    return null;
  });

  if (loginClicked) {
    console.log(`[zo-cloud-orders] 已点击登录按钮: ${loginClicked}`);
  }

  let loginSuccess = false;
  const startUrl = page.url();
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const currentUrl = page.url();
    if (currentUrl.includes('/Index/Home') || currentUrl.includes('/Schedule') || currentUrl.includes('/dashboard')) {
      console.log(`[zo-cloud-orders] 登录成功！跳转到: ${currentUrl}`);
      loginSuccess = true;
      break;
    }
  }

  if (!loginSuccess) {
    try {
      await page.goto(config.loginUrl + '/Index/Home', { waitUntil: 'networkidle2', timeout: 15000 });
      const newUrl = page.url();
      if (newUrl.includes('/Index/Home') || newUrl.includes('/Schedule')) {
        loginSuccess = true;
      }
    } catch {}
  }

  if (loginSuccess) {
    console.log('[zo-cloud-orders] 登录成功');
  }

  return loginSuccess;
}

// ==================== 数据获取：运单列表 API ====================

function parseOrderListResponse(data: any): {
  success: boolean;
  records: any[];
  total: number;
  error?: string;
  raw?: string;
} {
  if (data?.errno === 0 && Array.isArray(data?.res?.data)) {
    return { success: true, records: data.res.data, total: Number(data.res.total?.count || data.res.total || data.res.data.length) };
  }
  if (Array.isArray(data?.data?.datas)) {
    return { success: true, records: data.data.datas, total: Number(data.data.total || data.data.datas.length) };
  }
  if (Array.isArray(data?.data?.rows)) {
    return { success: true, records: data.data.rows, total: Number(data.data.total || data.data.rows.length) };
  }
  return {
    success: false, records: [], total: 0,
    error: `errno=${data?.errno ?? 'N/A'}, errmsg=${data?.errmsg ?? 'unknown'}`,
    raw: JSON.stringify(data).substring(0, 600),
  };
}

async function fetchOrderListPage(params: {
  baseUrl: string;
  cookieHeader: string;
  logid: string;
  gid: string;
  page: number;
  pageSize: number;
  startDate: string;
  endDate: string;
}): Promise<{
  success: boolean;
  records: any[];
  total: number;
  error?: string;
  raw?: string;
}> {
  try {
    const apiUrl = new URL('/api/Table/Search/orderList', params.baseUrl);
    apiUrl.searchParams.set('logid', params.logid);
    apiUrl.searchParams.set('gid', params.gid);

    const reqPayload = {
      category: 'Order',
      tab: 'od_all',
      sort: { billing_date: 'desc' },
      page_num: params.page,
      page_size: params.pageSize,
      cid: '',
      query: {},
      filter: {
        billing_date: [
          ['>=', `${params.startDate} 00:00:00`],
          ['<=', `${params.endDate} 23:59:59`],
        ],
      },
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
        'Origin': params.baseUrl,
        'Referer': `${params.baseUrl}/Order/orderList`,
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: bodyParams.toString(),
    });

    const rawText = await response.text();
    if (!response.ok) {
      return { success: false, records: [], total: 0, error: `HTTP ${response.status}`, raw: rawText.substring(0, 600) };
    }

    let data: any;
    try { data = JSON.parse(rawText); } catch {
      return { success: false, records: [], total: 0, error: '响应不是合法 JSON', raw: rawText.substring(0, 600) };
    }

    return parseOrderListResponse(data);
  } catch (e: any) {
    return { success: false, records: [], total: 0, error: e?.message || '请求异常' };
  }
}

async function fetchData(_page: Page, config: CrawlerRuntimeConfig, maxPages: number): Promise<any[]> {
  console.log('[zo-cloud-orders] 开始接口抓取运单列表数据...');

  const baseUrl = normalizeBaseUrl(config.loginUrl);

  // 获取 cookies 用于 Node 直连后续分页
  const cookies = await _page.cookies();
  const targetCompanyId = resolveTargetCompanyId(config);
  const { cookieMap, cookieHeader } = buildCookieHeader(
    cookies.map((c: { name: string; value: string }) => ({ name: c.name, value: c.value })),
    targetCompanyId
  );

  const userId = cookieMap.get('user_id') || cookieMap.get('uid') || '';
  const gid = cookieMap.get('group_id') || cookieMap.get('gid') || '100020';

  console.log(`[zo-cloud-orders] 直连上下文: cookies=${cookieMap.size}, PHPSESSID=${cookieMap.get('PHPSESSID') ? 'OK' : 'MISSING'}, user_id=${userId || 'N/A'}, group_id=${gid || 'N/A'}, company_id=${cookieMap.get('company_id') || 'N/A'} (target=${targetCompanyId})`);

  const now = new Date();
  const startDate = ORDER_START_DATE;
  const endDate = formatDateYmd(now);

  console.log(`[zo-cloud-orders] 使用接口: /api/Table/Search/orderList, 筛选字段: billing_date, 筛选: ${startDate} ~ ${endDate}`);

  const pageSize = 1000;
  let currentPage = 1;
  let totalRecords = 0;
  let hasMore = true;
  const allData: any[] = [];

  const logid = userId ? `${userId}${Date.now()}0707` : `${Date.now()}`;

  while (hasMore && currentPage <= maxPages) {
    console.log(`[zo-cloud-orders] Node 直连请求第 ${currentPage} 页...`);

    const pageResult = await fetchOrderListPage({
      baseUrl, cookieHeader, logid, gid,
      page: currentPage, pageSize,
      startDate, endDate,
    });

    if (!pageResult.success) {
      console.log(`[zo-cloud-orders] 第 ${currentPage} 页失败: ${pageResult.error}`);
      if (pageResult.raw) console.log(`[zo-cloud-orders] API 原始响应: ${pageResult.raw?.substring(0, 300)}`);
      break;
    }

    const records = pageResult.records || [];
    totalRecords = pageResult.total || totalRecords;
    allData.push(...records);

    console.log(`[zo-cloud-orders] 第 ${currentPage} 页: ${records.length} 条，累计 ${allData.length}/${totalRecords || '?'}`);

    if (records.length < pageSize || (totalRecords > 0 && allData.length >= totalRecords)) {
      hasMore = false;
    } else {
      currentPage++;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }

  console.log(`[zo-cloud-orders] 获取完成，共 ${allData.length} 条`);
  if (allData.length > 0) {
    console.log(`[zo-cloud-orders] 首条 keys: ${Object.keys(allData[0]).slice(0, 30).join(', ')}`);
    console.log(`[zo-cloud-orders] 首条数据(前500字符): ${JSON.stringify(allData[0]).substring(0, 500)}`);
  }

  // 同一页接口偶尔返回重复运单，按运单号去重（保留最先出现的一条）
  const deduped: any[] = [];
  const seenWaybillNumbers = new Set<string>();
  let duplicateRows = 0;
  for (const item of allData) {
    const key = resolveWaybillNumber(item);
    if (!key) {
      deduped.push(item);
      continue;
    }
    if (seenWaybillNumbers.has(key)) {
      duplicateRows++;
      continue;
    }
    seenWaybillNumbers.add(key);
    deduped.push(item);
  }
  if (duplicateRows > 0) {
    console.log(`[zo-cloud-orders] 去重完成: 原始=${allData.length}, 去重后=${deduped.length}, 重复=${duplicateRows}`);
  }

  return deduped;
}

// ==================== 字段映射 ====================

function mapFields(rawData: any): WaybillData {
  const item = rawData.rawData || rawData;

  const waybillNumber = resolveWaybillNumber(item);
  const totalFreight = parseNumber(item.total_price || item.actual_price || 0);
  const createTimeRaw = item.order_create_t || item.order_create_day || item.billing_date || null;
  const billingDateRaw = item.billing_date || null;
  const billingDateYmd = parseDateYmdFromRaw(billingDateRaw);
  const driverName = String(item.b_tr_dr_name || '').trim();
  const vehiclePlate = String(item.b_tr_tr_num || item.pickup_tr_num || '').trim();
  const receiverAddr = String(item.cee_addr || '').trim();
  const receiverName = String(item.cee_name || '').trim();
  const senderName = String(item.cor_name || '').trim();
  const statusText = resolveStatusText(item);

  return {
    waybillNumber,
    externalId: String(item.od_id || item.id || ''),
    driverName,
    vehiclePlate,
    departurePlace: senderName,
    arrivalPlace: receiverAddr || receiverName,
    freight: totalFreight,
    receivableTotal: totalFreight,
    receivableTransport: totalFreight,
    payableTotal: 0,
    status: statusText || '待处理',
    batchStatusText: statusText || '',
    remark: '',
    // 业务日期口径与 TMS 查询口径对齐：billing_date
    waybillDate: billingDateRaw ? new Date(billingDateRaw) : (createTimeRaw ? new Date(createTimeRaw) : undefined),
    waybillDateYmd: billingDateYmd,
    // 保留开单时间用于 created_time 展示
    createTime: createTimeRaw ? new Date(createTimeRaw) : undefined,
    subFinancier: '金罗',
    branch: '金罗',
  };
}

// ==================== 注册模板 ====================

const zoCloudOrdersTemplate: CrawlerTemplate = {
  id: 'zo-cloud-orders',
  name: '金罗运单列表',
  description: '抓取 zo-cloud TMS 运单列表页数据',
  requiredFields: [
    { key: 'companyId', label: '公司ID', type: 'text', required: true },
    { key: 'username', label: '用户名', type: 'text', required: true },
    { key: 'password', label: '密码', type: 'password', required: true },
  ],
  login,
  fetchData,
  mapFields,
};

registerCrawlerTemplate(zoCloudOrdersTemplate);

export default zoCloudOrdersTemplate;
