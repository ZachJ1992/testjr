import type { RowDataPacket } from "mysql2";

import { pool } from "./db.js";
import { getRevenueStats } from "./revenue-store.js";
import type { RevenueStats } from "./types.js";
import {
  DASHBOARD_REGION_FALLBACK_CITY,
  DASHBOARD_REGION_UNKNOWN_PROVINCE,
  normalizeDashboardRegionName,
} from "./dashboard-region.js";
import {
  getWaybillsOverview,
  type WaybillOverview,
} from "./waybills-store.js";
import type {
  WaybillAccessScope,
  WaybillOverviewFilters,
} from "./waybills-query.js";

export interface PlatformRevenueOverview {
  totalRevenue: number;
}

export type DashboardGranularity = "day" | "week" | "month";
export type DashboardSortBy =
  | "platformIncome"
  | "waybillCount"
  | "grossFreightAmount";

export interface DashboardAggregateFilters {
  startDate?: string;
  endDate?: string;
  partnerName?: string;
  landingPartnerName?: string;
  routeName?: string;
}

export interface DashboardTrendFilters extends DashboardAggregateFilters {
  granularity?: DashboardGranularity;
}

export interface DashboardRankFilters extends DashboardAggregateFilters {
  limit?: number;
  sortBy?: DashboardSortBy;
}

export interface DashboardEfficiencyFilters extends DashboardAggregateFilters {
  limit?: number;
}

export interface DashboardOverview {
  totalWaybillCount: number;
  grossFreightAmount: number;
  platformIncome: number;
  pendingSettlementIncome: number;
  settledIncome: number;
  avgDailyIncome: number;
  effectiveContractCount: number;
  partnerCount: number;
  landingPartnerCount: number;
}

export interface DashboardIncomeTrendItem {
  date: string;
  platformIncome: number;
  pendingSettlementIncome: number;
  settledIncome: number;
}

export interface DashboardIncomeTrend {
  granularity: DashboardGranularity;
  items: DashboardIncomeTrendItem[];
}

export interface DashboardBusinessTrendItem {
  date: string;
  waybillCount: number;
  grossFreightAmount: number;
  platformIncome: number;
}

export interface DashboardBusinessTrend {
  granularity: DashboardGranularity;
  items: DashboardBusinessTrendItem[];
}

/** 业务规模趋势（仅 grossFreightAmount）；周维度在应用层按 ISO 自然周从日粒度汇总。 */
export interface DashboardBusinessScaleTrendItem {
  periodLabel: string;
  startDate: string;
  endDate: string;
  grossFreightAmount: number;
}

export type DashboardBusinessScaleTrendDateScope = "last8weeks" | "custom";

/**
 * 周粒度下 `periodLabel` 与 `items.startDate`/`endDate` 的语义（`granularity` 为 `day`/`month` 时响应中为 `null`）。
 */
export interface DashboardBusinessScaleTrendWeekPeriodSemantics {
  /** `periodLabel` 严格采用 ISO 8601 周历编号，形如 `2026-W10`；一周为周一至周日 */
  periodLabelStandard: "iso8601";
  /**
   * `items[].startDate` / `endDate` 为：在本次查询实际 `startDate`～`endDate`（`data` 顶层回显）所限定的
   * `revenue_date` 范围内，落入该 ISO 周的实际最小日、最大日（闭区间），**不是**强制铺满的整周日历边界。
   */
  itemDateBounds: "query_window_intersection_per_iso_week";
  /**
   * 首尾不完整周：前端应理解为「查询窗口与该 ISO 周的交集片段」；金额为该片段内 `grossFreightAmount` 之和；
   * `periodLabel` 仍为整周的 ISO 周号，**不可用** `startDate`/`endDate` 反推完整周一至周日。
   */
  partialWeekInterpretation: string;
}

export const DASHBOARD_BUSINESS_SCALE_TREND_PARTIAL_WEEK_NOTE =
  "当查询下沿或上沿截断某一 ISO 周时，该周金额仅为查询窗口与该周交集内的 grossFreightAmount 之和；items.startDate/endDate 仅表示交集内实际有数据的 revenue_date 首尾日，periodLabel 仍为整周的 ISO 周编号，不能据此反推完整周一至周日边界。";

export interface DashboardBusinessScaleTrend {
  /** `last8weeks`：未传 `startDate`/`endDate` 时服务端默认最近 8 周；`custom`：调用方至少传入一端日期 */
  dateScope: DashboardBusinessScaleTrendDateScope;
  /** 本次统计实际使用的 `revenue_date` 下界（含）；与查询参数或默认窗口一致，始终回显 */
  startDate?: string;
  /** 本次统计实际使用的 `revenue_date` 上界（含）；与查询参数或默认窗口一致，始终回显 */
  endDate?: string;
  /** 未传 `startDate` 且未传 `endDate`、使用默认 8 周窗口时为 `true` */
  usedDefaultDateRange: boolean;
  granularity: DashboardGranularity;
  /** 未传或非法 `granularity` 时服务端采用 `week` */
  usedDefaultGranularity: boolean;
  /** 仅 `granularity=week` 时非空，用于对齐周标签与周边界理解 */
  weekPeriodSemantics: DashboardBusinessScaleTrendWeekPeriodSemantics | null;
  items: DashboardBusinessScaleTrendItem[];
}

/** 融满发车批次趋势：时间窗与 `business-scale-trend` 一致（默认最近 8 周），但按「发车/创建日」分桶，非 `revenue_date`。 */
export type DashboardDepartureBatchTrendDateScope = "last8weeks" | "custom";

export interface DashboardDepartureBatchTrendFilters {
  startDate?: string;
  endDate?: string;
  granularity?: DashboardGranularity;
}

export interface DashboardDepartureBatchTrendItem {
  periodLabel: string;
  startDate: string;
  endDate: string;
  departureBatchCount: number;
}

export interface DashboardDepartureBatchTrend {
  dateScope: DashboardDepartureBatchTrendDateScope;
  /** 本次统计使用的分桶日期下界（含），与 `business-scale-trend` 默认窗算法一致，字段语义见接口文档 */
  startDate?: string;
  /** 本次统计使用的分桶日期上界（含） */
  endDate?: string;
  usedDefaultDateRange: boolean;
  granularity: DashboardGranularity;
  usedDefaultGranularity: boolean;
  items: DashboardDepartureBatchTrendItem[];
}

export type DashboardBusinessScaleByCityDateScope = "last30days" | "custom";

export interface DashboardBusinessScaleByCityItem {
  regionName: string;
  provinceName: string;
  /** 与 `region-summary` 相同：按 `waybill_id` 去重计数 */
  waybillCount: number;
  grossFreightAmount: number;
}

export interface DashboardBusinessScaleByCity {
  /** `last30days`：未传 `startDate`/`endDate` 时服务端默认最近 30 天；`custom`：调用方至少传入一端日期 */
  dateScope: DashboardBusinessScaleByCityDateScope;
  /** 本次统计实际使用的 `revenue_date` 下界（含）；与查询参数或默认窗口一致，始终回显 */
  startDate?: string;
  /** 本次统计实际使用的 `revenue_date` 上界（含）；与查询参数或默认窗口一致，始终回显 */
  endDate?: string;
  /** 未传 `startDate` 且未传 `endDate`、使用默认 30 天窗口时为 `true`（与 `business-scale-trend` 的 `usedDefaultDateRange` 语义对齐） */
  usedDefaultDateRange: boolean;
  items: DashboardBusinessScaleByCityItem[];
}

/** 线路维度撮合运费累计默认窗起点（与 `business-scale-by-route` 一致）。 */
export const DASHBOARD_BUSINESS_SCALE_BY_ROUTE_DEFAULT_START = "2026-03-01";

export type DashboardBusinessScaleByRouteDateScope =
  | "fixedStartToToday"
  | "custom";

export interface DashboardBusinessScaleByRouteItem {
  /** 有 `revenue_records.route_id` 时为线路主键；无 id 时用运单 `vehicle_route` 文本分桶时回 `null` */
  routeId: string | null;
  /** 有 id 时与 `routes.name` 一致（经 `ROUTE_NAME_SQL`）；无 id 时优先 `waybills.vehicle_route`，否则 `未命名线路` */
  routeName: string;
  grossFreightAmount: number;
}

export interface DashboardBusinessScaleByRoute {
  /** `fixedStartToToday`：未传两端日期时使用 `2026-03-01`～今天；`custom`：至少传入一端日期 */
  dateScope: DashboardBusinessScaleByRouteDateScope;
  startDate?: string;
  endDate?: string;
  usedDefaultDateRange: boolean;
  items: DashboardBusinessScaleByRouteItem[];
}

