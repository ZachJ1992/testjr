/**
 * 摇钱树物流系统 爬虫模板
 * 
 * 适用于摇钱树物流系统（rm.zo-cloud.cn）
 * 登录后进入车辆配载页，通过业务筛选口径抓取目标数据
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
const DEFAULT_SHIP_TIME_START = '2026-02-28 00:00:00';
const DEFAULT_STATUS_TEXTS = ['已发车', '已到车', '部分卸车', '已卸车', '已完成'];
const DEFAULT_STATUS_CODE_TEXT_MAP: Record<string, string> = {
  '1': '已创建',
  '2': '预派车',
  '3': '已发车',
  '4': '已到车',
  '5': '部分卸车',
  '6': '已卸车',
  '7': '已完成',
  '10': '已发车',
  '15': '已发车',
  '20': '已到车',
  '25': '已到车',
  '30': '部分卸车',
  '35': '部分卸车',
  '40': '已卸车',
  '45': '已卸车',
  '50': '已完成',
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeBaseUrl(loginUrl: string): string {
  const raw = String(loginUrl || 'https://rm.zo-cloud.cn').trim();
  if (!raw) return 'https://rm.zo-cloud.cn';
  try {
    return new URL(raw).origin;
  } catch (e) {
    return raw.replace(/\/+$/, '');
  }
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
      // 忽略解析异常，回退空对象
    }
  }
  return {};
}

function parseCsv(value: any): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function toDateTimeString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function parseDateTimeInput(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace('T', ' ').replace(/\//g, '-');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return toDateTimeString(date);
}

function parseDateSafe(value: any): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().replace('T', ' ').replace(/\//g, '-');
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeText(value: string): string {
  return String(value || '').replace(/\s+/g, '').trim();
}

function buildOutletKeywords(value: string): string[] {
  const main = normalizeText(value);
  if (!main) return [];
  const variants = new Set<string>([main]);
  // 兼容末尾 A/B/C 等网点后缀差异
  const loose = main.replace(/[A-Za-z]$/, '').trim();
  if (loose && loose.length >= 6) variants.add(loose);
  return Array.from(variants);
}

function normalizeBatchNo(value: any): string {
  let text = String(value || '').trim();
  if (!text) return '';
  // 页面表格左侧序号可能拼在批次号前缀里（例如 1干线26/03月...）
  text = text.replace(/^\d+(?=干线)/, '');
  return text.trim();
}

function extractOutletName(raw: any): string {
  const candidates = [
    raw?.down_line_text,
    raw?.n_company_name,
    raw?.outlet_name,
    raw?.latest_outlet_name,
    raw?.latest_site_name,
    raw?.company_name,
    raw?.org_name,
  ];
  for (const item of candidates) {
    const text = String(item || '').trim();
    if (text) return text;
  }
  const rawText = String(raw?.raw_text || '').trim();
  if (rawText.includes(TARGET_ORG_NAME)) return TARGET_ORG_NAME;
  const fuzzy = rawText.match(/[\u4e00-\u9fa5A-Za-z0-9（）()\-]+(?:供应链|车队|物流)[\u4e00-\u9fa5A-Za-z0-9（）()\-]*/);
  if (fuzzy?.[0]) return fuzzy[0];
  return '';
}

function extractShipTime(raw: any): string {
  const dateRegex = /\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/;
  const candidates = [
    raw?.truck_t,
    raw?.head_truck_t,
    raw?.cur_truck_t,
    raw?.plan_truck_t,
    raw?.load_t,
    raw?.create_time,
  ];
  for (const item of candidates) {
    const text = String(item || '').trim();
    if (dateRegex.test(text)) return text.match(dateRegex)?.[0] || text;
  }
  const rawText = String(raw?.raw_text || '');
  const match = rawText.match(dateRegex);
  if (match?.[0]) return match[0];

  if (raw && typeof raw === 'object') {
    const entries = Object.entries(raw as Record<string, any>);
    const keyHintRegex = /(truck|time|date|load|plan|create|depart|arrive|发车|装车|计划|时间|到车)/i;

    for (const [key, value] of entries) {
      const text = String(value ?? '').trim();
      if (!text || !dateRegex.test(text)) continue;
      if (keyHintRegex.test(key)) {
        return text.match(dateRegex)?.[0] || text;
      }
    }

    for (const [, value] of entries) {
      const text = String(value ?? '').trim();
      if (!text || !dateRegex.test(text)) continue;
      return text.match(dateRegex)?.[0] || text;
    }
  }
  return '';
}

