/**
 * 经营中枢「跨省业务飞线」：与运力中枢 `province-flow` 分层思想一致，但指标为经营口径
 *（`revenue_records` + `GROSS_FREIGHT_SQL` / 平台抽成），**不**使用车辆数、专线运力代理指标。
 *
 * 地理解析复用运力侧 `capacityProvinceFromPlaceRaw`（发/到站文本 → 展示城市 + 省），
 * 与运力飞线同源启发式；城市→省依赖 `DASHBOARD_CITY_TO_PROVINCE` 静态表，未命中则为「未知」并丢弃该方向。
 */

import type { RowDataPacket } from "mysql2";

import { pool } from "./db.js";
import {
  CAPACITY_PROVINCE_FLOW_CORE_MAX_RANK,
  CAPACITY_PROVINCE_FLOW_IMPORTANT_MAX_RANK,
  CAPACITY_PROVINCE_FLOW_NORMAL_MAX_RANK,
  capacityProvinceFromPlaceRaw,
} from "./dashboard-capacity-store.js";
import {
  DASHBOARD_REGION_UNKNOWN_PROVINCE,
  dashboardProvinceShortToOfficialFullName,
} from "./dashboard-region.js";
import {
  buildDashboardSqlParts,
  GROSS_FREIGHT_SQL,
  getDefaultLast30DaysDateRange,
  type DashboardAggregateFilters,
} from "./dashboard-store.js";

export interface DashboardBusinessFlowItem {
  fromProvince: string;
  toProvince: string;
  fromCity: string;
  toCity: string;
  lineLabel: string;
  grossFreightAmount: number;
  waybillCount: number;
  platformIncome: number;
}

export interface DashboardBusinessFlowDateScope {
  startDate?: string;
  endDate?: string;
  usedDefaultDateRange: boolean;
}

export interface DashboardBusinessFlow {
  dateScope: DashboardBusinessFlowDateScope;
  coreFlows: DashboardBusinessFlowItem[];
  importantFlows: DashboardBusinessFlowItem[];
  normalFlows: DashboardBusinessFlowItem[];
}

/** 山海鲸单层飞线接口用：`flowType` 与中文名 */
export type DashboardBusinessFlowTierKind =
  | "core"
  | "important"
  | "normal";

export interface DashboardBusinessFlowLayerResponse {
  flowType: DashboardBusinessFlowTierKind;
  flowTypeName: string;
  dateScope: DashboardBusinessFlowDateScope;
  items: DashboardBusinessFlowItem[];
}

const BUSINESS_FLOW_TIER_META: Record<
  DashboardBusinessFlowTierKind,
  { flowType: DashboardBusinessFlowTierKind; flowTypeName: string }
> = {
  core: { flowType: "core", flowTypeName: "核心业务通道" },
  important: { flowType: "important", flowTypeName: "重点业务通道" },
  normal: { flowType: "normal", flowTypeName: "常规业务通道" },
};

/**
 * 聚合层输出为省名**简称**（与 `DASHBOARD_CITY_TO_PROVINCE` 一致）；HTTP 响应层统一转为**标准全称**，
 * `lineLabel` 保留「简称 → 简称」便于 tooltip 简短展示（与 `dashboardProvinceShortToOfficialFullName` 表一致）。
 */
export function mapBusinessFlowItemToOfficialProvinces(
  item: DashboardBusinessFlowItem
): DashboardBusinessFlowItem {
  const shortFrom = item.fromProvince;
  const shortTo = item.toProvince;
  return {
    ...item,
    fromProvince: dashboardProvinceShortToOfficialFullName(shortFrom),
    toProvince: dashboardProvinceShortToOfficialFullName(shortTo),
    lineLabel: `${shortFrom} → ${shortTo}`,
  };
}

/** 供单测注入的原始行 */
export interface DashboardBusinessFlowFactRow {
  waybill_id: string | number | null;
  gross_freight_amount: string | number | null;
  platform_income: string | number | null;
  departure_place: string | null;
  arrival_place: string | null;
}

type BusinessFlowBucket = {
  grossFreightAmount: number;
  platformIncome: number;
  waybills: Set<string>;
  cityPairHits: Map<string, number>;
  waybillCityCounted: Set<string>;
};

function roundMoney(value: unknown): number {
  return Number((Number(value) || 0).toFixed(2));
}