export interface DashboardPartnerTopItem {
  partnerName: string;
  waybillCount: number;
  grossFreightAmount: number;
  platformIncome: number;
  avgIncomePerWaybill: number;
}

export interface DashboardLandingPartnerTopItem {
  landingPartnerName: string;
  waybillCount: number;
  grossFreightAmount: number;
  platformIncome: number;
  avgIncomePerWaybill: number;
}

export interface DashboardIncomeStructure {
  items: Array<{ name: string; value: number }>;
}

export interface DashboardSettlementProgressItem {
  stage: string;
  count: number;
  amount: number;
}

export interface DashboardSettlementProgress {
  recordProgress: DashboardSettlementProgressItem[];
}

export interface DashboardPartnerEfficiencyItem {
  partnerName: string;
  xWaybillCount: number;
  yPlatformIncome: number;
  bubbleGrossFreightAmount: number;
}

export interface DashboardPartnerEfficiency {
  items: DashboardPartnerEfficiencyItem[];
}

export type DashboardRegionSummaryDateScope = "last7days" | "custom";

export interface DashboardRegionSummaryItem {
  regionName: string;
  provinceName: string;
  waybillCount: number;
  platformIncome: number;
  landingPartnerCount: number;
  /** 该区域下命中事实的去重线路数（经落地合作方 → routes，与 rr.route_id 一致） */
  routeCount: number;
  /** 与 routeCount 同值；山海鲸展示用「活跃线路」语义 */
  activeRouteCount: number;
  /** 展示辅助文案，不参与聚合；格式与 platformIncome 两位小数一致 */
  displayText: string;
}

export interface DashboardRegionSummary {
  dateScope: DashboardRegionSummaryDateScope;
  /** 本次统计实际使用的 revenue_date 下界（含）；与查询参数或默认近 7 天一致 */
  startDate?: string;
  /** 本次统计实际上界（含） */
  endDate?: string;
  items: DashboardRegionSummaryItem[];
}

interface RevenueStatsReader {
  getRevenueStats(filters: {
    recordType?: "revenue" | "expense";
  }): Promise<RevenueStats>;
}

interface WaybillOverviewReader {
  getWaybillsOverview(
    filters: WaybillOverviewFilters,
    scope: WaybillAccessScope
  ): Promise<WaybillOverview>;
}

interface DashboardOverviewStatsRow {
  totalWaybillCount: number;
  grossFreightAmount: number;
  platformIncome: number;
  pendingSettlementIncome: number;
  settledIncome: number;
  firstDate?: string;
  lastDate?: string;
  effectiveContractCount: number;
  partnerCount: number;
  landingPartnerCount: number;
}

interface DashboardTrendRow {
  date: string;
  platformIncome: number;
  pendingSettlementIncome: number;
  settledIncome: number;
}

interface DashboardBusinessTrendRow {
  date: string;
  waybillCount: number;
  grossFreightAmount: number;
  platformIncome: number;
}

interface DashboardDimensionRow {
  name?: string;
  waybillCount: number;
  grossFreightAmount: number;
  platformIncome: number;
}

interface DashboardSettlementStageMetrics {
  count?: number;
  amount?: number;
}

interface DashboardSettlementProgressStats {
  total?: DashboardSettlementStageMetrics;
  reconciliationCreated?: DashboardSettlementStageMetrics;
  reconciled?: DashboardSettlementStageMetrics;
  settlementGenerated?: DashboardSettlementStageMetrics;
  accounted?: DashboardSettlementStageMetrics;
}

interface DashboardOverviewReader {
  getOverviewStats(
    filters: DashboardAggregateFilters
  ): Promise<DashboardOverviewStatsRow>;
}

interface DashboardIncomeTrendReader {
  getIncomeTrendRows(
    filters: DashboardTrendFilters
  ): Promise<DashboardTrendRow[]>;
}

interface DashboardBusinessTrendReader {
  getBusinessTrendRows(
    filters: DashboardTrendFilters
  ): Promise<DashboardBusinessTrendRow[]>;
}

type DashboardDimension = "partner" | "landingPartner";

interface DashboardDimensionReader {
  getDimensionTopRows(
    filters: DashboardRankFilters,
    dimension: DashboardDimension
  ): Promise<DashboardDimensionRow[]>;
}

interface DashboardSettlementProgressReader {
  getSettlementProgressRows(
    filters: DashboardAggregateFilters
  ): Promise<DashboardSettlementProgressStats>;
}

interface DashboardEfficiencyReader {
  getPartnerEfficiencyRows(
    filters: DashboardEfficiencyFilters
  ): Promise<DashboardDimensionRow[]>;
}

/** 线路撮合运费聚合行（与 `queryRows` 结果字段一致，便于单测 mock）。 */
type DashboardBusinessScaleByRouteAggRow = {
  route_id: string | null;
  route_name: string | null;
  gross_freight_amount: string | number | null;
};

interface DashboardBusinessScaleByRouteSqlRow
  extends RowDataPacket,
    DashboardBusinessScaleByRouteAggRow {}

interface DashboardBusinessScaleByRouteReader {
  getBusinessScaleByRouteRows(
    filters: DashboardAggregateFilters
  ): Promise<DashboardBusinessScaleByRouteAggRow[]>;
}

interface DashboardSqlParts {
  fromSql: string;
  whereSql: string;
  params: Array<string | number>;
}

const DASHBOARD_FACT_SOURCE_TYPE = "waybill_commission";
/** 首版固定筛选：与业务约定「合作方=融满」一致，对应 `revenue_records.financier_name`（去首尾空格精确匹配）。 */
export const DASHBOARD_DEPARTURE_BATCH_TREND_PARTNER_NAME = "融满";
/**
 * 分桶日期：优先 `waybills.departure_time`（发车），缺失时用 `waybills.created_time`（批次创建/入库）。
 * 仅当两者均无法得到日历日时该行不参与统计。
 */
const DEPARTURE_BATCH_BUCKET_DATE_SQL =
  "COALESCE(DATE(w.departure_time), DATE(w.created_time))";
const PARTNER_FALLBACK_NAME = "未命名合作方";
const LANDING_PARTNER_FALLBACK_NAME = "未命名落地合作方";
const PARTNER_NAME_SQL = "COALESCE(NULLIF(TRIM(rr.financier_name), ''), '未命名合作方')";
const LANDING_PARTNER_NAME_SQL =
  "COALESCE(NULLIF(TRIM(lp.name), ''), '未命名落地合作方')";
const ROUTE_NAME_SQL = "COALESCE(NULLIF(TRIM(rt.name), ''), '未命名线路')";
const GROSS_FREIGHT_SQL = "COALESCE(w.receivable_total, rr.principal_amount, 0)";

function normalizeGranularity(
  value?: DashboardGranularity
): DashboardGranularity {
  return value === "week" || value === "month" ? value : "day";
}

function normalizeLimit(value: number | undefined, defaultLimit: number): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return defaultLimit;
  }
  return Math.min(Math.floor(value as number), 100);
}

function normalizeSortBy(value?: DashboardSortBy): DashboardSortBy {
  return value === "waybillCount" || value === "grossFreightAmount"
    ? value
    : "platformIncome";
}

function normalizeName(value: unknown, fallbackName: string): string {
  const text = String(value ?? "").trim();
  return text || fallbackName;
}

function formatLocalDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 地图区域汇总默认窗口：含今天在共 7 天（今天往前 6 天 ～ 今天），按服务器本地日历。 */
export function getDefaultLast7DaysDateRange(now: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const endDate = formatLocalDateOnly(now);
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 6
  );
  const startDate = formatLocalDateOnly(start);
  return { startDate, endDate };
}

/** 城市业务规模分布默认窗口：含今天在共 30 个自然日（今天往前 29 天 ～ 今天），按服务器本地日历。 */
export function getDefaultLast30DaysDateRange(now: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const endDate = formatLocalDateOnly(now);
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 29
  );
  const startDate = formatLocalDateOnly(start);
  return { startDate, endDate };
}

/** 线路撮合运费累计默认窗口：`2026-03-01`（含）～今天（含），按服务器本地日历。 */
export function getDefaultBusinessScaleByRouteDateRange(now: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: DASHBOARD_BUSINESS_SCALE_BY_ROUTE_DEFAULT_START,
    endDate: formatLocalDateOnly(now),
  };
}

