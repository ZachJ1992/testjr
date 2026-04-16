/**
 * 山海鲸「区域汇总」地图：固定省份/城市底表（用于 `includeZeroRegions` 输出层补齐）。
 * 来源：产品/大屏侧约定清单（2026-04），与业务事实聚合口径无关，仅约束返回集合与顺序。
 */
export interface DashboardRegionSummaryTemplateRow {
  readonly provinceName: string;
  readonly regionName: string;
}

/** 固定展示顺序；合并真实聚合结果时以 `provinceName` + `regionName` 为键覆盖，无数据则指标为 0 */
export const DASHBOARD_REGION_SUMMARY_TEMPLATE: readonly DashboardRegionSummaryTemplateRow[] =
  [
    { provinceName: "吉林", regionName: "长春" },
    { provinceName: "四川", regionName: "成都" },
    { provinceName: "陕西", regionName: "西安" },
    { provinceName: "广东", regionName: "广州" },
    { provinceName: "山东", regionName: "临沂" },
    { provinceName: "湖南", regionName: "长沙" },
    { provinceName: "重庆", regionName: "重庆" },
    { provinceName: "天津", regionName: "天津" },
    { provinceName: "山东", regionName: "济南" },
    { provinceName: "云南", regionName: "昆明" },
    { provinceName: "江苏", regionName: "镇江" },
    { provinceName: "湖北", regionName: "武汉" },
    { provinceName: "辽宁", regionName: "沈阳" },
    { provinceName: "福建", regionName: "泉州" },
    { provinceName: "河南", regionName: "郑州" },
    { provinceName: "安徽", regionName: "合肥" },
    { provinceName: "上海", regionName: "上海" },
    { provinceName: "贵州", regionName: "贵阳" },
    { provinceName: "河北", regionName: "石家庄" },
    { provinceName: "北京", regionName: "北京" },
  ] as const;
