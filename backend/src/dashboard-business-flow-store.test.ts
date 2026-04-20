import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateDashboardBusinessFlow,
  getDashboardBusinessFlow,
  getDashboardBusinessFlowTier,
  mapBusinessFlowItemToOfficialProvinces,
  type DashboardBusinessFlowFactRow,
} from "./dashboard-business-flow-store.js";

/** 济南→广州：山东、广东均在静态表中 */
function rowJinanGz(
  gross: number,
  platform: number,
  waybillId: string
): DashboardBusinessFlowFactRow {
  return {
    waybill_id: waybillId,
    gross_freight_amount: gross,
    platform_income: platform,
    departure_place: "济南",
    arrival_place: "广州",
  };
}

test("aggregateDashboardBusinessFlow sorts by grossFreightAmount and splits tiers 5 / 10 / 15", () => {
  const rows: DashboardBusinessFlowFactRow[] = [];
  /** 16 组跨省方向，城市均在 `DASHBOARD_CITY_TO_PROVINCE` 中，且 `(fromProv→toProv)` 两两不同 */
  const pairs: Array<[string, string]> = [
    ["济南", "广州"],
    ["临沂", "上海"],
    ["郑州", "武汉"],
    ["南京", "长沙"],
    ["昆明", "成都"],
    ["泉州", "重庆"],
    ["天津", "郑州"],
    ["临沂", "郑州"],
    ["武汉", "南京"],
    ["广州", "长沙"],
    ["上海", "临沂"],
    ["成都", "昆明"],
    ["长沙", "南京"],
    ["重庆", "泉州"],
    ["广州", "济南"],
    ["南京", "郑州"],
  ];
  for (let i = 0; i < 16; i++) {
    const [d, a] = pairs[i]!;
    const amount = 1000 - i;
    rows.push({
      waybill_id: `wb-${i}`,
      gross_freight_amount: amount,
      platform_income: amount / 100,
      departure_place: d,
      arrival_place: a,
    });
  }

  const { coreFlows, importantFlows, normalFlows } =
    aggregateDashboardBusinessFlow(rows);

  assert.equal(coreFlows.length, 5);
  assert.equal(importantFlows.length, 10);
  assert.equal(normalFlows.length, 1);
  assert.equal(coreFlows[0]!.grossFreightAmount, 1000);
  assert.equal(coreFlows[4]!.grossFreightAmount, 996);
  assert.equal(importantFlows[0]!.grossFreightAmount, 995);
  assert.equal(normalFlows[0]!.grossFreightAmount, 985);
});

test("aggregateDashboardBusinessFlow drops same-province and unknown province ends", () => {
  const rows: DashboardBusinessFlowFactRow[] = [
    rowJinanGz(100, 1, "a"),
    {
      waybill_id: "b",
      gross_freight_amount: 200,
      platform_income: 2,
      departure_place: "济南",
      arrival_place: "临沂",
    },
    {
      waybill_id: "c",
      gross_freight_amount: 300,
      platform_income: 3,
      departure_place: "某未知市",
      arrival_place: "广州",
    },
  ];
  const { coreFlows, importantFlows, normalFlows } =
    aggregateDashboardBusinessFlow(rows);
  assert.equal(coreFlows.length, 1);
  assert.equal(importantFlows.length, 0);
  assert.equal(normalFlows.length, 0);
  assert.equal(coreFlows[0]!.fromProvince, "山东");
  assert.equal(coreFlows[0]!.toProvince, "广东");
});

test("aggregateDashboardBusinessFlow sums gross and platform and dedupes waybills for counts", () => {
  const rows: DashboardBusinessFlowFactRow[] = [
    rowJinanGz(50, 10, "same-wb"),
    rowJinanGz(50, 10, "same-wb"),
    rowJinanGz(100, 5, "other"),
  ];
  const { coreFlows } = aggregateDashboardBusinessFlow(rows);
  assert.equal(coreFlows.length, 1);
  assert.equal(coreFlows[0]!.grossFreightAmount, 200);
  assert.equal(coreFlows[0]!.platformIncome, 25);
  assert.equal(coreFlows[0]!.waybillCount, 2);
  assert.match(coreFlows[0]!.lineLabel, /山东.*广东/);
});