function resolveBatchStatusText(raw: any, codeTextMap: Record<string, string>): string {
  const textCandidates = [
    raw?.batch_st_text,
    raw?.batch_status_text,
    raw?.batch_st_name,
    raw?.batch_status_name,
    raw?.batch_status,
    raw?.batch_st_label,
  ];
  for (const item of textCandidates) {
    const text = String(item || '').trim();
    if (text) return text;
  }
  const code = String(raw?.batch_st ?? '').trim();
  if (code) return codeTextMap[code] || code;

  const rawText = String(raw?.raw_text || '');
  const candidates = ['已创建', '预派车', '已发车', '已到车', '部分卸车', '已卸车', '已完成', '已装车'];
  for (const key of candidates) {
    if (rawText.includes(key)) {
      return key === '已装车' ? '已发车' : key;
    }
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

function parseBatchListRequest(postData: string): Record<string, any> | null {
  const raw = String(postData || '').trim();
  if (!raw) return null;

  try {
    const json = JSON.parse(raw);
    if (json && typeof json === 'object') {
      return json as Record<string, any>;
    }
  } catch (_e) {
    // ignore
  }

  try {
    const params = new URLSearchParams(raw);
    const reqText = params.get('req') || '';
    if (!reqText) return null;
    const req = JSON.parse(reqText);
    if (req && typeof req === 'object') {
      return req as Record<string, any>;
    }
  } catch (_e) {
    // ignore
  }

  return null;
}

function buildCookieHeader(cookies: Array<{ name: string; value: string }>): {
  cookieMap: Map<string, string>;
  cookieHeader: string;
} {
  const cookieMap = new Map<string, string>();
  for (const cookie of cookies) {
    if (!cookie?.name || cookie.value === undefined || cookie.value === null) continue;
    cookieMap.set(cookie.name, cookie.value);
  }
  const cookieHeader = Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  return { cookieMap, cookieHeader };
}

function buildBusinessCriteria(config: CrawlerRuntimeConfig): {
  query: Record<string, any>;
  filter: Record<string, any>;
  local: {
    outletName: string;
    shipTimeStartText: string;
    shipTimeStart: Date;
    statusTexts: string[];
    statusCodes: string[];
    codeTextMap: Record<string, string>;
  };
} {
  const outletName = String(
    config.outletName ??
    config.targetOutletName ??
    config.targetOrgName ??
    TARGET_ORG_NAME
  ).trim();

  const shipTimeStartText =
    parseDateTimeInput(
      config.shipTimeStart ??
      config.departureStartTime ??
      config.filterStartTime ??
      config.startTime
    ) || DEFAULT_SHIP_TIME_START;

  const parsedShipTimeStart = parseDateSafe(shipTimeStartText) || new Date(DEFAULT_SHIP_TIME_START);
  const statusTextsRaw = parseCsv(
    config.batchStatuses ??
    config.batchStatusTexts ??
    config.statusTexts
  );
  const statusTexts = statusTextsRaw.length > 0 ? statusTextsRaw : DEFAULT_STATUS_TEXTS;
  const statusCodes = parseCsv(
    config.batchStatusCodes ??
    config.statusCodes
  );

  const customCodeTextMap = parseObjectLike(
    config.batchStatusCodeTextMap ??
    config.batchStatusMap
  );
  const codeTextMap = {
    ...DEFAULT_STATUS_CODE_TEXT_MAP,
    ...customCodeTextMap,
  };

  // 线上账号在 query 里直接带 down_line_text 时会触发 errno=21 权限错误，
  // 因此网点口径仅做本地兜底过滤，服务端 query 默认留空。
  const query: Record<string, any> = {};

  // 摇钱树接口的筛选字段权限波动较大，默认不在请求层强制加 filter，
  // 统一由本地过滤兜底，避免 errno=21 导致整批失败。
  const filter: Record<string, any> = {};

  const customQuery = parseObjectLike(config.reqQuery ?? config.batchListQuery);
  const customFilter = parseObjectLike(config.reqFilter ?? config.batchListFilter);

  return {
    query: { ...query, ...customQuery },
    filter: { ...filter, ...customFilter },
    local: {
      outletName,
      shipTimeStartText,
      shipTimeStart: parsedShipTimeStart,
      statusTexts,
      statusCodes,
      codeTextMap,
    },
  };
}

async function fetchBatchListPageByNode(params: {
  baseUrl: string;
  cookieHeader: string;
  logid: string;
  gid: string;
  page: number;
  pageSize: number;
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
    const requestBody: Record<string, any> = {
      page: params.page,
      page_size: params.pageSize,
      sort_field: 'create_time',
      sort_type: 'desc',
    };
    if (Object.keys(params.query).length > 0) {
      requestBody.query = params.query;
    }
    if (Object.keys(params.filter).length > 0) {
      requestBody.filter = params.filter;
    }

    const response = await fetch(apiUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': params.cookieHeader,
        'Accept': 'application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Origin': params.baseUrl,
        'Referer': `${params.baseUrl}/Operate/carStowage`,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(requestBody),
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
    } catch (e) {
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

async function fetchBatchListPageByBrowser(page: Page, params: {
  page: number;
  pageSize: number;
  query: Record<string, any>;
  filter: Record<string, any>;
}): Promise<{
  success: boolean;
  records: any[];
  total: number;
  error?: string;
  raw?: string;
}> {
  const result = await page.evaluate(async (payload: {
    page: number;
    pageSize: number;
    query: Record<string, any>;
    filter: Record<string, any>;
  }) => {
    try {
      const apiUrl = '/api/Table/Search/batchList';
      const requestBody: Record<string, any> = {
        page: payload.page,
        page_size: payload.pageSize,
        sort_field: 'create_time',
        sort_type: 'desc',
      };
      if (payload.query && Object.keys(payload.query).length > 0) {
        requestBody.query = payload.query;
      }
      if (payload.filter && Object.keys(payload.filter).length > 0) {
        requestBody.filter = payload.filter;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
        credentials: 'include',
      });

      if (!response.ok) {
        return { success: false, records: [], total: 0, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
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
      return {
        success: false,
        records: [],
        total: 0,
        error: `errno=${data?.errno ?? 'N/A'}, errmsg=${data?.errmsg ?? 'unknown'}`,
        raw: JSON.stringify(data).substring(0, 600),
      };
    } catch (e: any) {
      return { success: false, records: [], total: 0, error: e?.message || '请求异常' };
    }
  }, params);

  return result;
}

async function fetchBatchByBatchNoUsingCapturedReq(
  page: Page,
  batchNo: string,
  capturedReq: Record<string, any> | null,
  capturedUrl: string
): Promise<{ success: boolean; record?: any; keyUsed?: string; error?: string }> {
  const target = normalizeBatchNo(batchNo);
  if (!target || !capturedReq || !capturedUrl) {
    return { success: false, error: 'missing-context' };
  }

  const result = await page.evaluate(async (payload: {
    target: string;
    capturedReq: Record<string, any>;
    capturedUrl: string;
  }) => {
    const normalize = (value: any): string => String(value || '').trim().replace(/^\d+(?=干线)/, '').trim();
    const keys = ['car_batch', 'batch_num', 'batch_no', 'b_tr_car_batch', 'b_tr_up_car_batch', 'b_trans_batch'];
    const pickRecords = (data: any): any[] => {
      if (data?.errno === 0 && Array.isArray(data?.res?.data)) return data.res.data;
      if (Array.isArray(data?.data?.datas)) return data.data.datas;
      if (Array.isArray(data?.datas)) return data.datas;
      return [];
    };

    for (const key of keys) {
      try {
        const req = JSON.parse(JSON.stringify(payload.capturedReq || {}));
        req.page_num = 1;
        req.page_size = 20;
        req.query = { [key]: payload.target };

        const body = new URLSearchParams({ req: JSON.stringify(req) }).toString();
        const response = await fetch(payload.capturedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': 'application/json',
          },
          body,
          credentials: 'include',
        });
        const data = await response.json().catch(() => null);
        if (!data) continue;
        const records = pickRecords(data);
        if (!Array.isArray(records) || records.length === 0) continue;

        const matchedCandidates = records.filter((item: any) => {
          const batch = normalize(
            item?.car_batch ||
            item?.batch_num ||
            item?.batch_no ||
            item?.b_tr_car_batch ||
            item?.b_tr_up_car_batch ||
            item?.b_trans_batch
          );
          return batch === payload.target;
        });

        const hasDate = (v: any) => /\d{4}-\d{2}-\d{2}/.test(String(v || '').trim());
        matchedCandidates.sort((a: any, b: any) => {
          const aDate = String(a?.head_truck_t || a?.truck_t || a?.plan_truck_t || '');
          const bDate = String(b?.head_truck_t || b?.truck_t || b?.plan_truck_t || '');
          const aScore = (hasDate(a?.head_truck_t) || hasDate(a?.truck_t) || hasDate(a?.plan_truck_t) ? 100 : 0)
            + (String(a?.batch_st || '').trim() ? 10 : 0);
          const bScore = (hasDate(b?.head_truck_t) || hasDate(b?.truck_t) || hasDate(b?.plan_truck_t) ? 100 : 0)
            + (String(b?.batch_st || '').trim() ? 10 : 0);
          if (bScore !== aScore) return bScore - aScore;
          return bDate.localeCompare(aDate);
        });
        const matched = matchedCandidates[0];

        if (matched) {
          return { success: true, keyUsed: key, record: matched };
        }
      } catch (_e) {
        // ignore and try next key
      }
    }

    return { success: false, error: 'not-found' };
  }, { target, capturedReq, capturedUrl });

  return result;
}

async function waitForCarStowageReady(page: Page, timeoutMs: number = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(() => {
      const text = String(document.body?.textContent || '').replace(/\s+/g, '');
      const hasKeyword = text.includes('发车批次') || text.includes('车辆配载') || text.includes('网点');
      const inputs = document.querySelectorAll('input').length;
      const hasQuery = Array.from(document.querySelectorAll('button,a,span,div,input[type="button"],input[type="submit"]'))
        .some(el => String((el as HTMLInputElement).value || el.textContent || '').replace(/\s+/g, '').includes('查询'));
      return hasKeyword && inputs >= 3 && hasQuery;
    });
    if (ready) return true;
    await sleep(800);
  }
  return false;
}

async function clickTopQueryButton(page: Page): Promise<any> {
  const clickResult = await page.evaluate(() => {
    const normalize = (s: string) => String(s || '').replace(/\s+/g, '').trim();
    const visible = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 12) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
    };

    const candidates = Array.from(document.querySelectorAll('button,a,span,div,input[type="button"],input[type="submit"]'))
      .filter((el): el is HTMLElement => el instanceof HTMLElement && visible(el))
      .map(el => {
        const text = normalize((el as HTMLInputElement).value || el.textContent || '');
        const rect = el.getBoundingClientRect();
        return { el, text, rect };
      })
      .filter(x => x.text.includes('查询'));

    if (candidates.length === 0) return { ok: false, reason: 'no-query-button' };

    candidates.sort((a, b) => {
      const scoreA = (a.rect.top < 320 ? 100 : 0) + (a.rect.width < 160 ? 20 : 0);
      const scoreB = (b.rect.top < 320 ? 100 : 0) + (b.rect.width < 160 ? 20 : 0);
      return scoreB - scoreA;
    });

    const best = candidates[0];
    best.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    best.el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    best.el.click();
    return { ok: true, text: best.text, top: Math.round(best.rect.top), left: Math.round(best.rect.left) };
  });
  return clickResult;
}

async function applyOutletFilterOnPage(page: Page, outletName: string): Promise<boolean> {
  const target = String(outletName || '').trim();
  if (!target) return false;

  const setResult = await page.evaluate((targetName: string) => {
    const normalize = (s: string) => String(s || '').replace(/\s+/g, '').trim();
    const targetNorm = normalize(targetName);
    const visible = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 30 || rect.height < 12) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
    };
    const setInput = (input: HTMLInputElement) => {
      input.focus();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = targetName;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    };
    const packInputMeta = (input: HTMLInputElement) => {
      const r = input.getBoundingClientRect();
      return {
        value: input.value,
        placeholder: input.placeholder || '',
        name: input.name || '',
        id: input.id || '',
        cls: input.className || '',
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
      };
    };

    const inputs = Array.from(document.querySelectorAll('input'))
      .filter((x): x is HTMLInputElement => x instanceof HTMLInputElement && visible(x));

    // 1) 已经填过目标网点
    for (const input of inputs) {
      const valueNorm = normalize(input.value || '');
      if (valueNorm && (valueNorm.includes(targetNorm) || targetNorm.includes(valueNorm))) {
        return { ok: true, method: 'already-set', ...packInputMeta(input) };
      }
    }

    // 2) 优先匹配“网点”语义输入框
    const semantic = inputs.find(input => {
      const meta = `${input.placeholder || ''} ${input.name || ''} ${input.id || ''} ${input.className || ''}`;
      return /网点|outlet|site|company|down_line/i.test(meta) && input.getBoundingClientRect().top < 320;
    });
    if (semantic) {
      setInput(semantic);
      return { ok: true, method: 'semantic', ...packInputMeta(semantic) };
    }

    // 3) 按“网点”表头几何位置找过滤输入
    const headers = Array.from(document.querySelectorAll('th,td,div,span'))
      .filter((el): el is HTMLElement => el instanceof HTMLElement && visible(el))
      .filter(el => normalize(el.textContent || '') === '网点');
    let outletHeader: HTMLElement | null = null;
    for (const h of headers) {
      const rect = h.getBoundingClientRect();
      if (rect.top < 260 && rect.left > 120) {
        outletHeader = h;
        break;
      }
    }
    if (outletHeader) {
      const hr = outletHeader.getBoundingClientRect();
      const nearInputs = inputs.filter(input => {
        const r = input.getBoundingClientRect();
        const yClose = r.top >= hr.top - 8 && r.top <= hr.bottom + 120;
        const xOverlap = r.right >= hr.left - 20 && r.left <= hr.right + 20;
        return yClose && xOverlap;
      });
      if (nearInputs.length > 0) {
        setInput(nearInputs[0]);
        return { ok: true, method: 'header-nearby', ...packInputMeta(nearInputs[0]) };
      }
    }

    // 4) 兜底：顶部区域最长输入框
    const fallback = inputs
      .filter(input => input.getBoundingClientRect().top < 320)
      .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    if (fallback) {
      setInput(fallback);
      return { ok: true, method: 'top-fallback', ...packInputMeta(fallback) };
    }

    return { ok: false, reason: 'no-input' };
  }, target);

  if (!setResult?.ok) {
    console.log(`[摇钱树] 网点筛选输入失败: ${JSON.stringify(setResult)}`);
    return false;
  }

  const clickResult = await clickTopQueryButton(page);

  console.log(`[摇钱树] 网点筛选输入完成: ${JSON.stringify(setResult)}, 查询按钮: ${JSON.stringify(clickResult)}`);
  await sleep(3500);
  return true;
}

