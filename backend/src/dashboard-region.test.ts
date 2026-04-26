import test from "node:test";
import assert from "node:assert/strict";

import {
  DASHBOARD_JINLUO_FINANCIER_NAME,
  dashboardProvinceShortToOfficialFullName,
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

test("dashboardProvinceShortToOfficialFullName: 直辖市与自治区", () => {
  assert.equal(dashboardProvinceShortToOfficialFullName("四川"), "四川省");
  assert.equal(dashboardProvinceShortToOfficialFullName("重庆"), "重庆市");
  assert.equal(dashboardProvinceShortToOfficialFullName("广西"), "广西壮族自治区");
  assert.equal(dashboardProvinceShortToOfficialFullName("新疆"), "新疆维吾尔自治区");
  assert.equal(dashboardProvinceShortToOfficialFullName("内蒙古"), "内蒙古自治区");
  assert.equal(dashboardProvinceShortToOfficialFullName("西藏"), "西藏自治区");
  assert.equal(dashboardProvinceShortToOfficialFullName("宁夏"), "宁夏回族自治区");
});

test("dashboardProvinceShortToOfficialFullName: 未命中不伪造全称", () => {
  assert.equal(dashboardProvinceShortToOfficialFullName(""), "未映射省份（空简称）");
  assert.equal(dashboardProvinceShortToOfficialFullName("   "), "未映射省份（空简称）");
  assert.equal(dashboardProvinceShortToOfficialFullName("架空省"), "未映射省份（架空省）");
  assert.equal(dashboardProvinceShortToOfficialFullName("未知"), "未映射省份（未知）");
});
