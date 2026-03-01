export type Permission = string;

export interface PermissionNode {
  id: string;
  code: string;
  name: string;
  description?: string;
  parentId?: string;
  children?: PermissionNode[];
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
}

export interface UserGroup {
  id: string;
  name: string;
  description?: string;
}

// 组织类型
export type OrgType = "platform" | "funder" | "financier";

export interface OrgUnit {
  id: string;
  name: string;
  parentId?: string;
  type: OrgType;              // 组织类型：平台/资金方/融资方
  relatedEntityId?: string;   // 关联的实体ID（资金方ID或融资方ID）
  isActive?: boolean;
}

// 从共享枚举文件导入并重新导出
import type {
  InvestmentStatus,
  SupervisionType,
  SupervisionStatus,
  CommissionStatus,
  ContractType,
  ContractStatus,
  FunderType,
  FunderStatus,
  FinancierScale,
  FinancierStatus,
  WaybillStatus,
  BusinessMode,
  I18nScope
} from "../../shared/src/enums.js";

export type {
  InvestmentStatus,
  SupervisionType,
  SupervisionStatus,
  CommissionStatus,
  ContractType,
  ContractStatus,
  FunderType,
  FunderStatus,
  FinancierScale,
  FinancierStatus,
  WaybillStatus,
  BusinessMode,
  I18nScope
};

// 导出枚举值常量供后端使用
export { EnumValues } from "../../shared/src/enums.js";

export interface I18nEntry {
  id: string;
  lang: string;
  key: string;
  value: string;
  scopeType: I18nScope;
  scopeId?: string;
  page?: string;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  orgId?: string;
  roleIds: string[];
  groupIds: string[];
  isActive?: boolean;
}

export interface SafeUser {
  id: string;
  username: string;
  displayName: string;
  orgId?: string;
  roleIds: string[];
  groupIds: string[];
  permissions: Permission[];
  isActive?: boolean;
}

export interface AuthTokenPayload {
  userId: string;
}


export interface Investment {
  id: string;
  investmentNumber: string;
  amount: number;
  investorEntity: string;
  receivingEntity: string;
  assetDescription: string;
  interestRate: number;
  startDate: string;
  endDate: string;
  expectedReturn: number;
  status: InvestmentStatus;
  createdAt: string;
}


export interface Supervision {
  id: string;
  waybillNumber: string;
  licensePlate: string;
  grossProfit: number;
  supervisionType: SupervisionType;
  supervisionRate: number;
  supervisionAmount: number;
  startDate: string;
  endDate: string;
  status: SupervisionStatus;
  createdAt: string;
}

export interface SupervisionStats {
  totalSupervising: number;
  monthlyAdded: number;
  monthlyReleased: number;
}


export interface ContractCommission {
  id: string;
  contractNumber: string;
  upstreamCustomer: string;
  licensePlate: string;
  vehicleIncome: number;
  commissionRate: number;
  commissionAmount: number;
  status: CommissionStatus;
  settlementTime?: string;
  createdAt: string;
}

export interface CommissionStats {
  totalPending: number;
  monthlySettled: number;
  totalFrozen: number;
}

// 合同管理相关类型

export interface Contract {
  id: string;
  type: ContractType;
  // 合同主体
  funderId?: string; // 资金方ID（三方融资合同）
  funderName?: string; // 资金方名称
  logisticsProviderId: string; // 物流商ID
  logisticsProviderName: string; // 物流商名称
  // 基础信息
  creditLimit: number; // 授信总额度
  startDate: string; // 合同开始日期
  endDate: string; // 合同结束日期
  // 资金计息配置（三方融资合同）
  annualInterestRate?: number; // 年化利率
  interestCalculationMode?: "daily_balance" | "other"; // 计息模式
  // 利润分成配置（撮合业务合同）
  sharingMode?: "percentage" | "fixed"; // 分成方式
  profitSharingRatio?: number; // 分润比例
  fixedSharingAmount?: number; // 固定分成金额
  // 结算配置
  settlementCycle: "monthly" | "quarterly" | "biweekly"; // 结算周期
  settlementTriggerDay?: number; // 结算触发日（每月几号，1-31）
  settlementTriggerQuarterEnd?: boolean; // 是否季度末结算
  settlementTriggerBiweekly?: boolean; // 是否每两周结算
  autoSettlement: boolean; // 自动结算开关
  // 状态
  status: ContractStatus;
  createdAt: string;
  updatedAt: string;
  // 放款信息
  usedAmount?: number; // 已用额度（累计放款）
  outstandingPrincipal?: number; // 未偿还本金
  accruedInterest?: number; // 累计利息
  commissionConfig?: any; // 抽成配置（JSON）
}

