import test from "node:test";
import assert from "node:assert/strict";

import {
  DASHBOARD_JINLUO_FINANCIER_NAME,
  normalizeDashboardRegionName,
  stripRongmanFromAreaName,
} from "./dashboard-region.js";

test("stripRongmanFromAreaName removes 融满 token", () => {
  assert.equal(stripRongmanFromAreaName("武汉融满"), "武汉");
  assert.equal(stripRongmanFromAreaName("  成都融满  "), "成都");
});

test("normalizeDashboardRegionName: 金罗 + 空区域 → 成都/四川", () => {
  assert.deepEqual(
    normalizeDashboardRegionName(DASHBOARD_JINLUO_FINANCIER_NAME, ""),
    { regionName: "成都", provinceName: "四川" }
  );
  assert.deepEqual(
    normalizeDashboardRegionName(DASHBOARD_JINLUO_FINANCIER_NAME, "   "),
    { regionName: "成都", provinceName: "四川" }
  );
  assert.deepEqual(
    normalizeDashboardRegionName(DASHBOARD_JINLUO_FINANCIER_NAME, null),
    { regionName: "成都", provinceName: "四川" }
  );
});

test("normalizeDashboardRegionName: 金罗 + 武汉融满 → 武汉/湖北", () => {
  assert.deepEqual(
    normalizeDashboardRegionName(DASHBOARD_JINLUO_FINANCIER_NAME, "武汉融满"),
    { regionName: "武汉", provinceName: "湖北" }
  );
});

test("normalizeDashboardRegionName: 非金罗且无区域 → 未维护区域/未知", () => {
  assert.deepEqual(normalizeDashboardRegionName("融满", ""), {
    regionName: "未维护区域",
    provinceName: "未知",
  });
});

test("normalizeDashboardRegionName: 未知城市 → 省份为未知", () => {
  assert.deepEqual(normalizeDashboardRegionName("X", "火星融满"), {
    regionName: "火星",
    provinceName: "未知",
  });
});
