/**
 * TMS系统字段映射器
 * 将 zo-cloud TMS 系统的运单数据映射到本系统的运单格式
 */

import type { TmsWaybillRecord } from "./crawler-types.js";

// TMS批次状态 -> 系统状态映射
const BATCH_STATUS_MAP: Record<string, string> = {
  '0': 'cancelled',    // 已取消
  '1': 'pending',      // 待发车
  '2': 'in_transit',   // 在途
  '3': 'delivered',    // 已到达
  '4': 'completed',    // 已完成
  '10': 'pending',     // 待发车（从样例数据）
};

/**
 * 安全解析数字
 */
function parseNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = parseFloat(String(value));
  return isNaN(num) ? 0 : num;
}

/**
 * 安全解析字符串
 */
function parseString(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * 将TMS运单记录映射到系统运单格式
 */
export function mapTmsToWaybill(record: TmsWaybillRecord, customerId: string): Record<string, any> {
  // 状态映射
  const status = BATCH_STATUS_MAP[record.batch_st] || 'pending';
  
  // 从 route_text 提取出发地和目的地
  let departurePlace = '';
  let arrivalPlace = '';
  if (record.route_text) {
    const parts = record.route_text.split('->');
    if (parts.length >= 2) {
      departurePlace = parts[0].trim();
      arrivalPlace = parts[parts.length - 1].trim();
    }
  }
  
  // 优先使用 load_addr 和 unload_addr
  if (record.load_addr) departurePlace = record.load_addr;
  if (record.unload_addr) arrivalPlace = record.unload_addr;

  return {
    // 基础信息
    waybillNumber: parseString(record.car_batch),
    externalId: parseString(record.id),
    customerId: customerId,
    customerName: '', // 由系统补充
    
    // 司机/车辆信息
    driverName: parseString(record.b_dr_name),
    vehiclePlate: parseString(record.b_tr_num),
    vehicleRoute: parseString(record.route_text),
    
    // 地点信息
    departurePlace: departurePlace,
    arrivalPlace: arrivalPlace,
    
    // 时间信息
    createdTime: parseString(record.create_time),
    departureTime: parseString(record.truck_t) || null,
    waybillDate: record.create_time ? record.create_time.split(' ')[0] : new Date().toISOString().split('T')[0],
    
    // 状态
    status: status,
    batchStatus: parseString(record.batch_st),
    dispatchStatus: parseString(record.dispatch_driver_st),
    
    // 费用信息 - 应收
    receivableTotal: parseNumber(record.receivable_total),
    receivableTransport: parseNumber(record.receivable_trans_f),
    receivableCash: parseNumber(record.receivable_spot_fee),
    receivableUpstairsFee: parseNumber(record.receivable_upstairs_f),
    receivableLoadingFee: parseNumber(record.receivable_handling_f),
    receivableOther: parseNumber(record.receivable_other),
    
    // 费用信息 - 应付
    payableOilCard: parseNumber(record.b_fuel_card_f),
    payableCollect: parseNumber(record.b_arr_f),
    
    // 利润
    profit: parseNumber(record.tt_profit),
    totalVolume: parseNumber(record.tt_volume),
    
    // 备注
    remark: parseString(record.b_remark),
    
    // 兼容旧字段
    freightAmount: parseNumber(record.receivable_trans_f) || parseNumber(record.receivable_total),
    oilCardAmount: parseNumber(record.b_fuel_card_f),
    etcAmount: 0,
    cashAmount: parseNumber(record.receivable_spot_fee),
    businessMode: 'brokerage',
  };
}

/**
 * 批量映射
 */
export function mapTmsRecords(records: TmsWaybillRecord[], customerId: string): Record<string, any>[] {
  return records.map(record => mapTmsToWaybill(record, customerId));
}
