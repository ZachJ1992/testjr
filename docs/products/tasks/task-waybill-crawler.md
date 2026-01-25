# 运单数据爬虫后端服务开发任务 (Agent-Crawler)

## 任务概述

开发一个完整的爬虫后端服务，从客户的TMS系统（如 zo-cloud.cn）自动抓取运单数据并同步到本系统。

## 背景信息

### 目标系统
- 系统地址：`tms25.zo-cloud.cn`（示例，每个融资方可能不同）
- API接口：`/api/Table/Search/batchList`
- 认证方式：Cookie（长期有效，不需要自动登录）

### 数据规模
- 单次请求：100条/页
- 示例数据：总计 6716 条记录

---

## 一、数据库表设计

### 1.1 爬虫配置表 `crawler_configs`

```sql
CREATE TABLE IF NOT EXISTS crawler_configs (
  id VARCHAR(36) PRIMARY KEY,
  financier_id VARCHAR(36) NOT NULL,           -- 融资方ID
  name VARCHAR(100) NOT NULL,                  -- 配置名称
  system_url VARCHAR(255) NOT NULL,            -- 系统地址 (如 https://tms25.zo-cloud.cn)
  api_endpoint VARCHAR(255) NOT NULL,          -- API路径 (如 /api/Table/Search/batchList)
  cookies TEXT NOT NULL,                       -- Cookie字符串
  company_id VARCHAR(50),                      -- TMS系统company_id
  user_id VARCHAR(50),                         -- TMS系统user_id
  group_id VARCHAR(50),                        -- TMS系统group_id
  extra_params JSON,                           -- 额外请求参数
  sync_enabled BOOLEAN DEFAULT true,           -- 是否启用同步
  sync_interval_minutes INT DEFAULT 60,        -- 同步间隔（分钟）
  last_sync_time DATETIME,                     -- 最后同步时间
  last_sync_record_id VARCHAR(50),             -- 最后同步的记录ID（用于增量）
  last_sync_count INT DEFAULT 0,               -- 最后同步数量
  last_sync_status VARCHAR(20),                -- 最后同步状态: success/failed/running
  last_sync_error TEXT,                        -- 最后同步错误信息
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  INDEX idx_financier_id (financier_id),
  INDEX idx_sync_enabled (sync_enabled),
  FOREIGN KEY (financier_id) REFERENCES financiers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.2 同步日志表 `crawler_sync_logs`

```sql
CREATE TABLE IF NOT EXISTS crawler_sync_logs (
  id VARCHAR(36) PRIMARY KEY,
  config_id VARCHAR(36) NOT NULL,              -- 爬虫配置ID
  start_time DATETIME NOT NULL,                -- 开始时间
  end_time DATETIME,                           -- 结束时间
  status VARCHAR(20) NOT NULL,                 -- running/success/failed
  total_fetched INT DEFAULT 0,                 -- 获取总数
  new_count INT DEFAULT 0,                     -- 新增数量
  updated_count INT DEFAULT 0,                 -- 更新数量
  skipped_count INT DEFAULT 0,                 -- 跳过数量
  error_count INT DEFAULT 0,                   -- 错误数量
  error_message TEXT,                          -- 错误信息
  sync_details JSON,                           -- 同步详情（可选，存储更多信息）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_config_id (config_id),
  INDEX idx_start_time (start_time),
  INDEX idx_status (status),
  FOREIGN KEY (config_id) REFERENCES crawler_configs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.3 waybills 表新增字段

```sql
-- 为 waybills 表添加 external_id 字段（用于增量同步去重）
ALTER TABLE waybills 
  ADD COLUMN external_id VARCHAR(50) COMMENT 'TMS系统原始ID',
  ADD COLUMN external_source VARCHAR(50) COMMENT '数据来源标识',
  ADD COLUMN external_synced_at DATETIME COMMENT '同步时间',
  ADD INDEX idx_external_id (external_id),
  ADD INDEX idx_external_source (external_source);
```

---

## 二、TMS字段完整映射

### 2.1 核心字段映射

| TMS字段 | 数据库字段 | 类型 | 说明 |
|---------|-----------|------|------|
| `id` | `external_id` | VARCHAR(50) | TMS记录ID（用于增量同步） |
| `car_batch` | `waybill_number` | VARCHAR(50) | 批次号 |
| `b_dr_name` | `driver_name` | VARCHAR(50) | 主驾司机 |
| `b_tr_num` | `vehicle_plate` | VARCHAR(20) | 车牌号 |
| `b_co_dr_name` | `co_driver` | VARCHAR(50) | 副驾司机 |
| `operator` | `operator` | VARCHAR(50) | 经办人 |
| `create_time` | `created_time` | DATETIME | 创建时间 |
| `truck_t` | `departure_time` | DATETIME | 发车时间 |
| `load_addr` | `departure_place` | VARCHAR(255) | 发货地/发站 |
| `unload_addr` | `arrival_place` | VARCHAR(255) | 收货地/到站 |
| `route_text` | `vehicle_route` | VARCHAR(255) | 车辆线路 |
| `batch_st` | `batch_status` | VARCHAR(20) | 批次状态 |
| `dispatch_driver_st` | `dispatch_status` | VARCHAR(20) | 派单状态 |
| `assign_st` | `assign_status` | VARCHAR(20) | 指派状态 |
| `b_remark` | `remark` | TEXT | 备注 |
| `customer_name` | `customer_name` | VARCHAR(100) | 客户名称 |
| `project_name` | `project_name` | VARCHAR(100) | 项目名称 |
| `branch` | `branch` | VARCHAR(100) | 网点 |
| `batch_tag` | `batch_tag` | VARCHAR(50) | 批次标识 |
| `batch_source` | `batch_source` | VARCHAR(50) | 批次来源 |
| `load_type` | `load_type` | VARCHAR(50) | 配载类型 |
| `batch_type` | `batch_type` | VARCHAR(50) | 批次类型 |
| `return_batch` | `return_batch_number` | VARCHAR(50) | 往返批次号 |
| `point_count` | `point_count` | INT | 点位数 |
| `transaction_time` | `transaction_time` | DATETIME | 交易时间 |
| `origin_departure_time` | `origin_departure_time` | DATETIME | 始发发车时间 |
| `dest_arrival_time` | `dest_arrival_time` | DATETIME | 终点到达时间 |
| `unload_wait_time` | `unload_wait_time` | VARCHAR(50) | 卸车等待时长 |

### 2.2 费用字段映射（应收）

| TMS字段 | 数据库字段 | 类型 | 说明 |
|---------|-----------|------|------|
| `receivable_total` | `receivable_total` | DECIMAL(12,2) | 应收运输费合计 |
| `receivable_trans_f` | `receivable_transport` | DECIMAL(12,2) | 应收运输费 |
| `receivable_point_fee` | `receivable_point_fee` | DECIMAL(12,2) | 应收点位费 |
| `receivable_upstairs_f` | `receivable_upstairs_fee` | DECIMAL(12,2) | 应收上楼费 |
| `receivable_handling_f` | `receivable_loading_fee` | DECIMAL(12,2) | 应收装卸费 |
| `receivable_spot_fee` | `receivable_cash` | DECIMAL(12,2) | 应收现付 |
| `receivable_collect` | `receivable_collect` | DECIMAL(12,2) | 应收到付 |
| `receivable_return` | `receivable_return` | DECIMAL(12,2) | 应收回付 |
| `receivable_other` | `receivable_other` | DECIMAL(12,2) | 应收其它 |

### 2.3 费用字段映射（应付）

| TMS字段 | 数据库字段 | 类型 | 说明 |
|---------|-----------|------|------|
| `payable_total` | `payable_total` | DECIMAL(12,2) | 应付运输费合计 |
| `b_dr_piece_rate` | `driver_piece_rate` | DECIMAL(12,2) | 主驾计件 |
| `b_co_dr_piece_rate` | `co_driver_piece_rate` | DECIMAL(12,2) | 副驾/装卸计件 |
| `b_fuel_card_f` | `payable_oil_card` | DECIMAL(12,2) | 应付油卡 |
| `b_arr_f` | `payable_collect` | DECIMAL(12,2) | 应付到付 |
| `payable_spot_fee` | `payable_cash` | DECIMAL(12,2) | 应付现付 |
| `payable_return` | `payable_return` | DECIMAL(12,2) | 应付回付 |
| `carpool_fee` | `carpool_fee` | DECIMAL(12,2) | 付拼车费 |
| `external_vehicle_fee` | `external_vehicle_fee` | DECIMAL(12,2) | 外调车费 |

### 2.4 其他费用/计算字段

| TMS字段 | 数据库字段 | 类型 | 说明 |
|---------|-----------|------|------|
| `tt_profit` | `profit` | DECIMAL(12,2) | 任务毛利 |
| `tt_profit_rate` | `profit_rate` | DECIMAL(5,2) | 任务毛利率 |
| `etc_fee` | `etc_fee` | DECIMAL(12,2) | ETC过路费 |
| `tt_volume` | `total_volume` | DECIMAL(12,2) | 总体积 |
| `monthly_cost` | `monthly_cost` | DECIMAL(12,2) | 月度分摊费用合计 |

### 2.5 状态码映射

TMS `batch_st` → 系统 `batch_status`：

| TMS值 | TMS含义 | 系统状态值 | 说明 |
|-------|--------|---------|------|
| 0 | 已取消 | cancelled | 批次已取消 |
| 1 | 待发车 | pending | 等待发车 |
| 2 | 在途 | in_transit | 运输中 |
| 3 | 已到达 | delivered | 已送达 |
| 4 | 已完成 | completed | 任务完成 |
| 10 | 未知状态 | pending | 默认处理为待发车 |

TMS `dispatch_driver_st` → 系统 `dispatch_status`：

| TMS值 | TMS含义 | 系统状态值 |
|-------|--------|---------|
| 0 | 未派单 | unassigned |
| 1 | 已派单 | assigned |
| 2 | 已接单 | accepted |
| 3 | 已拒绝 | rejected |

---

## 三、文件结构

```
backend/src/
├── crawler/
│   ├── crawler-service.ts      # 爬虫核心服务
│   ├── crawler-store.ts        # 配置和日志数据存储
│   ├── crawler-scheduler.ts    # 定时任务调度
│   ├── crawler-routes.ts       # API路由
│   └── field-mapper.ts         # TMS字段映射器
├── routes.ts                   # 添加爬虫路由挂载
└── index.ts                    # 启动调度器
```

---

## 四、爬虫核心服务实现

### 4.1 类型定义 `crawler/types.ts`

```typescript
// 爬虫配置接口
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
  extraParams?: Record<string, any>;
  syncEnabled: boolean;
  syncIntervalMinutes: number;
  lastSyncTime?: string;
  lastSyncRecordId?: string;
  lastSyncCount?: number;
  lastSyncStatus?: 'success' | 'failed' | 'running';
  lastSyncError?: string;
  createdAt: string;
  updatedAt: string;
}

// 同步日志接口
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
  syncDetails?: Record<string, any>;
  createdAt: string;
}

// 同步结果接口
export interface SyncResult {
  success: boolean;
  logId: string;
  totalFetched: number;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
  duration: number;  // 毫秒
}

// TMS API响应接口
export interface TmsApiResponse {
  errno: number;
  errmsg: string;
  res: {
    data: TmsWaybillRecord[];
    total: { count: number };
  };
  page_size: number;
}

// TMS运单记录接口
export interface TmsWaybillRecord {
  id: string;
  car_batch: string;
  b_dr_name?: string;
  b_tr_num?: string;
  b_co_dr_name?: string;
  operator?: string;
  create_time?: string;
  truck_t?: string;
  load_addr?: string;
  unload_addr?: string;
  route_text?: string;
  batch_st?: number;
  dispatch_driver_st?: number;
  assign_st?: number;
  b_remark?: string;
  customer_name?: string;
  project_name?: string;
  branch?: string;
  // 费用字段
  receivable_total?: number;
  receivable_trans_f?: number;
  receivable_point_fee?: number;
  receivable_upstairs_f?: number;
  receivable_handling_f?: number;
  receivable_spot_fee?: number;
  receivable_collect?: number;
  receivable_return?: number;
  receivable_other?: number;
  payable_total?: number;
  b_dr_piece_rate?: number;
  b_co_dr_piece_rate?: number;
  b_fuel_card_f?: number;
  b_arr_f?: number;
  payable_spot_fee?: number;
  payable_return?: number;
  carpool_fee?: number;
  external_vehicle_fee?: number;
  tt_profit?: number;
  tt_profit_rate?: number;
  etc_fee?: number;
  tt_volume?: number;
  monthly_cost?: number;
  // 其他字段...
  [key: string]: any;
}

// 测试连接结果
export interface TestConnectionResult {
  success: boolean;
  message: string;
  sampleCount?: number;
  totalCount?: number;
  sampleData?: any[];
}
```

### 4.2 字段映射器 `crawler/field-mapper.ts`

```typescript
import type { TmsWaybillRecord } from './types.js';

// 状态码映射
const BATCH_STATUS_MAP: Record<number, string> = {
  0: 'cancelled',
  1: 'pending',
  2: 'in_transit',
  3: 'delivered',
  4: 'completed',
  10: 'pending',  // 未知状态默认为待发车
};

const DISPATCH_STATUS_MAP: Record<number, string> = {
  0: 'unassigned',
  1: 'assigned',
  2: 'accepted',
  3: 'rejected',
};

/**
 * 将TMS记录映射为系统运单格式
 */
export function mapTmsToWaybill(
  record: TmsWaybillRecord, 
  financierId: string,
  source: string = 'tms_crawler'
): Record<string, any> {
  return {
    // 外部系统标识
    externalId: record.id,
    externalSource: source,
    externalSyncedAt: new Date().toISOString(),
    
    // 关联融资方
    customerId: financierId,
    
    // 核心字段
    waybillNumber: record.car_batch,
    driverName: record.b_dr_name || null,
    vehiclePlate: record.b_tr_num || null,
    coDriver: record.b_co_dr_name || null,
    operator: record.operator || null,
    createdTime: parseDateTime(record.create_time),
    departureTime: parseDateTime(record.truck_t),
    departurePlace: record.load_addr || null,
    arrivalPlace: record.unload_addr || null,
    vehicleRoute: record.route_text || null,
    remark: record.b_remark || null,
    customerName: record.customer_name || null,
    projectName: record.project_name || null,
    branch: record.branch || null,
    
    // 状态字段
    batchStatus: mapBatchStatus(record.batch_st),
    dispatchStatus: mapDispatchStatus(record.dispatch_driver_st),
    assignStatus: record.assign_st?.toString() || null,
    batchTag: record.batch_tag || null,
    batchSource: record.batch_source || null,
    loadType: record.load_type || null,
    batchType: record.batch_type || null,
    returnBatchNumber: record.return_batch || null,
    pointCount: record.point_count || null,
    transactionTime: parseDateTime(record.transaction_time),
    originDepartureTime: parseDateTime(record.origin_departure_time),
    destArrivalTime: parseDateTime(record.dest_arrival_time),
    unloadWaitTime: record.unload_wait_time || null,
    
    // 应收费用
    receivableTotal: parseDecimal(record.receivable_total),
    receivableTransport: parseDecimal(record.receivable_trans_f),
    receivablePointFee: parseDecimal(record.receivable_point_fee),
    receivableUpstairsFee: parseDecimal(record.receivable_upstairs_f),
    receivableLoadingFee: parseDecimal(record.receivable_handling_f),
    receivableCash: parseDecimal(record.receivable_spot_fee),
    receivableCollect: parseDecimal(record.receivable_collect),
    receivableReturn: parseDecimal(record.receivable_return),
    receivableOther: parseDecimal(record.receivable_other),
    
    // 应付费用
    payableTotal: parseDecimal(record.payable_total),
    driverPieceRate: parseDecimal(record.b_dr_piece_rate),
    coDriverPieceRate: parseDecimal(record.b_co_dr_piece_rate),
    payableOilCard: parseDecimal(record.b_fuel_card_f),
    payableCollect: parseDecimal(record.b_arr_f),
    payableCash: parseDecimal(record.payable_spot_fee),
    payableReturn: parseDecimal(record.payable_return),
    carpoolFee: parseDecimal(record.carpool_fee),
    externalVehicleFee: parseDecimal(record.external_vehicle_fee),
    
    // 其他计算字段
    profit: parseDecimal(record.tt_profit),
    profitRate: parseDecimal(record.tt_profit_rate),
    etcFee: parseDecimal(record.etc_fee),
    totalVolume: parseDecimal(record.tt_volume),
    monthlyCost: parseDecimal(record.monthly_cost),
    
    // 系统默认值
    status: 'pending',  // 系统内部状态，默认待处理
  };
}

/**
 * 映射批次状态
 */
function mapBatchStatus(status?: number): string {
  if (status === undefined || status === null) return 'pending';
  return BATCH_STATUS_MAP[status] || 'pending';
}

/**
 * 映射派单状态
 */
function mapDispatchStatus(status?: number): string {
  if (status === undefined || status === null) return 'unassigned';
  return DISPATCH_STATUS_MAP[status] || 'unassigned';
}

/**
 * 解析日期时间
 */
function parseDateTime(value?: string | null): string | null {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

/**
 * 解析数字字段
 */
function parseDecimal(value?: number | string | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}
```

### 4.3 数据存储 `crawler/crawler-store.ts`

```typescript
import { randomUUID } from 'crypto';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../db.js';
import type { CrawlerConfig, CrawlerSyncLog } from './types.js';

// ============ 配置管理 ============

/**
 * 获取爬虫配置列表
 */
export async function getCrawlerConfigs(
  filters?: { financierId?: string; syncEnabled?: boolean }
): Promise<CrawlerConfig[]> {
  let query = `SELECT * FROM crawler_configs WHERE deleted_at IS NULL`;
  const params: any[] = [];

  if (filters?.financierId) {
    query += ` AND financier_id = ?`;
    params.push(filters.financierId);
  }
  if (filters?.syncEnabled !== undefined) {
    query += ` AND sync_enabled = ?`;
    params.push(filters.syncEnabled);
  }

  query += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  return rows.map(mapConfigRow);
}

/**
 * 获取单个爬虫配置
 */
export async function getCrawlerConfigById(id: string): Promise<CrawlerConfig | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM crawler_configs WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] ? mapConfigRow(rows[0]) : null;
}

/**
 * 创建爬虫配置
 */
export async function createCrawlerConfig(
  input: Omit<CrawlerConfig, 'id' | 'createdAt' | 'updatedAt' | 'lastSyncTime' | 'lastSyncRecordId' | 'lastSyncCount' | 'lastSyncStatus' | 'lastSyncError'>
): Promise<CrawlerConfig> {
  const id = randomUUID();
  
  await pool.query(
    `INSERT INTO crawler_configs (
      id, financier_id, name, system_url, api_endpoint, cookies,
      company_id, user_id, group_id, extra_params,
      sync_enabled, sync_interval_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.financierId,
      input.name,
      input.systemUrl,
      input.apiEndpoint,
      input.cookies,
      input.companyId || null,
      input.userId || null,
      input.groupId || null,
      input.extraParams ? JSON.stringify(input.extraParams) : null,
      input.syncEnabled,
      input.syncIntervalMinutes,
    ]
  );

  const config = await getCrawlerConfigById(id);
  if (!config) throw new Error('创建配置失败');
  return config;
}

