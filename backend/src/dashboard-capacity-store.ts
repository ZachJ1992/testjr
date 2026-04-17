/**
 * 运力中枢（Capacity Dashboard）数据层。
 *
 * 与「经营中枢」彻底解耦：
 * - 不读取 `revenue_records`、不按抽成/收益口径聚合。
 * - 仅以 `waybills` 为主事实，辅以 `financiers` / `routes` / `local_partners` / `areas` 做区域与线路解析。
 *
 * 默认时间窗：未传 `startDate`/`endDate` 时，与经营侧「城市业务规模」习惯对齐，为**含当日起共 30 个自然日**
 *（今天往前 29 天～今天，按服务器本地日历）。见 `resolveCapacityDateRange`。
 */

import type { RowDataPacket } from "mysql2";

import { pool } from "./db.js";
import {
  DASHBOARD_CITY_TO_PROVINCE,
  DASHBOARD_REGION_FALLBACK_CITY,
  DASHBOARD_REGION_UNKNOWN_PROVINCE,
  normalizeDashboardRegionName,
} from "./dashboard-region.js";
import { DASHBOARD_REGION_SUMMARY_TEMPLATE } from "./dashboard-region-summary-template.js";

// ---------------------------------------------------------------------------
// 公共口径说明（首版代理指标，非 TMS 实时真值）
// ---------------------------------------------------------------------------

/** 首版无法在库内可靠定义「在途」枚举，故不在接口中给出伪数值。 */
export const CAPACITY_IN_TRANSIT_UNSUPPORTED_NOTE =
  "首版不提供 inTransitVehicleCount：缺少统一的在途状态机与车联网上报字段；如需该指标需业务定义 batch_status 等枚举后再实现。";

/** 车辆数：按 DISTINCT vehicle_plate，空车牌不计入。 */
/** 网点数：按 DISTINCT branch，空 branch 不计入。 */
/** 专线数：有 routes.id 时按 route_id 去重；否则按发站到站拼接的 routeDirectionName 去重（代理专线/方向桶）。 */

/** 与经营地图 `includeZeroRegions` 一致的零数据兜底展示句（运力 province-map 复用）。 */
export const CAPACITY_REGION_PENDING_DISPLAY_TEXT = "该区域数据持续接入中";

/** 未传或非法 `rotationIntervalSeconds` 时的默认轮播周期（秒）。 */
export const CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS = 5;

/** 轮播周期合法下限（秒）。 */
export const CAPACITY_REGION_DETAIL_ROTATION_MIN_SECONDS = 1;

/** 轮播周期合法上限（秒），防止误传极大值。 */
export const CAPACITY_REGION_DETAIL_ROTATION_MAX_SECONDS = 600;

/**
 * 将 query / 配置中的轮播周期解析为**最终生效**的整秒数。
 * - `undefined` / `null` / 空串 / 非有限数字 / `<= 0`：回落到 `CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS`
 * - 正数先 `Math.floor`，再夹在 `[MIN, MAX]`
 */
export function resolveCapacityRegionDetailRotationIntervalSeconds(
  raw: unknown
): number {
  const d = CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS;
  const min = CAPACITY_REGION_DETAIL_ROTATION_MIN_SECONDS;
  const max = CAPACITY_REGION_DETAIL_ROTATION_MAX_SECONDS;

  if (raw === undefined || raw === null) return d;

  let v: unknown = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v === "string") {
    v = v.trim();
    if (v === "") return d;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return d;
  const sec = Math.floor(n);
  if (sec <= 0) return d;
  if (sec < min) return min;
  if (sec > max) return max;
  return sec;
}

/**
 * 发/到站文本 → 展示城市名（启发式，非地址解析引擎）。
 * - 在 `DASHBOARD_CITY_TO_PROVINCE` 的**城市键**中按长度降序做子串包含匹配，命中则输出标准城市名。
 * - 未命中则 **city 与 raw 同为原文**，不伪造行政区划；存在误匹配风险（如路名含「南京」），大屏需知悉。
 */
export function normalizePlaceToDisplayCity(raw: string | null | undefined): {
  city: string;
  raw: string;
  normalization: "known_city_substring" | "raw_fallback";
} {
  const t = String(raw ?? "").trim();
  if (!t) {
    return { city: "", raw: "", normalization: "raw_fallback" };
  }
  const keys = Object.keys(DASHBOARD_CITY_TO_PROVINCE).sort(
    (a, b) => b.length - a.length
  );
  for (const city of keys) {
    if (t.includes(city)) {
      return { city, raw: t, normalization: "known_city_substring" };
    }
  }
  return { city: t, raw: t, normalization: "raw_fallback" };
}

/** 全国运力地图固定省级顺序（与产品底表一致，去重保序）。 */
export function capacityProvinceMapTemplateOrder(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of DASHBOARD_REGION_SUMMARY_TEMPLATE) {
    if (!seen.has(row.provinceName)) {
      seen.add(row.provinceName);
      out.push(row.provinceName);
    }
  }
  return out;
}

export interface CapacityDateFilters {
  startDate?: string;
  endDate?: string;
}

