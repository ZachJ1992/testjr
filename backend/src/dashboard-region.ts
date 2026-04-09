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