// 资金方相关类型（枚举已从共享文件导入）

export interface Funder {
  id: string;
  orgId?: string; // 关联的组织ID（自动创建）
  institutionName: string; // 机构全称
  institutionType: FunderType; // 机构类型
  unifiedSocialCreditCode: string; // 统一社会信用代码
  businessLicenseUrl?: string; // 营业执照URL
  businessLicenseName?: string; // 营业执照文件名
  financialLicenseUrl?: string; // 金融许可证URL
  financialLicenseName?: string; // 金融许可证文件名
  accountOpeningPermitUrl?: string; // 开户许可证URL
  accountOpeningPermitName?: string; // 开户许可证文件名
  contactPerson?: string; // 联系人
  contactPhone?: string; // 联系电话
  // 结算账户配置
  bankName?: string; // 开户银行
  bankAccount?: string; // 银行账号
  accountName?: string; // 账户名称
  // 统计信息
  cumulativeCreditLimit: number; // 累计提供额度
  currentLoanBalance: number; // 当前在贷余额
  status: FunderStatus; // 合作状态
  createdAt: string;
  updatedAt: string;
}

// 融资方相关类型（枚举已从共享文件导入）

// 外部系统配置
// 集成类型：爬虫、API、手动
export type IntegrationType = 'crawler' | 'api' | 'manual';

// 爬虫配置参数（存储在 crawler_config JSON 字段中）
export interface CrawlerConfigParams {
  loginUrl?: string;       // 登录地址
  companyId?: string;      // 公司ID
  username?: string;       // 用户名
  password?: string;       // 密码
  [key: string]: any;      // 其他自定义参数
}

export interface ExternalSystemConfig {
  id: string;
  financierId: string;           // 融资方ID
  systemName: string;            // 外部系统名称
  systemId: string;              // 在外部系统中的ID
  apiEndpoint?: string;          // API地址（可选）
  apiKey?: string;               // API密钥（可选）
  syncEnabled: boolean;          // 是否启用同步
  lastSyncTime?: string;         // 最后同步时间
  integrationType: IntegrationType; // 集成类型：crawler/api/manual
  crawlerType?: string;          // 爬虫模板ID（当 integrationType='crawler' 时使用）
  crawlerConfig?: CrawlerConfigParams; // 爬虫配置参数
  syncIntervalMinutes: number;   // 同步间隔（分钟）
  lastSyncStatus?: string;       // 上次同步状态：success/failed/running
  lastSyncError?: string;        // 上次同步错误信息
  createdAt: string;
  updatedAt: string;
}

export interface Financier {
  id: string;
  orgId?: string; // 关联的组织ID（自动创建）
  enterpriseName: string; // 企业名称
  unifiedSocialCreditCode: string; // 统一社会信用代码
  legalRepresentative: string; // 法定代表人
  businessAddress: string; // 经营地址
  region?: string; // 所属区域
  operatingScale: FinancierScale; // 经营规模
  // 证照
  businessLicenseUrl?: string; // 营业执照URL
  roadTransportLicenseUrl?: string; // 道路运输经营许可证URL
  legalPersonIdCardUrl?: string; // 法人身份证URL
  // 授信信息
  totalCreditLimit: number; // 总授信额度
  initialCreditAmount: number; // 初始授信金额
  remainingCreditLimit: number; // 剩余可用额度
  status: FinancierStatus; // 状态
  // 外部系统配置
  externalSystems?: ExternalSystemConfig[];
  createdAt: string;
  updatedAt: string;
}

// 资金池监控相关类型
export interface FundPoolMonitoring {
  totalCreditLine: number; // 资金池总授信额度
  currentAvailableBalance: number; // 当前可用余额
  totalOutstandingLoans: number; // 平台在贷总额
  utilizationRate: number; // 资金利用率
  funderShares: FundProviderShare[]; // 资金方授信份额
  liquidityWarnings: LiquidityWarning[]; // 流动性预警
  fundFlows: FundFlow[]; // 资金流水
}

export interface FundProviderShare {
  funderId: string;
  funderName: string;
  totalCreditLine: number; // 总授信额度
  usedAmount: number; // 已使用额度
  availableAmount: number; // 可用额度
  usageRate: number; // 使用率
}