export interface CapacityResolvedDateRange {
  startDate: string;
  endDate: string;
  /** 与经营大屏 `business-scale-by-city` 默认窗对齐：未传两端日期时为 true */
  usedDefaultDateRange: boolean;
}

/** 解析 YYYY-MM-DD；非法则返回 undefined */
export function parseCapacityDateOnly(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(Array.isArray(value) ? value[0] : value).trim();
  const m = /^(\d{4}-\d{2}-\d{2})$/.exec(s);
  return m ? m[1] : undefined;
}

function formatLocalDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 默认统计窗口：含今天在共 30 天（今天往前 29 天～今天）。
 * 与 `dashboard-store.getDefaultLast30DaysDateRange` 日历算法一致，但不 import 经营 store 以免耦合。
 */
export function getCapacityDefaultLast30DaysDateRange(now: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const endDate = formatLocalDateOnly(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const startDate = formatLocalDateOnly(start);
  return { startDate, endDate };
}

export function resolveCapacityDateRange(
  filters: CapacityDateFilters,
  now: Date = new Date()
): CapacityResolvedDateRange {
  const startRaw = parseCapacityDateOnly(filters.startDate);
  const endRaw = parseCapacityDateOnly(filters.endDate);
  const hasAny = Boolean(startRaw || endRaw);
  if (!hasAny) {
    const { startDate, endDate } = getCapacityDefaultLast30DaysDateRange(now);
    return { startDate, endDate, usedDefaultDateRange: true };
  }
  const endDate = endRaw ?? startRaw!;
  const startDate = startRaw ?? endRaw!;
  if (startDate > endDate) {
    return { startDate: endDate, endDate: startDate, usedDefaultDateRange: false };
  }
  return { startDate, endDate, usedDefaultDateRange: false };
}

/**
 * 运力业务日 SQL 表达式（与经营「发车批次趋势」分桶思想相近，但不读取收益表）。
 * 优先级：departure_time 日历日 → created_time 日历日 → waybill_date → created_at 日历日。
 */
export function capacityBusinessDayExpr(alias: string = "w"): string {
  return `COALESCE(
    DATE(NULLIF(TRIM(${alias}.departure_time), '')),
    DATE(NULLIF(TRIM(${alias}.created_time), '')),
    ${alias}.waybill_date,
    DATE(${alias}.created_at)
  )`;
}

const CAPACITY_WAYBILL_JOIN_SQL = `
  FROM waybills w
  LEFT JOIN financiers f ON w.customer_id = f.id
  LEFT JOIN routes rt
    ON rt.name = COALESCE(NULLIF(TRIM(w.sub_financier), ''), NULLIF(TRIM(w.branch), ''))
  LEFT JOIN local_partners lp
    ON rt.local_partner_id = lp.id AND lp.financier_id = w.customer_id
  LEFT JOIN areas ar ON lp.area_id = ar.id
`;

/** 区域标准化：与经营地图共用 `normalizeDashboardRegionName`（areas.name + 合作方名），不伪造未映射省份。 */
export function capacityRegionFromRow(
  financierName: string | null,
  rawAreaName: string | null
): { regionName: string; provinceName: string } {
  return normalizeDashboardRegionName(financierName, rawAreaName);
}

export interface CapacityWaybillFactRow {
  businessDay: string;
  vehiclePlate: string | null;
  branch: string | null;
  routeId: string | null;
  routeName: string | null;
  departurePlace: string | null;
  arrivalPlace: string | null;
  financierName: string | null;
  rawAreaName: string | null;
}

export interface CapacityEnrichedFact extends CapacityWaybillFactRow {
  regionName: string;
  provinceName: string;
}

export function routeDirectionNameFromFact(f: CapacityWaybillFactRow): string {
  if (f.routeId) {
    if (f.routeName && f.routeName.trim()) {
      return f.routeName.trim();
    }
    /** 有 route_id 但缺 name 时：不伪造线路汉字名，用稳定技术标识占位 */
    return `route:${f.routeId}`;
  }
  const a = (f.departurePlace ?? "").trim() || "未知发站";
  const b = (f.arrivalPlace ?? "").trim() || "未知到站";
  return `${a}→${b}`;
}

/** 专线去重键：route_id 优先，否则方向文本。 */
export function capacityRouteDedupeKey(f: CapacityWaybillFactRow): string {
  if (f.routeId) {
    return `id:${f.routeId}`;
  }
  return `dir:${routeDirectionNameFromFact(f)}`;
}

function mapFactRow(row: RowDataPacket): CapacityWaybillFactRow {
  const bd = row.business_day;
  const businessDay =
    bd instanceof Date
      ? formatLocalDateOnly(bd)
      : String(bd ?? "").slice(0, 10);
  return {
    businessDay,
    vehiclePlate: row.vehicle_plate == null ? null : String(row.vehicle_plate),
    branch: row.branch == null ? null : String(row.branch),
    routeId: row.route_id == null ? null : String(row.route_id),
    routeName: row.route_name == null ? null : String(row.route_name),
    departurePlace: row.departure_place == null ? null : String(row.departure_place),
    arrivalPlace: row.arrival_place == null ? null : String(row.arrival_place),
    financierName: row.financier_name == null ? null : String(row.financier_name),
    rawAreaName: row.raw_area_name == null ? null : String(row.raw_area_name),
  };
}

async function queryRows<T extends RowDataPacket>(
  sql: string,
  params: Array<string | number>
): Promise<T[]> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows as T[];
}

