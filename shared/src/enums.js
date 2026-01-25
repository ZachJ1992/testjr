// 所有枚举类型定义 - 前后端共享
// 枚举值常量对象 - 供 AI tools 和前端使用
export const EnumValues = {
    InvestmentStatus: ["holding", "redeemed", "expired"],
    SupervisionType: ["rental", "receivables", "advance_freight"],
    SupervisionStatus: ["supervising", "overdue", "released"],
    CommissionStatus: ["pending", "settled", "frozen"],
    ContractType: ["financing", "brokerage"],
    ContractStatus: ["active", "expiring_soon", "expired"],
    FunderType: ["bank", "factoring", "platform", "other"],
    FunderStatus: ["active", "disabled"],
    FinancierScale: ["large", "medium", "small"],
    FinancierStatus: ["active", "warning", "suspended"],
    I18nScope: ["global", "org", "user", "page"]
};
// 枚举值的类型定义辅助函数
export function getEnumValues(enumName) {
    return EnumValues[enumName];
}
