// 所有枚举类型定义 - 前后端共享
// 运单状态顺序（用于判断"该状态及之后"）
export const WAYBILL_STATUS_ORDER = [
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
export const WAYBILL_STATUS_LABELS = {
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
// 枚举值常量对象 - 供 AI tools 和前端使用
export const EnumValues = {
    InvestmentStatus: ["holding", "redeemed", "expired"],
    SupervisionType: ["rental", "receivables", "advance_freight"],
    SupervisionStatus: ["supervising", "overdue", "released"],
    CommissionStatus: ["pending", "settled", "frozen"],
    ContractType: ["financing", "brokerage"],
    ContractStatus: ["active", "expiring_soon", "expired", "disabled"],
    FunderType: ["bank", "factoring", "platform", "other"],
    FunderStatus: ["active", "disabled"],
    FinancierScale: ["large", "medium", "small"],
    FinancierStatus: ["active", "warning", "suspended"],
    WaybillStatus: ["created", "dispatched", "loading", "in_transit", "delivered", "signed", "settled", "completed", "cancelled"],
    BusinessMode: ["financing", "brokerage"],
    I18nScope: ["global", "org", "user", "page"]
};
// 枚举值的类型定义辅助函数
export function getEnumValues(enumName) {
    return EnumValues[enumName];
}