/**
 * 拉取时间窗内运单行（每行一笔运单），供各运力接口在内存中聚合。
 * 代理说明：同一运单仅出现在其 business_day 落入窗口的那一天（不因多日轨迹膨胀）。
 */
export async function queryCapacityWaybillFacts(
  range: CapacityResolvedDateRange
): Promise<CapacityWaybillFactRow[]> {
  const dayExpr = capacityBusinessDayExpr("w");
  const sql = `
    SELECT
      ${dayExpr} AS business_day,
      NULLIF(TRIM(w.vehicle_plate), '') AS vehicle_plate,
      NULLIF(TRIM(w.branch), '') AS branch,
      rt.id AS route_id,
      NULLIF(TRIM(rt.name), '') AS route_name,
      NULLIF(TRIM(w.departure_place), '') AS departure_place,
      NULLIF(TRIM(w.arrival_place), '') AS arrival_place,
      NULLIF(TRIM(f.enterprise_name), '') AS financier_name,
      NULLIF(TRIM(ar.name), '') AS raw_area_name
    ${CAPACITY_WAYBILL_JOIN_SQL}
    WHERE w.deleted_at IS NULL
      AND ${dayExpr} >= ?
      AND ${dayExpr} <= ?
  `;
  const rows = await queryRows<RowDataPacket>(sql, [range.startDate, range.endDate]);
  return rows.map(mapFactRow);
}

export function enrichCapacityFacts(
  facts: CapacityWaybillFactRow[]
): CapacityEnrichedFact[] {
  return facts.map((f) => {
    const { regionName, provinceName } = capacityRegionFromRow(
      f.financierName,
      f.rawAreaName
    );
    return { ...f, regionName, provinceName };
  });
}

// --- overview ----------------------------------------------------------------

export interface CapacityOverview {
  dateScope: CapacityResolvedDateRange;
  /** DISTINCT 标准化城市名（regionName），排除「未维护区域」占位 */
  coveredCityCount: number;
  /** DISTINCT vehicle_plate，空车牌不计 */
  activeVehicleCount: number;
  /** 专线去重：route_id 优先，否则方向文本键 */
  activeRouteCount: number;
  /** DISTINCT branch，空不计 */
  activeOutletCount: number;
  /** 首版固定 null：不提供伪在途 */
  inTransitVehicleCount: null;
  inTransitVehicleAvailability: "unsupported_v1";
  inTransitVehicleNote: string;
}

export function aggregateCapacityOverview(
  enriched: CapacityEnrichedFact[]
): Omit<CapacityOverview, "dateScope"> {
  const plates = new Set<string>();
  const branches = new Set<string>();
  const routes = new Set<string>();
  const cities = new Set<string>();

  for (const r of enriched) {
    if (r.vehiclePlate) plates.add(r.vehiclePlate);
    if (r.branch) branches.add(r.branch);
    routes.add(capacityRouteDedupeKey(r));
    if (r.regionName && r.regionName !== DASHBOARD_REGION_FALLBACK_CITY) {
      cities.add(r.regionName);
    }
  }

  return {
    coveredCityCount: cities.size,
    activeVehicleCount: plates.size,
    activeRouteCount: routes.size,
    activeOutletCount: branches.size,
    inTransitVehicleCount: null,
    inTransitVehicleAvailability: "unsupported_v1",
    inTransitVehicleNote: CAPACITY_IN_TRANSIT_UNSUPPORTED_NOTE,
  };
}

export async function getCapacityOverview(
  filters: CapacityDateFilters = {}
): Promise<CapacityOverview> {
  const dateScope = resolveCapacityDateRange(filters);
  const facts = await queryCapacityWaybillFacts(dateScope);
  const agg = aggregateCapacityOverview(enrichCapacityFacts(facts));
  return { dateScope, ...agg };
}

// --- province-map ------------------------------------------------------------

export interface CapacityProvinceMapItem {
  provinceName: string;
  /** 时间窗内落入该省的运单行数（用于零数据判断与兜底展示） */
  waybillCount: number;
  activeVehicleCount: number;
  activeRouteCount: number;
  activeOutletCount: number;
  coveredCityCount: number;
  displayText: string;
  /**
   * true：该省行**仅由固定底表补齐**且本窗内 `waybillCount === 0`。
   * false：存在真实运单聚合，或该省不在底表顺序中（如「未知」等数据溢出省）。
   */
  isFallback: boolean;
}

function buildProvinceDisplayText(item: {
  provinceName: string;
  activeVehicleCount: number;
  activeOutletCount: number;
  activeRouteCount: number;
}): string {
  return `${item.provinceName}｜活跃车辆，${item.activeVehicleCount} 辆｜活跃网点，${item.activeOutletCount} 个｜活跃专线，${item.activeRouteCount} 条`;
}