/** 本地日历日所在周的周一（12:00 取整，避免夏令时边界）。 */
function getLocalMondayOfWeekContaining(now: Date): Date {
  const t = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
    0,
    0,
    0
  );
  const dow = t.getDay() || 7;
  t.setDate(t.getDate() - (dow - 1));
  return t;
}

/**
 * 业务规模趋势默认窗口：自「含今天在内的当前周」的周一，再向前数 7 个整周（共 8 个自然周跨度）的周一为 `startDate`，`endDate` 为今天（本地日历）。
 * 用于周趋势首版默认截断，避免拉全量历史。
 */
export function getDefaultLast8WeeksDateRange(now: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const endDate = formatLocalDateOnly(now);
  const monThisWeek = getLocalMondayOfWeekContaining(now);
  const start = new Date(monThisWeek);
  start.setDate(monThisWeek.getDate() - 49);
  const startDate = formatLocalDateOnly(start);
  return { startDate, endDate };
}

export function normalizeDashboardDateValue(
  value?: string | Date | null
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : formatLocalDateOnly(value);
  }

  const text = String(value).trim();
  if (!text) {
    return undefined;
  }

  const directDateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directDateMatch) {
    return directDateMatch[1];
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return formatLocalDateOnly(parsed);
}

function parseDateOnly(value?: string | Date): Date | undefined {
  const dateOnlyText = normalizeDashboardDateValue(value);
  if (!dateOnlyText) {
    return undefined;
  }

  return new Date(`${dateOnlyText}T00:00:00Z`);
}

function getInclusiveDayCount(
  startDate?: string,
  endDate?: string,
  firstDate?: string,
  lastDate?: string
): number {
  const start = parseDateOnly(startDate) ?? parseDateOnly(firstDate);
  const end = parseDateOnly(endDate) ?? parseDateOnly(lastDate);

  if (!start || !end) {
    return 0;
  }

  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) {
    return 0;
  }

  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

function getDateFormat(granularity: DashboardGranularity): string {
  switch (granularity) {
    case "week":
      return "%x-W%v";
    case "month":
      return "%Y-%m";
    case "day":
    default:
      return "%Y-%m-%d";
  }
}

function normalizeBusinessScaleTrendGranularity(
  value?: DashboardGranularity
): { granularity: DashboardGranularity; usedDefault: boolean } {
  if (value === "day" || value === "week" || value === "month") {
    return { granularity: value, usedDefault: false };
  }
  return { granularity: "week", usedDefault: true };
}

/** 从日历日 Y-M-D 计算 ISO 周历年份与周序号（周一为每周首日），用于 `YYYY-Www` 周期标签。 */
function getIsoWeekYearAndWeekFromYmd(
  y: number,
  monthIndex0: number,
  day: number
): { isoYear: number; week: number } {
  const t = new Date(Date.UTC(y, monthIndex0, day));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const isoYear = t.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000) + 1) / 7
  );
  return { isoYear, week };
}

function formatIsoWeekPeriodLabel(isoYear: number, week: number): string {
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function parseYmdParts(
  dateStr: string
): { y: number; m0: number; d: number } | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!m) {
    return undefined;
  }
  return { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) };
}

/** 月桶 `YYYY-MM` 对应的自然月首尾，并与查询起止日期求交（用于返回周期边界）。 */
function getMonthPeriodBounds(
  ym: string,
  filterStart?: string,
  filterEnd?: string
): { startDate: string; endDate: string } {
  const parts = /^(\d{4})-(\d{2})$/.exec(String(ym).trim());
  if (!parts) {
    const s = String(ym).trim();
    return { startDate: s, endDate: s };
  }
  const y = Number(parts[1]);
  const mo = Number(parts[2]);
  const first = formatLocalDateOnly(new Date(y, mo - 1, 1));
  const lastDay = new Date(y, mo, 0).getDate();
  const last = formatLocalDateOnly(new Date(y, mo - 1, lastDay));
  let startDate = first;
  let endDate = last;
  if (filterStart && filterStart > startDate) {
    startDate = filterStart;
  }
  if (filterEnd && filterEnd < endDate) {
    endDate = filterEnd;
  }
  return { startDate, endDate };
}

async function queryRows<T extends RowDataPacket>(
  sql: string,
  params: Array<string | number> = []
): Promise<T[]> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows as T[];
}

function buildDashboardSqlParts(
  filters: DashboardAggregateFilters = {}
): DashboardSqlParts {
  const conditions = [
    "rr.record_type = 'revenue'",
    "rr.beneficiary_type = 'platform'",
    // 当前 dashboard 统一围绕业务抽成事实表聚合。
    `rr.source_type = '${DASHBOARD_FACT_SOURCE_TYPE}'`,
  ];
  const params: Array<string | number> = [];

  if (filters.startDate) {
    conditions.push("rr.revenue_date >= ?");
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push("rr.revenue_date <= ?");
    params.push(filters.endDate);
  }

  if (filters.partnerName) {
    conditions.push(`${PARTNER_NAME_SQL} = ?`);
    params.push(filters.partnerName.trim());
  }

  if (filters.landingPartnerName) {
    conditions.push(`${LANDING_PARTNER_NAME_SQL} = ?`);
    params.push(filters.landingPartnerName.trim());
  }

  if (filters.routeName) {
    conditions.push(`${ROUTE_NAME_SQL} = ?`);
    params.push(filters.routeName.trim());
  }

  return {
    fromSql: `
      FROM revenue_records rr
      LEFT JOIN waybills w ON rr.waybill_id = w.id AND w.deleted_at IS NULL
      LEFT JOIN routes rt ON rr.route_id = rt.id
      LEFT JOIN local_partners lp ON rt.local_partner_id = lp.id
    `,
    whereSql: `WHERE ${conditions.join(" AND ")}`,
    params,
  };
}

function buildDepartureBatchTrendSqlParts(filters: {
  startDate?: string;
  endDate?: string;
}): DashboardSqlParts {
  const conditions = [
    "rr.record_type = 'revenue'",
    "rr.beneficiary_type = 'platform'",
    `rr.source_type = '${DASHBOARD_FACT_SOURCE_TYPE}'`,
    "TRIM(rr.financier_name) = ?",
    `${DEPARTURE_BATCH_BUCKET_DATE_SQL} IS NOT NULL`,
  ];
  const params: Array<string | number> = [
    DASHBOARD_DEPARTURE_BATCH_TREND_PARTNER_NAME,
  ];

  if (filters.startDate) {
    conditions.push(`${DEPARTURE_BATCH_BUCKET_DATE_SQL} >= ?`);
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push(`${DEPARTURE_BATCH_BUCKET_DATE_SQL} <= ?`);
    params.push(filters.endDate);
  }

  return {
    fromSql: `
      FROM revenue_records rr
      LEFT JOIN waybills w ON rr.waybill_id = w.id AND w.deleted_at IS NULL
      LEFT JOIN routes rt ON rr.route_id = rt.id
      LEFT JOIN local_partners lp ON rt.local_partner_id = lp.id
    `,
    whereSql: `WHERE ${conditions.join(" AND ")}`,
    params,
  };
}

/** 区域汇总：在 dashboard 事实链路上追加 areas，仅用于本接口，避免改动其他聚合 SQL 行为。 */
function buildDashboardSqlPartsWithAreaJoin(
  filters: DashboardAggregateFilters = {}
): DashboardSqlParts {
  const base = buildDashboardSqlParts(filters);
  return {
    ...base,
    fromSql: `${base.fromSql.trimEnd()}
      LEFT JOIN areas ar ON lp.area_id = ar.id`,
  };
}

/** 无 `route_id` 时分组键前缀（仅 SQL 内部，不对外暴露）。 */
const BUSINESS_SCALE_BY_ROUTE_FREE_KEY_PREFIX = "__NO_ROUTE_ID__:";

async function queryDashboardBusinessScaleByRouteRows(
  filters: DashboardAggregateFilters = {}
): Promise<DashboardBusinessScaleByRouteAggRow[]> {
  const sqlParts = buildDashboardSqlParts(filters);
  const routeNamePerRowSql = `
    CASE
      WHEN rr.route_id IS NOT NULL AND TRIM(rr.route_id) <> ''
      THEN ${ROUTE_NAME_SQL}
      ELSE COALESCE(NULLIF(TRIM(w.vehicle_route), ''), ${ROUTE_NAME_SQL})
    END
  `;
  const groupKeySql = `
    CASE
      WHEN rr.route_id IS NOT NULL AND TRIM(rr.route_id) <> ''
      THEN TRIM(rr.route_id)
      ELSE CONCAT(
        '${BUSINESS_SCALE_BY_ROUTE_FREE_KEY_PREFIX}',
        COALESCE(NULLIF(TRIM(w.vehicle_route), ''), '__UNNAMED__')
      )
    END
  `;
  return queryRows<DashboardBusinessScaleByRouteSqlRow>(
    `SELECT
       MAX(CASE
         WHEN rr.route_id IS NOT NULL AND TRIM(rr.route_id) <> ''
         THEN TRIM(rr.route_id)
         ELSE NULL
       END) AS route_id,
       MAX(${routeNamePerRowSql}) AS route_name,
       COALESCE(ROUND(SUM(${GROSS_FREIGHT_SQL}), 2), 0) AS gross_freight_amount
     ${sqlParts.fromSql}
     ${sqlParts.whereSql}
     GROUP BY ${groupKeySql}
     ORDER BY gross_freight_amount DESC, route_name ASC`,
    sqlParts.params
  );
}