async function applyShipTimeAndStatusFilterOnPage(
  page: Page,
  shipTimeStartText: string,
  statusTexts: string[]
): Promise<{ shipTimeApplied: boolean; statusApplied: boolean; queryClicked: boolean }> {
  const shipStart = String(shipTimeStartText || '').trim();
  const targets = statusTexts.map(s => String(s || '').trim()).filter(Boolean);

  const shipResult = shipStart
    ? await page.evaluate((startText: string) => {
        const normalize = (s: string) => String(s || '').replace(/\s+/g, '').trim();
        const visible = (el: HTMLElement | null): boolean => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width < 30 || rect.height < 12) return false;
          if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
        };
        const labels = Array.from(document.querySelectorAll('div,span,th,td,label'))
          .filter((el): el is HTMLElement => el instanceof HTMLElement && visible(el))
          .filter(el => normalize(el.textContent || '') === '发车时间');
        const inputs = Array.from(document.querySelectorAll('input'))
          .filter((x): x is HTMLInputElement => x instanceof HTMLInputElement && visible(x));

        for (const label of labels) {
          const lr = label.getBoundingClientRect();
          const candidates = inputs.filter(input => {
            const r = input.getBoundingClientRect();
            const yClose = Math.abs(r.top - lr.top) < 26 || (r.top >= lr.top - 6 && r.top <= lr.bottom + 28);
            const rightSide = r.left >= lr.right - 12;
            const near = r.left - lr.right < 380;
            return yClose && rightSide && near;
          });
          if (candidates.length > 0) {
            const input = candidates[0];
            input.focus();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.value = startText;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            const r = input.getBoundingClientRect();
            return {
              ok: true,
              method: 'label-nearby',
              value: input.value,
              top: Math.round(r.top),
              left: Math.round(r.left),
              cls: input.className || '',
            };
          }
        }
        return { ok: false, reason: 'shiptime-input-not-found' };
      }, shipStart)
    : { ok: false, reason: 'shiptime-empty' };

  const openStatus = await page.evaluate(() => {
    const normalize = (s: string) => String(s || '').replace(/\s+/g, '').trim();
    const visible = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 18 || rect.height < 10) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
    };
    const nodes = Array.from(document.querySelectorAll('th,td,div,span,a,button'))
      .filter((el): el is HTMLElement => el instanceof HTMLElement && visible(el))
      .map(el => ({ el, text: normalize(el.textContent || ''), rect: el.getBoundingClientRect() }))
      .filter(x => x.text.includes('批次状态') && x.rect.top < 320);
    if (nodes.length === 0) return { ok: false, reason: 'no-status-header' };
    nodes.sort((a, b) => a.rect.top - b.rect.top);
    const best = nodes[0];
    best.el.click();
    return { ok: true, top: Math.round(best.rect.top), left: Math.round(best.rect.left) };
  });
  await sleep(500);

  const statusResult = targets.length > 0
    ? await page.evaluate((targetStatuses: string[]) => {
        const normalize = (s: string) => String(s || '').replace(/\s+/g, '').trim();
        const visible = (el: HTMLElement | null): boolean => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width < 18 || rect.height < 10) return false;
          if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
        };

        const nodes = Array.from(document.querySelectorAll('div,li,span,label,a,button'))
          .filter((el): el is HTMLElement => el instanceof HTMLElement && visible(el))
          .map(el => ({ el, text: normalize(el.textContent || ''), rect: el.getBoundingClientRect() }));

        const clickText = (txt: string): boolean => {
          const matched = nodes.find(n => n.text === normalize(txt));
          if (!matched) return false;
          matched.el.click();
          return true;
        };

        const cleared = clickText('全部');
        const selected: string[] = [];
        for (const s of targetStatuses) {
          if (clickText(s)) selected.push(s);
        }
        const confirmed = clickText('确定');
        return { ok: selected.length > 0, selected, cleared, confirmed };
      }, targets)
    : { ok: false, reason: 'status-empty' };

  const queryResult = await clickTopQueryButton(page);
  console.log(
    `[摇钱树] 时间/状态筛选: ship=${JSON.stringify(shipResult)}, openStatus=${JSON.stringify(openStatus)}, status=${JSON.stringify(statusResult)}, query=${JSON.stringify(queryResult)}`
  );
  await sleep(3500);

  return {
    shipTimeApplied: !!shipResult?.ok,
    statusApplied: !!statusResult?.ok,
    queryClicked: !!queryResult?.ok,
  };
}

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
    console.log('[摇钱树] 按新策略跳过组织跳转，直接在配载页按业务字段筛选');
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
    const enableOrgSwitch = config.enableOrgSwitch === true || String(config.enableOrgSwitch || '').toLowerCase() === 'true';
    if (enableOrgSwitch) {
      console.log('[摇钱树] 检测到 enableOrgSwitch=true，执行组织切换...');
      const switchResult = await switchOrganization(page);
      if (!switchResult) {
        console.log('[摇钱树] 组织切换失败');
        return false;
      }
    } else {
      console.log('[摇钱树] 登录成功，按新策略跳过组织切换');
    }
  }
  
  return loginSuccess;
}

