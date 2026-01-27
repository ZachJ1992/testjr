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
  BusinessMode
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
  BusinessMode
};

// 导出枚举值常量供前端使用
export { EnumValues } from "../../shared/src/enums.js";

export interface SafeUser {
  id: string;
  username: string;
  displayName: string;
  orgId?: string;
  roleIds: string[];
  groupIds: string[];
  permissions: string[];
   isActive?: boolean;
}

export interface PermissionNode {
  id: string;
  code: string;
  name: string;
  description?: string;
  parentId?: string;
  children?: PermissionNode[];
}

export interface UserGroupDetail {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  userIds: string[];
}

// 组织类型
export type OrgType = "platform" | "funder" | "financier";

export interface OrgUnit {
  id: string;
  name: string;
  parentId?: string;
  type?: OrgType;              // 组织类型：平台/资金方/融资方
  relatedEntityId?: string;   // 关联的实体ID（资金方ID或融资方ID）
  isActive?: boolean;
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

export interface InvestmentStats {
  totalAmount: number;
  monthlyAmount: number;
  averageRate: number;
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
  // 放款相关
  usedAmount?: number; // 已用额度
  outstandingPrincipal?: number; // 剩余本金
  accruedInterest?: number; // 待还利息
}

// 资金方相关类型（枚举已从共享文件导入）

export interface Funder {
  id: string;
  orgId?: string; // 关联的组织ID
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
export interface ExternalSystemConfig {
  id: string;
  financierId: string;     // 融资方ID
  systemName: string;      // 外部系统名称
  systemId: string;        // 在外部系统中的ID
  apiEndpoint?: string;    // API地址（可选）
  apiKey?: string;         // API密钥（可选）
  syncEnabled: boolean;    // 是否启用同步
  lastSyncTime?: string;   // 最后同步时间
  createdAt: string;
  updatedAt: string;
}

export interface Financier {
  id: string;
  orgId?: string; // 关联的组织ID
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
  funderAccountId?: string;
  creditLimit: number;
  usedAmount: number;
  availableAmount: number;
  annualInterestRate: number;
  interestCalcBase: number;
  startDate: string;
  endDate: string;
  settlementCycle: SettlementCycle;
  settlementDay: number;
  gracePeriodDays: number;
  autoPaymentEnabled: boolean;
  status: DirectedPayContractStatus;
  remark?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// 支付类别配置
export interface PaymentCategoryConfig {
  id: string;
  contractId: string;
  categoryCode: string;
  categoryName: string;
  paymentRatio: number;  // 支付比例 (0-100)，如80表示最多支付原始金额的80%
  minAmount?: number;
  maxAmount?: number;
  dailyLimit?: number;
  requirePlatformApproval: boolean;
  requireFunderApproval: boolean;
  platformApprovalThreshold?: number;
  funderApprovalThreshold?: number;
  autoPaymentEnabled: boolean;
  isEnabled: boolean;
  unlockStatus: WaybillStatus;  // 解锁状态：达到此状态后可申请该费用
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
  | "bank_transfer"
  | "virtual_account"
  | "payment_code"
  | "oil_card"
  | "etc_recharge";

// 收款方式选项（前端使用）
export const RECEIVER_TYPE_OPTIONS = [
  { value: "payment_code", label: "平台直付" },
  { value: "virtual_account", label: "虚拟账户" },
  { value: "bank_transfer", label: "银行卡直付" },
  { value: "oil_card", label: "油卡充值" },
  { value: "etc_recharge", label: "ETC充值" },
] as const;

// 运单状态选项（前端使用）
export const WAYBILL_STATUS_OPTIONS = [
  { value: "created", label: "已创建" },
  { value: "dispatched", label: "已派单" },
  { value: "loading", label: "装货中" },
  { value: "in_transit", label: "运输中" },
  { value: "delivered", label: "已送达" },
  { value: "signed", label: "已签收" },
  { value: "settled", label: "已结算" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
] as const;

// 运单状态顺序（用于判断解锁）
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

// 支付申请状态
export type PaymentRequestStatus =
  | "pending"
  | "platform_pending"
  | "funder_pending"
  | "approved"
  | "rejected"
  | "processing"
  | "success"
  | "failed"
  | "cancelled";

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
  interestStartTime?: string;
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

// 支付申请统计
export interface PaymentRequestStats {
  totalCount: number;
  pendingCount: number;
  approvedCount: number;
  processingCount: number;
  successCount: number;
  failedCount: number;
  rejectedCount: number;
  totalAmount: number;
  successAmount: number;
}

// 付款码状态
export type PaymentCodeStatus = "active" | "used" | "expired" | "cancelled";

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
  principalAmount: number;
  interestAmount: number;
  serviceAmount: number;
  totalAmount: number;
  dueDate: string;
  actualPaidAmount: number;
  paidAt?: string;
  status: SettlementStatus;
  remark?: string;
  createdAt: string;
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

// 状态显示配置
export const DIRECTED_PAY_CONTRACT_STATUS_CONFIG: Record<DirectedPayContractStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  pending_approval: { label: "待审批", color: "processing" },
  active: { label: "生效中", color: "success" },
  suspended: { label: "已暂停", color: "warning" },
  expired: { label: "已到期", color: "default" },
  terminated: { label: "已终止", color: "error" },
};

export const PAYMENT_REQUEST_STATUS_CONFIG: Record<PaymentRequestStatus, { label: string; color: string }> = {
  pending: { label: "待处理", color: "default" },
  platform_pending: { label: "待平台审批", color: "processing" },
  funder_pending: { label: "待资金方审批", color: "processing" },
  approved: { label: "审批通过", color: "success" },
  rejected: { label: "已拒绝", color: "error" },
  processing: { label: "处理中", color: "processing" },
  success: { label: "支付成功", color: "success" },
  failed: { label: "支付失败", color: "error" },
  cancelled: { label: "已取消", color: "default" },
};

export const SETTLEMENT_STATUS_CONFIG: Record<SettlementStatus, { label: string; color: string }> = {
  pending: { label: "待确认", color: "default" },
  confirmed: { label: "已确认", color: "processing" },
  partial_paid: { label: "部分还款", color: "warning" },
  paid: { label: "已结清", color: "success" },
  overdue: { label: "已逾期", color: "error" },
};

// ==================== 爬虫配置相关类型 ====================

// 爬虫同步状态
export type CrawlerSyncStatus = 'success' | 'failed' | 'running' | 'never';

// 爬虫配置
export interface CrawlerConfig {
  id: string;
  financierId: string;
  name: string;
  systemUrl: string;
  apiEndpoint: string;
  cookies: string;
  companyId?: string;
  userId?: string;
  groupId?: string;
  syncEnabled: boolean;
  syncIntervalMinutes: number;
  lastSyncTime?: string;
  lastSyncCount?: number;
  lastSyncStatus?: CrawlerSyncStatus;
  lastSyncError?: string;
  createdAt: string;
  updatedAt: string;
}

// 爬虫同步日志
export interface CrawlerSyncLog {
  id: string;
  configId: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'success' | 'failed';
  totalFetched: number;
  newCount: number;
  skippedCount: number;
  errorCount: number;
  errorMessage?: string;
  createdAt: string;
}

// 爬虫连接测试结果
export interface CrawlerTestResult {
  success: boolean;
  message: string;
  sampleCount?: number;
  sampleData?: any;
}

// 爬虫同步结果
export interface CrawlerSyncResult {
  success: boolean;
  totalFetched: number;
  newCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
}

// 同步间隔选项
export const SYNC_INTERVAL_OPTIONS = [
  { value: 30, label: "每30分钟" },
  { value: 60, label: "每小时" },
  { value: 120, label: "每2小时" },
  { value: 360, label: "每6小时" },
  { value: 720, label: "每12小时" },
  { value: 1440, label: "每日" },
] as const;

// 同步状态配置（用于显示）
export const CRAWLER_SYNC_STATUS_CONFIG: Record<CrawlerSyncStatus, { label: string; color: string; icon: string }> = {
  success: { label: "同步成功", color: "success", icon: "🟢" },
  running: { label: "同步中", color: "processing", icon: "🟡" },
  failed: { label: "同步失败", color: "error", icon: "🔴" },
  never: { label: "未同步", color: "default", icon: "⚪" },
};