export function aggregateCapacityProvinceMap(
  enriched: CapacityEnrichedFact[]
): CapacityProvinceMapItem[] {
  type Bucket = {
    waybillCount: number;
    plates: Set<string>;
    branches: Set<string>;
    routes: Set<string>;
    cities: Set<string>;
  };
  const map = new Map<string, Bucket>();

  for (const r of enriched) {
    const p = r.provinceName;
    let b = map.get(p);
    if (!b) {
      b = {
        waybillCount: 0,
        plates: new Set(),
        branches: new Set(),
        routes: new Set(),
        cities: new Set(),
      };
      map.set(p, b);
    }
    b.waybillCount += 1;
    if (r.vehiclePlate) b.plates.add(r.vehiclePlate);
    if (r.branch) b.branches.add(r.branch);
    b.routes.add(capacityRouteDedupeKey(r));
    if (r.regionName && r.regionName !== DASHBOARD_REGION_FALLBACK_CITY) {
      b.cities.add(r.regionName);
    }
  }

  const items: CapacityProvinceMapItem[] = [];
  for (const [provinceName, b] of map) {
    const row: CapacityProvinceMapItem = {
      provinceName,
      waybillCount: b.waybillCount,
      activeVehicleCount: b.plates.size,
      activeRouteCount: b.routes.size,
      activeOutletCount: b.branches.size,
      coveredCityCount: b.cities.size,
      displayText: "",
      isFallback: false,
    };
    row.displayText =
      row.waybillCount === 0
        ? CAPACITY_REGION_PENDING_DISPLAY_TEXT
        : buildProvinceDisplayText(row);
    items.push(row);
  }

  items.sort((a, b) => {
    if (b.activeVehicleCount !== a.activeVehicleCount) {
      return b.activeVehicleCount - a.activeVehicleCount;
    }
    return a.provinceName.localeCompare(b.provinceName, "zh-Hans-CN");
  });
  return items;
}

/**
 * 在 **store 聚合层** 将 `aggregateCapacityProvinceMap` 结果与固定省级底表合并（非 SQL）。
 * - 底表顺序见 `DASHBOARD_REGION_SUMMARY_TEMPLATE` 去重省序。
 * - 真实有数据省覆盖同省桶；底表有而真实无则补 0 行，`displayText` 为接入中，`isFallback=true`。
 * - 不在底表中的省（如「未知」）追加在末尾。
 */
export function mergeCapacityProvinceMapWithFixedTemplate(
  aggregated: CapacityProvinceMapItem[]
): CapacityProvinceMapItem[] {
  const byProvince = new Map<string, CapacityProvinceMapItem>();
  for (const row of aggregated) {
    byProvince.set(row.provinceName, { ...row });
  }

  const templateOrder = capacityProvinceMapTemplateOrder();
  const result: CapacityProvinceMapItem[] = [];

  for (const provinceName of templateOrder) {
    const real = byProvince.get(provinceName);
    if (real) {
      result.push({
        ...real,
        displayText:
          real.waybillCount === 0
            ? CAPACITY_REGION_PENDING_DISPLAY_TEXT
            : buildProvinceDisplayText(real),
        isFallback: real.waybillCount === 0,
      });
      byProvince.delete(provinceName);
    } else {
      result.push({
        provinceName,
        waybillCount: 0,
        activeVehicleCount: 0,
        activeRouteCount: 0,
        activeOutletCount: 0,
        coveredCityCount: 0,
        displayText: CAPACITY_REGION_PENDING_DISPLAY_TEXT,
        isFallback: true,
      });
    }
  }

  const rest = [...byProvince.values()].sort((a, b) =>
    a.provinceName.localeCompare(b.provinceName, "zh-Hans-CN")
  );
  for (const row of rest) {
    result.push({
      ...row,
      displayText:
        row.waybillCount === 0
          ? CAPACITY_REGION_PENDING_DISPLAY_TEXT
          : buildProvinceDisplayText(row),
      /** 非底表补齐行：即使运单为 0 也标 false，表示来自真实聚合桶 */
      isFallback: false,
    });
  }

  return result;
}

export interface CapacityProvinceMap {
  dateScope: CapacityResolvedDateRange;
  /** 本接口始终合并固定省级底表，首屏省列表稳定 */
  usedFixedProvinceTemplate: true;
  items: CapacityProvinceMapItem[];
}

export async function getCapacityProvinceMap(
  filters: CapacityDateFilters = {}
): Promise<CapacityProvinceMap> {
  const dateScope = resolveCapacityDateRange(filters);
  const facts = await queryCapacityWaybillFacts(dateScope);
  const aggregated = aggregateCapacityProvinceMap(enrichCapacityFacts(facts));
  return {
    dateScope,
    usedFixedProvinceTemplate: true,
    items: mergeCapacityProvinceMapWithFixedTemplate(aggregated),
  };
}

// --- city-heat ---------------------------------------------------------------

export interface CapacityCityHeatItem {
  cityName: string;
  provinceName: string;
  activeVehicleCount: number;
  activeOutletCount: number;
  activeRouteCount: number;
}