// ==================== DOM 抓取备用方法 ====================
async function extractDataFromDOM(page: Page): Promise<any[]> {
  console.log('[摇钱树] 开始 DOM 抓取...');
  
  const data = await page.evaluate(() => {
    const rows: any[] = [];
    const normalizeBatchNoLocal = (value: any): string => {
      let text = String(value || '').trim();
      if (!text) return '';
      text = text.replace(/^\d+(?=干线)/, '');
      return text.trim();
    };

    const primaryWrappers = Array.from(document.querySelectorAll('.el-table__body-wrapper'))
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .filter(el => !el.closest('.el-table__fixed') && !el.closest('.el-table__fixed-right'));

    let tableRows: NodeListOf<Element>;
    if (primaryWrappers.length > 0) {
      tableRows = primaryWrappers[0].querySelectorAll('table tbody tr');
    } else {
      tableRows = document.querySelectorAll('table tbody tr, .el-table__body tbody tr, [class*="table"] [class*="row"]');
    }
    
    tableRows.forEach((row, index) => {
      let cells = row.querySelectorAll('td');
      if (cells.length < 6) {
        cells = row.querySelectorAll('td, [class*="cell"]');
        if (cells.length < 6) return;
      }

      const cellTexts = Array.from(cells)
        .map(cell => (cell.textContent || '').trim())
        .filter(Boolean);
      if (cellTexts.length === 0) return;

      const wholeText = cellTexts.join('|');
      // 排除筛选行/表头行
      if (/筛\s*选/.test(wholeText) || /发车批次.*车辆线路/.test(wholeText)) return;

      const rowAny = row as any;
      const vueRowFromRow = rowAny?.__vue__?.row || rowAny?.__vue__?.$props?.row;
      const vueRowFromCell = Array.from(cells)
        .map(cell => {
          const cellAny = cell as any;
          return cellAny?.__vue__?.row || cellAny?.__vue__?.$props?.row || cellAny?.__vue__?.$parent?.row || null;
        })
        .find(Boolean);
      const vueRow = (vueRowFromRow || vueRowFromCell || null) as any;

      const batchNoByText = cellTexts.find(t =>
        t.length >= 6 &&
        /\d/.test(t) &&
        !t.includes('筛选') &&
        !t.includes('发车批次') &&
        !t.includes('车辆线路')
      ) || '';
      const batchNoByVue = String(
        vueRow?.car_batch ||
        vueRow?.batch_num ||
        vueRow?.batch_no ||
        vueRow?.batchNo ||
        ''
      ).trim();
      const batchNo = normalizeBatchNoLocal(batchNoByVue || batchNoByText);
      if (!batchNo) return;

      const routeTextByText = cellTexts.find(t => t.includes('->')) || '';
      const statusTextRawByText = cellTexts.find(t =>
        ['已创建', '预派车', '已发车', '已到车', '部分卸车', '已卸车', '已完成', '已到达', '已装车'].some(k => t.includes(k))
      ) || '';
      const statusTextByText = statusTextRawByText.includes('已装车') ? '已发车' : statusTextRawByText;
      const outletTextByText = cellTexts.find(t =>
        t.includes('供应链') || t.includes('车队') || t.includes('网点')
      ) || '';
      const dateRegex = /\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/;
      const dateTimeByText = (
        cellTexts.find(t => dateRegex.test(t))?.match(dateRegex)?.[0] ||
        wholeText.match(dateRegex)?.[0] ||
        ''
      );

      const statusCodeByVue = String(vueRow?.batch_st ?? '').trim();
      const statusTextRawByVue = String(
        vueRow?.batch_st_text ||
        vueRow?.batch_status_text ||
        vueRow?.batch_st_name ||
        vueRow?.batch_status_name ||
        ''
      ).trim();
      const statusTextByVue = statusTextRawByVue.includes('已装车') ? '已发车' : statusTextRawByVue;
      const outletTextByVue = String(
        vueRow?.down_line_text ||
        vueRow?.n_company_name ||
        vueRow?.company_name ||
        ''
      ).trim();
      const routeTextByVue = String(vueRow?.route_text || '').trim();
      const dateTimeByVue = String(
        vueRow?.truck_t ||
        vueRow?.plan_truck_t ||
        vueRow?.head_truck_t ||
        vueRow?.cur_truck_t ||
        vueRow?.create_time ||
        ''
      ).trim();
      const rowEl = row as HTMLElement;
      const rowClass = String(rowEl.className || '');
      const hasCheckedInput = !!rowEl.querySelector('input[type="checkbox"]:checked');
      const hasCheckedClass = !!rowEl.querySelector('.is-checked, .checked, .ant-checkbox-checked, [class*="checkbox-checked"]');
      const rowSelected = hasCheckedInput || hasCheckedClass || /selected|current-row|active/.test(rowClass);

      const rowData: any = {
        _index: index,
        car_batch: batchNo,
        route_text: routeTextByVue || routeTextByText,
        batch_st: statusCodeByVue || statusTextByVue || statusTextByText,
        batch_st_text: statusTextByVue || statusTextByText,
        down_line_text: outletTextByVue || outletTextByText,
        create_time: dateTimeByVue || dateTimeByText,
        truck_t: String(vueRow?.truck_t || '').trim(),
        plan_truck_t: String(vueRow?.plan_truck_t || '').trim(),
        head_truck_t: String(vueRow?.head_truck_t || '').trim(),
        cur_truck_t: String(vueRow?.cur_truck_t || '').trim(),
        b_tr_num: '',
        b_dr_name: '',
        raw_text: wholeText,
        row_selected: rowSelected,
      };
      rows.push(rowData);
    });
    
    return rows;
  });
  
  console.log(`[摇钱树] DOM 抓取完成，找到 ${data.length} 条数据`);
  if (data.length > 0) {
    console.log(`[摇钱树] DOM 首条样例: ${JSON.stringify(data[0]).substring(0, 400)}`);
  }
  return data;
}

