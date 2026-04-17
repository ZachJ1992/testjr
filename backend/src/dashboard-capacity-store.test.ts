import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateCapacityCityHeat,
  aggregateCapacityOverview,
  aggregateCapacityProvinceMap,
  aggregateCapacityRouteTop,
  aggregateCapacityTrend,
  buildCapacityRegionDetailItem,
  capacityProvinceMapTemplateOrder,
  capacityRegionDetailAvgRatio,
  capacityRouteDedupeKey,
  computeCapacityRegionDetailCurrentRotation,
  enrichCapacityFacts,
  getCapacityDefaultLast30DaysDateRange,
  listCapacityRegionDetailProvinceNames,
  mergeCapacityProvinceMapWithFixedTemplate,
  normalizePlaceToDisplayCity,
  resolveCapacityDateRange,
  resolveCapacityRegionDetailRotationIntervalSeconds,
  routeDirectionNameFromFact,
  CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS,
  CAPACITY_REGION_DETAIL_ROTATION_MAX_SECONDS,
  CAPACITY_REGION_PENDING_DISPLAY_TEXT,
  type CapacityRegionDetailItem,
  type CapacityWaybillFactRow,
} from "./dashboard-capacity-store.js";

const baseFact = (over: Partial<CapacityWaybillFactRow>): CapacityWaybillFactRow => ({
  businessDay: "2026-04-10",
  vehiclePlate: "川A11111",
  branch: "网点甲",
  routeId: "r1",
  routeName: "成渝专线",
  departurePlace: "成都",
  arrivalPlace: "重庆",
  financierName: "融满",
  rawAreaName: "成都融满",
  ...over,
});

test("resolveCapacityDateRange defaults to last 30 days and swaps inverted range", () => {
  const fixed = new Date("2026-04-17T12:00:00");
  const def = getCapacityDefaultLast30DaysDateRange(fixed);
  assert.equal(def.endDate, "2026-04-17");
  /** 含首尾共 30 日：4 月 17 往前 29 天为 3 月 19 */
  assert.equal(def.startDate, "2026-03-19");

  const r = resolveCapacityDateRange({}, fixed);
  assert.equal(r.usedDefaultDateRange, true);
  assert.deepEqual(r, { ...def, usedDefaultDateRange: true });

  const swapped = resolveCapacityDateRange(
    { startDate: "2026-04-07", endDate: "2026-04-01" },
    fixed
  );
  assert.equal(swapped.startDate, "2026-04-01");
  assert.equal(swapped.endDate, "2026-04-07");
  assert.equal(swapped.usedDefaultDateRange, false);
});

test("routeDirectionNameFromFact prefers route name then id placeholder then places", () => {
  assert.equal(
    routeDirectionNameFromFact(baseFact({ routeName: "专线A", routeId: "rid" })),
    "专线A"
  );
  assert.equal(
    routeDirectionNameFromFact(baseFact({ routeName: "", routeId: "rid-only" })),
    "route:rid-only"
  );
  assert.equal(
    routeDirectionNameFromFact(
      baseFact({
        routeId: null,
        routeName: null,
        departurePlace: "",
        arrivalPlace: "",
      })
    ),
    "未知发站→未知到站"
  );
});

test("capacityRouteDedupeKey uses id bucket when routeId present", () => {
  assert.equal(capacityRouteDedupeKey(baseFact({ routeId: "x" })), "id:x");
  assert.equal(
    capacityRouteDedupeKey(baseFact({ routeId: null, departurePlace: "A", arrivalPlace: "B" })),
    "dir:A→B"
  );
});

test("aggregateCapacityOverview counts distinct plates branches routes cities", () => {
  const facts: CapacityWaybillFactRow[] = [
    baseFact({ vehiclePlate: "A1", branch: "b1", routeId: "r1", routeName: "n1" }),
    baseFact({ vehiclePlate: "A1", branch: "b2", routeId: "r2", routeName: "n2" }),
    baseFact({
      vehiclePlate: "A2",
      branch: "b2",
      routeId: null,
      routeName: null,
      departurePlace: "武汉",
      arrivalPlace: "长沙",
    }),
  ];
  const enriched = enrichCapacityFacts(facts);
  const o = aggregateCapacityOverview(enriched);
  assert.equal(o.activeVehicleCount, 2);
  assert.equal(o.activeOutletCount, 2);
  assert.equal(o.activeRouteCount, 3);
  assert.equal(o.inTransitVehicleCount, null);
  assert.ok(o.coveredCityCount >= 1);
});