test("aggregateDashboardBusinessFlow returns empty tiers when no qualifying rows", () => {
  const { coreFlows, importantFlows, normalFlows } =
    aggregateDashboardBusinessFlow([]);
  assert.deepEqual(coreFlows, []);
  assert.deepEqual(importantFlows, []);
  assert.deepEqual(normalFlows, []);
});

test("getDashboardBusinessFlow resolves default 30-day window and usedDefaultDateRange", async () => {
  let captured: { startDate?: string; endDate?: string } = {};
  const result = await getDashboardBusinessFlow(
    {},
    {
      getBusinessFlowFactRows: async (filters) => {
        captured = { startDate: filters.startDate, endDate: filters.endDate };
        return [];
      },
    }
  );
  assert.equal(result.dateScope.usedDefaultDateRange, true);
  assert.equal(captured.startDate, result.dateScope.startDate);
  assert.equal(captured.endDate, result.dateScope.endDate);
  assert.deepEqual(result.coreFlows, []);
});

test("getDashboardBusinessFlow passes custom date range", async () => {
  const result = await getDashboardBusinessFlow(
    { startDate: "2026-04-01", endDate: "2026-04-20" },
    {
      getBusinessFlowFactRows: async (filters) => {
        assert.equal(filters.startDate, "2026-04-01");
        assert.equal(filters.endDate, "2026-04-20");
        return [];
      },
    }
  );
  assert.equal(result.dateScope.usedDefaultDateRange, false);
  assert.equal(result.dateScope.startDate, "2026-04-01");
  assert.equal(result.dateScope.endDate, "2026-04-20");
});

test("getDashboardBusinessFlow maps province fields to official full names", async () => {
  const result = await getDashboardBusinessFlow(
    {},
    {
      getBusinessFlowFactRows: async () => [rowJinanGz(100, 1, "wb1")],
    }
  );
  assert.equal(result.coreFlows.length, 1);
  assert.equal(result.coreFlows[0]!.fromProvince, "山东省");
  assert.equal(result.coreFlows[0]!.toProvince, "广东省");
  assert.equal(result.coreFlows[0]!.lineLabel, "山东 → 广东");
});

test("mapBusinessFlowItemToOfficialProvinces matches HTTP output layer", () => {
  const out = mapBusinessFlowItemToOfficialProvinces({
    fromProvince: "山东",
    toProvince: "广东",
    fromCity: "济南",
    toCity: "广州",
    lineLabel: "unused",
    grossFreightAmount: 1,
    waybillCount: 1,
    platformIncome: 1,
  });
  assert.equal(out.fromProvince, "山东省");
  assert.equal(out.toProvince, "广东省");
  assert.equal(out.lineLabel, "山东 → 广东");
});

test("getDashboardBusinessFlowTier returns one tier and matches getDashboardBusinessFlow slice", async () => {
  const facts = [rowJinanGz(100, 1, "wb1")];
  const filters = {
    startDate: "2026-04-01",
    endDate: "2026-04-20",
  };
  let queryCalls = 0;
  const reader = {
    getBusinessFlowFactRows: async () => {
      queryCalls++;
      return facts;
    },
  };

  const full = await getDashboardBusinessFlow(filters, reader);
  const core = await getDashboardBusinessFlowTier("core", filters, reader);
  const important = await getDashboardBusinessFlowTier(
    "important",
    filters,
    reader
  );
  const normal = await getDashboardBusinessFlowTier("normal", filters, reader);

  assert.deepEqual(core.items, full.coreFlows);
  assert.deepEqual(important.items, full.importantFlows);
  assert.deepEqual(normal.items, full.normalFlows);

  assert.equal(core.flowType, "core");
  assert.equal(core.flowTypeName, "核心业务通道");
  assert.equal(important.flowType, "important");
  assert.equal(important.flowTypeName, "重点业务通道");
  assert.equal(normal.flowType, "normal");
  assert.equal(normal.flowTypeName, "常规业务通道");

  assert.equal(queryCalls, 4);
});

test("getDashboardBusinessFlowTier empty items when no data", async () => {
  const core = await getDashboardBusinessFlowTier("core", {}, {
    getBusinessFlowFactRows: async () => [],
  });
  assert.deepEqual(core.items, []);
  assert.equal(core.flowType, "core");
  assert.equal(core.flowTypeName, "核心业务通道");
});