async function getDomSelectionStats(page: Page): Promise<{ totalRows: number; selectedRows: number }> {
  return await page.evaluate(() => {
    const primaryWrappers = Array.from(document.querySelectorAll('.el-table__body-wrapper'))
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .filter(el => !el.closest('.el-table__fixed') && !el.closest('.el-table__fixed-right'));

    let rowNodes: NodeListOf<Element>;
    if (primaryWrappers.length > 0) {
      rowNodes = primaryWrappers[0].querySelectorAll('table tbody tr');
    } else {
      rowNodes = document.querySelectorAll('table tbody tr, .el-table__body tbody tr, [class*="table"] [class*="row"]');
    }
    const rows = Array.from(rowNodes).filter((row): row is HTMLElement => row instanceof HTMLElement);

    let selectedRows = 0;
    for (const row of rows) {
      const cells = row.querySelectorAll('td, [class*="cell"]');
      if (cells.length < 6) continue;
      const text = (row.textContent || '').replace(/\s+/g, ' ');
      if (!text || /发车批次.*车辆线路/.test(text)) continue;
      const hasCheckedInput = !!row.querySelector('input[type="checkbox"]:checked');
      const hasCheckedClass = !!row.querySelector('.is-checked, .checked, .ant-checkbox-checked, [class*="checkbox-checked"]');
      const rowClass = String(row.className || '');
      if (hasCheckedInput || hasCheckedClass || /selected|current-row|active/.test(rowClass)) {
        selectedRows++;
      }
    }

    return { totalRows: rows.length, selectedRows };
  });
}

async function verifyOutletRowsOnPage(page: Page, outletKeyword: string): Promise<{ totalRows: number; matchedRows: number }> {
  const key = String(outletKeyword || '').trim();
  if (!key) return { totalRows: 0, matchedRows: 0 };
  return await page.evaluate((keyword: string) => {
    const normalize = (s: string) => String(s || '').replace(/\s+/g, '').trim();
    const target = normalize(keyword);
    const wrappers = Array.from(document.querySelectorAll('.el-table__body-wrapper'))
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .filter(el => !el.closest('.el-table__fixed') && !el.closest('.el-table__fixed-right'));
    let rowNodes: NodeListOf<Element>;
    if (wrappers.length > 0) {
      rowNodes = wrappers[0].querySelectorAll('table tbody tr');
    } else {
      rowNodes = document.querySelectorAll('table tbody tr');
    }
    let totalRows = 0;
    let matchedRows = 0;
    for (const row of Array.from(rowNodes).slice(0, 120)) {
      const text = normalize((row.textContent || '').replace(/\|/g, ' '));
      if (!text) continue;
      totalRows++;
      if (text.includes(target)) matchedRows++;
    }
    return { totalRows, matchedRows };
  }, key);
}

async function setTableHorizontalScroll(page: Page, left: number): Promise<boolean> {
  return await page.evaluate((targetLeft: number) => {
    const allCandidates = Array.from(
      document.querySelectorAll(
        '.el-table__body-wrapper, .el-scrollbar__wrap, [class*="table__body-wrapper"], [class*="body-wrapper"], [class*="table-body"]'
      )
    ).filter((el): el is HTMLElement => el instanceof HTMLElement);
    const candidates = allCandidates.filter(el => !el.closest('.el-table__fixed') && !el.closest('.el-table__fixed-right'));

    let changed = false;
    for (const el of candidates) {
      if (el.scrollWidth - el.clientWidth < 80) continue;
      if (el.clientHeight < 120) continue;
      const nextLeft = Math.max(0, Math.min(targetLeft, el.scrollWidth - el.clientWidth));
      if (Math.abs(el.scrollLeft - nextLeft) < 2) continue;
      el.scrollLeft = nextLeft;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
      changed = true;
    }
    return changed;
  }, left);
}

