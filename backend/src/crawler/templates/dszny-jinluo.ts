/**
 * dszny.com (大势能源) - 金罗运单爬虫模板
 *
 * 数据来源：https://www.dszny.com/waybills
 * 接口直连：POST /api/v1/table/search
 * 鉴权方式：Bearer Token（JWT，浏览器抓包获取，默认 2 小时过期）
 *
 * 设计要点：
 * 鉴权策略（无感续期）：
 *   - 优先用 username/password/tenantId 自动登录拿 token，JWT 默认 2 小时有效；
 *   - 内存里缓存 token，每次接口请求收到 401 / "token" 错误时自动重新登录重试；
 *   - 兼容旧的"直接贴 token"模式（仅当 username/password 未填时使用）。
 *
 * 设计要点：
 *   1) 接口本身支持按 createdAt 范围筛选 + 分页（pageSize 上限 ≥ 500），按自然月切片 + 内部翻页双重保险；
 *   2) 收益计算关键金额取 freight（运费），同时填到 receivableTotal / payableTotal / receivableTransport 三个口径，
 *      与金罗在抽成合同里实际选哪个字段无关均可命中；
 *   3) 网点字段：orgUnitName（如"四川宜宾"）作为 branch，匹配 routes.name；
 *   4) keepAlive：拉单日数据做轻量保活，不影响 last_sync_time。
 */

import { Page } from 'puppeteer-core';
import {
  CrawlerRuntimeConfig,
  CrawlerTemplate,
  KeepAliveResult,
  WaybillData,
  registerCrawlerTemplate,
} from '../crawler-templates.js';

const DEFAULT_BASE_URL = 'https://www.dszny.com';
const SEARCH_PATH = '/api/v1/table/search';
const LOGIN_PATH = '/api/v1/auth/login';
const HISTORY_REFERER = `${DEFAULT_BASE_URL}/waybills`;
const LOGIN_REFERER = `${DEFAULT_BASE_URL}/login`;
const DEFAULT_LANDING_PARTNER_ROUTE = '金罗';
const DEFAULT_DATE_RANGE_DAYS = 31;
const DEFAULT_KEEP_ALIVE_INTERVAL_MINUTES = 15;
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_TAB = 'all';
const MAX_PAGES_PER_RANGE = 50;
const DEFAULT_TENANT_ID = 100021;

/**
 * 进程内 token 缓存：以 (baseUrl::tenantId::username) 为 key，避免每次抓取都重复登录。
 * 缓存 TTL 90 分钟（JWT 默认 2 小时，留 30 分钟安全余量）。
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 90 * 60 * 1000;

type DateRange = {
  startDate: string;
  endDate: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeBaseUrl(loginUrl: string | undefined): string {
  const raw = String(loginUrl || DEFAULT_BASE_URL).trim();
  if (!raw) return DEFAULT_BASE_URL;
  try {
    return new URL(raw).origin;
  } catch (_e) {
    return raw.replace(/\/+$/, '');
  }
}

function parseNumber(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  const text = String(value).replace(/,/g, '').trim();
  if (!text) return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateYmd(value: any): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().slice(0, 10).replace(/\//g, '-');
  const matched = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function lastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * 按自然月切片：endDate 默认今天，startDate 默认 endDate - dateRangeDays + 1。
 * 切片粒度按自然月避开极端跨度，单切片再依赖 pageSize 分页拉完。
 */