test("aggregateCapacityProvinceMap includes waybillCount and displayText", () => {
  const enriched = enrichCapacityFacts([
    baseFact({ vehiclePlate: "P1", branch: "o1", routeId: "r1", routeName: "L1" }),
  ]);
  const items = aggregateCapacityProvinceMap(enriched);
  assert.ok(items.length >= 1);
  const sc = items.find((i) => i.provinceName === "四川");
  assert.ok(sc);
  assert.equal(sc!.waybillCount, 1);
  assert.match(sc!.displayText, /四川｜活跃车辆/);
});

test("mergeCapacityProvinceMapWithFixedTemplate pads missing provinces", () => {
  const agg = aggregateCapacityProvinceMap(enrichCapacityFacts([]));
  assert.equal(agg.length, 0);
  const merged = mergeCapacityProvinceMapWithFixedTemplate(agg);
  assert.ok(merged.length >= 19);
  const jl = merged.find((i) => i.provinceName === "吉林");
  assert.ok(jl);
  assert.equal(jl!.waybillCount, 0);
  assert.equal(jl!.displayText, CAPACITY_REGION_PENDING_DISPLAY_TEXT);
  assert.equal(jl!.isFallback, true);
});

test("normalizePlaceToDisplayCity matches longest known city substring", () => {
  const w = normalizePlaceToDisplayCity("武汉市东西湖区某某物流园");
  assert.equal(w.city, "武汉");
  assert.equal(w.normalization, "known_city_substring");
  const unk = normalizePlaceToDisplayCity("某偏远县A点");
  assert.equal(unk.city, "某偏远县A点");
  assert.equal(unk.normalization, "raw_fallback");
});

test("aggregateCapacityCityHeat groups by city and province", () => {
  const enriched = enrichCapacityFacts([
    baseFact({ vehiclePlate: "a", branch: "b1" }),
    baseFact({ vehiclePlate: "b", branch: "b1" }),
  ]);
  const items = aggregateCapacityCityHeat(enriched);
  assert.ok(items.length >= 1);
  const row = items.find((i) => i.cityName === "成都");
  assert.ok(row);
  assert.equal(row!.activeVehicleCount, 2);
});

test("aggregateCapacityRouteTop buckets by route dedupe key", () => {
  const facts: CapacityWaybillFactRow[] = [
    baseFact({ routeId: "r1", routeName: "同线", vehiclePlate: "A" }),
    baseFact({ routeId: "r1", routeName: "同线", vehiclePlate: "B" }),
    baseFact({
      routeId: null,
      routeName: null,
      departurePlace: "武汉",
      arrivalPlace: "长沙",
      vehiclePlate: "C",
    }),
  ];
  const top = aggregateCapacityRouteTop(facts, 10);
  assert.equal(top.length, 2);
  const line = top.find((t) => t.routeDirectionName === "同线");
  assert.ok(line);
  assert.equal(line!.waybillCount, 2);
  assert.equal(line!.activeVehicleCount, 2);
});

test("aggregateCapacityTrend emits per-day vehicle and route counts", () => {
  const enriched = enrichCapacityFacts([
    baseFact({ businessDay: "2026-04-01", vehiclePlate: "X" }),
    baseFact({ businessDay: "2026-04-02", vehiclePlate: "X", routeId: "r9", routeName: "R" }),
  ]);
  const items = aggregateCapacityTrend(enriched);
  assert.equal(items.length, 2);
  assert.equal(items[0].inTransitVehicleCount, null);
  assert.equal(items[1].activeRouteCount, 1);
});