function mergeDomRows(rowsList: any[][]): any[] {
  const merged = new Map<string, any>();
  for (const rows of rowsList) {
    for (const row of rows) {
      const key = normalizeBatchNo(row?.car_batch);
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...row, car_batch: key });
        continue;
      }
      if (!existing.route_text && row.route_text) existing.route_text = row.route_text;
      if (!existing.batch_st && row.batch_st) existing.batch_st = row.batch_st;
      if (!existing.down_line_text && row.down_line_text) existing.down_line_text = row.down_line_text;
      if (!existing.create_time && row.create_time) existing.create_time = row.create_time;
      existing.row_selected = !!existing.row_selected || !!row.row_selected;
      const rawText = [existing.raw_text, row.raw_text].filter(Boolean).join('|');
      existing.raw_text = rawText.slice(0, 4000);
      merged.set(key, existing);
    }
  }
  return Array.from(merged.values());
}

function enrichDomRowsWithApiRows(domRows: any[], apiRows: any[]): any[] {
  if (domRows.length === 0 || apiRows.length === 0) return domRows;
  const apiByBatch = new Map<string, any>();
  const isEmpty = (v: any): boolean => v === undefined || v === null || String(v).trim() === '';
  for (const item of apiRows) {
    const key = normalizeBatchNo(
      item?.car_batch ||
      item?.b_tr_car_batch ||
      item?.b_tr_up_car_batch ||
      item?.batch_num ||
      item?.batch_no ||
      item?.b_trans_batch
    );
    if (!key) continue;
    const existing = apiByBatch.get(key);
    if (!existing) {
      apiByBatch.set(key, item);
      continue;
    }
    const mergedApi: any = { ...existing };
    for (const [k, v] of Object.entries(item || {})) {
      if (isEmpty(mergedApi[k]) && !isEmpty(v)) {
        mergedApi[k] = v;
      }
    }
    // 时间字段优先用非空值
    if (isEmpty(mergedApi.truck_t) && !isEmpty(item?.truck_t)) mergedApi.truck_t = item.truck_t;
    if (isEmpty(mergedApi.head_truck_t) && !isEmpty(item?.head_truck_t)) mergedApi.head_truck_t = item.head_truck_t;
    if (isEmpty(mergedApi.plan_truck_t) && !isEmpty(item?.plan_truck_t)) mergedApi.plan_truck_t = item.plan_truck_t;
    apiByBatch.set(key, mergedApi);
  }

  return domRows.map(domItem => {
    const key = normalizeBatchNo(domItem?.car_batch || domItem?.id);
    const apiItem = apiByBatch.get(key);
    if (!apiItem) return domItem;
    const merged: any = { ...domItem, car_batch: key, __api_matched: true };
    for (const [k, v] of Object.entries(apiItem)) {
      if (merged[k] === undefined || merged[k] === null || merged[k] === '') {
        merged[k] = v;
      }
    }
    return merged;
  });
}

async function extractDataFromDOMWithHorizontalScan(page: Page): Promise<any[]> {
  const snapshots: any[][] = [];
  const scanPositions = [0, 560, 1120];
  for (const left of scanPositions) {
    await setTableHorizontalScroll(page, left);
    await sleep(500);
    snapshots.push(await extractDataFromDOM(page));
  }
  await setTableHorizontalScroll(page, 0);
  const merged = mergeDomRows(snapshots);
  console.log(`[摇钱树] DOM 多视角合并: snapshot=${snapshots.map(x => x.length).join('/')}, merged=${merged.length}`);
  return merged;
}