async function queryDashboardOverviewStats(
  filters: DashboardAggregateFilters = {}
): Promise<DashboardOverviewStatsRow> {
  const sqlParts = buildDashboardSqlParts(filters);
  const rows = await queryRows<RowDataPacket>(
    `SELECT
       COUNT(DISTINCT rr.waybill_id) AS total_waybill_count,
       COALESCE(ROUND(SUM(${GROSS_FREIGHT_SQL}), 2), 0) AS gross_freight_amount,
       -- platformIncome = 业务抽成金额 sum
       COALESCE(ROUND(SUM(rr.amount), 2), 0) AS platform_income,
       -- 待结算收益 = 未入账抽成金额 sum
       COALESCE(ROUND(SUM(CASE WHEN rr.status <> 'accounted' THEN rr.amount ELSE 0 END), 2), 0) AS pending_settlement_income,
       -- settledIncome = 已入账抽成金额 sum
       COALESCE(ROUND(SUM(CASE WHEN rr.status = 'accounted' THEN rr.amount ELSE 0 END), 2), 0) AS settled_income,
       MIN(rr.revenue_date) AS first_date,
       MAX(rr.revenue_date) AS last_date,
       -- TODO: 当前先按“已产生日志的抽成合同数”近似 effectiveContractCount。
       COUNT(DISTINCT rr.commission_contract_id) AS effective_contract_count,
       COUNT(DISTINCT NULLIF(TRIM(rr.financier_name), '')) AS partner_count,
       COUNT(DISTINCT NULLIF(TRIM(lp.name), '')) AS landing_partner_count
     ${sqlParts.fromSql}
     ${sqlParts.whereSql}`,
    sqlParts.params
  );

  const row = rows[0] || {};
  return {
    totalWaybillCount: Number(row.total_waybill_count) || 0,
    grossFreightAmount: Number(row.gross_freight_amount) || 0,
    platformIncome: Number(row.platform_income) || 0,
    pendingSettlementIncome: Number(row.pending_settlement_income) || 0,
    settledIncome: Number(row.settled_income) || 0,
    firstDate: normalizeDashboardDateValue(row.first_date),
    lastDate: normalizeDashboardDateValue(row.last_date),
    effectiveContractCount: Number(row.effective_contract_count) || 0,
    partnerCount: Number(row.partner_count) || 0,
    landingPartnerCount: Number(row.landing_partner_count) || 0,
  };
}

async function queryDashboardIncomeTrendRows(
  filters: DashboardTrendFilters = {}
): Promise<DashboardTrendRow[]> {
  const granularity = normalizeGranularity(filters.granularity);
  const dateFormat = getDateFormat(granularity);
  const sqlParts = buildDashboardSqlParts(filters);
  const rows = await queryRows<RowDataPacket>(
    `SELECT
       DATE_FORMAT(rr.revenue_date, ?) AS bucket_date,
       COALESCE(ROUND(SUM(rr.amount), 2), 0) AS platform_income,
       COALESCE(ROUND(SUM(CASE WHEN rr.status <> 'accounted' THEN rr.amount ELSE 0 END), 2), 0) AS pending_settlement_income,
       COALESCE(ROUND(SUM(CASE WHEN rr.status = 'accounted' THEN rr.amount ELSE 0 END), 2), 0) AS settled_income
     ${sqlParts.fromSql}
     ${sqlParts.whereSql}
     GROUP BY DATE_FORMAT(rr.revenue_date, ?)
     ORDER BY MIN(rr.revenue_date) ASC`,
    [dateFormat, ...sqlParts.params, dateFormat]
  );

  return rows.map((row) => ({
    date: String(row.bucket_date || ""),
    platformIncome: Number(row.platform_income) || 0,
    pendingSettlementIncome: Number(row.pending_settlement_income) || 0,
    settledIncome: Number(row.settled_income) || 0,
  }));
}

async function queryDashboardBusinessTrendRows(
  filters: DashboardTrendFilters = {}
): Promise<DashboardBusinessTrendRow[]> {
  const granularity = normalizeGranularity(filters.granularity);
  const dateFormat = getDateFormat(granularity);
  const sqlParts = buildDashboardSqlParts(filters);
  const rows = await queryRows<RowDataPacket>(
    `SELECT
       DATE_FORMAT(rr.revenue_date, ?) AS bucket_date,
       COUNT(DISTINCT rr.waybill_id) AS waybill_count,
       -- grossFreightAmount = 撮合运费 sum
       COALESCE(ROUND(SUM(${GROSS_FREIGHT_SQL}), 2), 0) AS gross_freight_amount,
       COALESCE(ROUND(SUM(rr.amount), 2), 0) AS platform_income
     ${sqlParts.fromSql}
     ${sqlParts.whereSql}
     GROUP BY DATE_FORMAT(rr.revenue_date, ?)
     ORDER BY MIN(rr.revenue_date) ASC`,
    [dateFormat, ...sqlParts.params, dateFormat]
  );

  return rows.map((row) => ({
    date: String(row.bucket_date || ""),
    waybillCount: Number(row.waybill_count) || 0,
    grossFreightAmount: Number(row.gross_freight_amount) || 0,
    platformIncome: Number(row.platform_income) || 0,
  }));
}

function getDimensionConfig(dimension: DashboardDimension): {
  nameSql: string;
  fallbackName: string;
} {
  if (dimension === "landingPartner") {
    return {
      nameSql: LANDING_PARTNER_NAME_SQL,
      fallbackName: LANDING_PARTNER_FALLBACK_NAME,
    };
  }

  return {
    // partnerName 暂映射底层 rr.financier_name。
    nameSql: PARTNER_NAME_SQL,
    fallbackName: PARTNER_FALLBACK_NAME,
  };
}

function getSortFieldSql(sortBy: DashboardSortBy): string {
  switch (sortBy) {
    case "waybillCount":
      return "waybill_count";
    case "grossFreightAmount":
      return "gross_freight_amount";
    case "platformIncome":
    default:
      return "platform_income";
  }
}

async function queryDashboardDimensionTopRows(
  filters: DashboardRankFilters = {},
  dimension: DashboardDimension
): Promise<DashboardDimensionRow[]> {
  const sortBy = normalizeSortBy(filters.sortBy);
  const limit = normalizeLimit(filters.limit, 10);
  const sqlParts = buildDashboardSqlParts(filters);
  const dimensionConfig = getDimensionConfig(dimension);
  const rows = await queryRows<RowDataPacket>(
    `SELECT
       ${dimensionConfig.nameSql} AS dimension_name,
       COUNT(DISTINCT rr.waybill_id) AS waybill_count,
       COALESCE(ROUND(SUM(${GROSS_FREIGHT_SQL}), 2), 0) AS gross_freight_amount,
       COALESCE(ROUND(SUM(rr.amount), 2), 0) AS platform_income
     ${sqlParts.fromSql}
     ${sqlParts.whereSql}
     GROUP BY ${dimensionConfig.nameSql}
     ORDER BY ${getSortFieldSql(sortBy)} DESC, waybill_count DESC, dimension_name ASC
     LIMIT ?`,
    [...sqlParts.params, limit]
  );

  return rows.map((row) => ({
    name: normalizeName(row.dimension_name, dimensionConfig.fallbackName),
    waybillCount: Number(row.waybill_count) || 0,
    grossFreightAmount: Number(row.gross_freight_amount) || 0,
    platformIncome: Number(row.platform_income) || 0,
  }));
}