export function aggregateCapacityCityHeat(
  enriched: CapacityEnrichedFact[]
): CapacityCityHeatItem[] {
  type B = { plates: Set<string>; branches: Set<string>; routes: Set<string> };
  const map = new Map<string, B>();
  const keyOf = (r: CapacityEnrichedFact) =>
    `${r.regionName}\u0000${r.provinceName}`;

  for (const r of enriched) {
    const k = keyOf(r);
    let b = map.get(k);
    if (!b) {
      b = { plates: new Set(), branches: new Set(), routes: new Set() };
      map.set(k, b);
    }
    if (r.vehiclePlate) b.plates.add(r.vehiclePlate);
    if (r.branch) b.branches.add(r.branch);
    b.routes.add(capacityRouteDedupeKey(r));
  }

  const items: CapacityCityHeatItem[] = [];
  for (const [k, b] of map) {
    const [cityName, provinceName] = k.split("\u0000");
    items.push({
      cityName,
      provinceName,
      activeVehicleCount: b.plates.size,
      activeOutletCount: b.branches.size,
      activeRouteCount: b.routes.size,
    });
  }
  items.sort((a, b) => {
    if (b.activeVehicleCount !== a.activeVehicleCount) {
      return b.activeVehicleCount - a.activeVehicleCount;
    }
    return a.cityName.localeCompare(b.cityName, "zh-Hans-CN");
  });
  return items;
}

export interface CapacityCityHeat {
  dateScope: CapacityResolvedDateRange;
  items: CapacityCityHeatItem[];
}

export async function getCapacityCityHeat(
  filters: CapacityDateFilters = {}
): Promise<CapacityCityHeat> {
  const dateScope = resolveCapacityDateRange(filters);
  const facts = await queryCapacityWaybillFacts(dateScope);
  return {
    dateScope,
    items: aggregateCapacityCityHeat(enrichCapacityFacts(facts)),
  };
}

// --- route-top ---------------------------------------------------------------

export interface CapacityRouteTopItem {
  routeDirectionName: string;
  waybillCount: number;
  activeVehicleCount: number;
}

export function aggregateCapacityRouteTop(
  facts: CapacityWaybillFactRow[],
  limit: number
): CapacityRouteTopItem[] {
  /** 分桶键与 activeRouteCount 一致：`id:route_id` 或 `dir:发→到` */
  type B = { waybills: number; plates: Set<string>; routeDirectionName: string };
  const map = new Map<string, B>();

  for (const f of facts) {
    const key = capacityRouteDedupeKey(f);
    const label = routeDirectionNameFromFact(f);
    let b = map.get(key);
    if (!b) {
      b = { waybills: 0, plates: new Set(), routeDirectionName: label };
      map.set(key, b);
    }
    b.waybills += 1;
    if (f.vehiclePlate) b.plates.add(f.vehiclePlate);
  }

  const items: CapacityRouteTopItem[] = [];
  for (const [, b] of map) {
    items.push({
      routeDirectionName: b.routeDirectionName,
      waybillCount: b.waybills,
      activeVehicleCount: b.plates.size,
    });
  }
  items.sort((a, b) => {
    if (b.waybillCount !== a.waybillCount) return b.waybillCount - a.waybillCount;
    return a.routeDirectionName.localeCompare(b.routeDirectionName, "zh-Hans-CN");
  });
  return items.slice(0, limit);
}

export interface CapacityRouteTop {
  dateScope: CapacityResolvedDateRange;
  limit: number;
  items: CapacityRouteTopItem[];
}

export async function getCapacityRouteTop(
  filters: CapacityDateFilters & { limit?: number } = {}
): Promise<CapacityRouteTop> {
  const dateScope = resolveCapacityDateRange(filters);
  const limit =
    Number.isFinite(filters.limit) && (filters.limit ?? 0) > 0
      ? Math.min(100, Math.floor(filters.limit as number))
      : 20;
  const facts = await queryCapacityWaybillFacts(dateScope);
  return {
    dateScope,
    limit,
    items: aggregateCapacityRouteTop(facts, limit),
  };
}

// --- region-detail -----------------------------------------------------------

export type CapacityRegionLevel = "province" | "city";

export interface CapacityRegionDetailTopDirection {
  routeDirectionName: string;
  waybillCount: number;
  activeVehicleCount: number;
}

/** 单条区域详情（不含 dateScope，避免与批量 items 重复） */
export interface CapacityRegionDetailItem {
  regionName: string;
  regionLevel: CapacityRegionLevel;
  provinceName: string;
  /** 当前区域子集内运单行数（与 `province-map` 的 waybillCount 计数口径一致） */
  waybillCount: number;
  activeVehicleCount: number;
  activeOutletCount: number;
  /**
   * 大屏口径：`waybillCount === 0` 或 `activeVehicleCount === 0` 时为 `0`；
   * 否则为 `waybillCount / activeVehicleCount`，**保留 1 位小数**。
   */
  avgWaybillsPerVehicle: number;
  /**
   * 大屏口径：`waybillCount === 0` 或 `activeOutletCount === 0` 时为 `0`；
   * 否则为 `waybillCount / activeOutletCount`，**保留 1 位小数**。
   */
  avgWaybillsPerOutlet: number;
  coveredCityCount: number;
  activeRouteCount: number;
  topRouteDirections: CapacityRegionDetailTopDirection[];
}

/** 区域详情接口统一外壳：联动筛选由山海鲸完成，后端只返回列表 */
export interface CapacityRegionDetailResponse {
  dateScope: CapacityResolvedDateRange;
  items: CapacityRegionDetailItem[];
}