function buildMonthlyDateRanges(config: CrawlerRuntimeConfig): DateRange[] {
  const configuredEnd = parseDateYmd(config.endDate ?? config.filterEndDate);
  const endDate = configuredEnd || new Date();

  const configuredStart = parseDateYmd(config.startDate ?? config.filterStartDate);
  const rangeDaysRaw = Number(config.dateRangeDays ?? config.fetchDays ?? DEFAULT_DATE_RANGE_DAYS);
  const rangeDays = Number.isFinite(rangeDaysRaw) && rangeDaysRaw > 0
    ? Math.floor(rangeDaysRaw)
    : DEFAULT_DATE_RANGE_DAYS;
  const startDate = configuredStart || addDays(endDate, -(rangeDays - 1));

  const ranges: DateRange[] = [];
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  while (cursor <= end) {
    const monthEnd = lastDayOfMonth(cursor);
    const chunkEnd = monthEnd < end ? monthEnd : end;
    ranges.push({
      startDate: formatDateYmd(cursor),
      endDate: formatDateYmd(chunkEnd),
    });
    cursor = addDays(chunkEnd, 1);
  }

  return ranges;
}

function buildKeepAliveRange(): DateRange {
  const today = formatDateYmd(new Date());
  return { startDate: today, endDate: today };
}

function resolveStaticToken(config: CrawlerRuntimeConfig): string {
  const raw = String(
    config.bearerToken ??
    config.token ??
    config.authorization ??
    ''
  ).trim();
  // 容忍用户直接粘贴 "Bearer xxx" 整段
  return raw.replace(/^Bearer\s+/i, '').trim();
}

type Credentials = {
  baseUrl: string;
  tenantId: number;
  username: string;
  password: string;
};

function resolveCredentials(config: CrawlerRuntimeConfig): Credentials | null {
  const username = String(config.username ?? '').trim();
  const password = String(config.password ?? '').trim();
  if (!username || !password) return null;

  const tenantRaw = config.tenantId ?? config.companyId ?? DEFAULT_TENANT_ID;
  const tenantId = Number(tenantRaw);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return null;
  }

  return {
    baseUrl: normalizeBaseUrl(config.loginUrl),
    tenantId,
    username,
    password,
  };
}

function cacheKey(creds: Credentials): string {
  return `${creds.baseUrl}::${creds.tenantId}::${creds.username}`;
}