async function queryDashboardSettlementProgressRows(
  filters: DashboardAggregateFilters = {}
): Promise<DashboardSettlementProgressStats> {
  const sqlParts = buildDashboardSqlParts(filters);
  const rows = await queryRows<RowDataPacket>(
    `SELECT
       COUNT(*) AS total_count,
       COALESCE(ROUND(SUM(rr.amount), 2), 0) AS total_amount,
       COUNT(CASE WHEN rr.status IN ('reconciling', 'reconciled', 'settled', 'accounted') THEN 1 END) AS reconciliation_created_count,
       COALESCE(ROUND(SUM(CASE WHEN rr.status IN ('reconciling', 'reconciled', 'settled', 'accounted') THEN rr.amount ELSE 0 END), 2), 0) AS reconciliation_created_amount,
       COUNT(CASE WHEN rr.status IN ('reconciled', 'settled', 'accounted') THEN 1 END) AS reconciled_count,
       COALESCE(ROUND(SUM(CASE WHEN rr.status IN ('reconciled', 'settled', 'accounted') THEN rr.amount ELSE 0 END), 2), 0) AS reconciled_amount,
       COUNT(CASE WHEN rr.status IN ('settled', 'accounted') THEN 1 END) AS settlement_generated_count,
       COALESCE(ROUND(SUM(CASE WHEN rr.status IN ('settled', 'accounted') THEN rr.amount ELSE 0 END), 2), 0) AS settlement_generated_amount,
       COUNT(CASE WHEN rr.status = 'accounted' THEN 1 END) AS accounted_count,
       COALESCE(ROUND(SUM(CASE WHEN rr.status = 'accounted' THEN rr.amount ELSE 0 END), 2), 0) AS accounted_amount
     ${sqlParts.fromSql}
     ${sqlParts.whereSql}`,
    sqlParts.params
  );

  const row = rows[0] || {};
  return {
    total: {
      count: Number(row.total_count) || 0,
      amount: Number(row.total_amount) || 0,
    },
    reconciliationCreated: {
      count: Number(row.reconciliation_created_count) || 0,
      amount: Number(row.reconciliation_created_amount) || 0,
    },
    reconciled: {
      count: Number(row.reconciled_count) || 0,
      amount: Number(row.reconciled_amount) || 0,
    },
    settlementGenerated: {
      count: Number(row.settlement_generated_count) || 0,
      amount: Number(row.settlement_generated_amount) || 0,
    },
    accounted: {
      count: Number(row.accounted_count) || 0,
      amount: Number(row.accounted_amount) || 0,
    },
  };
}

interface DashboardRegionFactRow {
  waybill_id: string | number | null;
  amount: string | number | null;
  /** 与 overview / business-trend 相同的单行 grossFreightAmount 定义（未 round 到桶前在聚合中累加） */
  gross_freight_amount: string | number | null;
  financier_name: string | null;
  raw_area_name: string | null;
  landing_partner_id: string | null;
  landing_partner_name: string | null;
  route_id: string | null;
}

function landingPartnerDedupeKey(
  id: string | null | undefined,
  name: string | null | undefined
): string | null {
  if (id != null && String(id).trim() !== "") {
    return `id:${String(id).trim()}`;
  }
  const n = String(name ?? "").trim();
  return n ? `name:${n}` : null;
}

async function queryDashboardRegionFactRows(
  filters: DashboardAggregateFilters = {}
): Promise<DashboardRegionFactRow[]> {
  const sqlParts = buildDashboardSqlPartsWithAreaJoin(filters);
  const rows = await queryRows<RowDataPacket>(
    `SELECT
       rr.waybill_id,
       rr.amount,
       ${GROSS_FREIGHT_SQL} AS gross_freight_amount,
       rr.financier_name,
       rr.route_id,
       ar.name AS raw_area_name,
       lp.id AS landing_partner_id,
       lp.name AS landing_partner_name
     ${sqlParts.fromSql}
     ${sqlParts.whereSql}`,
    sqlParts.params
  );

  return rows.map((row) => ({
    waybill_id: row.waybill_id ?? null,
    amount: row.amount ?? null,
    gross_freight_amount: row.gross_freight_amount ?? null,
    financier_name:
      row.financier_name == null ? null : String(row.financier_name),
    raw_area_name:
      row.raw_area_name == null ? null : String(row.raw_area_name),
    landing_partner_id:
      row.landing_partner_id == null
        ? null
        : String(row.landing_partner_id),
    landing_partner_name:
      row.landing_partner_name == null
        ? null
        : String(row.landing_partner_name),
    route_id:
      row.route_id == null || String(row.route_id).trim() === ""
        ? null
        : String(row.route_id),
  }));
}

async function queryDashboardPartnerEfficiencyRows(
  filters: DashboardEfficiencyFilters = {}
): Promise<DashboardDimensionRow[]> {
  const limit = normalizeLimit(filters.limit, 50);
  const sqlParts = buildDashboardSqlParts(filters);
  const rows = await queryRows<RowDataPacket>(
    `SELECT
       ${PARTNER_NAME_SQL} AS partner_name,
       COUNT(DISTINCT rr.waybill_id) AS waybill_count,
       COALESCE(ROUND(SUM(${GROSS_FREIGHT_SQL}), 2), 0) AS gross_freight_amount,
       COALESCE(ROUND(SUM(rr.amount), 2), 0) AS platform_income
     ${sqlParts.fromSql}
     ${sqlParts.whereSql}
     GROUP BY ${PARTNER_NAME_SQL}
     ORDER BY platform_income DESC, waybill_count DESC, partner_name ASC
     LIMIT ?`,
    [...sqlParts.params, limit]
  );

  return rows.map((row) => ({
    name: normalizeName(row.partner_name, PARTNER_FALLBACK_NAME),
    waybillCount: Number(row.waybill_count) || 0,
    grossFreightAmount: Number(row.gross_freight_amount) || 0,
    platformIncome: Number(row.platform_income) || 0,
  }));
}

function roundMoney(value: unknown): number {
  return Number((Number(value) || 0).toFixed(2));
}

/** region-summary 展示串中的金额片段，与 roundMoney 两位小数一致 */
function formatRegionSummaryIncomeForDisplay(incomeRounded: number): string {
  return incomeRounded.toFixed(2);
}

function buildRegionSummaryDisplayText(
  provinceName: string,
  platformIncomeRounded: number,
  activeRouteCount: number
): string {
  return `${provinceName}｜平台收益，${formatRegionSummaryIncomeForDisplay(platformIncomeRounded)} 元｜活跃线路，${activeRouteCount} 条`;
}

export async function getPlatformRevenueOverview(
  _filters?: {
    startDate?: string;
    endDate?: string;
  },
  deps: RevenueStatsReader = { getRevenueStats }
): Promise<PlatformRevenueOverview> {
  const stats = await deps.getRevenueStats({
    recordType: "revenue",
  });

  return {
    totalRevenue: roundMoney(stats.totalRevenue),
  };
}

export async function getDashboardWaybillsOverview(
  filters: WaybillOverviewFilters = {},
  scope: WaybillAccessScope = {},
  deps: WaybillOverviewReader = { getWaybillsOverview }
): Promise<WaybillOverview> {
  const overview = await deps.getWaybillsOverview(filters, scope);

  return {
    waybillCount: Number(overview.waybillCount) || 0,
    totalReceivable: roundMoney(overview.totalReceivable),
  };
}

export async function getDashboardOverview(
  filters: DashboardAggregateFilters = {},
  deps: DashboardOverviewReader = {
    getOverviewStats: queryDashboardOverviewStats,
  }
): Promise<DashboardOverview> {
  const stats = await deps.getOverviewStats(filters);
  const naturalDays = getInclusiveDayCount(
    filters.startDate,
    filters.endDate,
    stats.firstDate,
    stats.lastDate
  );

  return {
    totalWaybillCount: Number(stats.totalWaybillCount) || 0,
    grossFreightAmount: roundMoney(stats.grossFreightAmount),
    platformIncome: roundMoney(stats.platformIncome),
    pendingSettlementIncome: roundMoney(stats.pendingSettlementIncome),
    settledIncome: roundMoney(stats.settledIncome),
    avgDailyIncome:
      naturalDays > 0 ? roundMoney(stats.platformIncome / naturalDays) : 0,
    effectiveContractCount: Number(stats.effectiveContractCount) || 0,
    partnerCount: Number(stats.partnerCount) || 0,
    landingPartnerCount: Number(stats.landingPartnerCount) || 0,
  };
}

export async function getDashboardIncomeTrend(
  filters: DashboardTrendFilters = {},
  deps: DashboardIncomeTrendReader = {
    getIncomeTrendRows: queryDashboardIncomeTrendRows,
  }
): Promise<DashboardIncomeTrend> {
  const granularity = normalizeGranularity(filters.granularity);
  const rows = await deps.getIncomeTrendRows({
    ...filters,
    granularity,
  });

  return {
    granularity,
    items: rows.map((row) => ({
      date: row.date,
      platformIncome: roundMoney(row.platformIncome),
      pendingSettlementIncome: roundMoney(row.pendingSettlementIncome),
      settledIncome: roundMoney(row.settledIncome),
    })),
  };
}

