/**
 * 56qqt 陆行天下供应链 - 临沂网点历史发车列表爬虫模板
 *
 * 当前系统的历史发车查询接口超过一个月会报错，因此按自然月切片请求；
 * 接口本身返回 rows 数组，当前版本不做分页。
 */

import { Page } from 'puppeteer-core';
import {
  CrawlerRuntimeConfig,
  CrawlerTemplate,
  KeepAliveResult,
  WaybillData,
  registerCrawlerTemplate,
} from '../crawler-templates.js';

const DEFAULT_BASE_URL = 'https://56qqt.com';
const DEFAULT_OUTLET_NAME = '临沂';
const DEFAULT_LANDING_PARTNER_ROUTE = '临沂陆行天下物流有限公司';
const DEFAULT_DATE_RANGE_DAYS = 31;
const DEFAULT_KEEP_ALIVE_INTERVAL_MINUTES = 10;
const SEARCH_PATH = '/logistics/query/transfer.ashx?action=search';
const HISTORY_REFERER = `${DEFAULT_BASE_URL}/logistics/opt/waybill_send_history.aspx`;

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

function normalizeText(value: any): string {
  return String(value || '').replace(/\s+/g, '').trim();
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
  return {
    startDate: today,
    endDate: today,
  };
}

function resolveCookieHeader(config: CrawlerRuntimeConfig): string {
  return String(
    config.cookie ??
    config.cookies ??
    config.cookieHeader ??
    config.sessionCookie ??
    ''
  ).trim();
}

function parseCookieHeader(cookieHeader: string): Array<{ name: string; value: string }> {
  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const idx = part.indexOf('=');
      if (idx <= 0) return null;
      return {
        name: part.slice(0, idx).trim(),
        value: part.slice(idx + 1).trim(),
      };
    })
    .filter((item): item is { name: string; value: string } => !!item?.name);
}

function resolveTransferStatus(config: CrawlerRuntimeConfig): string {
  return String(config.transferStatus ?? '0').trim() || '0';
}

function buildSearchBody(range: DateRange, config: CrawlerRuntimeConfig): URLSearchParams {
  const body = new URLSearchParams();
  body.set('startdt', range.startDate);
  body.set('enddt', range.endDate);
  body.set('addrfrom', String(config.addrFrom ?? ''));
  body.set('fromnodeid', String(config.fromNodeId ?? ''));
  body.append('addrto[]', String(config.addrTo ?? ''));
  body.append('tonodeid[]', String(config.toNodeId ?? ''));
  body.set('keytype', String(config.keyType ?? '1'));
  body.set('keyword', String(config.keyword ?? ''));
  body.set('transferstatus', resolveTransferStatus(config));
  return body;
}

function parseSearchResponse(data: any): { success: boolean; total: number; rows: any[]; error?: string } {
  if (data?.sessionstate === 'timeout' || Number(data?.sessionstatecode) === 0) {
    return {
      success: false,
      total: 0,
      rows: [],
      error: '会话已过期，请更新 56qqt 登录 Cookie',
    };
  }

  if (Number(data?.statuscode) === 200 && Array.isArray(data?.rows)) {
    return {
      success: true,
      total: Number(data?.total || data.rows.length) || data.rows.length,
      rows: data.rows,
    };
  }

  return {
    success: false,
    total: 0,
    rows: [],
    error: String(data?.msg || data?.message || `statuscode=${data?.statuscode ?? 'N/A'}`),
  };
}

