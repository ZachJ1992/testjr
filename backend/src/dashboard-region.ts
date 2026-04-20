/**
 * 山海鲸地图「区域汇总」：原始区域名（areas.name）标准化与城市→省份映射。
 *
 * 区域原始字段来源：areas.name（经 local_partners.area_id → areas.id，与 revenue / 运单列表一致）。
 * 合作方（用于金罗规则）：revenue_records.financier_name（与 dashboard partner 维度一致）。
 */

/** 业务合作方「金罗」：区域未维护时统一视为成都 / 四川 */
export const DASHBOARD_JINLUO_FINANCIER_NAME = "金罗";

/** 融满系区域名：去掉其中的「融满」字样，得到城市名（如 武汉融满 → 武汉） */
const RONGMAN_TOKEN = "融满";

/** 城市名 → 省份名（地图省级展示）；未命中时由调用方标为「未知」 */
export const DASHBOARD_CITY_TO_PROVINCE: Readonly<Record<string, string>> = {
  武汉: "湖北",
  成都: "四川",
  昆明: "云南",
  上海: "上海",
  天津: "天津",
  临沂: "山东",
  南京: "江苏",
  郑州: "河南",
  济南: "山东",
  泉州: "福建",
  长沙: "湖南",
  广州: "广东",
  重庆: "重庆",
};

export const DASHBOARD_REGION_FALLBACK_CITY = "未维护区域";
export const DASHBOARD_REGION_UNKNOWN_PROVINCE = "未知";

/**
 * 省级行政区**简称**（与 `DASHBOARD_CITY_TO_PROVINCE` 值域、底表 `provinceName` 一致）→ **标准全称**，
 * 供山海鲸飞线、地图等按民政部标准名称绑定图层。
 */
export const DASHBOARD_PROVINCE_SHORT_TO_OFFICIAL_FULL_NAME: Readonly<
  Record<string, string>
> = {
  北京: "北京市",
  天津: "天津市",
  河北: "河北省",
  山西: "山西省",
  内蒙古: "内蒙古自治区",
  辽宁: "辽宁省",
  吉林: "吉林省",
  黑龙江: "黑龙江省",
  上海: "上海市",
  江苏: "江苏省",
  浙江: "浙江省",
  安徽: "安徽省",
  福建: "福建省",
  江西: "江西省",
  山东: "山东省",
  河南: "河南省",
  湖北: "湖北省",
  湖南: "湖南省",
  广东: "广东省",
  广西: "广西壮族自治区",
  海南: "海南省",
  重庆: "重庆市",
  四川: "四川省",
  贵州: "贵州省",
  云南: "云南省",
  西藏: "西藏自治区",
  陕西: "陕西省",
  甘肃: "甘肃省",
  青海: "青海省",
  宁夏: "宁夏回族自治区",
  新疆: "新疆维吾尔自治区",
  台湾: "台湾省",
  香港: "香港特别行政区",
  澳门: "澳门特别行政区",
} as const;

/**
 * 将内部使用的省名简称转为标准全称（用于 `province-flow` 的 `fromProvince` / `toProvince`）。
 *
 * **兜底（不静默伪造行政区划全称）**：
 * - 空串或仅空白：返回 `未映射省份（空简称）`，便于联调发现脏数据。
 * - 简称为 `未知`：返回 `未映射省份（未知）`（不设「未知省」伪全称）；`province-flow` 聚合侧已过滤「未知」，此处仅为防御性分支。
 * - 其它未在表中的简称：返回 `未映射省份（{原文}）`，提示需补充 `DASHBOARD_PROVINCE_SHORT_TO_OFFICIAL_FULL_NAME`。
 */
export function dashboardProvinceShortToOfficialFullName(short: string): string {
  const s = String(short ?? "").trim();
  if (!s) {
    return "未映射省份（空简称）";
  }
  const hit = DASHBOARD_PROVINCE_SHORT_TO_OFFICIAL_FULL_NAME[s];
  if (hit) {
    return hit;
  }
  if (s === DASHBOARD_REGION_UNKNOWN_PROVINCE) {
    return "未映射省份（未知）";
  }
  return `未映射省份（${s}）`;
}

/**
 * 去掉「融满」字样（支持任意位置的该子串，与「去掉后缀融满」在常见样本上等价）。
 */
export function stripRongmanFromAreaName(raw: string): string {
  return raw.split(RONGMAN_TOKEN).join("").trim();
}

export interface DashboardNormalizedRegion {
  regionName: string;
  provinceName: string;
}

/**
 * 将单条事实行的合作方 + 原始区域名解析为展示用城市与省份。
 */
export function normalizeDashboardRegionName(
  financierName: string | null | undefined,
  rawAreaName: string | null | undefined
): DashboardNormalizedRegion {
  const partner = String(financierName ?? "").trim();
  const raw = String(rawAreaName ?? "").trim();

  // 金罗 + 区域未维护：业务约定统一归到成都 / 四川
  if (partner === DASHBOARD_JINLUO_FINANCIER_NAME && !raw) {
    return { regionName: "成都", provinceName: "四川" };
  }

  if (!raw) {
    return {
      regionName: DASHBOARD_REGION_FALLBACK_CITY,
      provinceName: DASHBOARD_REGION_UNKNOWN_PROVINCE,
    };
  }

  const city = stripRongmanFromAreaName(raw);
  if (!city) {
    if (partner === DASHBOARD_JINLUO_FINANCIER_NAME) {
      return { regionName: "成都", provinceName: "四川" };
    }
    return {
      regionName: DASHBOARD_REGION_FALLBACK_CITY,
      provinceName: DASHBOARD_REGION_UNKNOWN_PROVINCE,
    };
  }

  const provinceName =
    DASHBOARD_CITY_TO_PROVINCE[city] ?? DASHBOARD_REGION_UNKNOWN_PROVINCE;
  return { regionName: city, provinceName };
}