export interface LiquidityWarning {
  id: string;
  type: "warning" | "tip" | "notification";
  message: string;
  timestamp: string;
}

export interface FundFlow {
  id: string;
  time: string;
  operationType: "payment" | "repayment"; // 代付支出 | 还款回笼
  associatedEntity: string; // 关联实体
  changeAmount: number; // 变动金额
  remainingBalance: number; // 剩余余额
}

// 系统参数配置相关类型
export interface SystemParameters {
  // 清结算基础参数
  annualInterestCalculationDays: 360 | 365; // 年计息基础天数
  dailyInterestRoundingRule: "round_up" | "round_half_up" | "round_down"; // 日计息取整规则
  defaultProfitSharingRatio: number; // 默认分润比例 (%)
  
  // 支付风控阈值
  singlePaymentLimit: number; // 单笔代付上限
  enterpriseDailyPaymentLimit: number; // 企业日累计支出上限
  fundPoolWarningLevel: number; // 资金池水位预警线 (%)
  
  // 逾期与罚息规则
  repaymentGracePeriod: number; // 还款宽限期 (天)
  penaltyInterestRatio: number; // 罚息加收比例 (%)
}

// 运单数据相关类型
export interface Waybill {
  id: string;
  waybillNumber: string; // 运单号（唯一）
  customerId: string; // 客户ID（融资方）
  customerName: string; // 客户名称
  contractId?: string; // 合同ID
  contractNumber?: string; // 合同编号
  businessMode: BusinessMode; // 业务模式
  vehiclePlate: string; // 车牌号
  driverName: string; // 司机姓名
  driverPhone?: string; // 司机电话
  departurePlace: string; // 发货地
  arrivalPlace: string; // 收货地
  goodsName: string; // 货物名称
  goodsWeight: number; // 货物重量（吨）
  freightAmount: number; // 运费金额
  oilCardAmount: number; // 油卡金额
  etcAmount: number; // ETC金额
  cashAmount: number; // 现金金额
  totalPayment: number; // 代付总额
  waybillDate: string; // 运单日期
  status: WaybillStatus; // 状态
  remark?: string; // 备注
  createdAt: string;
  updatedAt: string;
}

export interface WaybillStats {
  totalCount: number; // 总运单数
  pendingCount: number; // 待确认数量
  confirmedCount: number; // 已确认数量
  settledCount: number; // 已结算数量
  totalFreightAmount: number; // 总运费金额
  totalPaymentAmount: number; // 总代付金额
}

// ==================== 资金定向支付相关类型 ====================

// 定向支付合同状态
export type DirectedPayContractStatus =
  | "draft"            // 草稿
  | "pending_approval" // 待审批
  | "active"           // 生效中
  | "suspended"        // 已暂停
  | "expired"          // 已到期
  | "terminated";      // 已终止

// 结算周期
export type SettlementCycle = "monthly" | "biweekly" | "weekly";

