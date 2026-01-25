import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db.js";

// 运单数据接口 - 支持CSV所有字段
interface Waybill {
  id: string;
  waybillNumber: string; // 批次号
  operator?: string; // 经办人
  driverName?: string; // 主驾司机
  coDriver?: string; // 副驾司机
  vehiclePlate?: string; // 车牌号
  monthlyCost?: number; // 月度分摊费用合计
  createdTime?: string; // 创建时间
  departureTime?: string; // 发车时间
  remark?: string; // 批次备注
  totalVolume?: number; // 总体积
  vehicleRoute?: string; // 车辆线路
  driverPieceRate?: number; // 主驾计件
  branch?: string; // 网点
  customerName?: string; // 客户名称
  returnBatchNumber?: string; // 往返批次号
  projectName?: string; // 项目名称
  batchStatus?: string; // 批次状态
  assignStatus?: string; // 批次指派状态
  dispatchStatus?: string; // 批次派单状态
  batchTag?: string; // 批次标识
  batchSource?: string; // 批次来源
  loadType?: string; // 配载类型
  batchType?: string; // 批次类型
  pointCount?: number; // 点位数
  transactionTime?: string; // 交易时间
  originDepartureTime?: string; // 始发发车时间
  destArrivalTime?: string; // 终点到达时间
  unloadWaitTime?: string; // 卸车等待时长
  receivableTotal?: number; // 应收运输费合计
  receivableTransport?: number; // 应收运输费
  receivablePointFee?: number; // 应收点位费
  receivableUpstairsFee?: number; // 应收上楼费
  receivableLoadingFee?: number; // 应收装卸费
  receivableCash?: number; // 应收现付
  receivableCollect?: number; // 应收到付
  receivableReturn?: number; // 应收回付
  receivableOther?: number; // 应收其它
  payableTotal?: number; // 应付运输费合计
  coDriverPieceRate?: number; // 副驾/装卸计件
  carpoolFee?: number; // 付拼车费
  externalVehicleFee?: number; // 外调车费
  payableCash?: number; // 应付现付
  payableCollect?: number; // 应付到付
  payableOilCard?: number; // 应付油卡
  payableReturn?: number; // 应付回付
  departurePlace?: string; // 发站
  arrivalPlace?: string; // 到站
  profit?: number; // 任务毛利
  profitRate?: number; // 任务毛利率
  etcFee?: number; // ETC过路费
  // 兼容旧字段
  customerId?: string;
  contractId?: string;
  contractNumber?: string;
  businessMode?: string;
  driverPhone?: string;
  goodsName?: string;
  goodsWeight?: number;
  freightAmount?: number;
  oilCardAmount?: number;
  etcAmount?: number;
  cashAmount?: number;
  totalPayment?: number;
  waybillDate?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

interface WaybillStats {
  totalCount: number;
  pendingCount: number;
  confirmedCount: number;
  settledCount: number;
  totalReceivable: number;
  totalPayable: number;
  totalProfit: number;
}

interface WaybillRow extends RowDataPacket {
  id: string;
  waybill_number: string;
  operator: string | null;
  driver_name: string | null;
  co_driver: string | null;
  vehicle_plate: string | null;
  monthly_cost: number | null;
  created_time: string | null;
  departure_time: string | null;
  remark: string | null;
  total_volume: number | null;
  vehicle_route: string | null;
  driver_piece_rate: number | null;
  branch: string | null;
  customer_name: string | null;
  return_batch_number: string | null;
  project_name: string | null;
  batch_status: string | null;
  assign_status: string | null;
  dispatch_status: string | null;
  batch_tag: string | null;
  batch_source: string | null;
  load_type: string | null;
  batch_type: string | null;
  point_count: number | null;
  transaction_time: string | null;
  origin_departure_time: string | null;
  dest_arrival_time: string | null;
  unload_wait_time: string | null;
  receivable_total: number | null;
  receivable_transport: number | null;
  receivable_point_fee: number | null;
  receivable_upstairs_fee: number | null;
  receivable_loading_fee: number | null;
  receivable_cash: number | null;
  receivable_collect: number | null;
  receivable_return: number | null;
  receivable_other: number | null;
  payable_total: number | null;
  co_driver_piece_rate: number | null;
  carpool_fee: number | null;
  external_vehicle_fee: number | null;
  payable_cash: number | null;
  payable_collect: number | null;
  payable_oil_card: number | null;
  payable_return: number | null;
  departure_place: string | null;
  arrival_place: string | null;
  profit: number | null;
  profit_rate: number | null;
  etc_fee: number | null;
  // 兼容旧字段
  customer_id: string | null;
  contract_id: string | null;
  contract_number: string | null;
  business_mode: string | null;
  driver_phone: string | null;
  goods_name: string | null;
  goods_weight: number | null;
  freight_amount: number | null;
  oil_card_amount: number | null;
  etc_amount: number | null;
  cash_amount: number | null;
  total_payment: number | null;
  waybill_date: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

function mapWaybillRow(row: WaybillRow): Waybill {
  return {
    id: row.id,
    waybillNumber: row.waybill_number,
    operator: row.operator || undefined,
    driverName: row.driver_name || undefined,
    coDriver: row.co_driver || undefined,
    vehiclePlate: row.vehicle_plate || undefined,
    monthlyCost: row.monthly_cost ? Number(row.monthly_cost) : undefined,
    createdTime: row.created_time || undefined,
    departureTime: row.departure_time || undefined,
    remark: row.remark || undefined,
    totalVolume: row.total_volume ? Number(row.total_volume) : undefined,
    vehicleRoute: row.vehicle_route || undefined,
    driverPieceRate: row.driver_piece_rate ? Number(row.driver_piece_rate) : undefined,
    branch: row.branch || undefined,
    customerName: row.customer_name || undefined,
    returnBatchNumber: row.return_batch_number || undefined,
    projectName: row.project_name || undefined,
    batchStatus: row.batch_status || undefined,
    assignStatus: row.assign_status || undefined,
    dispatchStatus: row.dispatch_status || undefined,
    batchTag: row.batch_tag || undefined,
    batchSource: row.batch_source || undefined,
    loadType: row.load_type || undefined,
    batchType: row.batch_type || undefined,
    pointCount: row.point_count ? Number(row.point_count) : undefined,
    transactionTime: row.transaction_time || undefined,
    originDepartureTime: row.origin_departure_time || undefined,
    destArrivalTime: row.dest_arrival_time || undefined,
    unloadWaitTime: row.unload_wait_time || undefined,
    receivableTotal: row.receivable_total ? Number(row.receivable_total) : undefined,
    receivableTransport: row.receivable_transport ? Number(row.receivable_transport) : undefined,
    receivablePointFee: row.receivable_point_fee ? Number(row.receivable_point_fee) : undefined,
    receivableUpstairsFee: row.receivable_upstairs_fee ? Number(row.receivable_upstairs_fee) : undefined,
    receivableLoadingFee: row.receivable_loading_fee ? Number(row.receivable_loading_fee) : undefined,
    receivableCash: row.receivable_cash ? Number(row.receivable_cash) : undefined,
    receivableCollect: row.receivable_collect ? Number(row.receivable_collect) : undefined,
    receivableReturn: row.receivable_return ? Number(row.receivable_return) : undefined,
    receivableOther: row.receivable_other ? Number(row.receivable_other) : undefined,
    payableTotal: row.payable_total ? Number(row.payable_total) : undefined,
    coDriverPieceRate: row.co_driver_piece_rate ? Number(row.co_driver_piece_rate) : undefined,
    carpoolFee: row.carpool_fee ? Number(row.carpool_fee) : undefined,
    externalVehicleFee: row.external_vehicle_fee ? Number(row.external_vehicle_fee) : undefined,
    payableCash: row.payable_cash ? Number(row.payable_cash) : undefined,
    payableCollect: row.payable_collect ? Number(row.payable_collect) : undefined,
    payableOilCard: row.payable_oil_card ? Number(row.payable_oil_card) : undefined,
    payableReturn: row.payable_return ? Number(row.payable_return) : undefined,
    departurePlace: row.departure_place || undefined,
    arrivalPlace: row.arrival_place || undefined,
    profit: row.profit ? Number(row.profit) : undefined,
    profitRate: row.profit_rate ? Number(row.profit_rate) : undefined,
    etcFee: row.etc_fee ? Number(row.etc_fee) : undefined,
    // 兼容旧字段
    customerId: row.customer_id || undefined,
    contractId: row.contract_id || undefined,
    contractNumber: row.contract_number || undefined,
    businessMode: row.business_mode || undefined,
    driverPhone: row.driver_phone || undefined,
    goodsName: row.goods_name || undefined,
    goodsWeight: row.goods_weight ? Number(row.goods_weight) : undefined,
    freightAmount: row.freight_amount ? Number(row.freight_amount) : undefined,
    oilCardAmount: row.oil_card_amount ? Number(row.oil_card_amount) : undefined,
    etcAmount: row.etc_amount ? Number(row.etc_amount) : undefined,
    cashAmount: row.cash_amount ? Number(row.cash_amount) : undefined,
    totalPayment: row.total_payment ? Number(row.total_payment) : undefined,
    waybillDate: row.waybill_date || undefined,
    status: row.status || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getWaybills(filters?: {
  customerName?: string;
  vehiclePlate?: string;
  batchStatus?: string;
  startDate?: string;
  endDate?: string;
  customerId?: string;  // 融资方ID过滤（单个）
  customerIds?: string[];  // 融资方ID过滤（多个，资金方用）
}): Promise<Waybill[]> {
  // 先检查表结构，获取存在的列
  const [columns] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'waybills'`
  );
  const columnNames = new Set(columns.map((c: any) => c.COLUMN_NAME));
  
  let query = `SELECT * FROM waybills WHERE deleted_at IS NULL`;
  const params: any[] = [];

  // 单个融资方ID过滤（数据隔离）
  if (filters?.customerId) {
    query += ` AND customer_id = ?`;
    params.push(filters.customerId);
  }
  
  // 多个融资方ID过滤（资金方用）
  if (filters?.customerIds && filters.customerIds.length > 0) {
    const placeholders = filters.customerIds.map(() => '?').join(',');
    query += ` AND customer_id IN (${placeholders})`;
    params.push(...filters.customerIds);
  }

  if (filters?.customerName) {
    if (columnNames.has('project_name')) {
      query += ` AND (customer_name LIKE ? OR project_name LIKE ?)`;
      params.push(`%${filters.customerName}%`, `%${filters.customerName}%`);
    } else {
      query += ` AND customer_name LIKE ?`;
      params.push(`%${filters.customerName}%`);
    }
  }
  if (filters?.vehiclePlate) {
    query += ` AND vehicle_plate LIKE ?`;
    params.push(`%${filters.vehiclePlate}%`);
  }
  if (filters?.batchStatus && columnNames.has('batch_status')) {
    query += ` AND batch_status = ?`;
    params.push(filters.batchStatus);
  }
  if (filters?.startDate) {
    if (columnNames.has('departure_time')) {
      query += ` AND (DATE(departure_time) >= ? OR waybill_date >= ?)`;
      params.push(filters.startDate, filters.startDate);
    } else {
      query += ` AND waybill_date >= ?`;
      params.push(filters.startDate);
    }
  }
  if (filters?.endDate) {
    if (columnNames.has('departure_time')) {
      query += ` AND (DATE(departure_time) <= ? OR waybill_date <= ?)`;
      params.push(filters.endDate, filters.endDate);
    } else {
      query += ` AND waybill_date <= ?`;
      params.push(filters.endDate);
    }
  }

  query += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<WaybillRow[]>(query, params);
  return rows.map(mapWaybillRow);
}

export async function getWaybillById(id: string): Promise<Waybill | undefined> {
  const [rows] = await pool.query<WaybillRow[]>(
    `SELECT * FROM waybills WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] ? mapWaybillRow(rows[0]) : undefined;
}

export async function getWaybillByNumber(waybillNumber: string): Promise<Waybill | undefined> {
  const [rows] = await pool.query<WaybillRow[]>(
    `SELECT * FROM waybills WHERE waybill_number = ? AND deleted_at IS NULL LIMIT 1`,
    [waybillNumber]
  );
  return rows[0] ? mapWaybillRow(rows[0]) : undefined;
}

export async function createWaybill(input: any): Promise<Waybill> {
  const id = randomUUID();
  
  await pool.query(
    `INSERT INTO waybills (
      id, waybill_number, customer_id, customer_name, contract_id, contract_number,
      business_mode, vehicle_plate, driver_name, driver_phone,
      departure_place, arrival_place, goods_name, goods_weight,
      freight_amount, oil_card_amount, etc_amount, cash_amount,
      waybill_date, status, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.waybillNumber,
      input.customerId || randomUUID(),
      input.customerName || '',
      input.contractId || null,
      input.contractNumber || null,
      input.businessMode || 'brokerage',
      input.vehiclePlate || '',
      input.driverName || '',
      input.driverPhone || null,
      input.departurePlace || '',
      input.arrivalPlace || '',
      input.goodsName || '',
      input.goodsWeight || 0,
      input.freightAmount || 0,
      input.oilCardAmount || 0,
      input.etcAmount || 0,
      input.cashAmount || 0,
      input.waybillDate || new Date().toISOString().slice(0, 10),
      input.status || 'pending',
      input.remark || null
    ]
  );

  const waybill = await getWaybillById(id);
  if (!waybill) {
    throw new Error("创建运单失败");
  }
  return waybill;
}

export async function updateWaybill(id: string, input: any): Promise<Waybill> {
  const current = await getWaybillById(id);
  if (!current) {
    throw new Error("运单不存在");
  }

  // 简单更新
  if (input.status) {
    await pool.query(`UPDATE waybills SET status = ? WHERE id = ?`, [input.status, id]);
  }

  const updated = await getWaybillById(id);
  if (!updated) {
    throw new Error("更新运单失败");
  }
  return updated;
}

export async function deleteWaybill(id: string): Promise<void> {
  const current = await getWaybillById(id);
  if (!current) {
    throw new Error("运单不存在");
  }
  await pool.query(
    `UPDATE waybills SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id]
  );
}

export async function getWaybillStats(): Promise<WaybillStats> {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT 
      COUNT(*) as total_count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
      SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END) as settled_count,
      COALESCE(SUM(receivable_total), 0) as total_receivable,
      COALESCE(SUM(payable_total), 0) as total_payable,
      COALESCE(SUM(profit), 0) as total_profit
    FROM waybills
    WHERE deleted_at IS NULL
  `);

  const row = rows[0] || {};
  return {
    totalCount: Number(row.total_count) || 0,
    pendingCount: Number(row.pending_count) || 0,
    confirmedCount: Number(row.confirmed_count) || 0,
    settledCount: Number(row.settled_count) || 0,
    totalReceivable: Number(row.total_receivable) || 0,
    totalPayable: Number(row.total_payable) || 0,
    totalProfit: Number(row.total_profit) || 0
  };
}

export async function importWaybills(
  waybills: any[],
  customerId?: string  // 新增参数：融资方ID
): Promise<{ success: number; failed: number; errors: string[] }> {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const waybill of waybills) {
    try {
      // 字段校验
      if (!waybill.waybillNumber) {
        throw new Error("批次号不能为空");
      }
      
      // 数字字段校验
      if (waybill.receivableTotal && isNaN(Number(waybill.receivableTotal))) {
        throw new Error("应收运输费合计必须为数字");
      }
      if (waybill.payableTotal && isNaN(Number(waybill.payableTotal))) {
        throw new Error("应付运输费合计必须为数字");
      }
      if (waybill.profit && isNaN(Number(waybill.profit))) {
        throw new Error("任务毛利必须为数字");
      }
      
      const existing = await getWaybillByNumber(waybill.waybillNumber);
      if (existing) {
        failed++;
        errors.push(`运单号 ${waybill.waybillNumber} 已存在`);
        continue;
      }
      
      // 创建运单，使用传入的 customerId
      await createWaybill({
        ...waybill,
        customerId: customerId || waybill.customerId,
        customerName: waybill.customerName || ""
      });
      success++;
    } catch (err) {
      failed++;
      errors.push(`行 ${waybill.waybillNumber || '未知'}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { success, failed, errors };
}