export async function getDashboardBusinessTrend(
  filters: DashboardTrendFilters = {},
  deps: DashboardBusinessTrendReader = {
    getBusinessTrendRows: queryDashboardBusinessTrendRows,
  }
): Promise<DashboardBusinessTrend> {
  const granularity = normalizeGranularity(filters.granularity);
  const rows = await deps.getBusinessTrendRows({
    ...filters,
    granularity,
  });

  return {
    granularity,
    items: rows.map((row) => ({
      date: row.date,
      waybillCount: Number(row.waybillCount) || 0,
      grossFreightAmount: roundMoney(row.grossFreightAmount),
      platformIncome: roundMoney(row.platformIncome),
    })),
  };
}

/**
 * 业务规模（grossFreightAmount）趋势。
 * - 未传 `startDate` 且未传 `endDate` 时：默认最近 8 周（见 `getDefaultLast8WeeksDateRange`），`data.dateScope`=`last8weeks`。
 * - `day` / `month`：与 `/dashboard/business-trend` 相同的按桶 SQL（`GROSS_FREIGHT_SQL` 口径一致）。
 * - `week`：先按日取数，再在应用层按 ISO 周汇总；周标签与 `items` 日期边界语义见 `weekPeriodSemantics`。
 * - 未传 `granularity` 时默认 `week`，`usedDefaultGranularity` 为 true。
 * - `usedDefaultDateRange`：未传两端日期且使用默认 8 周时为 `true`，否则 `false`。
 */
export async function getDashboardBusinessScaleTrend(
  filters: DashboardTrendFilters = {},
  deps: DashboardBusinessTrendReader = {
    getBusinessTrendRows: queryDashboardBusinessTrendRows,
  }
): Promise<DashboardBusinessScaleTrend> {
  const { granularity, usedDefault } =
    normalizeBusinessScaleTrendGranularity(filters.granularity);

  const hasCustomRange = Boolean(filters.startDate || filters.endDate);
  let effectiveFilters: DashboardTrendFilters = { ...filters };
  let dateScope: DashboardBusinessScaleTrendDateScope = "custom";

  if (!hasCustomRange) {
    const { startDate, endDate } = getDefaultLast8WeeksDateRange();
    effectiveFilters = {
      ...filters,
      startDate,
      endDate,
    };
    dateScope = "last8weeks";
  }

  const usedDefaultDateRange = !hasCustomRange;

  const normStart = normalizeDashboardDateValue(effectiveFilters.startDate);
  const normEnd = normalizeDashboardDateValue(effectiveFilters.endDate);

  const weekSemanticsPayload: DashboardBusinessScaleTrendWeekPeriodSemantics = {
    periodLabelStandard: "iso8601",
    itemDateBounds: "query_window_intersection_per_iso_week",
    partialWeekInterpretation: DASHBOARD_BUSINESS_SCALE_TREND_PARTIAL_WEEK_NOTE,
  };

  if (granularity === "day" || granularity === "month") {
    const rows = await deps.getBusinessTrendRows({
      ...effectiveFilters,
      granularity,
    });
    const items: DashboardBusinessScaleTrendItem[] = rows.map((row) => {
      const grossFreightAmount = roundMoney(row.grossFreightAmount);
      if (granularity === "day") {
        return {
          periodLabel: row.date,
          startDate: row.date,
          endDate: row.date,
          grossFreightAmount,
        };
      }
      const { startDate, endDate } = getMonthPeriodBounds(
        row.date,
        normStart,
        normEnd
      );
      return {
        periodLabel: row.date,
        startDate,
        endDate,
        grossFreightAmount,
      };
    });
    return {
      dateScope,
      startDate: effectiveFilters.startDate,
      endDate: effectiveFilters.endDate,
      usedDefaultDateRange,
      granularity,
      usedDefaultGranularity: usedDefault,
      weekPeriodSemantics: null,
      items,
    };
  }

  const dailyRows = await deps.getBusinessTrendRows({
    ...effectiveFilters,
    granularity: "day",
  });

  type WeekAcc = {
    isoYear: number;
    week: number;
    periodLabel: string;
    sum: number;
    minD: string;
    maxD: string;
  };
  const weekMap = new Map<string, WeekAcc>();

  for (const row of dailyRows) {
    const p = parseYmdParts(row.date);
    if (!p) {
      continue;
    }
    const { isoYear, week } = getIsoWeekYearAndWeekFromYmd(p.y, p.m0, p.d);
    const key = `${isoYear}\u0000${week}`;
    const prev = weekMap.get(key);
    const add = Number(row.grossFreightAmount) || 0;
    const sum = (prev?.sum ?? 0) + add;
    const minD =
      !prev || row.date < prev.minD ? row.date : prev.minD;
    const maxD =
      !prev || row.date > prev.maxD ? row.date : prev.maxD;
    weekMap.set(key, {
      isoYear,
      week,
      periodLabel: formatIsoWeekPeriodLabel(isoYear, week),
      sum,
      minD,
      maxD,
    });
  }

  const items = [...weekMap.values()]
    .sort((a, b) =>
      a.isoYear !== b.isoYear ? a.isoYear - b.isoYear : a.week - b.week
    )
    .map((w) => ({
      periodLabel: w.periodLabel,
      startDate: w.minD,
      endDate: w.maxD,
      grossFreightAmount: roundMoney(w.sum),
    }));

  return {
    dateScope,
    startDate: effectiveFilters.startDate,
    endDate: effectiveFilters.endDate,
    usedDefaultDateRange,
    granularity: "week",
    usedDefaultGranularity: usedDefault,
    weekPeriodSemantics: weekSemanticsPayload,
    items,
  };
}

function clampBucketBounds(
  minD: string,
  maxD: string,
  filterStart?: string,
  filterEnd?: string
): { startDate: string; endDate: string } {
  let startDate = minD;
  let endDate = maxD;
  if (filterStart && filterStart > startDate) {
    startDate = filterStart;
  }
  if (filterEnd && filterEnd < endDate) {
    endDate = filterEnd;
  }
  return { startDate, endDate };
}

interface DashboardDepartureBatchTrendSqlRow extends RowDataPacket {
  period_label: string;
  min_bucket: string | Date | null;
  max_bucket: string | Date | null;
  departure_batch_count: string | number | null;
}

async function queryDashboardDepartureBatchTrendRows(
  filters: DashboardDepartureBatchTrendFilters = {},
  granularity: DashboardGranularity
): Promise<
  Array<{
    periodLabel: string;
    minBucket: string;
    maxBucket: string;
    departureBatchCount: number;
  }>
> {
  const dateFormat = getDateFormat(granularity);
  const sqlParts = buildDepartureBatchTrendSqlParts({
    startDate: filters.startDate,
    endDate: filters.endDate,
  });
  const rows = await queryRows<DashboardDepartureBatchTrendSqlRow>(
    `SELECT
       DATE_FORMAT(${DEPARTURE_BATCH_BUCKET_DATE_SQL}, ?) AS period_label,
       MIN(${DEPARTURE_BATCH_BUCKET_DATE_SQL}) AS min_bucket,
       MAX(${DEPARTURE_BATCH_BUCKET_DATE_SQL}) AS max_bucket,
       COUNT(DISTINCT NULLIF(TRIM(w.waybill_number), '')) AS departure_batch_count
     ${sqlParts.fromSql}
     ${sqlParts.whereSql}
     GROUP BY DATE_FORMAT(${DEPARTURE_BATCH_BUCKET_DATE_SQL}, ?)
     ORDER BY MIN(${DEPARTURE_BATCH_BUCKET_DATE_SQL}) ASC`,
    [dateFormat, ...sqlParts.params, dateFormat]
  );

  return rows.map((row) => ({
    periodLabel: String(row.period_label || ""),
    minBucket: normalizeDashboardDateValue(row.min_bucket) ?? "",
    maxBucket: normalizeDashboardDateValue(row.max_bucket) ?? "",
    departureBatchCount: Number(row.departure_batch_count) || 0,
  }));
}

interface DashboardDepartureBatchTrendReader {
  getDepartureBatchTrendRows(
    filters: DashboardDepartureBatchTrendFilters,
    granularity: DashboardGranularity
  ): Promise<
    Array<{
      periodLabel: string;
      minBucket: string;
      maxBucket: string;
      departureBatchCount: number;
    }>
  >;
}