/** `GET .../region-detail-current` 的 `data`：按时间桶轮播单条，无服务端游标。 */
export interface CapacityRegionDetailCurrentData {
  /** 规范化后的轮播周期（秒），与取模用 `rotationIntervalSeconds * 1000` ms 一致 */
  rotationIntervalSeconds: number;
  currentIndex: number;
  totalItems: number;
  item: CapacityRegionDetailItem | null;
}

export interface CapacityRegionDetailFilters extends CapacityDateFilters {
  /** 可选；不传则返回「全省」级条目列表（每省一条，顺序：底表省序 + 其它省字典序） */
  provinceName?: string;
  /** 若传则为城市桶；不传表示全省聚合 */
  regionName?: string;
  /** top 线路条数，默认 8 */
  topLimit?: number;
}

/** `region-detail-current` 在区域筛选参数之外，可带原始 query 的轮播周期。 */
export type CapacityRegionDetailCurrentFilters = CapacityRegionDetailFilters & {
  rotationIntervalSeconds?: unknown;
};

export function filterFactsForRegion(
  enriched: CapacityEnrichedFact[],
  provinceName: string,
  regionName?: string
): CapacityEnrichedFact[] {
  const p = provinceName.trim();
  const c = regionName?.trim();
  return enriched.filter((r) => {
    if (r.provinceName !== p) return false;
    if (c && r.regionName !== c) return false;
    return true;
  });
}

/** 区域详情「全省列表」省份顺序：固定底表省序 ∪ 数据中出现的其它省 */
export function listCapacityRegionDetailProvinceNames(
  enriched: CapacityEnrichedFact[]
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const p of capacityProvinceMapTemplateOrder()) {
    if (!seen.has(p)) {
      seen.add(p);
      ordered.push(p);
    }
  }
  const extras = new Set<string>();
  for (const r of enriched) {
    if (!seen.has(r.provinceName)) {
      extras.add(r.provinceName);
    }
  }
  const extraSorted = [...extras].sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN")
  );
  return [...ordered, ...extraSorted];
}

/**
 * 区域详情卡均单（大屏）：`waybillCount === 0` 返回 `0`；分母 `<= 0` 返回 `0`；
 * 否则返回商并保留 1 位小数（不返回 `null`）。
 */
export function capacityRegionDetailAvgRatio(
  waybillCount: number,
  denominatorCount: number
): number {
  if (waybillCount === 0) return 0;
  if (denominatorCount <= 0) return 0;
  return Number((waybillCount / denominatorCount).toFixed(1));
}

export function buildCapacityRegionDetailItem(
  provinceName: string,
  regionName: string | undefined,
  enriched: CapacityEnrichedFact[],
  topLimit: number
): CapacityRegionDetailItem {
  const subset = filterFactsForRegion(enriched, provinceName, regionName);
  const level: CapacityRegionLevel = regionName?.trim() ? "city" : "province";
  const displayRegion = regionName?.trim() || provinceName.trim();

  const overview = aggregateCapacityOverview(subset);
  const waybillCount = subset.length;
  const avgWaybillsPerVehicle = capacityRegionDetailAvgRatio(
    waybillCount,
    overview.activeVehicleCount
  );
  const avgWaybillsPerOutlet = capacityRegionDetailAvgRatio(
    waybillCount,
    overview.activeOutletCount
  );
  const coveredCityCount =
    level === "city" ? (subset.length > 0 ? 1 : 0) : overview.coveredCityCount;

  const plainFacts: CapacityWaybillFactRow[] = subset.map((s) => ({
    businessDay: s.businessDay,
    vehiclePlate: s.vehiclePlate,
    branch: s.branch,
    routeId: s.routeId,
    routeName: s.routeName,
    departurePlace: s.departurePlace,
    arrivalPlace: s.arrivalPlace,
    financierName: s.financierName,
    rawAreaName: s.rawAreaName,
  }));

  return {
    regionName: displayRegion,
    regionLevel: level,
    provinceName: provinceName.trim(),
    waybillCount,
    activeVehicleCount: overview.activeVehicleCount,
    activeOutletCount: overview.activeOutletCount,
    avgWaybillsPerVehicle,
    avgWaybillsPerOutlet,
    coveredCityCount,
    activeRouteCount: overview.activeRouteCount,
    topRouteDirections: aggregateCapacityRouteTop(plainFacts, topLimit),
  };
}

export async function getCapacityRegionDetail(
  filters: CapacityRegionDetailFilters
): Promise<CapacityRegionDetailResponse> {
  const dateScope = resolveCapacityDateRange(filters);
  const topLimit =
    Number.isFinite(filters.topLimit) && (filters.topLimit ?? 0) > 0
      ? Math.min(50, Math.floor(filters.topLimit as number))
      : 8;
  const facts = await queryCapacityWaybillFacts(dateScope);
  const enriched = enrichCapacityFacts(facts);

  const province = filters.provinceName?.trim();
  const region = filters.regionName?.trim();

  let items: CapacityRegionDetailItem[];
  if (!province) {
    const provinces = listCapacityRegionDetailProvinceNames(enriched).filter(
      (p) => p !== DASHBOARD_REGION_UNKNOWN_PROVINCE
    );
    items = provinces.map((p) =>
      buildCapacityRegionDetailItem(p, undefined, enriched, topLimit)
    );
  } else if (region) {
    items = [
      buildCapacityRegionDetailItem(province, region, enriched, topLimit),
    ];
  } else {
    items = [buildCapacityRegionDetailItem(province, undefined, enriched, topLimit)];
  }

  return { dateScope, items };
}