// ==================== 数据获取逻辑 ====================
async function fetchData(page: Page, config: CrawlerRuntimeConfig, maxPages: number): Promise<any[]> {
  console.log('[摇钱树] 开始获取数据...');

  interceptedApiData = [];
  tmsTotalRecords = 0;

  const baseUrl = normalizeBaseUrl(config.loginUrl || 'https://rm.zo-cloud.cn');
  const carStowageUrl = `${baseUrl}/Operate/carStowage`;
  const criteria = buildBusinessCriteria(config);
  const maxFetchPages = Math.max(1, Number(maxPages || 1));
  const pageSizeRaw = Number(config.pageSize ?? 100);
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
    ? Math.min(Math.floor(pageSizeRaw), 500)
    : 100;

  console.log(
    `[摇钱树] 业务筛选口径: outlet=${criteria.local.outletName || '-'}, shipTimeStart=${criteria.local.shipTimeStartText}, statusTexts=${criteria.local.statusTexts.join('|') || '-'}, statusCodes=${criteria.local.statusCodes.join(',') || '-'}`
  );

  const uiCapturedData: any[] = [];
  const initialApiData: any[] = [];
  let capturedRequestCount = 0;
  let lastCapturedBatchReq: Record<string, any> | null = null;
  let lastCapturedBatchUrl = '';
  const uiRequestHandler = (request: any) => {
    try {
      const url = String(request?.url?.() || '');
      if (!url.includes('batchList')) return;
      const method = String(request?.method?.() || 'GET').toUpperCase();
      if (method !== 'POST') return;
      capturedRequestCount++;
      const req = parseBatchListRequest(String(request?.postData?.() || ''));
      if (!req) {
        console.log(`[摇钱树] batchList 请求#${capturedRequestCount}: 无法解析请求体`);
        return;
      }
      lastCapturedBatchReq = req;
      lastCapturedBatchUrl = url;
      const query = req.query && typeof req.query === 'object' ? req.query : {};
      const filter = req.filter && typeof req.filter === 'object' ? req.filter : {};
      const queryKeys = Object.keys(query);
      const filterKeys = Object.keys(filter);
      console.log(
        `[摇钱树] batchList 请求#${capturedRequestCount}: page=${req.page_num || '-'}, queryKeys=${queryKeys.join(',') || '-'}, filterKeys=${filterKeys.join(',') || '-'}, filter=${JSON.stringify(filter).substring(0, 220)}`
      );
    } catch (_e) {
      // 忽略请求解析异常
    }
  };
  const uiResponseHandler = async (response: any) => {
    try {
      const url = String(response?.url?.() || '');
      if (!url.includes('batchList')) return;
      const text = await response.text();
      const data = JSON.parse(text);
      const parsed = parseBatchListResponse(data);
      if (parsed.success && parsed.records.length > 0) {
        uiCapturedData.push(...parsed.records);
        const sampleOutlet = String(
          parsed.records[0]?.down_line_text ||
          parsed.records[0]?.n_company_name ||
          parsed.records[0]?.company_name ||
          ''
        ).trim();
        console.log(`[摇钱树] 捕获页面 batchList 响应: ${parsed.records.length} 条, sampleOutlet=${sampleOutlet || '-'}`);
      }
    } catch (_e) {
      // 忽略页面响应解析异常
    }
  };
  page.on('request', uiRequestHandler);
  page.on('response', uiResponseHandler);

  console.log(`[摇钱树] 访问车辆配载页面: ${carStowageUrl}`);
  try {
    await page.goto(carStowageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e: any) {
    console.log(`[摇钱树] 访问配载页面超时，继续处理: ${e.message}`);
  }
  const pageReady = await waitForCarStowageReady(page, 18000);
  console.log(`[摇钱树] 车辆配载页就绪状态: ${pageReady ? 'ready' : 'not-ready'}`);
  if (!pageReady) {
    await sleep(2500);
  }

  try {
    await page.screenshot({ path: '/tmp/yaoqianshu_car_stowage.png', fullPage: true });
  } catch (_e) {
    // 忽略截图异常
  }

  if (uiCapturedData.length > 0) {
    initialApiData.push(...uiCapturedData);
    const first = initialApiData[0] || {};
    console.log(`[摇钱树] 初始页面API数据: ${initialApiData.length} 条`);
    console.log(`[摇钱树] 初始API首条键: ${Object.keys(first).slice(0, 80).join(',')}`);
  }

  // 清空页面初始加载阶段捕获的数据，只保留“网点筛选 + 查询”之后的响应
  uiCapturedData.length = 0;
  const outletFilterAppliedRaw = await applyOutletFilterOnPage(page, criteria.local.outletName);
  const outletVerify = await verifyOutletRowsOnPage(page, criteria.local.outletName);
  const outletFilterApplied = outletFilterAppliedRaw && outletVerify.matchedRows > 0;
  console.log(
    `[摇钱树] 网点UI筛选执行结果: raw=${outletFilterAppliedRaw ? 'success' : 'failed'}, verify=${outletVerify.matchedRows}/${outletVerify.totalRows}, final=${outletFilterApplied ? 'success' : 'failed'}`
  );
  // 继续按“发车时间 + 批次状态”筛选，并再次触发查询，确保捕获到最终筛选结果
  uiCapturedData.length = 0;
  const extraFilterResult = await applyShipTimeAndStatusFilterOnPage(
    page,
    criteria.local.shipTimeStartText,
    criteria.local.statusTexts
  );
  const shipTimeFilterApplied = extraFilterResult.shipTimeApplied;
  const statusFilterApplied = extraFilterResult.statusApplied;
  console.log(
    `[摇钱树] 时间/状态UI筛选执行结果: shipTime=${shipTimeFilterApplied ? 'success' : 'failed'}, status=${statusFilterApplied ? 'success' : 'failed'}, query=${extraFilterResult.queryClicked ? 'clicked' : 'no-click'}`
  );
  const domSelectionStats = await getDomSelectionStats(page);
  console.log(`[摇钱树] 表格选择态: totalRows=${domSelectionStats.totalRows}, selectedRows=${domSelectionStats.selectedRows}`);

  const { cookieMap, cookieHeader } = buildCookieHeader(await page.cookies());
  const logid = cookieMap.get('user_id') || cookieMap.get('logid') || cookieMap.get('uid') || '';
  const gid = cookieMap.get('group_id') || cookieMap.get('gid') || cookieMap.get('company_id') || '';
  console.log(`[摇钱树] Cookie上下文: hasCookie=${cookieHeader.length > 0}, logid=${logid ? 'Y' : 'N'}, gid=${gid ? 'Y' : 'N'}`);

  // ====== 新策略：用捕获的请求模板分页拉取全量 API 数据，然后本地过滤 ======
  const allData: any[] = [];

  await sleep(1200);

  // 第一步：把初始加载捕获的数据放入池
  const firstPageData = initialApiData.length > 0 ? initialApiData : (uiCapturedData.length > 0 ? uiCapturedData : []);
  if (firstPageData.length > 0) {
    allData.push(...firstPageData);
    console.log(`[摇钱树] 第1页API数据: ${firstPageData.length} 条`);
  }

  // 第二步：用捕获的请求模板分页拉取后续页（浏览器上下文，保留 session/cookie）
  if (lastCapturedBatchReq && lastCapturedBatchUrl && firstPageData.length >= 100) {
    const apiPageSize = Number((lastCapturedBatchReq as Record<string, any>).page_size || 300);
    let apiPageNum = 2;
    const maxApiPages = Math.min(maxFetchPages, 20);
    while (apiPageNum <= maxApiPages) {
      const nextPageResult = await page.evaluate(async (payload: {
        reqTemplate: Record<string, any>;
        url: string;
        pageNum: number;
      }) => {
        try {
          const req = JSON.parse(JSON.stringify(payload.reqTemplate));
          req.page_num = payload.pageNum;
          const body = new URLSearchParams({ req: JSON.stringify(req) }).toString();
          const response = await fetch(payload.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'Accept': 'application/json',
            },
            body,
            credentials: 'include',
          });
          const data = await response.json();
          if (data?.errno === 0 && Array.isArray(data?.res?.data)) {
            return { success: true, records: data.res.data, total: data.res.total?.count || data.res.total || 0 };
          }
          return { success: false, records: [], total: 0, error: `errno=${data?.errno}` };
        } catch (e: any) {
          return { success: false, records: [], total: 0, error: e?.message || 'unknown' };
        }
      }, { reqTemplate: lastCapturedBatchReq, url: lastCapturedBatchUrl, pageNum: apiPageNum });

      if (!nextPageResult.success || !nextPageResult.records || nextPageResult.records.length === 0) {
        console.log(`[摇钱树] API第${apiPageNum}页: ${nextPageResult.error || '无数据'}, 停止翻页`);
        break;
      }

      allData.push(...nextPageResult.records);
      console.log(`[摇钱树] API第${apiPageNum}页: ${nextPageResult.records.length} 条, 累计 ${allData.length}`);

      if (nextPageResult.records.length < apiPageSize) break;
      apiPageNum++;
      await sleep(300);
    }
  }

  const hasDate = (v: any) => /\d{4}-\d{2}-\d{2}/.test(String(v || '').trim());
  const apiTruckCount = allData.filter(item => hasDate(item?.truck_t) || hasDate(item?.head_truck_t)).length;
  console.log(`[摇钱树] API全量数据: ${allData.length} 条, 含truck_t/head_truck_t=${apiTruckCount}`);

  if (allData.length > 0) {
    const first = allData[0] || {};
    console.log(`[摇钱树] 原始首条: car_batch=${String(first?.car_batch || '-')}, batch_st=${String(first?.batch_st || '-')}, truck_t=${String(first?.truck_t || '-')}, head_truck_t=${String(first?.head_truck_t || '-')}, down_line_text=${String(first?.down_line_text || '-').slice(0, 80)}`);
  }

  const outletKeywords = buildOutletKeywords(criteria.local.outletName);
  const statusTextSet = new Set(criteria.local.statusTexts.map(normalizeText).filter(Boolean));
  const statusCodeSet = new Set(criteria.local.statusCodes.map(code => String(code || '').trim()).filter(Boolean));
  const shipStartYmd = String(criteria.local.shipTimeStartText || '').slice(0, 10);
  const enforceShipTimeFilter = !!shipStartYmd && apiTruckCount > 0;
  console.log(
    `[摇钱树] 发车时间过滤: shipStartYmd=${shipStartYmd}, apiTruckCount=${apiTruckCount}, enforce=${enforceShipTimeFilter ? 'Y' : 'N'}`
  );
  let rejectedByOutlet = 0;
  let rejectedByShipTime = 0;
  let rejectedByStatus = 0;

  const filtered = allData.filter((item: any) => {
    // 业务口径以本地规则为最终准入条件，避免 UI 控件“看起来成功”但实际未生效
    // 网点字段在接口返回中不稳定，若 UI 网点筛选已成功则信任页面结果，避免误杀
    if (outletKeywords.length > 0) {
      const outlet = normalizeText(extractOutletName(item));
      const outletMatched = !!outlet && outletKeywords.some(k => outlet.includes(k) || k.includes(outlet));
      if (!outletMatched) {
        rejectedByOutlet++;
        return false;
      }
    }

    const shipTimeText = extractShipTime(item);
    if (!/\d{4}-\d{2}-\d{2}/.test(shipTimeText)) {
      rejectedByShipTime++;
      return false;
    }

    if (statusTextSet.size > 0 || statusCodeSet.size > 0) {
      const statusCode = String(item?.batch_st ?? '').trim();
      const statusText = normalizeText(resolveBatchStatusText(item, criteria.local.codeTextMap));
      const byCode = statusCodeSet.size > 0 && statusCodeSet.has(statusCode);
      const byText = statusText && Array.from(statusTextSet).some(t => statusText.includes(t) || t.includes(statusText));
      if (!byCode && !byText) {
        if (rejectedByStatus < 5) {
          console.log(`[摇钱树] 状态拦截: batch=${normalizeBatchNo(item?.car_batch)}, code=${statusCode}, text=${statusText}`);
        }
        rejectedByStatus++;
        return false;
      }
    }

    return true;
  });

  const dedupedMap = new Map<string, any>();
  for (const item of filtered) {
    const key = normalizeBatchNo(item?.car_batch || item?.id);
    if (!key) continue;
    dedupedMap.set(key, item);
  }
  const deduped = Array.from(dedupedMap.values());

  console.log(
    `[摇钱树] 数据口径过滤: 原始=${allData.length}, 过滤后=${filtered.length}, 去重后=${deduped.length}, 拦截[网点=${rejectedByOutlet}, 发车时间=${rejectedByShipTime}, 批次状态=${rejectedByStatus}]`
  );
  if (deduped.length > 0) {
    console.log(`[摇钱树] 第一条数据键: ${Object.keys(deduped[0]).slice(0, 20).join(', ')}`);
    const sample = deduped.slice(0, 20).map(item => ({
      car_batch: normalizeBatchNo(item?.car_batch || item?.id),
      outlet: String(extractOutletName(item) || '').slice(0, 80),
      status: String(resolveBatchStatusText(item, criteria.local.codeTextMap) || item?.batch_st || '').slice(0, 30),
      ship: extractShipTime(item),
      receivable_trans_f: String(item?.receivable_trans_f ?? '-'),
      b_tr_trans_f: String(item?.b_tr_trans_f ?? '-'),
      b_tr_trans_f_s: String(item?.b_tr_trans_f_s ?? '-'),
      b_tr_actual_price_s: String(item?.b_tr_actual_price_s ?? '-'),
      receivable_total: String(item?.receivable_total ?? '-'),
    }));
    console.log(`[摇钱树] 过滤后批次样例(前20): ${JSON.stringify(sample).substring(0, 1800)}`);
  }

  page.off('request', uiRequestHandler);
  page.off('response', uiResponseHandler);
  return deduped;
}