function pickRepresentativeCities(
  cityPairHits: Map<string, number>
): { fromCity: string; toCity: string } {
  let bestKey = "";
  let bestN = -1;
  for (const [k, n] of cityPairHits) {
    if (n > bestN || (n === bestN && k.localeCompare(bestKey, "zh-Hans-CN") < 0)) {
      bestN = n;
      bestKey = k;
    }
  }
  if (!bestKey) {
    return { fromCity: "", toCity: "" };
  }
  const [fromCity, toCity] = bestKey.split("\u0000");
  return { fromCity: fromCity ?? "", toCity: toCity ?? "" };
}

function compareBusinessFlowLegs(
  a: DashboardBusinessFlowItem,
  b: DashboardBusinessFlowItem
): number {
  if (b.grossFreightAmount !== a.grossFreightAmount) {
    return b.grossFreightAmount - a.grossFreightAmount;
  }
  if (b.waybillCount !== a.waybillCount) {
    return b.waybillCount - a.waybillCount;
  }
  const c1 = a.fromProvince.localeCompare(b.fromProvince, "zh-Hans-CN");
  if (c1 !== 0) return c1;
  return a.toProvince.localeCompare(b.toProvince, "zh-Hans-CN");
}

/**
 * 按 `(fromProvince,toProvince)` 聚合跨省经营通道；主排序指标为 grossFreightAmount 降序。
 * - 仅跨省且两端省份均非「未知」。
 * - 金额：同桶内对事实行求和（与 overview 单行口径一致）；`waybillCount` 为桶内 `waybill_id` 去重。
 * - 展示城市：在桶内按运单去重后对 `(fromCity,toCity)` 计票，取众数对（与运力飞线一致思路，避免同一运单多条抽成记录重复计票）。
 */