/**
 * 从与 `region-detail` 同序的列表中，按 `floor(nowUnixMs / rotationIntervalMs) % length` 取当前项。
 * - 先过滤 `provinceName === DASHBOARD_REGION_UNKNOWN_PROVINCE`（「未知」省桶不参与轮播）。
 * - `items` 为空或过滤后为空：`currentIndex: -1`，`item: null`。
 * @param rotationIntervalMs 时间桶宽度（毫秒），等价于「生效秒数 × 1000」
 */
export function computeCapacityRegionDetailCurrentRotation(
  items: CapacityRegionDetailItem[],
  nowUnixMs: number,
  rotationIntervalMs: number
): Pick<
  CapacityRegionDetailCurrentData,
  "currentIndex" | "totalItems" | "item"
> {
  const filtered = items.filter(
    (i) => i.provinceName !== DASHBOARD_REGION_UNKNOWN_PROVINCE
  );
  const n = filtered.length;
  if (n === 0) {
    return { currentIndex: -1, totalItems: 0, item: null };
  }
  const idx = Math.floor(nowUnixMs / rotationIntervalMs) % n;
  return { currentIndex: idx, totalItems: n, item: filtered[idx]! };
}

export async function getCapacityRegionDetailCurrent(
  filters: CapacityRegionDetailCurrentFilters,
  nowUnixMs: number = Date.now()
): Promise<CapacityRegionDetailCurrentData> {
  const effectiveSeconds = resolveCapacityRegionDetailRotationIntervalSeconds(
    filters.rotationIntervalSeconds
  );
  const { rotationIntervalSeconds: _raw, ...regionFilters } = filters;
  const { items } = await getCapacityRegionDetail(regionFilters);
  const rotationIntervalMs = effectiveSeconds * 1000;
  const core = computeCapacityRegionDetailCurrentRotation(
    items,
    nowUnixMs,
    rotationIntervalMs
  );
  return {
    rotationIntervalSeconds: effectiveSeconds,
    ...core,
  };
}

// --- trend -------------------------------------------------------------------

export interface CapacityTrendItem {
  date: string;
  activeVehicleCount: number;
  /** 首版固定 null，含义见 `inTransitVehicleNote` */
  inTransitVehicleCount: null;
  inTransitVehicleNote: string;
  /** 按日 DISTINCT 专线键计数，可作为运力活跃度的补充观察（非在途） */
  activeRouteCount: number;
}

export interface CapacityTrend {
  dateScope: CapacityResolvedDateRange;
  items: CapacityTrendItem[];
}

export function aggregateCapacityTrend(enriched: CapacityEnrichedFact[]): CapacityTrendItem[] {
  type B = { plates: Set<string>; routes: Set<string> };
  const byDay = new Map<string, B>();

  for (const r of enriched) {
    const d = r.businessDay;
    if (!d) continue;
    let b = byDay.get(d);
    if (!b) {
      b = { plates: new Set(), routes: new Set() };
      byDay.set(d, b);
    }
    if (r.vehiclePlate) b.plates.add(r.vehiclePlate);
    b.routes.add(capacityRouteDedupeKey(r));
  }

  const dates = [...byDay.keys()].sort();
  return dates.map((date) => {
    const b = byDay.get(date)!;
    return {
      date,
      activeVehicleCount: b.plates.size,
      inTransitVehicleCount: null as null,
      inTransitVehicleNote: CAPACITY_IN_TRANSIT_UNSUPPORTED_NOTE,
      activeRouteCount: b.routes.size,
    };
  });
}

export async function getCapacityTrend(
  filters: CapacityDateFilters = {}
): Promise<CapacityTrend> {
  const dateScope = resolveCapacityDateRange(filters);
  const facts = await queryCapacityWaybillFacts(dateScope);
  return {
    dateScope,
    items: aggregateCapacityTrend(enrichCapacityFacts(facts)),
  };
}

// --- vehicle-monitor（运单动态列表，非实时监控） ---------------------------

export interface CapacityVehicleMonitorItem {
  plateNumber: string | null;
  /** 来自 batch_status / status / dispatch_status 的展示文本，非枚举校验 */
  status: string | null;
  /** 代理任务名：project_name 优先，否则 waybill_number */
  taskName: string | null;
  /**
   * 启发式清洗后的城市展示名；规则见 `normalizePlaceToDisplayCity`。
   * 无法稳定映射时为**原文**，不伪造行政区划。
   */
  originCity: string | null;
  destinationCity: string | null;
  /** TMS 原始发站文本 */
  originRaw: string | null;
  /** TMS 原始到站文本 */
  destinationRaw: string | null;
  /** `known_city_substring`：命中已知城市键；`raw_fallback`：未命中，city 同 raw */
  originNormalization: "known_city_substring" | "raw_fallback";
  destinationNormalization: "known_city_substring" | "raw_fallback";
  /** 业务侧最近时间：取 created_at / updated_at / departure_time / created_time 的最大值（ISO）；不含终点到达时间列以降低对旧库的列依赖 */
  lastBusinessTime: string | null;
}