test("buildCapacityRegionDetailItem filters province and city", () => {
  const enriched = enrichCapacityFacts([
    baseFact({ vehiclePlate: "p1", financierName: "融满", rawAreaName: "成都融满" }),
    baseFact({
      vehiclePlate: "p2",
      financierName: "融满",
      rawAreaName: "武汉融满",
      routeId: "r2",
      routeName: "鄂线",
    }),
  ]);

  const prov = buildCapacityRegionDetailItem("四川", undefined, enriched, 5);
  assert.equal(prov.regionLevel, "province");
  assert.equal(prov.regionName, "四川");
  assert.ok(prov.activeVehicleCount >= 1);
  assert.equal(prov.waybillCount, 1);
  assert.equal(prov.avgWaybillsPerVehicle, 1);
  assert.equal(prov.avgWaybillsPerOutlet, 1);

  const city = buildCapacityRegionDetailItem("四川", "成都", enriched, 5);
  assert.equal(city.regionLevel, "city");
  assert.equal(city.coveredCityCount, 1);
  assert.equal(city.waybillCount, 1);
  assert.ok(Array.isArray(city.topRouteDirections));
});

test("buildCapacityRegionDetailItem waybillCount and avgs match subset", () => {
  const enriched = enrichCapacityFacts([
    baseFact({ vehiclePlate: "A", branch: "b1", financierName: "融满", rawAreaName: "成都融满" }),
    baseFact({ vehiclePlate: "B", branch: "b1", financierName: "融满", rawAreaName: "成都融满" }),
    baseFact({ vehiclePlate: "A", branch: "b2", financierName: "融满", rawAreaName: "成都融满" }),
  ]);
  const row = buildCapacityRegionDetailItem("四川", "成都", enriched, 5);
  assert.equal(row.waybillCount, 3);
  assert.equal(row.activeVehicleCount, 2);
  assert.equal(row.activeOutletCount, 2);
  assert.equal(row.avgWaybillsPerVehicle, 1.5);
  assert.equal(row.avgWaybillsPerOutlet, 1.5);
});

test("buildCapacityRegionDetailItem avg zero when denominator zero but waybills exist", () => {
  const enriched = enrichCapacityFacts([
    baseFact({
      vehiclePlate: null,
      branch: null,
      financierName: "融满",
      rawAreaName: "成都融满",
    }),
    baseFact({
      vehiclePlate: "",
      branch: "",
      financierName: "融满",
      rawAreaName: "成都融满",
    }),
  ]);
  const row = buildCapacityRegionDetailItem("四川", "成都", enriched, 5);
  assert.equal(row.waybillCount, 2);
  assert.equal(row.activeVehicleCount, 0);
  assert.equal(row.activeOutletCount, 0);
  assert.equal(row.avgWaybillsPerVehicle, 0);
  assert.equal(row.avgWaybillsPerOutlet, 0);
});

test("buildCapacityRegionDetailItem avg zero when waybillCount zero", () => {
  const enriched = enrichCapacityFacts([]);
  const row = buildCapacityRegionDetailItem("四川", "成都", enriched, 5);
  assert.equal(row.waybillCount, 0);
  assert.equal(row.avgWaybillsPerVehicle, 0);
  assert.equal(row.avgWaybillsPerOutlet, 0);
});

test("capacityRegionDetailAvgRatio one decimal and zero when not computable", () => {
  assert.equal(capacityRegionDetailAvgRatio(0, 0), 0);
  assert.equal(capacityRegionDetailAvgRatio(0, 5), 0);
  assert.equal(capacityRegionDetailAvgRatio(10, 3), 3.3);
  assert.equal(capacityRegionDetailAvgRatio(4, 2), 2);
  assert.equal(capacityRegionDetailAvgRatio(1, 0), 0);
  assert.equal(capacityRegionDetailAvgRatio(1, -1), 0);
});

test("listCapacityRegionDetailProvinceNames orders template then extras", () => {
  const enriched = enrichCapacityFacts([
    baseFact({ financierName: "融满", rawAreaName: "成都融满" }),
    baseFact({ financierName: "x", rawAreaName: "" }),
  ]);
  const names = listCapacityRegionDetailProvinceNames(enriched);
  assert.ok(names.includes("四川"));
  assert.ok(names.includes("未知"));
  assert.equal(names[0], capacityProvinceMapTemplateOrder()[0]);
});