async function fetchSearchRange(params: {
  baseUrl: string;
  cookieHeader: string;
  range: DateRange;
  config: CrawlerRuntimeConfig;
}): Promise<any[]> {
  const url = new URL(SEARCH_PATH, params.baseUrl);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'accept': 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'cache-control': 'no-cache',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'cookie': params.cookieHeader,
      'origin': params.baseUrl,
      'pragma': 'no-cache',
      'referer': HISTORY_REFERER,
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: buildSearchBody(params.range, params.config).toString(),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${rawText.substring(0, 300)}`);
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (_e) {
    throw new Error(`响应不是合法 JSON: ${rawText.substring(0, 300)}`);
  }

  const parsed = parseSearchResponse(data);
  if (!parsed.success) {
    throw new Error(parsed.error || '查询失败');
  }

  console.log(
    `[56qqt-临沂] ${params.range.startDate}~${params.range.endDate}: rows=${parsed.rows.length}, total=${parsed.total}`
  );
  return parsed.rows;
}

function rowBelongsToOutlet(row: any, outletName: string): boolean {
  const outlet = normalizeText(outletName);
  if (!outlet) return true;
  const text = [
    row?.fromlocation,
    row?.fromnodename,
    row?.fromto,
  ].map(normalizeText).join('|');
  return text.includes(outlet);
}

function resolveStatus(row: any): { status: string; statusText: string } {
  const raw = String(row?.transferstatus ?? '').trim();
  const map: Record<string, { status: string; statusText: string }> = {
    '0': { status: 'pending', statusText: '全部/未指定' },
    '1': { status: 'pending', statusText: '未发车' },
    '2': { status: 'in_transit', statusText: '未到车' },
    '3': { status: 'delivered', statusText: '已到车' },
    '4': { status: 'completed', statusText: '已完成' },
  };
  return map[raw] || { status: 'pending', statusText: raw || '' };
}

function resolveBusinessTime(row: any): Date | undefined {
  const raw = String(row?.sendtime || row?.senddt || row?.loaddt || '').trim();
  if (!raw) return undefined;
  const date = new Date(raw.replace(/\//g, '-'));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function mapFields(rawData: any): WaybillData {
  const item = rawData.rawData || rawData;
  const waybillNumber = String(item?.sendno || item?.loadno || item?.transferid || '').trim();
  const vehicleFreight = parseNumber(item?.vehiclefreight);
  const status = resolveStatus(item);
  const businessTime = resolveBusinessTime(item);
  const sendDate = String(item?.senddt || item?.loaddt || '').trim().slice(0, 10);
  const fromLocation = String(item?.fromlocation || '').trim();
  const toLocation = String(item?.tolocation || '').trim();
  const landingPartnerRoute = String(
    item?.__routeName ??
    item?.__landingPartnerName ??
    DEFAULT_LANDING_PARTNER_ROUTE
  ).trim() || DEFAULT_LANDING_PARTNER_ROUTE;

  return {
    waybillNumber,
    externalId: String(item?.transferid || ''),
    driverName: String(item?.drivername || ''),
    vehiclePlate: String(item?.vehicleno || ''),
    departurePlace: fromLocation,
    arrivalPlace: toLocation,
    weight: parseNumber(item?.totalgoodsweight || item?.goodsweight),
    volume: parseNumber(item?.totalgoodsvolume || item?.goodsvolume),

    // 业务确认：“车费-合计”字段为 vehiclefreight，作为收益计算核心金额。
    freight: vehicleFreight,
    receivableTotal: vehicleFreight,
    receivableTransport: vehicleFreight,
    payableTotal: vehicleFreight,

    status: status.status,
    batchStatusText: status.statusText,
    remark: String(item?.sendremark || item?.feeremark || ''),
    createTime: businessTime,
    shipTime: businessTime,
    waybillDateYmd: sendDate || undefined,
    subFinancier: landingPartnerRoute,
    branch: landingPartnerRoute,
  };
}

async function login(page: Page, config: CrawlerRuntimeConfig): Promise<boolean> {
  const baseUrl = normalizeBaseUrl(config.loginUrl);
  const cookieHeader = resolveCookieHeader(config);
  if (!cookieHeader) {
    console.log('[56qqt-临沂] 缺少 Cookie，无法使用接口直连模式');
    return false;
  }

  const cookies = parseCookieHeader(cookieHeader).map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    url: baseUrl,
  }));
  if (cookies.length > 0) {
    await page.setCookie(...cookies);
  }

  try {
    await page.goto(`${baseUrl}/logistics/index.aspx`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1000);
    const bodyText = await page.evaluate(() => document.body?.textContent || '');
    if (bodyText.includes('会话已过期') || bodyText.includes('重新登录')) {
      console.log('[56qqt-临沂] Cookie 已过期或会话失效');
      return false;
    }
  } catch (e: any) {
    console.log(`[56qqt-临沂] 登录态页面校验失败，继续尝试接口请求: ${e.message}`);
  }

  try {
    const ranges = buildMonthlyDateRanges(config);
    const firstRange = ranges[0] || {
      startDate: formatDateYmd(new Date()),
      endDate: formatDateYmd(new Date()),
    };
    await fetchSearchRange({ baseUrl, cookieHeader, range: firstRange, config });
  } catch (e: any) {
    console.log(`[56qqt-临沂] Cookie 接口校验失败: ${e.message}`);
    return false;
  }

  return true;
}

async function fetchData(_page: Page, config: CrawlerRuntimeConfig, _maxPages: number): Promise<any[]> {
  const baseUrl = normalizeBaseUrl(config.loginUrl);
  const cookieHeader = resolveCookieHeader(config);
  const ranges = buildMonthlyDateRanges(config);
  const outletName = String(config.outletName ?? DEFAULT_OUTLET_NAME).trim();
  const landingPartnerRoute = String(
    config.routeName ??
    config.landingPartnerName ??
    config.branchName ??
    DEFAULT_LANDING_PARTNER_ROUTE
  ).trim() || DEFAULT_LANDING_PARTNER_ROUTE;
  const allRows: any[] = [];

  console.log(
    `[56qqt-临沂] 开始抓取历史发车列表: ranges=${ranges.map(r => `${r.startDate}~${r.endDate}`).join(', ')}, outlet=${outletName || '-'}, route=${landingPartnerRoute}`
  );

  for (const range of ranges) {
    const rows = await fetchSearchRange({ baseUrl, cookieHeader, range, config });
    allRows.push(...rows);
    await sleep(300);
  }

  let rejectedByOutlet = 0;
  const dedupedMap = new Map<string, any>();
  for (const row of allRows) {
    if (!rowBelongsToOutlet(row, outletName)) {
      rejectedByOutlet++;
      continue;
    }
    const key = String(row?.sendno || row?.loadno || row?.transferid || '').trim();
    if (!key) continue;
    dedupedMap.set(key, {
      ...row,
      __landingPartnerName: landingPartnerRoute,
      __routeName: landingPartnerRoute,
    });
  }

  const deduped = Array.from(dedupedMap.values());
  console.log(
    `[56qqt-临沂] 抓取完成: 原始=${allRows.length}, 去重=${deduped.length}, 非目标网点过滤=${rejectedByOutlet}`
  );
  if (deduped.length > 0) {
    const sample = deduped[0];
    console.log(
      `[56qqt-临沂] 首条样例: sendno=${sample?.sendno || '-'}, vehiclefreight=${sample?.vehiclefreight ?? '-'}, sendtime=${sample?.sendtime || '-'}, fromto=${sample?.fromto || '-'}`
    );
  }

  return deduped;
}

async function keepAlive(config: CrawlerRuntimeConfig): Promise<KeepAliveResult> {
  const baseUrl = normalizeBaseUrl(config.loginUrl);
  const cookieHeader = resolveCookieHeader(config);
  if (!cookieHeader) {
    return {
      success: false,
      message: '缺少 Cookie，无法执行 56qqt 会话保活',
    };
  }

  try {
    const range = buildKeepAliveRange();
    const rows = await fetchSearchRange({ baseUrl, cookieHeader, range, config });
    return {
      success: true,
      message: `56qqt 会话保活成功: ${range.startDate} rows=${rows.length}`,
    };
  } catch (e: any) {
    return {
      success: false,
      message: e.message || '56qqt 会话保活失败',
    };
  }
}

const qqtLinyiTemplate: CrawlerTemplate = {
  id: 'qqt-linyi',
  name: '陆行天下供应链-临沂网点',
  description: '56qqt.com 历史发车列表，按自然月切片直连查询；车费合计取 vehiclefreight',
  requiredFields: [
    {
      key: 'loginUrl',
      label: '系统地址',
      type: 'text',
      required: true,
      placeholder: 'https://56qqt.com',
      defaultValue: DEFAULT_BASE_URL,
    },
    {
      key: 'cookie',
      label: '登录 Cookie',
      type: 'textarea',
      required: true,
      placeholder: '复制历史发车列表请求中的完整 Cookie',
    },
    {
      key: 'outletName',
      label: '网点筛选关键词',
      type: 'text',
      required: false,
      placeholder: '默认 临沂',
      defaultValue: DEFAULT_OUTLET_NAME,
    },
    {
      key: 'landingPartnerName',
      label: '落地合作方/线路名称',
      type: 'text',
      required: false,
      placeholder: '默认 临沂陆行天下物流有限公司；用于匹配合同线路',
      defaultValue: DEFAULT_LANDING_PARTNER_ROUTE,
    },
    {
      key: 'startDate',
      label: '抓取开始日期',
      type: 'text',
      required: false,
      placeholder: '例如 2026-04-01；不填则按抓取天数倒推',
    },
    {
      key: 'endDate',
      label: '抓取结束日期',
      type: 'text',
      required: false,
      placeholder: '例如 2026-04-27；不填则默认今天',
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
      key: 'keepAliveIntervalMinutes',
      label: 'Cookie 保活间隔分钟',
      type: 'number',
      required: false,
      placeholder: '默认 10；仅用于保持 56qqt 会话活跃',
      defaultValue: DEFAULT_KEEP_ALIVE_INTERVAL_MINUTES,
    },
    {
      key: 'transferStatus',
      label: '发车状态',
      type: 'select',
      required: false,
      defaultValue: '0',
      options: [
        { value: '0', label: '全部' },
        { value: '1', label: '未发车' },
        { value: '2', label: '未到车' },
        { value: '3', label: '已到车' },
        { value: '4', label: '已完成' },
      ],
    },
  ],
  login,
  fetchData,
  keepAlive,
  mapFields,
};

registerCrawlerTemplate(qqtLinyiTemplate);

export default qqtLinyiTemplate;