/**
 * 合作方=融满（`revenue_records.financier_name`）下，按 **批次号** `waybills.waybill_number` 去重后的「发车车次数」趋势。
 * - 时间窗默认与 `business-scale-trend` 相同（最近 8 周），但筛选与分桶使用 **发车日/创建日**（见 `DEPARTURE_BATCH_BUCKET_DATE_SQL`），**不是** `revenue_date`。
 * - `granularity` 未传或非法时默认 `week`。
 */
export async function getDashboardDepartureBatchTrend(
  filters: DashboardDepartureBatchTrendFilters = {},
  deps: DashboardDepartureBatchTrendReader = {
    getDepartureBatchTrendRows: queryDashboardDepartureBatchTrendRows,
  }
): Promise<DashboardDepartureBatchTrend> {
  const { granularity, usedDefault } =
    normalizeBusinessScaleTrendGranularity(filters.granularity);

  const hasCustomRange = Boolean(filters.startDate || filters.endDate);
  let effectiveFilters: DashboardDepartureBatchTrendFilters = { ...filters };
  let dateScope: DashboardDepartureBatchTrendDateScope = "custom";

  if (!hasCustomRange) {
    const { startDate, endDate } = getDefaultLast8WeeksDateRange();
    effectiveFilters = {
      ...filters,
      startDate,
      endDate,
    };
    dateScope = "last8weeks";
  }

  const usedDefaultDateRange = !hasCustomRange;
  const normStart = normalizeDashboardDateValue(effectiveFilters.startDate);
  const normEnd = normalizeDashboardDateValue(effectiveFilters.endDate);

  const rawRows = await deps.getDepartureBatchTrendRows(
    effectiveFilters,
    granularity
  );

  const items: DashboardDepartureBatchTrendItem[] = rawRows.map((r) => {
    if (granularity === "day") {
      return {
        periodLabel: r.periodLabel,
        startDate: r.periodLabel,
        endDate: r.periodLabel,
        departureBatchCount: r.departureBatchCount,
      };
    }
    if (granularity === "month") {
      const { startDate, endDate } = getMonthPeriodBounds(
        r.periodLabel,
        normStart,
        normEnd
      );
      return {
        periodLabel: r.periodLabel,
        startDate,
        endDate,
        departureBatchCount: r.departureBatchCount,
      };
    }
    const { startDate, endDate } = clampBucketBounds(
      r.minBucket,
      r.maxBucket,
      normStart,
      normEnd
    );
    return {
      periodLabel: r.periodLabel,
      startDate,
      endDate,
      departureBatchCount: r.departureBatchCount,
    };
  });

  return {
    dateScope,
    startDate: effectiveFilters.startDate,
    endDate: effectiveFilters.endDate,
    usedDefaultDateRange,
    granularity,
    usedDefaultGranularity: usedDefault,
    items,
  };
}

export async function getDashboardPartnerTop(
  filters: DashboardRankFilters = {},
  deps: DashboardDimensionReader = {
    getDimensionTopRows: queryDashboardDimensionTopRows,
  }
): Promise<{
  dimension: "partner";
  sortBy: DashboardSortBy;
  items: DashboardPartnerTopItem[];
}> {
  const sortBy = normalizeSortBy(filters.sortBy);
  const rows = await deps.getDimensionTopRows(
    {
      ...filters,
      sortBy,
      limit: normalizeLimit(filters.limit, 10),
    },
    "partner"
  );

  return {
    dimension: "partner",
    sortBy,
    items: rows.map((row) => {
      const waybillCount = Number(row.waybillCount) || 0;
      const platformIncome = roundMoney(row.platformIncome);
      return {
        partnerName: normalizeName(row.name, PARTNER_FALLBACK_NAME),
        waybillCount,
        grossFreightAmount: roundMoney(row.grossFreightAmount),
        platformIncome,
        avgIncomePerWaybill:
          waybillCount > 0 ? roundMoney(platformIncome / waybillCount) : 0,
      };
    }),
  };
}

export async function getDashboardLandingPartnerTop(
  filters: DashboardRankFilters = {},
  deps: DashboardDimensionReader = {
    getDimensionTopRows: queryDashboardDimensionTopRows,
  }
): Promise<{
  dimension: "landingPartner";
  sortBy: DashboardSortBy;
  items: DashboardLandingPartnerTopItem[];
}> {
  const sortBy = normalizeSortBy(filters.sortBy);
  const rows = await deps.getDimensionTopRows(
    {
      ...filters,
      sortBy,
      limit: normalizeLimit(filters.limit, 10),
    },
    "landingPartner"
  );

  return {
    dimension: "landingPartner",
    sortBy,
    items: rows.map((row) => {
      const waybillCount = Number(row.waybillCount) || 0;
      const platformIncome = roundMoney(row.platformIncome);
      return {
        landingPartnerName: normalizeName(
          row.name,
          LANDING_PARTNER_FALLBACK_NAME
        ),
        waybillCount,
        grossFreightAmount: roundMoney(row.grossFreightAmount),
        platformIncome,
        avgIncomePerWaybill:
          waybillCount > 0 ? roundMoney(platformIncome / waybillCount) : 0,
      };
    }),
  };
}

export async function getDashboardIncomeStructure(
  filters: DashboardAggregateFilters = {},
  deps: DashboardOverviewReader = {
    getOverviewStats: queryDashboardOverviewStats,
  }
): Promise<DashboardIncomeStructure> {
  const stats = await deps.getOverviewStats(filters);

  return {
    items: [
      {
        name: "待结算收益",
        value: roundMoney(stats.pendingSettlementIncome),
      },
      {
        name: "已结算收益",
        value: roundMoney(stats.settledIncome),
      },
    ],
  };
}

export async function getDashboardSettlementProgress(
  filters: DashboardAggregateFilters = {},
  deps: DashboardSettlementProgressReader = {
    getSettlementProgressRows: queryDashboardSettlementProgressRows,
  }
): Promise<DashboardSettlementProgress> {
  const stats = await deps.getSettlementProgressRows(filters);

  return {
    recordProgress: [
      {
        stage: "收益记录",
        count: Number(stats.total?.count) || 0,
        amount: roundMoney(stats.total?.amount),
      },
      {
        stage: "已生成对账单",
        count: Number(stats.reconciliationCreated?.count) || 0,
        amount: roundMoney(stats.reconciliationCreated?.amount),
      },
      {
        stage: "对账完成",
        count: Number(stats.reconciled?.count) || 0,
        amount: roundMoney(stats.reconciled?.amount),
      },
      {
        stage: "已生成结算单",
        count: Number(stats.settlementGenerated?.count) || 0,
        amount: roundMoney(stats.settlementGenerated?.amount),
      },
      {
        stage: "已入账",
        count: Number(stats.accounted?.count) || 0,
        amount: roundMoney(stats.accounted?.amount),
      },
    ],
  };
}

export async function getDashboardPartnerEfficiency(
  filters: DashboardEfficiencyFilters = {},
  deps: DashboardEfficiencyReader = {
    getPartnerEfficiencyRows: queryDashboardPartnerEfficiencyRows,
  }
): Promise<DashboardPartnerEfficiency> {
  const rows = await deps.getPartnerEfficiencyRows({
    ...filters,
    limit: normalizeLimit(filters.limit, 50),
  });

  return {
    items: rows.map((row) => ({
      partnerName: normalizeName(row.name, PARTNER_FALLBACK_NAME),
      xWaybillCount: Number(row.waybillCount) || 0,
      yPlatformIncome: roundMoney(row.platformIncome),
      bubbleGrossFreightAmount: roundMoney(row.grossFreightAmount),
    })),
  };
}

interface DashboardRegionFactReader {
  getRegionFactRows(
    filters: DashboardAggregateFilters
  ): Promise<DashboardRegionFactRow[]>;
}

