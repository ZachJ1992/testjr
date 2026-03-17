// 登录配置
export interface LoginConfig {
  companyId: string;
  username: string;
  password: string;
}

// 爬虫配置
export interface CrawlerConfig {
  id: string;
  financierId: string;
  financierName?: string;
  name: string;
  systemUrl: string;
  baseUrl: string;  // 等同于 systemUrl，用于 puppeteer
  apiEndpoint: string;
  cookies: string;
  companyId?: string;
  userId?: string;
  groupId?: string;
  loginConfig: LoginConfig;  // 登录配置
  extraParams?: Record<string, any>;
  syncEnabled: boolean;
  enabled?: boolean;  // 等同于 syncEnabled
  syncIntervalMinutes: number;
  syncInterval?: number;  // 等同于 syncIntervalMinutes
  lastSyncTime?: string;
  lastSyncRecordId?: string;
  lastSyncCount?: number;
  lastSyncStatus?: 'success' | 'failed' | 'running';
  lastSyncError?: string;
  createdAt: string;
  updatedAt: string;
}

// 同步日志
export interface CrawlerSyncLog {
  id: string;
  configId: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'success' | 'failed';
  totalFetched: number;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errorMessage?: string;
  createdAt: string;
}

// 同步结果
export interface SyncResult {
  success: boolean;
  totalFetched: number;
  newCount: number;
  updatedCount?: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
}

// TMS 行数据（处理后的格式）
export interface TmsRowData {
  waybillNumber: string;
  operator?: string;
  driverName?: string;
  coDriver?: string;
  vehiclePlate?: string;
  monthlyCost?: number;
  createdTime?: string;
  departureTime?: string;
  remark?: string;
  customerName?: string;
  receivableTotal?: number;
  receivableTransport?: number;
  payableTotal?: number;
  driverPieceRate?: number;
  coDriverPieceRate?: number;
  payableOilCard?: number;
  etcFee?: number;
  profit?: number;
  profitRate?: number;
  receivableReturn?: number;
  branch?: string;
  batchStatusText?: string;
}

// 测试连接结果
export interface TestConnectionResult {
  success: boolean;
  message: string;
  sampleCount?: number;
  sampleData?: any[];
}

// TMS API 响应结构
export interface TmsApiResponse {
  errno: number;
  errmsg: string;
  res?: {
    data: TmsWaybillRecord[];
    total?: { count: number };
  };
  page_size?: number;
}

// TMS 运单记录（原始数据）
export interface TmsWaybillRecord {
  id: string;
  car_batch: string;
  b_dr_name: string;
  b_dr_assistant_id: string;
  b_tr_num: string;
  route_text: string;
  load_addr: string;
  unload_addr: string;
  create_time: string;
  truck_t: string;
  batch_st: string;
  dispatch_driver_st: string;
  b_remark: string;
  // 费用字段
  receivable_total: string;
  receivable_trans_f: string;
  receivable_spot_fee: string;
  receivable_upstairs_f: string;
  receivable_handling_f: string;
  receivable_other: string;
  b_fuel_card_f: string;
  b_arr_f: string;
  tt_profit: string;
  tt_volume: string;
  // 其他字段
  company_id: string;
  customer_id: string;
  project_id: string;
  mgr_id: string;
  [key: string]: any;
}

// 批次状态映射
export const BATCH_STATUS_MAP: Record<string, string> = {
  '0': 'cancelled',    // 已取消
  '1': 'pending',      // 待发车
  '2': 'in_transit',   // 在途
  '3': 'delivered',    // 已到达
  '4': 'completed',    // 已完成
  '10': 'pending',     // 待发车（从样例数据）
};

// 将 TMS 状态转换为系统状态
export function mapBatchStatus(tmsStatus: string): string {
  return BATCH_STATUS_MAP[tmsStatus] || 'pending';
}