/**
 * 更新爬虫配置
 */
export async function updateCrawlerConfig(
  id: string,
  input: Partial<CrawlerConfig>
): Promise<CrawlerConfig> {
  const updates: string[] = [];
  const params: any[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    params.push(input.name);
  }
  if (input.systemUrl !== undefined) {
    updates.push('system_url = ?');
    params.push(input.systemUrl);
  }
  if (input.apiEndpoint !== undefined) {
    updates.push('api_endpoint = ?');
    params.push(input.apiEndpoint);
  }
  if (input.cookies !== undefined) {
    updates.push('cookies = ?');
    params.push(input.cookies);
  }
  if (input.companyId !== undefined) {
    updates.push('company_id = ?');
    params.push(input.companyId);
  }
  if (input.userId !== undefined) {
    updates.push('user_id = ?');
    params.push(input.userId);
  }
  if (input.groupId !== undefined) {
    updates.push('group_id = ?');
    params.push(input.groupId);
  }
  if (input.extraParams !== undefined) {
    updates.push('extra_params = ?');
    params.push(JSON.stringify(input.extraParams));
  }
  if (input.syncEnabled !== undefined) {
    updates.push('sync_enabled = ?');
    params.push(input.syncEnabled);
  }
  if (input.syncIntervalMinutes !== undefined) {
    updates.push('sync_interval_minutes = ?');
    params.push(input.syncIntervalMinutes);
  }

  if (updates.length === 0) {
    const config = await getCrawlerConfigById(id);
    if (!config) throw new Error('配置不存在');
    return config;
  }

  params.push(id);
  await pool.query(
    `UPDATE crawler_configs SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  const config = await getCrawlerConfigById(id);
  if (!config) throw new Error('配置不存在');
  return config;
}

/**
 * 更新同步状态
 */
export async function updateCrawlerSyncStatus(
  id: string,
  status: {
    lastSyncTime?: string;
    lastSyncRecordId?: string;
    lastSyncCount?: number;
    lastSyncStatus?: string;
    lastSyncError?: string | null;
  }
): Promise<void> {
  await pool.query(
    `UPDATE crawler_configs SET 
      last_sync_time = COALESCE(?, last_sync_time),
      last_sync_record_id = COALESCE(?, last_sync_record_id),
      last_sync_count = COALESCE(?, last_sync_count),
      last_sync_status = COALESCE(?, last_sync_status),
      last_sync_error = ?
    WHERE id = ? AND deleted_at IS NULL`,
    [
      status.lastSyncTime || null,
      status.lastSyncRecordId || null,
      status.lastSyncCount ?? null,
      status.lastSyncStatus || null,
      status.lastSyncError ?? null,
      id,
    ]
  );
}

/**
 * 删除爬虫配置（软删除）
 */
export async function deleteCrawlerConfig(id: string): Promise<void> {
  await pool.query(
    `UPDATE crawler_configs SET deleted_at = NOW() WHERE id = ?`,
    [id]
  );
}

// ============ 同步日志 ============

/**
 * 创建同步日志
 */
export async function createSyncLog(
  configId: string,
  status: 'running' | 'success' | 'failed' = 'running'
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO crawler_sync_logs (id, config_id, start_time, status) VALUES (?, ?, NOW(), ?)`,
    [id, configId, status]
  );
  return id;
}