const regionDetailStub = (
  provinceName: string,
  regionName: string
): CapacityRegionDetailItem => ({
  regionName,
  regionLevel: "province",
  provinceName,
  waybillCount: 1,
  activeVehicleCount: 1,
  activeOutletCount: 1,
  avgWaybillsPerVehicle: 1,
  avgWaybillsPerOutlet: 1,
  coveredCityCount: 1,
  activeRouteCount: 1,
  topRouteDirections: [],
});

test("computeCapacityRegionDetailCurrentRotation advances every rotationIntervalMs", () => {
  const items = [regionDetailStub("四川", "四川"), regionDetailStub("湖北", "湖北")];
  const ms = CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS * 1000;
  const a = computeCapacityRegionDetailCurrentRotation(items, 0, ms);
  const b = computeCapacityRegionDetailCurrentRotation(items, ms - 1, ms);
  const c = computeCapacityRegionDetailCurrentRotation(items, ms, ms);
  assert.equal(a.currentIndex, 0);
  assert.equal(a.totalItems, 2);
  assert.equal(a.item?.provinceName, "四川");
  assert.equal(b.currentIndex, 0);
  assert.equal(c.currentIndex, 1);
  assert.equal(c.item?.provinceName, "湖北");
  const wrap = computeCapacityRegionDetailCurrentRotation(items, ms * 2, ms);
  assert.equal(wrap.currentIndex, 0);
});

test("computeCapacityRegionDetailCurrentRotation drops 未知 before indexing", () => {
  const items = [
    regionDetailStub("四川", "四川"),
    regionDetailStub("未知", "未知"),
    regionDetailStub("湖北", "湖北"),
  ];
  const ms = 1000;
  assert.equal(
    computeCapacityRegionDetailCurrentRotation(items, 0, ms).item?.provinceName,
    "四川"
  );
  assert.equal(
    computeCapacityRegionDetailCurrentRotation(items, 1000, ms).item?.provinceName,
    "湖北"
  );
  assert.equal(computeCapacityRegionDetailCurrentRotation(items, 0, ms).totalItems, 2);
});

test("computeCapacityRegionDetailCurrentRotation empty when only 未知 or empty input", () => {
  const onlyUnknown = [regionDetailStub("未知", "未知")];
  const ms = CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS * 1000;
  const r = computeCapacityRegionDetailCurrentRotation(onlyUnknown, 999_000, ms);
  assert.equal(r.currentIndex, -1);
  assert.equal(r.totalItems, 0);
  assert.equal(r.item, null);

  const empty = computeCapacityRegionDetailCurrentRotation([], 0, ms);
  assert.equal(empty.currentIndex, -1);
  assert.equal(empty.totalItems, 0);
  assert.equal(empty.item, null);
});

test("resolveCapacityRegionDetailRotationIntervalSeconds defaults and clamps", () => {
  assert.equal(
    resolveCapacityRegionDetailRotationIntervalSeconds(undefined),
    CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS
  );
  assert.equal(resolveCapacityRegionDetailRotationIntervalSeconds(""), CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS);
  assert.equal(resolveCapacityRegionDetailRotationIntervalSeconds("  "), CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS);
  assert.equal(resolveCapacityRegionDetailRotationIntervalSeconds("x"), CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS);
  assert.equal(resolveCapacityRegionDetailRotationIntervalSeconds(0), CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS);
  assert.equal(resolveCapacityRegionDetailRotationIntervalSeconds(-2), CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS);
  assert.equal(resolveCapacityRegionDetailRotationIntervalSeconds(Infinity), CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS);
  assert.equal(resolveCapacityRegionDetailRotationIntervalSeconds(8), 8);
  assert.equal(resolveCapacityRegionDetailRotationIntervalSeconds(8.9), 8);
  assert.equal(resolveCapacityRegionDetailRotationIntervalSeconds(0.2), CAPACITY_REGION_DETAIL_ROTATION_DEFAULT_SECONDS);
  assert.equal(
    resolveCapacityRegionDetailRotationIntervalSeconds(CAPACITY_REGION_DETAIL_ROTATION_MAX_SECONDS + 1),
    CAPACITY_REGION_DETAIL_ROTATION_MAX_SECONDS
  );
  assert.equal(resolveCapacityRegionDetailRotationIntervalSeconds(1), 1);
});