interface CapacityMonitorSqlRow extends RowDataPacket {
  waybill_number: string | null;
  project_name: string | null;
  vehicle_plate: string | null;
  batch_status: string | null;
  status: string | null;
  dispatch_status: string | null;
  departure_place: string | null;
  arrival_place: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  departure_time: Date | string | null;
  created_time: Date | string | null;
}

function toTimeMs(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const s = String(v).trim();
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

function maxTimeIso(row: CapacityMonitorSqlRow): string | null {
  const candidates = [
    toTimeMs(row.updated_at),
    toTimeMs(row.created_at),
    toTimeMs(row.departure_time),
    toTimeMs(row.created_time),
  ].filter((x): x is number => x != null);
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates)).toISOString();
}

function pickStatus(row: CapacityMonitorSqlRow): string | null {
  const a = row.batch_status != null ? String(row.batch_status).trim() : "";
  if (a) return a;
  const b = row.status != null ? String(row.status).trim() : "";
  if (b) return b;
  const c = row.dispatch_status != null ? String(row.dispatch_status).trim() : "";
  return c || null;
}

export interface CapacityVehicleMonitor {
  dateScope: CapacityResolvedDateRange;
  /** 本接口为「运单动态」列表，非 GPS 实时监控 */
  mode: "waybill_activity_list";
  modeNote: string;
  limit: number;
  items: CapacityVehicleMonitorItem[];
}

const CAPACITY_MONITOR_MODE_NOTE =
  "本接口返回的是时间窗内运单的动态列表字段（车牌、站点文本、状态文本、最近业务时间），不包含 GPS/速度/ETA/车联网 lastReportTime。";

export async function getCapacityVehicleMonitor(
  filters: CapacityDateFilters & { limit?: number } = {}
): Promise<CapacityVehicleMonitor> {
  const dateScope = resolveCapacityDateRange(filters);
  const limitRaw = filters.limit ?? 50;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, Math.floor(limitRaw)) : 50;

  const dayExpr = capacityBusinessDayExpr("w");
  /**
   * 默认过滤空车牌：`vehicle_plate IS NOT NULL AND TRIM(vehicle_plate) <> ''`
   *（与 `NULLIF(TRIM(...))` 组合等价）。
   */
  const sql = `
    SELECT
      w.waybill_number,
      w.project_name,
      NULLIF(TRIM(w.vehicle_plate), '') AS vehicle_plate,
      w.batch_status,
      w.status,
      w.dispatch_status,
      NULLIF(TRIM(w.departure_place), '') AS departure_place,
      NULLIF(TRIM(w.arrival_place), '') AS arrival_place,
      w.created_at,
      w.updated_at,
      w.departure_time,
      w.created_time
    FROM waybills w
    WHERE w.deleted_at IS NULL
      AND NULLIF(TRIM(w.vehicle_plate), '') IS NOT NULL
      AND ${dayExpr} >= ?
      AND ${dayExpr} <= ?
    ORDER BY GREATEST(
      IFNULL(UNIX_TIMESTAMP(w.updated_at), 0),
      IFNULL(UNIX_TIMESTAMP(w.created_at), 0),
      IFNULL(UNIX_TIMESTAMP(NULLIF(TRIM(w.departure_time), '')), 0),
      IFNULL(UNIX_TIMESTAMP(NULLIF(TRIM(w.created_time), '')), 0)
    ) DESC
    LIMIT ${limit}
  `;

  const rows = await queryRows<CapacityMonitorSqlRow>(sql, [
    dateScope.startDate,
    dateScope.endDate,
  ]);

  const items: CapacityVehicleMonitorItem[] = rows.map((row) => {
    const pn = row.project_name != null ? String(row.project_name).trim() : "";
    const wn = row.waybill_number != null ? String(row.waybill_number).trim() : "";
    const taskName = pn || wn || null;
    const oRaw = row.departure_place == null ? null : String(row.departure_place);
    const dRaw = row.arrival_place == null ? null : String(row.arrival_place);
    const oNorm = normalizePlaceToDisplayCity(oRaw);
    const dNorm = normalizePlaceToDisplayCity(dRaw);
    return {
      plateNumber: row.vehicle_plate == null ? null : String(row.vehicle_plate),
      status: pickStatus(row),
      taskName,
      originCity: oNorm.city || null,
      destinationCity: dNorm.city || null,
      originRaw: oRaw,
      destinationRaw: dRaw,
      originNormalization: oNorm.normalization,
      destinationNormalization: dNorm.normalization,
      lastBusinessTime: maxTimeIso(row),
    };
  });

  return {
    dateScope,
    mode: "waybill_activity_list",
    modeNote: CAPACITY_MONITOR_MODE_NOTE,
    limit,
    items,
  };
}

/** 测试或文档用：标明「未知省」在地图中的语义 */
export function capacityUnknownProvinceLabel(): string {
  return DASHBOARD_REGION_UNKNOWN_PROVINCE;
}