/**
 * 更新同步日志
 */
export async function updateSyncLog(
  logId: string,
  data: {
    status?: 'running' | 'success' | 'failed';
    totalFetched?: number;
    newCount?: number;
    updatedCount?: number;
    skippedCount?: number;
    errorCount?: number;
    errorMessage?: string | null;
    syncDetails?: Record<string, any>;
  }
): Promise<void> {
  const updates: string[] = ['end_time = NOW()'];
  const params: any[] = [];

  if (data.status !== undefined) {
    updates.push('status = ?');
    params.push(data.status);
  }
  if (data.totalFetched !== undefined) {
    updates.push('total_fetched = ?');
    params.push(data.totalFetched);
  }
  if (data.newCount !== undefined) {
    updates.push('new_count = ?');
    params.push(data.newCount);
  }
  if (data.updatedCount !== undefined) {
    updates.push('updated_count = ?');
    params.push(data.updatedCount);
  }
  if (data.skippedCount !== undefined) {
    updates.push('skipped_count = ?');
    params.push(data.skippedCount);
  }
  if (data.errorCount !== undefined) {
    updates.push('error_count = ?');
    params.push(data.errorCount);
  }
  if (data.errorMessage !== undefined) {
    updates.push('error_message = ?');
    params.push(data.errorMessage);
  }
  if (data.syncDetails !== undefined) {
    updates.push('sync_details = ?');
    params.push(JSON.stringify(data.syncDetails));
  }

  params.push(logId);
  await pool.query(
    `UPDATE crawler_sync_logs SET ${updates.join(', ')} WHERE id = ?`,
    params
  );
}