// ==================== 辅助函数：安全解析数字 ====================
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
  
  const waybillNumber = normalizeBatchNo(item.car_batch || item.id);
  
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
  const actualFreight = pickFirstPositiveNumber([
    item.b_tr_actual_price_s,
    item.receivable_trans_f,
    item.b_tr_trans_f_s,
  ]);
  const receivableTransport = actualFreight || parseNumber(item.b_tr_trans_f);

  // 签单付 + 开单付 + 赊欠 + 送货费（非核心但参与总计）
  const receiptPay  = parseNumber(item.b_tr_pay_receipt_s);              // 签单付/回单付
  const billingPay  = parseNumber(item.b_tr_pay_billing_s);              // 开单付
  const creditPay   = parseNumber(item.b_tr_pay_credit_s);               // 赊欠
  const coDelivery  = parseNumber(item.b_tr_co_delivery_s);              // 送货费

  let receivableTotal = actualFreight;
  if (receivableTotal === 0) {
    receivableTotal = parseNumber(item.b_tr_total_price_s || item.receivable_total);
  }
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
  const batchStatusText = resolveBatchStatusText(item, DEFAULT_STATUS_CODE_TEXT_MAP) || '';

  // 发车时间（用作运单日期和shipTime）
  const truckTime = item.truck_t || item.head_truck_t || item.cur_truck_t || item.plan_truck_t || null;

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
    batchStatusText,
    remark: String(item.b_remark || ''),
    createTime: truckTime ? new Date(truckTime) : undefined,
    shipTime: truckTime ? new Date(truckTime) : undefined,
    subFinancier: String(item.down_line_text || '').split('->')[0].trim() || TARGET_ORG_NAME,
    branch: String(item.down_line_text || '').split('->')[0].trim() || extractOutletName(item).split('->')[0].trim() || '',
  };
}

// ==================== 模板定义 ====================
const yaoqianshuTemplate: CrawlerTemplate = {
  id: 'yaoqianshu',
  name: '摇钱树物流系统',
  description: '摇钱树物流管理系统（rm.zo-cloud.cn），登录后直连 carStowage，并按网点/发车时间/批次状态过滤抓取',
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
    {
      key: 'outletName',
      label: '网点筛选关键词',
      type: 'text',
      required: false,
      placeholder: '默认 嘉上嘉供应链重庆山东A（按“网点”字段过滤）',
      defaultValue: TARGET_ORG_NAME
    },
    {
      key: 'shipTimeStart',
      label: '发车时间起点',
      type: 'text',
      required: false,
      placeholder: '默认 2026-02-28 00:00:00',
      defaultValue: DEFAULT_SHIP_TIME_START
    },
    {
      key: 'batchStatuses',
      label: '批次状态（名称）',
      type: 'text',
      required: false,
      placeholder: '逗号分隔，默认 已发车,已到车,部分卸车,已卸车,已完成',
      defaultValue: DEFAULT_STATUS_TEXTS.join(',')
    },
    {
      key: 'batchStatusCodes',
      label: '批次状态（编码，可选）',
      type: 'text',
      required: false,
      placeholder: '逗号分隔；若不填则仅按状态名称本地过滤'
    },
  ],
  login,
  fetchData,
  mapFields,
};

// ==================== 注册模板 ====================
registerCrawlerTemplate(yaoqianshuTemplate);

export default yaoqianshuTemplate;