async function loginByCredentials(creds: Credentials): Promise<string> {
  const url = new URL(LOGIN_PATH, creds.baseUrl);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'origin': creds.baseUrl,
      'pragma': 'no-cache',
      'referer': LOGIN_REFERER,
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      tenantId: creds.tenantId,
      username: creds.username,
      password: creds.password,
    }),
  });

  const rawText = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch (_e) {
    throw new Error(`dszny 登录响应不是合法 JSON (HTTP ${response.status}): ${rawText.substring(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(
      `dszny 登录失败 HTTP ${response.status}: ${data?.message || data?.msg || rawText.substring(0, 200)}`
    );
  }

  const token = String(data?.token ?? data?.data?.token ?? '').trim();
  if (!token) {
    throw new Error(`dszny 登录响应缺少 token: ${rawText.substring(0, 200)}`);
  }
  return token;
}

/**
 * 获取可用 token。优先用凭据自动登录（带缓存）；凭据缺失时回退到静态 token。
 * @param forceRefresh 强制刷新（401 重试时使用）
 */
async function obtainToken(config: CrawlerRuntimeConfig, forceRefresh = false): Promise<string> {
  const creds = resolveCredentials(config);
  if (creds) {
    const key = cacheKey(creds);
    if (!forceRefresh) {
      const cached = tokenCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.token;
      }
    }
    const token = await loginByCredentials(creds);
    tokenCache.set(key, { token, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    console.log(`[dszny-金罗] 自动登录成功，token 缓存 90 分钟 (tenant=${creds.tenantId}, user=${creds.username})`);
    return token;
  }

  const staticToken = resolveStaticToken(config);
  if (!staticToken) {
    throw new Error('dszny-金罗 缺少登录凭据：请填写 username/password/tenantId，或提供 bearerToken');
  }
  return staticToken;
}

function resolveTab(config: CrawlerRuntimeConfig): string {
  return String(config.tab ?? DEFAULT_TAB).trim() || DEFAULT_TAB;
}

function resolvePageSize(config: CrawlerRuntimeConfig): number {
  const raw = Number(config.pageSize ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(raw), 1000);
}

function buildSearchPayload(params: {
  tab: string;
  page: number;
  pageSize: number;
  range: DateRange;
}): string {
  return JSON.stringify({
    category: 'waybill',
    tab: params.tab,
    page: params.page,
    pageSize: params.pageSize,
    // 实测：filters.createdAt 必须是 {gte, lte} 对象（被服务端转成 ES range 查询）；
    // [start, end] 数组形式会被解析为 terms（精确匹配），实际上"碰巧"还能返回数据是因为默认兜底，不可信。
    filters: {
      createdAt: { gte: params.range.startDate, lte: params.range.endDate },
    },
  });
}

function isAuthFailure(httpStatus: number, body: any): boolean {
  if (httpStatus === 401 || httpStatus === 403) return true;
  if (body && typeof body === 'object') {
    const code = body.code;
    if (code === 401 || code === '401') return true;
    const msg = String(body.message || body.msg || '').toLowerCase();
    if (msg.includes('token') || msg.includes('unauth') || msg.includes('未登录') || msg.includes('登录')) {
      return true;
    }
  }
  return false;
}

type SearchPageOk = { kind: 'ok'; total: number; rows: any[] };
type SearchPageAuthError = { kind: 'auth_error'; reason: string };

async function fetchSearchPageOnce(params: {
  baseUrl: string;
  token: string;
  range: DateRange;
  page: number;
  pageSize: number;
  tab: string;
}): Promise<SearchPageOk | SearchPageAuthError> {
  const url = new URL(SEARCH_PATH, params.baseUrl);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'authorization': `Bearer ${params.token}`,
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'origin': params.baseUrl,
      'pragma': 'no-cache',
      'referer': HISTORY_REFERER,
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    },
    body: buildSearchPayload({
      tab: params.tab,
      page: params.page,
      pageSize: params.pageSize,
      range: params.range,
    }),
  });

  const rawText = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch (_e) {
    if (isAuthFailure(response.status, null)) {
      return { kind: 'auth_error', reason: `HTTP ${response.status}` };
    }
    throw new Error(`dszny 响应不是合法 JSON (HTTP ${response.status}): ${rawText.substring(0, 300)}`);
  }

  if (isAuthFailure(response.status, data)) {
    return {
      kind: 'auth_error',
      reason: `HTTP ${response.status}, code=${data?.code}, msg=${data?.message || data?.msg || ''}`,
    };
  }

  if (!response.ok) {
    throw new Error(
      `dszny HTTP ${response.status}: ${data?.message || data?.msg || rawText.substring(0, 200)}`
    );
  }

  if (Number(data?.code) !== 0) {
    throw new Error(`dszny 查询失败 code=${data?.code}: ${data?.message || data?.msg || '未知错误'}`);
  }

  const wrapper = data?.data || {};
  const rows = Array.isArray(wrapper?.data) ? wrapper.data : [];
  const total = Number(wrapper?.total ?? rows.length) || rows.length;
  return { kind: 'ok', total, rows };
}

/**
 * 带 401 自动重试的查询：token 失效时强制刷新一次，仍失败则上抛。
 */
async function fetchSearchPage(params: {
  config: CrawlerRuntimeConfig;
  range: DateRange;
  page: number;
  pageSize: number;
  tab: string;
}): Promise<{ total: number; rows: any[] }> {
  const baseUrl = normalizeBaseUrl(params.config.loginUrl);
  let token = await obtainToken(params.config, false);

  let attempt = await fetchSearchPageOnce({
    baseUrl,
    token,
    range: params.range,
    page: params.page,
    pageSize: params.pageSize,
    tab: params.tab,
  });

  if (attempt.kind === 'auth_error') {
    console.log(`[dszny-金罗] token 失效 (${attempt.reason})，尝试自动续期重试`);
    token = await obtainToken(params.config, true);
    attempt = await fetchSearchPageOnce({
      baseUrl,
      token,
      range: params.range,
      page: params.page,
      pageSize: params.pageSize,
      tab: params.tab,
    });
    if (attempt.kind === 'auth_error') {
      throw new Error(`dszny 自动续期后仍鉴权失败 (${attempt.reason})，请检查账号/密码`);
    }
  }

  return { total: attempt.total, rows: attempt.rows };
}

async function fetchSearchRange(params: {
  range: DateRange;
  config: CrawlerRuntimeConfig;
}): Promise<any[]> {
  const pageSize = resolvePageSize(params.config);
  const tab = resolveTab(params.config);
  const collected: any[] = [];
  let page = 1;
  let total = 0;

  while (page <= MAX_PAGES_PER_RANGE) {
    const result = await fetchSearchPage({
      config: params.config,
      range: params.range,
      page,
      pageSize,
      tab,
    });
    total = result.total;
    collected.push(...result.rows);

    console.log(
      `[dszny-金罗] ${params.range.startDate}~${params.range.endDate} page=${page} got=${result.rows.length}/${total}`
    );

    if (result.rows.length < pageSize) break;
    if (collected.length >= total) break;
    page++;
    await sleep(200);
  }

  if (page > MAX_PAGES_PER_RANGE) {
    console.warn(
      `[dszny-金罗] ${params.range.startDate}~${params.range.endDate} 命中分页上限 ${MAX_PAGES_PER_RANGE}，可能漏数据`
    );
  }

  return collected;
}

function resolveStatus(item: any): { status: string; statusText: string } {
  const raw = String(item?.status ?? '').trim();
  const map: Record<string, { status: string; statusText: string }> = {
    created: { status: 'pending', statusText: '已开单' },
    assigned: { status: 'pending', statusText: '已分配' },
    accepted: { status: 'pending', statusText: '已受理' },
    picking: { status: 'pending', statusText: '提货中' },
    picked_up: { status: 'in_transit', statusText: '已提货' },
    warehoused: { status: 'in_transit', statusText: '已入库' },
    loaded: { status: 'in_transit', statusText: '已装车' },
    departed: { status: 'in_transit', statusText: '已发车' },
    in_transit: { status: 'in_transit', statusText: '运输中' },
    unloading: { status: 'in_transit', statusText: '到货卸车' },
    arrived: { status: 'delivered', statusText: '已到货' },
    delivering: { status: 'delivered', statusText: '派送中' },
    delivered: { status: 'completed', statusText: '已签收' },
    exception: { status: 'pending', statusText: '异常' },
    canceled: { status: 'pending', statusText: '已取消' },
  };
  return map[raw] || { status: 'pending', statusText: raw || '' };
}

function parseDateValue(value: any): Date | undefined {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function pickAddressDetail(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';
  const parts = [
    obj.province,
    obj.city,
    obj.district,
    obj.town,
    obj.street,
    obj.detail,
  ]
    .map(v => String(v ?? '').trim())
    .filter(Boolean);
  if (parts.length) return parts.join('');
  return String(obj.fullAddress || '').trim();
}

function mapFields(rawData: any): WaybillData {
  const item = rawData?.rawData || rawData;
  const status = resolveStatus(item);

  const waybillNumber = String(item?.waybillNo || item?.id || '').trim();
  const freight = parseNumber(item?.freight ?? item?.freightAmount);
  const businessTime =
    parseDateValue(item?.issuedAt) ||
    parseDateValue(item?.createdAt) ||
    parseDateValue(item?.departureTime) ||
    undefined;
  const waybillDateYmd = businessTime ? formatDateYmd(businessTime) : undefined;

  const orgUnitName = String(item?.orgUnitName || '').trim();
  const landingPartnerRoute = String(
    item?.__routeName ??
    item?.__landingPartnerName ??
    orgUnitName ??
    DEFAULT_LANDING_PARTNER_ROUTE
  ).trim() || DEFAULT_LANDING_PARTNER_ROUTE;

  return {
    waybillNumber,
    externalId: String(item?.id || ''),
    senderName: String(item?.senderName || ''),
    senderPhone: String(item?.senderPhone || ''),
    senderAddress: pickAddressDetail(item?.senderAddress),
    receiverName: String(item?.receiverName || ''),
    receiverPhone: String(item?.receiverPhone || ''),
    receiverAddress: pickAddressDetail(item?.receiverAddress),
    goodsName: String(item?.goodsName || ''),
    weight: parseNumber(item?.weight),
    volume: parseNumber(item?.volume),
    declaredValue: parseNumber(item?.declaredValue),

    // 收益基数：金罗 抽成合同实际选哪个口径都先填上，避免漏匹配。
    freight,
    receivableTotal: freight,
    receivableTransport: freight,
    receivableCash: parseNumber(item?.cashAmount),
    receivableCollect: parseNumber(item?.collectAmount),
    receivableMonthly: parseNumber(item?.monthlyAmount),
    payableTotal: freight,
    payableTransport: freight,

    status: status.status,
    batchStatusText: status.statusText,
    remark: String(item?.remark || ''),
    createTime: parseDateValue(item?.createdAt),
    shipTime: businessTime,
    deliveryTime: parseDateValue(item?.signedTime),
    waybillDateYmd,

    // 网点：dszny 用 orgUnitName 表示运单业务归属网点（如"四川宜宾"），对应我们 routes.name。
    branch: landingPartnerRoute,
    subFinancier: landingPartnerRoute,
  };
}

async function login(_page: Page, config: CrawlerRuntimeConfig): Promise<boolean> {
  try {
    // 触发一次 obtainToken（必要时执行账号密码登录），并做一次轻量查询验证 token 可用
    const range = buildKeepAliveRange();
    await fetchSearchPage({
      config,
      range,
      page: 1,
      pageSize: 1,
      tab: resolveTab(config),
    });
    console.log('[dszny-金罗] 登录校验通过');
    return true;
  } catch (e: any) {
    console.log(`[dszny-金罗] 登录校验失败: ${e.message || e}`);
    return false;
  }
}

async function fetchData(_page: Page, config: CrawlerRuntimeConfig, _maxPages: number): Promise<any[]> {

  const ranges = buildMonthlyDateRanges(config);
  const landingPartnerRoute = String(
    config.routeName ??
    config.landingPartnerName ??
    config.branchName ??
    DEFAULT_LANDING_PARTNER_ROUTE
  ).trim() || DEFAULT_LANDING_PARTNER_ROUTE;

  console.log(
    `[dszny-金罗] 开始抓取: ranges=${ranges.map(r => `${r.startDate}~${r.endDate}`).join(', ')}, route=${landingPartnerRoute}`
  );

  const allRows: any[] = [];
  for (const range of ranges) {
    const rows = await fetchSearchRange({ range, config });
    allRows.push(...rows);
    await sleep(300);
  }

  // 按 waybillNo 去重（接口偶发分页重复，谨慎一点）
  const dedupedMap = new Map<string, any>();
  for (const row of allRows) {
    const key = String(row?.waybillNo || row?.id || '').trim();
    if (!key) continue;
    dedupedMap.set(key, {
      ...row,
      __landingPartnerName: landingPartnerRoute,
      __routeName: landingPartnerRoute,
    });
  }

  const deduped = Array.from(dedupedMap.values());
  console.log(
    `[dszny-金罗] 抓取完成: 原始=${allRows.length}, 去重=${deduped.length}`
  );
  if (deduped.length > 0) {
    const s = deduped[0];
    console.log(
      `[dszny-金罗] 首条样例: waybillNo=${s?.waybillNo}, freight=${s?.freight}, issuedAt=${s?.issuedAt}, orgUnitName=${s?.orgUnitName}, status=${s?.status}`
    );
  }
  return deduped;
}

async function keepAlive(config: CrawlerRuntimeConfig): Promise<KeepAliveResult> {
  try {
    const range = buildKeepAliveRange();
    const result = await fetchSearchPage({
      config,
      range,
      page: 1,
      pageSize: 1,
      tab: resolveTab(config),
    });
    return {
      success: true,
      message: `dszny 会话保活成功: ${range.startDate} total=${result.total}`,
    };
  } catch (e: any) {
    return { success: false, message: e.message || 'dszny 会话保活失败' };
  }
}

const dsznyJinluoTemplate: CrawlerTemplate = {
  id: 'dszny-jinluo',
  name: '大势能源 (dszny) - 金罗运单',
  description: 'https://www.dszny.com/waybills 接口直连，按月切片+分页拉取；车费取 freight',
  requiredFields: [
    {
      key: 'loginUrl',
      label: '系统地址',
      type: 'text',
      required: true,
      placeholder: 'https://www.dszny.com',
      defaultValue: DEFAULT_BASE_URL,
    },
    {
      key: 'tenantId',
      label: '租户 ID',
      type: 'text',
      required: true,
      placeholder: '例如 100021',
      defaultValue: String(DEFAULT_TENANT_ID),
    },
    {
      key: 'username',
      label: '用户名',
      type: 'text',
      required: true,
      placeholder: 'dszny.com 的登录账号，例如 admin',
    },
    {
      key: 'password',
      label: '密码',
      type: 'password',
      required: true,
      placeholder: 'dszny.com 的登录密码',
    },
    {
      key: 'bearerToken',
      label: 'Bearer Token (可选)',
      type: 'textarea',
      required: false,
      placeholder: '账号密码缺失时的兜底；正常情况留空，系统会自动登录拿 token 并续期',
    },
    {
      key: 'landingPartnerName',
      label: '落地合作方/线路名称',
      type: 'text',
      required: false,
      placeholder: '默认 金罗；用于匹配合同线路',
      defaultValue: DEFAULT_LANDING_PARTNER_ROUTE,
    },
    {
      key: 'startDate',
      label: '抓取开始日期',
      type: 'text',
      required: false,
      placeholder: '例如 2026-05-01；不填则按抓取天数倒推',
    },
    {
      key: 'endDate',
      label: '抓取结束日期',
      type: 'text',
      required: false,
      placeholder: '例如 2026-05-25；不填则默认今天',
    },
    {
      key: 'dateRangeDays',
      label: '默认抓取天数',
      type: 'number',
      required: false,
      placeholder: '默认 31；超过一个月会自动按月切片',
      defaultValue: DEFAULT_DATE_RANGE_DAYS,
    },
    {
      key: 'tab',
      label: '数据视角',
      type: 'select',
      required: false,
      defaultValue: DEFAULT_TAB,
      options: [
        { value: 'all', label: '全部运单' },
        { value: 'created', label: '开单记录' },
        { value: 'arrived', label: '到货记录' },
        { value: 'unpaid', label: '未支付运单' },
      ],
    },
    {
      key: 'pageSize',
      label: '单次分页大小',
      type: 'number',
      required: false,
      placeholder: '默认 500；接口允许较大值',
      defaultValue: DEFAULT_PAGE_SIZE,
    },
    {
      key: 'keepAliveIntervalMinutes',
      label: 'Token 保活间隔分钟',
      type: 'number',
      required: false,
      placeholder: '默认 15；用于在 Token 过期前刷一次会话',
      defaultValue: DEFAULT_KEEP_ALIVE_INTERVAL_MINUTES,
    },
  ],
  login,
  fetchData,
  keepAlive,
  mapFields,
};

registerCrawlerTemplate(dsznyJinluoTemplate);

export default dsznyJinluoTemplate;