/**
 * 获取同步日志列表
 */
export async function getSyncLogs(
  configId: string,
  limit: number = 50
): Promise<CrawlerSyncLog[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM crawler_sync_logs WHERE config_id = ? ORDER BY start_time DESC LIMIT ?`,
    [configId, limit]
  );
  return rows.map(mapLogRow);
}

/**
 * 获取需要同步的配置列表
 */
export async function getConfigsNeedingSync(): Promise<CrawlerConfig[]> {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT * FROM crawler_configs 
    WHERE deleted_at IS NULL 
      AND sync_enabled = true
      AND (
        last_sync_time IS NULL 
        OR TIMESTAMPDIFF(MINUTE, last_sync_time, NOW()) >= sync_interval_minutes
      )
      AND (last_sync_status IS NULL OR last_sync_status != 'running')
    ORDER BY last_sync_time ASC
  `);
  return rows.map(mapConfigRow);
}

// ============ 辅助函数 ============

function mapConfigRow(row: RowDataPacket): CrawlerConfig {
  return {
    id: row.id,
    financierId: row.financier_id,
    name: row.name,
    systemUrl: row.system_url,
    apiEndpoint: row.api_endpoint,
    cookies: row.cookies,
    companyId: row.company_id || undefined,
    userId: row.user_id || undefined,
    groupId: row.group_id || undefined,
    extraParams: row.extra_params ? JSON.parse(row.extra_params) : undefined,
    syncEnabled: Boolean(row.sync_enabled),
    syncIntervalMinutes: row.sync_interval_minutes,
    lastSyncTime: row.last_sync_time ? new Date(row.last_sync_time).toISOString() : undefined,
    lastSyncRecordId: row.last_sync_record_id || undefined,
    lastSyncCount: row.last_sync_count || undefined,
    lastSyncStatus: row.last_sync_status || undefined,
    lastSyncError: row.last_sync_error || undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapLogRow(row: RowDataPacket): CrawlerSyncLog {
  return {
    id: row.id,
    configId: row.config_id,
    startTime: new Date(row.start_time).toISOString(),
    endTime: row.end_time ? new Date(row.end_time).toISOString() : undefined,
    status: row.status,
    totalFetched: row.total_fetched || 0,
    newCount: row.new_count || 0,
    updatedCount: row.updated_count || 0,
    skippedCount: row.skipped_count || 0,
    errorCount: row.error_count || 0,
    errorMessage: row.error_message || undefined,
    syncDetails: row.sync_details ? JSON.parse(row.sync_details) : undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
```

### 4.4 爬虫核心服务 `crawler/crawler-service.ts`

```typescript
import type { RowDataPacket } from 'mysql2';
import { pool } from '../db.js';
import {
  getCrawlerConfigById,
  createSyncLog,
  updateSyncLog,
  updateCrawlerSyncStatus,
} from './crawler-store.js';
import { mapTmsToWaybill } from './field-mapper.js';
import type { 
  CrawlerConfig, 
  SyncResult, 
  TmsApiResponse, 
  TestConnectionResult 
} from './types.js';

// 同步配置
const SYNC_CONFIG = {
  pageSize: 100,
  maxPages: 100,           // 最大抓取页数（防止死循环）
  requestDelayMs: 500,     // 请求间隔（毫秒）
  requestTimeoutMs: 30000, // 请求超时（毫秒）
};

/**
 * 爬虫服务类
 */
export class CrawlerService {
  /**
   * 测试TMS连接
   */
  async testConnection(config: Partial<CrawlerConfig>): Promise<TestConnectionResult> {
    if (!config.systemUrl || !config.apiEndpoint || !config.cookies) {
      return {
        success: false,
        message: '缺少必要参数：系统地址、API路径、Cookie',
      };
    }

    try {
      // 只获取第一页来测试
      const response = await this.fetchPage(config as CrawlerConfig, 1, 10);
      
      if (response.errno !== 0) {
        return {
          success: false,
          message: `TMS接口返回错误: ${response.errmsg}`,
        };
      }

      return {
        success: true,
        message: '连接成功',
        sampleCount: response.res?.data?.length || 0,
        totalCount: response.res?.total?.count || 0,
        sampleData: response.res?.data?.slice(0, 3),  // 返回前3条样例
      };
    } catch (error: any) {
      return {
        success: false,
        message: `连接失败: ${error.message}`,
      };
    }
  }

  /**
   * 执行同步任务
   */
  async syncWaybills(configId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const config = await getCrawlerConfigById(configId);
    
    if (!config) {
      throw new Error('配置不存在');
    }

    // 创建同步日志
    const logId = await createSyncLog(configId, 'running');
    
    // 更新配置状态为同步中
    await updateCrawlerSyncStatus(configId, {
      lastSyncStatus: 'running',
      lastSyncError: null,
    });

    const result: SyncResult = {
      success: false,
      logId,
      totalFetched: 0,
      newCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      errors: [],
      duration: 0,
    };

    try {
      // 执行增量同步
      await this.incrementalSync(config, result);
      
      result.success = true;
      result.duration = Date.now() - startTime;

      // 更新同步日志
      await updateSyncLog(logId, {
        status: 'success',
        totalFetched: result.totalFetched,
        newCount: result.newCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        errorMessage: result.errors.length > 0 ? result.errors.join('\n') : null,
      });

      // 更新配置同步状态
      await updateCrawlerSyncStatus(configId, {
        lastSyncTime: new Date().toISOString(),
        lastSyncCount: result.newCount,
        lastSyncStatus: 'success',
        lastSyncError: null,
      });

      console.log(`[Crawler] Sync completed for ${config.name}: +${result.newCount} new, ${result.skippedCount} skipped`);
      
    } catch (error: any) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.errors.push(error.message);

      // 更新同步日志为失败
      await updateSyncLog(logId, {
        status: 'failed',
        totalFetched: result.totalFetched,
        newCount: result.newCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        errorMessage: error.message,
      });

      // 更新配置同步状态
      await updateCrawlerSyncStatus(configId, {
        lastSyncStatus: 'failed',
        lastSyncError: error.message,
      });

      console.error(`[Crawler] Sync failed for ${config.name}:`, error.message);
    }

    return result;
  }

  /**
   * 增量同步逻辑
   */
  private async incrementalSync(config: CrawlerConfig, result: SyncResult): Promise<void> {
    let pageNum = 1;
    let hasMore = true;
    let lastRecordId: string | undefined;

    while (hasMore && pageNum <= SYNC_CONFIG.maxPages) {
      // 获取一页数据
      const response = await this.fetchPage(config, pageNum, SYNC_CONFIG.pageSize);
      
      if (response.errno !== 0) {
        throw new Error(`TMS接口错误: ${response.errmsg}`);
      }

      const records = response.res?.data || [];
      result.totalFetched += records.length;

      // 处理每条记录
      for (const record of records) {
        try {
          // 检查是否已存在（通过 external_id）
          const existing = await this.getWaybillByExternalId(record.id);
          
          if (existing) {
            result.skippedCount++;
            continue;
          }

          // 映射字段并创建运单
          const waybillData = mapTmsToWaybill(record, config.financierId);
          await this.createWaybillFromCrawler(waybillData);
          result.newCount++;
          lastRecordId = record.id;
          
        } catch (err: any) {
          result.errorCount++;
          result.errors.push(`记录 ${record.id}: ${err.message}`);
        }
      }

      // 检查是否还有更多数据
      hasMore = records.length >= SYNC_CONFIG.pageSize;
      pageNum++;

      // 请求间隔，避免请求过快
      if (hasMore) {
        await this.delay(SYNC_CONFIG.requestDelayMs);
      }
    }

    // 更新最后同步的记录ID
    if (lastRecordId) {
      await updateCrawlerSyncStatus(config.id, {
        lastSyncRecordId: lastRecordId,
      });
    }
  }

  /**
   * 获取一页TMS数据
   */
  private async fetchPage(
    config: CrawlerConfig, 
    pageNum: number, 
    pageSize: number
  ): Promise<TmsApiResponse> {
    const url = `${config.systemUrl}${config.apiEndpoint}`;
    
    // 构建请求参数
    const params = new URLSearchParams();
    params.append('page', pageNum.toString());
    params.append('page_size', pageSize.toString());
    
    if (config.userId) {
      params.append('logid', config.userId);
    }
    if (config.groupId) {
      params.append('gid', config.groupId);
    }
    if (config.companyId) {
      params.append('company_id', config.companyId);
    }
    
    // 添加额外参数
    if (config.extraParams) {
      for (const [key, value] of Object.entries(config.extraParams)) {
        params.append(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_CONFIG.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': config.cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as TmsApiResponse;
      return data;
      
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('请求超时');
      }
      throw error;
    }
  }

  /**
   * 通过外部ID查找运单
   */
  private async getWaybillByExternalId(externalId: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 FROM waybills WHERE external_id = ? AND deleted_at IS NULL LIMIT 1`,
      [externalId]
    );
    return rows.length > 0;
  }

  /**
   * 从爬虫数据创建运单
   */
  private async createWaybillFromCrawler(data: Record<string, any>): Promise<void> {
    const { randomUUID } = await import('crypto');
    const id = randomUUID();
    
    // 检查运单号是否已存在
    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT 1 FROM waybills WHERE waybill_number = ? AND deleted_at IS NULL LIMIT 1`,
      [data.waybillNumber]
    );
    
    if (existing.length > 0) {
      throw new Error('运单号已存在');
    }

    await pool.query(
      `INSERT INTO waybills (
        id, waybill_number, external_id, external_source, external_synced_at,
        customer_id, customer_name, driver_name, co_driver, vehicle_plate,
        operator, created_time, departure_time, departure_place, arrival_place,
        vehicle_route, batch_status, dispatch_status, assign_status, remark,
        project_name, branch, batch_tag, batch_source, load_type, batch_type,
        return_batch_number, point_count, transaction_time, origin_departure_time,
        dest_arrival_time, unload_wait_time,
        receivable_total, receivable_transport, receivable_point_fee,
        receivable_upstairs_fee, receivable_loading_fee, receivable_cash,
        receivable_collect, receivable_return, receivable_other,
        payable_total, driver_piece_rate, co_driver_piece_rate,
        payable_oil_card, payable_collect, payable_cash, payable_return,
        carpool_fee, external_vehicle_fee,
        profit, profit_rate, etc_fee, total_volume, monthly_cost,
        status
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?
      )`,
      [
        id, data.waybillNumber, data.externalId, data.externalSource, data.externalSyncedAt,
        data.customerId, data.customerName, data.driverName, data.coDriver, data.vehiclePlate,
        data.operator, data.createdTime, data.departureTime, data.departurePlace, data.arrivalPlace,
        data.vehicleRoute, data.batchStatus, data.dispatchStatus, data.assignStatus, data.remark,
        data.projectName, data.branch, data.batchTag, data.batchSource, data.loadType, data.batchType,
        data.returnBatchNumber, data.pointCount, data.transactionTime, data.originDepartureTime,
        data.destArrivalTime, data.unloadWaitTime,
        data.receivableTotal, data.receivableTransport, data.receivablePointFee,
        data.receivableUpstairsFee, data.receivableLoadingFee, data.receivableCash,
        data.receivableCollect, data.receivableReturn, data.receivableOther,
        data.payableTotal, data.driverPieceRate, data.coDriverPieceRate,
        data.payableOilCard, data.payableCollect, data.payableCash, data.payableReturn,
        data.carpoolFee, data.externalVehicleFee,
        data.profit, data.profitRate, data.etcFee, data.totalVolume, data.monthlyCost,
        data.status,
      ]
    );
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例
export const crawlerService = new CrawlerService();
```

---

## 五、API接口设计

### 5.1 路由定义 `crawler/crawler-routes.ts`

```typescript
import { Router, Response } from 'express';
import type { AuthenticatedRequest } from '../auth.js';
import { authenticate } from '../auth.js';
import { crawlerService } from './crawler-service.js';
import {
  getCrawlerConfigs,
  getCrawlerConfigById,
  createCrawlerConfig,
  updateCrawlerConfig,
  deleteCrawlerConfig,
  getSyncLogs,
} from './crawler-store.js';

const router = Router();

/**
 * 获取爬虫配置列表
 * GET /api/crawlers?financierId=xxx
 */
router.get('/crawlers', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { financierId } = req.query;
    
    // 权限检查：只有平台用户或对应融资方可以查看
    const orgContext = req.orgContext;
    if (orgContext && !orgContext.isPlatformUser) {
      if (orgContext.orgType !== 'financier') {
        return res.status(403).json({ error: '无权限查看爬虫配置' });
      }
      if (financierId && financierId !== orgContext.relatedEntityId) {
        return res.status(403).json({ error: '无权限查看其他融资方配置' });
      }
    }

    const configs = await getCrawlerConfigs({
      financierId: financierId as string,
    });
    
    // 脱敏处理：不返回完整Cookie
    const safeConfigs = configs.map(c => ({
      ...c,
      cookies: c.cookies ? `${c.cookies.substring(0, 50)}...` : '',
    }));
    
    res.json({ configs: safeConfigs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 获取单个爬虫配置
 * GET /api/crawlers/:id
 */
router.get('/crawlers/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await getCrawlerConfigById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: '配置不存在' });
    }
    
    // 权限检查
    const orgContext = req.orgContext;
    if (orgContext && !orgContext.isPlatformUser) {
      if (orgContext.orgType !== 'financier' || config.financierId !== orgContext.relatedEntityId) {
        return res.status(403).json({ error: '无权限查看此配置' });
      }
    }
    
    res.json({ config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 创建爬虫配置
 * POST /api/crawlers
 */
router.post('/crawlers', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { financierId, name, systemUrl, apiEndpoint, cookies, 
            companyId, userId, groupId, extraParams,
            syncEnabled, syncIntervalMinutes } = req.body;
    
    // 参数校验
    if (!financierId || !name || !systemUrl || !apiEndpoint || !cookies) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    // 权限检查
    const orgContext = req.orgContext;
    if (orgContext && !orgContext.isPlatformUser) {
      if (orgContext.orgType !== 'financier' || financierId !== orgContext.relatedEntityId) {
        return res.status(403).json({ error: '无权限创建此配置' });
      }
    }

    const config = await createCrawlerConfig({
      financierId,
      name,
      systemUrl,
      apiEndpoint,
      cookies,
      companyId,
      userId,
      groupId,
      extraParams,
      syncEnabled: syncEnabled ?? true,
      syncIntervalMinutes: syncIntervalMinutes ?? 60,
    });
    
    res.status(201).json({ config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 更新爬虫配置
 * PUT /api/crawlers/:id
 */
router.put('/crawlers/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = await getCrawlerConfigById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '配置不存在' });
    }
    
    // 权限检查
    const orgContext = req.orgContext;
    if (orgContext && !orgContext.isPlatformUser) {
      if (orgContext.orgType !== 'financier' || existing.financierId !== orgContext.relatedEntityId) {
        return res.status(403).json({ error: '无权限修改此配置' });
      }
    }

    const config = await updateCrawlerConfig(req.params.id, req.body);
    res.json({ config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 删除爬虫配置
 * DELETE /api/crawlers/:id
 */
router.delete('/crawlers/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = await getCrawlerConfigById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '配置不存在' });
    }
    
    // 权限检查
    const orgContext = req.orgContext;
    if (orgContext && !orgContext.isPlatformUser) {
      if (orgContext.orgType !== 'financier' || existing.financierId !== orgContext.relatedEntityId) {
        return res.status(403).json({ error: '无权限删除此配置' });
      }
    }

    await deleteCrawlerConfig(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 测试连接
 * POST /api/crawlers/test
 */
router.post('/crawlers/test', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { systemUrl, apiEndpoint, cookies, companyId, userId, groupId } = req.body;
    
    if (!systemUrl || !apiEndpoint || !cookies) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const result = await crawlerService.testConnection({
      systemUrl,
      apiEndpoint,
      cookies,
      companyId,
      userId,
      groupId,
    });
    
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 测试已有配置连接
 * POST /api/crawlers/:id/test
 */
router.post('/crawlers/:id/test', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await getCrawlerConfigById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: '配置不存在' });
    }

    const result = await crawlerService.testConnection(config);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 手动触发同步
 * POST /api/crawlers/:id/sync
 */
router.post('/crawlers/:id/sync', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await getCrawlerConfigById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: '配置不存在' });
    }
    
    // 权限检查
    const orgContext = req.orgContext;
    if (orgContext && !orgContext.isPlatformUser) {
      if (orgContext.orgType !== 'financier' || config.financierId !== orgContext.relatedEntityId) {
        return res.status(403).json({ error: '无权限执行同步' });
      }
    }

    // 检查是否已在同步中
    if (config.lastSyncStatus === 'running') {
      return res.status(409).json({ error: '同步任务正在执行中' });
    }

    const result = await crawlerService.syncWaybills(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 获取同步日志
 * GET /api/crawlers/:id/logs
 */
router.get('/crawlers/:id/logs', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await getCrawlerConfigById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: '配置不存在' });
    }
    
    // 权限检查
    const orgContext = req.orgContext;
    if (orgContext && !orgContext.isPlatformUser) {
      if (orgContext.orgType !== 'financier' || config.financierId !== orgContext.relatedEntityId) {
        return res.status(403).json({ error: '无权限查看日志' });
      }
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await getSyncLogs(req.params.id, limit);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

### 5.2 路由挂载

在 `backend/src/routes.ts` 中添加：

```typescript
import crawlerRoutes from './crawler/crawler-routes.js';

// ... 其他路由 ...

// 爬虫相关路由
router.use(crawlerRoutes);
```

### 5.3 API接口汇总

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/crawlers` | 获取配置列表 |
| GET | `/api/crawlers/:id` | 获取单个配置 |
| POST | `/api/crawlers` | 创建配置 |
| PUT | `/api/crawlers/:id` | 更新配置 |
| DELETE | `/api/crawlers/:id` | 删除配置 |
| POST | `/api/crawlers/test` | 测试新配置连接 |
| POST | `/api/crawlers/:id/test` | 测试已有配置连接 |
| POST | `/api/crawlers/:id/sync` | 手动触发同步 |
| GET | `/api/crawlers/:id/logs` | 获取同步日志 |

---

## 六、定时任务调度

### 6.1 调度器实现 `crawler/crawler-scheduler.ts`

```typescript
import cron from 'node-cron';
import { crawlerService } from './crawler-service.js';
import { getConfigsNeedingSync } from './crawler-store.js';

let schedulerTask: cron.ScheduledTask | null = null;
let isRunning = false;

/**
 * 启动爬虫调度器
 */
export function startCrawlerScheduler(): void {
  if (schedulerTask) {
    console.log('[Crawler Scheduler] Already running');
    return;
  }

  console.log('[Crawler Scheduler] Starting...');

  // 每分钟检查一次需要同步的配置
  schedulerTask = cron.schedule('* * * * *', async () => {
    if (isRunning) {
      console.log('[Crawler Scheduler] Previous job still running, skipping...');
      return;
    }

    isRunning = true;
    try {
      await runScheduledSync();
    } catch (error: any) {
      console.error('[Crawler Scheduler] Error:', error.message);
    } finally {
      isRunning = false;
    }
  });

  console.log('[Crawler Scheduler] Started successfully');
}

/**
 * 停止爬虫调度器
 */
export function stopCrawlerScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log('[Crawler Scheduler] Stopped');
  }
}

/**
 * 执行定时同步任务
 */
async function runScheduledSync(): Promise<void> {
  const configs = await getConfigsNeedingSync();
  
  if (configs.length === 0) {
    return;
  }

  console.log(`[Crawler Scheduler] Found ${configs.length} configs needing sync`);

  // 串行执行，避免同时太多请求
  for (const config of configs) {
    try {
      console.log(`[Crawler Scheduler] Starting sync for: ${config.name}`);
      const result = await crawlerService.syncWaybills(config.id);
      console.log(`[Crawler Scheduler] Completed: ${config.name} - +${result.newCount} new`);
    } catch (error: any) {
      console.error(`[Crawler Scheduler] Failed: ${config.name} - ${error.message}`);
    }
    
    // 配置之间间隔5秒，避免过于频繁
    await delay(5000);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 6.2 启动调度器

在 `backend/src/index.ts` 中添加：

```typescript
import { startCrawlerScheduler } from './crawler/crawler-scheduler.js';

// 在服务启动后启动爬虫调度器
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // 启动爬虫调度器
  if (process.env.CRAWLER_ENABLED !== 'false') {
    startCrawlerScheduler();
  }
});
```

---

## 七、增量同步逻辑说明

### 7.1 同步流程

```
┌─────────────────────────────────────────────────────────────┐
│                      增量同步流程                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  创建同步日志    │
                    │  状态：running   │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   请求第1页数据  │◄─────────────┐
                    └─────────────────┘              │
                              │                      │
                              ▼                      │
              ┌───────────────────────────┐         │
              │  遍历每条记录              │         │
              │  ├─ 查询 external_id 是否存在        │
              │  ├─ 已存在 → skipped++     │         │
              │  └─ 不存在 → 映射并创建    │         │
              │             new++          │         │
              └───────────────────────────┘         │
                              │                      │
                              ▼                      │
              ┌───────────────────────────┐         │
              │  检查是否有更多数据        │         │
              │  records.length >= pageSize│         │
              └───────────────────────────┘         │
                    │                │               │
                   Yes              No               │
                    │                │               │
                    ▼                ▼               │
            ┌─────────────┐  ┌─────────────┐        │
            │ 延迟500ms   │  │  同步完成   │        │
            │ 请求下一页  │──│  更新状态   │        │
            └─────────────┘  └─────────────┘        │
                    │                                │
                    └────────────────────────────────┘
```

### 7.2 去重策略

1. **主键去重**：使用 TMS 系统的 `id` 作为 `external_id`，确保同一条记录不会重复导入
2. **运单号去重**：如果运单号已存在，也会跳过（双重保险）
3. **状态检查**：同步任务运行时会检查配置状态，避免重复执行

### 7.3 错误处理

- **网络错误**：记录到日志，标记为失败，下次调度时重试
- **数据错误**：单条记录失败不影响其他记录，错误计数并记录详情
- **超时处理**：单次请求30秒超时，避免长时间阻塞
- **Cookie过期**：连接测试失败时返回明确提示

---

## 八、验收标准

### 8.1 配置管理

- [ ] 可以为融资方创建爬虫配置
- [ ] 可以编辑爬虫配置（修改Cookie、同步间隔等）
- [ ] 可以删除爬虫配置（软删除）
- [ ] 可以启用/禁用同步
- [ ] 配置列表正确展示最后同步时间和状态

### 8.2 连接测试

- [ ] 测试连接返回明确的成功/失败信息
- [ ] 成功时显示数据总量
- [ ] 失败时显示具体错误原因（Cookie过期、网络错误等）

### 8.3 数据同步

- [ ] 支持增量同步（通过 external_id 判断）
- [ ] 正确映射所有字段（见字段映射表）
- [ ] 正确映射状态码
- [ ] 费用字段完整同步
- [ ] 同步的运单自动关联融资方 (customer_id)

### 8.4 定时任务

- [ ] 支持配置同步间隔（30分钟~24小时）
- [ ] 定时任务按间隔自动执行
- [ ] 同一时间只有一个同步任务运行
- [ ] 服务重启后自动恢复调度

### 8.5 日志记录

- [ ] 记录每次同步的开始/结束时间
- [ ] 记录成功/失败/跳过数量
- [ ] 记录错误详情
- [ ] 日志可分页查询

### 8.6 权限控制

- [ ] 融资方只能管理自己的配置
- [ ] 资金方无法访问爬虫功能
- [ ] 平台用户可以管理所有配置

---

## 九、依赖安装

```bash
cd backend
npm install node-cron
npm install -D @types/node-cron
```

---

## 十、注意事项

1. **Cookie安全**：Cookie在数据库中明文存储，建议生产环境考虑加密存储
2. **请求频率**：默认500ms请求间隔，避免对目标系统造成压力
3. **错误重试**：网络错误自动在下次调度时重试，无需人工干预
4. **日志清理**：建议定期清理30天前的同步日志，避免表过大
5. **并发控制**：同一配置同时只能有一个同步任务运行

---

## 十一、环境变量

```env
# 爬虫功能开关（默认开启）
CRAWLER_ENABLED=true
```

---

*任务文档版本: v2.0*
*最后更新: 2026-01-15*