export function aggregateDashboardBusinessFlow(
  rows: DashboardBusinessFlowFactRow[]
): {
  coreFlows: DashboardBusinessFlowItem[];
  importantFlows: DashboardBusinessFlowItem[];
  normalFlows: DashboardBusinessFlowItem[];
} {
  const buckets = new Map<string, BusinessFlowBucket>();

  for (const row of rows) {
    const from = capacityProvinceFromPlaceRaw(row.departure_place);
    const to = capacityProvinceFromPlaceRaw(row.arrival_place);
    if (from.provinceName === to.provinceName) continue;
    if (
      from.provinceName === DASHBOARD_REGION_UNKNOWN_PROVINCE ||
      to.provinceName === DASHBOARD_REGION_UNKNOWN_PROVINCE
    ) {
      continue;
    }

    const key = `${from.provinceName}\u0000${to.provinceName}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        grossFreightAmount: 0,
        platformIncome: 0,
        waybills: new Set(),
        cityPairHits: new Map(),
        waybillCityCounted: new Set(),
      };
      buckets.set(key, b);
    }

    b.grossFreightAmount += Number(row.gross_freight_amount) || 0;
    b.platformIncome += Number(row.platform_income) || 0;

    const wbRaw = row.waybill_id;
    const wb =
      wbRaw != null && String(wbRaw).trim() !== ""
        ? String(wbRaw).trim()
        : null;
    if (wb) {
      b.waybills.add(wb);
      if (!b.waybillCityCounted.has(wb)) {
        b.waybillCityCounted.add(wb);
        const fc = from.displayCity;
        const tc = to.displayCity;
        const pairKey = `${fc}\u0000${tc}`;
        b.cityPairHits.set(pairKey, (b.cityPairHits.get(pairKey) ?? 0) + 1);
      }
    }
  }

  const legs: DashboardBusinessFlowItem[] = [];
  for (const [k, b] of buckets) {
    const [fromProvince, toProvince] = k.split("\u0000");
    const { fromCity, toCity } = pickRepresentativeCities(b.cityPairHits);
    legs.push({
      fromProvince: fromProvince ?? "",
      toProvince: toProvince ?? "",
      fromCity,
      toCity,
      lineLabel: `${fromProvince} → ${toProvince}`,
      grossFreightAmount: roundMoney(b.grossFreightAmount),
      waybillCount: b.waybills.size,
      platformIncome: roundMoney(b.platformIncome),
    });
  }

  legs.sort(compareBusinessFlowLegs);

  const coreFlows = legs.slice(0, CAPACITY_PROVINCE_FLOW_CORE_MAX_RANK);
  const importantFlows = legs.slice(
    CAPACITY_PROVINCE_FLOW_CORE_MAX_RANK,
    CAPACITY_PROVINCE_FLOW_IMPORTANT_MAX_RANK
  );
  const normalFlows = legs.slice(
    CAPACITY_PROVINCE_FLOW_IMPORTANT_MAX_RANK,
    CAPACITY_PROVINCE_FLOW_NORMAL_MAX_RANK
  );

  return { coreFlows, importantFlows, normalFlows };
}

async function queryRows<T extends RowDataPacket>(
  sql: string,
  params: Array<string | number> = []
): Promise<T[]> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows as T[];
}

async function queryDashboardBusinessFlowFactRows(
  filters: DashboardAggregateFilters = {}
): Promise<DashboardBusinessFlowFactRow[]> {
  const sqlParts = buildDashboardSqlParts(filters);
  const rows = await queryRows<RowDataPacket>(
    `SELECT
       rr.waybill_id,
       ${GROSS_FREIGHT_SQL} AS gross_freight_amount,
       rr.amount AS platform_income,
       NULLIF(TRIM(w.departure_place), '') AS departure_place,
       NULLIF(TRIM(w.arrival_place), '') AS arrival_place
     ${sqlParts.fromSql}
     ${sqlParts.whereSql}`,
    sqlParts.params
  );

  return rows.map((row) => ({
    waybill_id: row.waybill_id ?? null,
    gross_freight_amount: row.gross_freight_amount ?? null,
    platform_income: row.platform_income ?? null,
    departure_place:
      row.departure_place == null ? null : String(row.departure_place),
    arrival_place:
      row.arrival_place == null ? null : String(row.arrival_place),
  }));
}

export interface DashboardBusinessFlowReader {
  getBusinessFlowFactRows(
    filters: DashboardAggregateFilters
  ): Promise<DashboardBusinessFlowFactRow[]>;
}

async function loadDashboardBusinessFlowResolved(
  filters: DashboardAggregateFilters,
  deps: DashboardBusinessFlowReader
): Promise<DashboardBusinessFlow> {
  const hasCustomRange = Boolean(filters.startDate || filters.endDate);
  let effectiveFilters: DashboardAggregateFilters = { ...filters };
  const usedDefaultDateRange = !hasCustomRange;

  if (!hasCustomRange) {
    const { startDate, endDate } = getDefaultLast30DaysDateRange();
    effectiveFilters = {
      ...filters,
      startDate,
      endDate,
    };
  }

  const rows = await deps.getBusinessFlowFactRows(effectiveFilters);
  const raw = aggregateDashboardBusinessFlow(rows);
  const mapArr = (items: DashboardBusinessFlowItem[]) =>
    items.map(mapBusinessFlowItemToOfficialProvinces);

  return {
    dateScope: {
      startDate: effectiveFilters.startDate,
      endDate: effectiveFilters.endDate,
      usedDefaultDateRange,
    },
    coreFlows: mapArr(raw.coreFlows),
    importantFlows: mapArr(raw.importantFlows),
    normalFlows: mapArr(raw.normalFlows),
  };
}

/**
 * 经营地图飞线总览：默认时间窗与 `business-scale-by-city` 一致（未传两端日期 → 最近 30 天含今日）。
 * `fromProvince` / `toProvince` 为**省级标准全称**；`lineLabel` 为省名简称箭头串。
 */
export async function getDashboardBusinessFlow(
  filters: DashboardAggregateFilters = {},
  deps: DashboardBusinessFlowReader = {
    getBusinessFlowFactRows: queryDashboardBusinessFlowFactRows,
  }
): Promise<DashboardBusinessFlow> {
  return loadDashboardBusinessFlowResolved(filters, deps);
}

/**
 * 单层飞线：与 {@link getDashboardBusinessFlow} **共用一次**事实查询与聚合，仅输出对应一组 `items`。
 */
export async function getDashboardBusinessFlowTier(
  tier: DashboardBusinessFlowTierKind,
  filters: DashboardAggregateFilters = {},
  deps: DashboardBusinessFlowReader = {
    getBusinessFlowFactRows: queryDashboardBusinessFlowFactRows,
  }
): Promise<DashboardBusinessFlowLayerResponse> {
  const data = await loadDashboardBusinessFlowResolved(filters, deps);
  const meta = BUSINESS_FLOW_TIER_META[tier];
  const items =
    tier === "core"
      ? data.coreFlows
      : tier === "important"
        ? data.importantFlows
        : data.normalFlows;

  return {
    flowType: meta.flowType,
    flowTypeName: meta.flowTypeName,
    dateScope: data.dateScope,
    items,
  };
}