// 定向支付合同
export interface DirectedPayContract {
  id: string;
  contractNumber: string;
  funderId: string;
  funderName?: string;
  financierId: string;
  financierName?: string;
  funderAccountId?: string;        // 资金方为融资方开设的专属账户ID
  creditLimit: number;             // 授信总额度
  usedAmount: number;              // 已用额度
  availableAmount: number;         // 可用额度
  annualInterestRate: number;      // 年化利率
  interestCalcBase: number;        // 计息基数 (360/365)
  startDate: string;
  endDate: string;
  settlementCycle: SettlementCycle;
  settlementDay: number;           // 结算日
  gracePeriodDays: number;         // 宽限期天数
  autoPaymentEnabled: boolean;     // 是否启用自动支付
  status: DirectedPayContractStatus;
  remark?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// 从 shared/enums 重新导出运单状态相关常量
export { WAYBILL_STATUS_ORDER, WAYBILL_STATUS_LABELS } from "../../shared/src/enums.js";

// 支付类别配置
export interface PaymentCategoryConfig {
  id: string;
  contractId: string;
  categoryCode: string;
  categoryName: string;
  paymentRatio: number;                   // 支付比例 (0-100)，如80表示最多支付原始金额的80%
  minAmount?: number;                     // 单笔最小金额
  maxAmount?: number;                     // 单笔最大金额
  dailyLimit?: number;                    // 日累计限额
  requirePlatformApproval: boolean;       // 是否需要平台审批
  requireFunderApproval: boolean;         // 是否需要资金方审批
  platformApprovalThreshold?: number;     // 平台审批阈值
  funderApprovalThreshold?: number;       // 资金方审批阈值
  autoPaymentEnabled: boolean;            // 是否启用自动支付
  isEnabled: boolean;
  unlockStatus: WaybillStatus;            // 解锁状态：达到此状态后可申请该费用
  createdAt: string;
}

// 预设支付类别
export const PAYMENT_CATEGORY_TEMPLATES = [
  { code: "FREIGHT", name: "运费" },
  { code: "OIL_CARD", name: "油卡" },
  { code: "ETC", name: "ETC" },
  { code: "SALARY", name: "工资" },
  { code: "INSURANCE", name: "保险" },
  { code: "MAINTENANCE", name: "维修" },
  { code: "TOLL", name: "路桥费" },
  { code: "OTHER", name: "其他" },
] as const;

// 收款方式
export type ReceiverType =
  | "bank_transfer"    // 银行卡直付
  | "virtual_account"  // 虚拟账户
  | "payment_code"     // 平台直付
  | "oil_card"         // 油卡充值
  | "etc_recharge";    // ETC充值

// 支付申请状态
export type PaymentRequestStatus =
  | "pending"          // 待处理
  | "platform_pending" // 待平台审批
  | "funder_pending"   // 待资金方审批
  | "approved"         // 审批通过
  | "rejected"         // 已拒绝
  | "processing"       // 处理中
  | "success"          // 支付成功
  | "failed"           // 支付失败
  | "cancelled";       // 已取消

// 审批状态
export type ApprovalStatus = "pending" | "approved" | "rejected";

// 定向支付申请
export interface DirectedPaymentRequest {
  id: string;
  requestNumber: string;
  contractId: string;
  contractNumber?: string;
  waybillId?: string;
  waybillNumber?: string;
  categoryCode: string;
  categoryName: string;
  paymentAmount: number;
  serviceFee: number;
  interestStartTime?: string;            // 计息开始时间（支付成功时间）
  receiverType: ReceiverType;
  receiverName?: string;
  receiverAccount?: string;
  receiverBank?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  remark?: string;
  status: PaymentRequestStatus;
  platformApprovalStatus: ApprovalStatus;
  platformApprovedBy?: string;
  platformApprovedAt?: string;
  platformApprovalRemark?: string;
  funderApprovalStatus: ApprovalStatus;
  funderApprovedBy?: string;
  funderApprovedAt?: string;
  funderApprovalRemark?: string;
  executionTime?: string;
  executionChannel?: string;
  executionTransactionId?: string;
  executionStatus?: string;
  executionFailureReason?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
}

// 付款码状态
export type PaymentCodeStatus = "active" | "used" | "expired" | "cancelled";

// TMS同步状态
export type TmsSyncStatus = "pending" | "synced" | "failed";

// 付款码
export interface PaymentCode {
  id: string;
  code: string;
  requestId: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  amount: number;
  expireAt: string;
  status: PaymentCodeStatus;
  usedAt?: string;
  usedLocation?: string;
  tmsSyncStatus: TmsSyncStatus;
  tmsSyncTime?: string;
  createdAt: string;
}

// 虚拟账户所有者类型
export type AccountOwnerType = "driver" | "financier" | "platform";

// 虚拟账户状态
export type AccountStatus = "active" | "frozen" | "closed";

// 虚拟账户
export interface VirtualAccount {
  id: string;
  accountNumber: string;
  ownerType: AccountOwnerType;
  ownerId: string;
  ownerName: string;
  balance: number;
  frozenAmount: number;
  totalIncome: number;
  totalExpense: number;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

// 虚拟账户交易类型
export type TransactionType = "credit" | "debit" | "freeze" | "unfreeze" | "withdraw";

// 虚拟账户流水
export interface VirtualAccountTransaction {
  id: string;
  transactionNumber: string;
  accountId: string;
  txnType: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  relatedType?: string;
  relatedId?: string;
  remark?: string;
  createdAt: string;
}

// 结算单状态
export type SettlementStatus = "pending" | "confirmed" | "partial_paid" | "paid" | "overdue";

// 定向支付结算单
export interface DirectedPaySettlement {
  id: string;
  settlementNumber: string;
  contractId: string;
  contractNumber?: string;
  financierName?: string;
  periodStart: string;
  periodEnd: string;
  paymentCount: number;
  principalAmount: number;         // 本金总额
  interestAmount: number;          // 利息总额
  serviceAmount: number;           // 服务费总额
  totalAmount: number;             // 应还总额
  dueDate: string;                 // 应还日期
  actualPaidAmount: number;        // 实际还款金额
  paidAt?: string;
  status: SettlementStatus;
  remark?: string;
  createdAt: string;
  updatedAt?: string;
}

// 结算单明细
export interface SettlementItem {
  id: string;
  settlementId: string;
  paymentRequestId: string;
  paymentAmount: number;
  paymentTime: string;
  interestDays: number;
  interestAmount: number;
  serviceFee: number;
  createdAt: string;
}

// 支付渠道（预留扩展）
export type PaymentChannel =
  | "mock"              // 模拟支付（当前）
  | "funder_account"    // 资金方账户体系（后续）
  | "platform_account"  // 平台账户体系（后续）
  | "bank_gateway";     // 银行网关（后续）

// ==================== 收益管理相关类型 ====================

// 收益记录类型
export type RevenueRecordType = 'revenue' | 'expense';

// 收益来源类型
export type RevenueSourceType =
  | 'financing_interest'      // 三方融资利息
  | 'directed_pay_interest'   // 定向支付利息
  | 'brokerage_commission'    // 撮合业务抽成
  | 'commission_fee'          // 抽成合同费用
  | 'waybill_commission';     // 运单平台抽成（按融资方规则）

// 收益状态
export type RevenueStatus = 'pending' | 'confirmed' | 'settled';

// 受益方类型
export type BeneficiaryType = 'platform' | 'funder' | 'financier';

// 收益记录
export interface RevenueRecord {
  id: string;
  recordType: RevenueRecordType;
  beneficiaryType: BeneficiaryType;
  beneficiaryId?: string;
  sourceType: RevenueSourceType;
  contractId: string;
  contractNumber?: string;
  contractType?: string;
  funderId?: string;
  funderName?: string;
  financierId?: string;
  financierName?: string;
  amount: number;
  principalAmount?: number;
  rate?: number;
  revenueDate: string;
  status: RevenueStatus;
  settlementId?: string;
  paymentRequestId?: string;
  waybillId?: string;
  remark?: string;
  vehiclePlate?: string;
  driverName?: string;
  createdAt: string;
  updatedAt: string;
}

// 收益统计
export interface RevenueStats {
  totalRevenue: number;         // 总收益/支出
  confirmedRevenue: number;     // 已确认
  pendingRevenue: number;       // 待确认
  estimatedRevenue: number;     // 预估(未来30天)
  periodRevenue: number;        // 本期新增
  growthRate?: number;          // 环比增长率
  // 业务指标（平台看板用）
  totalInvestment?: number;     // 在投总额
  dailyAverage?: number;        // 日均收益
  activeContracts?: number;     // 有效合同数
  newContractsPeriod?: number;  // 本期新增合同
  activeFunders?: number;       // 资金方数量
  activeFinanciers?: number;    // 融资方数量
  periodWaybills?: number;      // 本期运单数
}

// 收益趋势数据点
export interface RevenueTrendPoint {
  date: string;
  amount: number;
  confirmedAmount: number;
  pendingAmount: number;
}

// 收益构成
export interface RevenueComposition {
  sourceType: RevenueSourceType;
  sourceName: string;
  amount: number;
  percentage: number;
}

// 排行榜项
export interface RevenueRankItem {
  id: string;
  name: string;
  amount: number;
  count: number;
}

// 抽成合同状态
export type CommissionContractStatus = "active" | "expired" | "terminated" | "expiring_soon";

// 抽成配置项
export interface CommissionConfigItem {
  mode: "percentage" | "fixed";
  value: number;
  categoryCode?: string;
  categoryName?: string;
}

// 抽成合同
export interface CommissionContract {
  id: string;
  customerName: string;
  customerSystemId: string;
  startDate: string;
  endDate: string;
  settlementCycle: string;
  settlementDay: number;
  remark?: string;
  commissionConfig: CommissionConfigItem[];
  status: CommissionContractStatus;
  createdAt: string;
  updatedAt: string;
}

// 抽成合同统计
export interface CommissionContractStats {
  totalCount: number;
  activeCount: number;
  totalConfigCount: number;
  avgRatio: number;
}