function aggregateDashboardRegionSummary(
  rows: DashboardRegionFactRow[]
): DashboardRegionSummaryItem[] {
  type Bucket = {
    waybills: Set<string>;
    platformIncome: number;
    landingPartners: Set<string>;
    routes: Set<string>;
  };

  const map = new Map<string, Bucket>();

  for (const row of rows) {
    const norm = normalizeDashboardRegionName(
      row.financier_name,
      row.raw_area_name
    );
    const key = `${norm.regionName}\u0000${norm.provinceName}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        waybills: new Set(),
        platformIncome: 0,
        landingPartners: new Set(),
        routes: new Set(),
      };
      map.set(key, bucket);
    }

    bucket.platformIncome += Number(row.amount) || 0;

    if (row.waybill_id != null && String(row.waybill_id).trim() !== "") {
      bucket.waybills.add(String(row.waybill_id));
    }

    const lpKey = landingPartnerDedupeKey(
      row.landing_partner_id,
      row.landing_partner_name
    );
    if (lpKey) {
      bucket.landingPartners.add(lpKey);
    }

    if (row.route_id != null && String(row.route_id).trim() !== "") {
      bucket.routes.add(String(row.route_id));
    }
  }

  const items: DashboardRegionSummaryItem[] = [];
  for (const [key, bucket] of map) {
    const [regionName, provinceName] = key.split("\u0000");
    const platformIncome = roundMoney(bucket.platformIncome);
    const activeRouteCount = bucket.routes.size;
    items.push({
      regionName,
      provinceName,
      waybillCount: bucket.waybills.size,
      platformIncome,
      landingPartnerCount: bucket.landingPartners.size,
      routeCount: activeRouteCount,
      activeRouteCount,
      displayText: buildRegionSummaryDisplayText(
        provinceName,
        platformIncome,
        activeRouteCount
      ),
    });
  }

  items.sort((a, b) => {
    if (b.platformIncome !== a.platformIncome) {
      return b.platformIncome - a.platformIncome;
    }
    if (b.waybillCount !== a.waybillCount) {
      return b.waybillCount - a.waybillCount;
    }
    return a.regionName.localeCompare(b.regionName, "zh-Hans-CN");
  });

  return items;
}

function aggregateDashboardRegionBusinessScaleByCity(
  rows: DashboardRegionFactRow[]
): DashboardBusinessScaleByCityItem[] {
  type Bucket = { grossFreightAmount: number; waybills: Set<string> };
  const map = new Map<string, Bucket>();

  for (const row of rows) {
    const norm = normalizeDashboardRegionName(
      row.financier_name,
      row.raw_area_name
    );
    const key = `${norm.regionName}\u0000${norm.provinceName}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { grossFreightAmount: 0, waybills: new Set() };
      map.set(key, bucket);
    }
    bucket.grossFreightAmount += Number(row.gross_freight_amount) || 0;
    if (row.waybill_id != null && String(row.waybill_id).trim() !== "") {
      bucket.waybills.add(String(row.waybill_id));
    }
  }

  const items: DashboardBusinessScaleByCityItem[] = [];
  for (const [key, bucket] of map) {
    const [regionName, provinceName] = key.split("\u0000");
    items.push({
      regionName,
      provinceName,
      waybillCount: bucket.waybills.size,
      grossFreightAmount: roundMoney(bucket.grossFreightAmount),
    });
  }

  const filtered = items.filter(
    (item) =>
      item.regionName !== DASHBOARD_REGION_FALLBACK_CITY &&
      item.provinceName !== DASHBOARD_REGION_UNKNOWN_PROVINCE
  );

  filtered.sort((a, b) => {
    if (b.grossFreightAmount !== a.grossFreightAmount) {
      return b.grossFreightAmount - a.grossFreightAmount;
    }
    if (b.waybillCount !== a.waybillCount) {
      return b.waybillCount - a.waybillCount;
    }
    return a.regionName.localeCompare(b.regionName, "zh-Hans-CN");
  });

  return filtered;
}

/**
 * 区域汇总（地图）：与 overview 等接口同一套 revenue_records 事实与日期/筛选条件。
 * 默认未传日期时：近 7 天（含今天），见 getDefaultLast7DaysDateRange。
 */
export async function getDashboardRegionSummary(
  filters: DashboardAggregateFilters = {},
  deps: DashboardRegionFactReader = {
    getRegionFactRows: queryDashboardRegionFactRows,
  }
): Promise<DashboardRegionSummary> {
  const hasCustomRange = Boolean(filters.startDate || filters.endDate);
  let effectiveFilters: DashboardAggregateFilters = { ...filters };
  let dateScope: DashboardRegionSummaryDateScope = "custom";

  if (!hasCustomRange) {
    const { startDate, endDate } = getDefaultLast7DaysDateRange();
    effectiveFilters = {
      ...filters,
      startDate,
      endDate,
    };
    dateScope = "last7days";
  }

  const rows = await deps.getRegionFactRows(effectiveFilters);
  const aggregated = aggregateDashboardRegionSummary(rows);
  // 地图展示层输出过滤：无城市语义或未配置省份映射的桶不交给山海鲸主视觉渲染
  const items = aggregated.filter(
    (item) =>
      item.regionName !== DASHBOARD_REGION_FALLBACK_CITY &&
      item.provinceName !== DASHBOARD_REGION_UNKNOWN_PROVINCE
  );

  return {
    dateScope,
    startDate: effectiveFilters.startDate,
    endDate: effectiveFilters.endDate,
    items,
  };
}

/**
 * 城市维度业务规模（grossFreightAmount + waybillCount）：与 region-summary **同一套**区域标准化
 *（`normalizeDashboardRegionName`）与输出过滤；`grossFreightAmount` 口径与 overview / business-trend 一致；
 * `waybillCount` 与 region-summary 相同，按 `waybill_id` 去重。
 * 未传日期时默认最近 30 天（含今天），见 getDefaultLast30DaysDateRange；`usedDefaultDateRange` 与此对应。
 */
export async function getDashboardBusinessScaleByCity(
  filters: DashboardAggregateFilters = {},
  deps: DashboardRegionFactReader = {
    getRegionFactRows: queryDashboardRegionFactRows,
  }
): Promise<DashboardBusinessScaleByCity> {
  const hasCustomRange = Boolean(filters.startDate || filters.endDate);
  let effectiveFilters: DashboardAggregateFilters = { ...filters };
  let dateScope: DashboardBusinessScaleByCityDateScope = "custom";

  if (!hasCustomRange) {
    const { startDate, endDate } = getDefaultLast30DaysDateRange();
    effectiveFilters = {
      ...filters,
      startDate,
      endDate,
    };
    dateScope = "last30days";
  }

  const usedDefaultDateRange = !hasCustomRange;

  const rows = await deps.getRegionFactRows(effectiveFilters);
  const items = aggregateDashboardRegionBusinessScaleByCity(rows);

  return {
    dateScope,
    startDate: effectiveFilters.startDate,
    endDate: effectiveFilters.endDate,
    usedDefaultDateRange,
    items,
  };
}

/**
 * 按线路汇总撮合运费 `grossFreightAmount`（与 overview / `business-scale-by-city` 相同：`GROSS_FREIGHT_SQL`）。
 * - 未同时缺省两端日期：与 `business-scale-by-city` 一致——**至少传入** `startDate` 或 `endDate` 之一即视为自定义窗，缺省的一端不在 SQL 中加边界（全历史开放侧）。
 * - 两端均未传：`startDate`=`2026-03-01`，`endDate`=今天，`dateScope`=`fixedStartToToday`，`usedDefaultDateRange`=true。
 * - 分组：有 `rr.route_id` 时按**线路 id** 一桶（展示名取 `routes.name`）；无 id 时按运单 `vehicle_route` 文本分桶（展示同文本，无则 `未命名线路`），`routeId` 回 `null`。
 */
export async function getDashboardBusinessScaleByRoute(
  filters: DashboardAggregateFilters = {},
  deps: DashboardBusinessScaleByRouteReader = {
    getBusinessScaleByRouteRows: queryDashboardBusinessScaleByRouteRows,
  }
): Promise<DashboardBusinessScaleByRoute> {
  const hasCustomRange = Boolean(filters.startDate || filters.endDate);
  let effectiveFilters: DashboardAggregateFilters = { ...filters };
  let dateScope: DashboardBusinessScaleByRouteDateScope = "custom";

  if (!hasCustomRange) {
    const { startDate, endDate } = getDefaultBusinessScaleByRouteDateRange();
    effectiveFilters = {
      ...filters,
      startDate,
      endDate,
    };
    dateScope = "fixedStartToToday";
  }

  const usedDefaultDateRange = !hasCustomRange;
  const rows = await deps.getBusinessScaleByRouteRows(effectiveFilters);
  const items: DashboardBusinessScaleByRouteItem[] = rows.map((row) => ({
    routeId:
      row.route_id == null || String(row.route_id).trim() === ""
        ? null
        : String(row.route_id),
    routeName: normalizeName(row.route_name, "未命名线路"),
    grossFreightAmount: roundMoney(row.gross_freight_amount),
  }));

  return {
    dateScope,
    startDate: effectiveFilters.startDate,
    endDate: effectiveFilters.endDate,
    usedDefaultDateRange,
    items,
  };
}
