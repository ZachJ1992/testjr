// 所有枚举类型定义 - 前后端共享

// 投资状态
export type InvestmentStatus = "holding" | "redeemed" | "expired";

// 监管类型
export type SupervisionType = "rental" | "receivables" | "advance_freight";

// 监管状态
export type SupervisionStatus = "supervising" | "overdue" | "released";

// 合同抽成状态
export type CommissionStatus = "pending" | "settled" | "frozen";

// 合同类型
export type ContractType = "financing" | "brokerage";

// 合同状态
export type ContractStatus = "active" | "expiring_soon" | "expired" | "disabled";

// 资金方类型
export type FunderType = "bank" | "factoring" | "platform" | "other";

// 资金方状态
export type FunderStatus = "active" | "disabled";

// 融资方规模
export type FinancierScale = "large" | "medium" | "small";

// 融资方状态
export type FinancierStatus = "active" | "warning" | "suspended";

// 运单状态
// 运单状态（物流全流程）
export type WaybillStatus = 
  | "created"      // 已创建
  | "dispatched"   // 已派单
  | "loading"      // 装货中
  | "in_transit"   // 运输中
  | "delivered"    // 已送达
  | "signed"       // 已签收
  | "settled"      // 已结算
  | "completed"    // 已完成
  | "cancelled";   // 已取消

// 运单状态顺序（用于判断"该状态及之后"）
export const WAYBILL_STATUS_ORDER: WaybillStatus[] = [
  "created",
  "dispatched",
  "loading",
  "in_transit",
  "delivered",
  "signed",
  "settled",
  "completed"
];

// 运单状态显示名
export const WAYBILL_STATUS_LABELS: Record<WaybillStatus, string> = {
  created: "已创建",
  dispatched: "已派单",
  loading: "装货中",
  in_transit: "运输中",
  delivered: "已送达",
  signed: "已签收",
  settled: "已结算",
  completed: "已完成",
  cancelled: "已取消"
};

// 业务模式
export type BusinessMode = "financing" | "brokerage";

// i18n 作用域（仅后端使用）
export type I18nScope = "global" | "org" | "user" | "page";

// 枚举值常量对象 - 供 AI tools 和前端使用
export const EnumValues = {
  InvestmentStatus: ["holding", "redeemed", "expired"] as const,
  SupervisionType: ["rental", "receivables", "advance_freight"] as const,
  SupervisionStatus: ["supervising", "overdue", "released"] as const,
  CommissionStatus: ["pending", "settled", "frozen"] as const,
  ContractType: ["financing", "brokerage"] as const,
  ContractStatus: ["active", "expiring_soon", "expired", "disabled"] as const,
  FunderType: ["bank", "factoring", "platform", "other"] as const,
  FunderStatus: ["active", "disabled"] as const,
  FinancierScale: ["large", "medium", "small"] as const,
  FinancierStatus: ["active", "warning", "suspended"] as const,
  WaybillStatus: ["created", "dispatched", "loading", "in_transit", "delivered", "signed", "settled", "completed", "cancelled"] as const,
  BusinessMode: ["financing", "brokerage"] as const,
  I18nScope: ["global", "org", "user", "page"] as const
} as const;

// 枚举值的类型定义辅助函数
export function getEnumValues<T extends keyof typeof EnumValues>(
  enumName: T
): readonly string[] {
  return EnumValues[enumName];
}

