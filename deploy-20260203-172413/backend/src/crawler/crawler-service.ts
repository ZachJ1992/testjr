/**
 * 爬虫核心服务
 * 负责从TMS系统抓取运单数据并同步到本系统
 */

import type { 
  CrawlerConfig, 
  SyncResult, 
  TestConnectionResult, 
  TmsApiResponse,
  TmsWaybillRecord 
} from "./crawler-types.js";
import { 
  getCrawlerConfigById, 
  updateCrawlerConfig,
  createCrawlerSyncLog,
  updateCrawlerSyncLog 
} from "./crawler-store.js";
import { mapTmsToWaybill } from "./field-mapper.js";
import { pool } from "../db.js";
import { randomUUID } from "crypto";

/**
 * 发送HTTP请求到TMS系统
 */
async function fetchFromTms(
  config: CrawlerConfig, 
  pageNum: number = 1
): Promise<TmsApiResponse> {
  // 构建URL，包含logid和gid参数
  const logid = `${config.userId}${Date.now()}0707`;
  const gid = config.groupId || '100020';
  const url = `${config.systemUrl}${config.apiEndpoint}?logid=${logid}&gid=${gid}`;
  
  // 构建请求体 - TMS系统需要JSON格式的请求体，但使用urlencoded传输
  const requestBody = {
    category: "Batch",
    tab: "transport_task_batch",
    sort: [],
    page_num: pageNum,
    page_size: 100,
    cid: "",
    query: [],
    filter: [],
    fetch_mode: "all"
  };

  // 将JSON对象转换为URL编码的字符串
  const bodyParams = new URLSearchParams();
  Object.entries(requestBody).forEach(([key, value]) => {
    bodyParams.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });

  try {
    console.log(`[Crawler] 请求URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': config.cookies,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Origin': config.systemUrl,
        'Referer': `${config.systemUrl}/Schedule/taskList`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as TmsApiResponse;
    return data;
  } catch (error: any) {
    console.error(`[Crawler] 请求TMS失败:`, error.message);
    throw error;
  }
}

/**
 * 检查运单是否已存在（通过 external_id）
 */
async function waybillExists(externalId: string): Promise<boolean> {
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM waybills WHERE external_id = ? LIMIT 1`,
    [externalId]
  );
  return rows.length > 0;
}

/**
 * 创建运单记录
 */
async function createWaybillFromTms(waybillData: Record<string, any>): Promise<void> {
  const id = randomUUID();
  
  await pool.query(
    `INSERT INTO waybills (
      id, waybill_number, external_id, customer_id, customer_name,
      driver_name, vehicle_plate, vehicle_route,
      departure_place, arrival_place,
      created_time, departure_time, waybill_date,
      status, batch_status, dispatch_status,
      receivable_total, receivable_transport, receivable_cash,
      receivable_upstairs_fee, receivable_loading_fee, receivable_other,
      payable_oil_card, payable_collect,
      profit, total_volume,
      freight_amount, oil_card_amount, etc_amount, cash_amount,
      business_mode, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      waybillData.waybillNumber,
      waybillData.externalId,
      waybillData.customerId,
      waybillData.customerName || '',
      waybillData.driverName || '',
      waybillData.vehiclePlate || '',
      waybillData.vehicleRoute || '',
      waybillData.departurePlace || '',
      waybillData.arrivalPlace || '',
      waybillData.createdTime || null,
      waybillData.departureTime || null,
      waybillData.waybillDate || new Date().toISOString().split('T')[0],
      waybillData.status || 'pending',
      waybillData.batchStatus || '',
      waybillData.dispatchStatus || '',
      waybillData.receivableTotal || 0,
      waybillData.receivableTransport || 0,
      waybillData.receivableCash || 0,
      waybillData.receivableUpstairsFee || 0,
      waybillData.receivableLoadingFee || 0,
      waybillData.receivableOther || 0,
      waybillData.payableOilCard || 0,
      waybillData.payableCollect || 0,
      waybillData.profit || 0,
      waybillData.totalVolume || 0,
      waybillData.freightAmount || 0,
      waybillData.oilCardAmount || 0,
      waybillData.etcAmount || 0,
      waybillData.cashAmount || 0,
      waybillData.businessMode || 'brokerage',
      waybillData.remark || '',
    ]
  );
}

/**
 * 测试连接
 */
export async function testConnection(config: Partial<CrawlerConfig>): Promise<TestConnectionResult> {
  if (!config.systemUrl || !config.apiEndpoint || !config.cookies) {
    return {
      success: false,
      message: "缺少必要配置参数（systemUrl, apiEndpoint, cookies）",
    };
  }

  try {
    const testConfig = {
      ...config,
      userId: config.userId || '1000000',
      groupId: config.groupId || '100020',
    } as CrawlerConfig;

    console.log(`[Crawler] 测试连接: ${config.systemUrl}`);
    const response = await fetchFromTms(testConfig, 1);

    if (response.errno !== 0) {
      return {
        success: false,
        message: `TMS返回错误: ${response.errmsg}`,
      };
    }

    const records = response.res?.data || [];
    const totalCount = response.res?.total?.count || records.length;

    return {
      success: true,
      message: `连接成功！发现 ${totalCount} 条运单记录`,
      sampleCount: totalCount,
      sampleData: records.slice(0, 3).map(r => ({
        id: r.id,
        car_batch: r.car_batch,
        b_dr_name: r.b_dr_name,
        create_time: r.create_time,
      })),
    };
  } catch (error: any) {
    console.error(`[Crawler] 连接测试失败:`, error.message);
    return {
      success: false,
      message: `连接失败: ${error.message}`,
    };
  }
}

/**
 * 执行同步
 */
export async function syncWaybills(configId: string): Promise<SyncResult> {
  const config = await getCrawlerConfigById(configId);
  if (!config) {
    return {
      success: false,
      totalFetched: 0,
      newCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 1,
      errors: ["配置不存在"],
    };
  }

  // 创建同步日志
  const syncLog = await createCrawlerSyncLog({
    configId: config.id,
    status: 'running',
  });

  const result: SyncResult = {
    success: true,
    totalFetched: 0,
    newCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errors: [],
  };

  // 更新配置状态
  await updateCrawlerConfig(config.id, {
    lastSyncStatus: 'running',
  });

  try {
    console.log(`[Crawler] 开始同步: ${config.name}`);
    
    let pageNum = 1;
    let hasMore = true;
    let lastRecordId = '';

    while (hasMore) {
      console.log(`[Crawler] 获取第 ${pageNum} 页...`);
      
      const response = await fetchFromTms(config, pageNum);
      
      if (response.errno !== 0) {
        throw new Error(`TMS返回错误: ${response.errmsg}`);
      }

      const records = response.res?.data || [];
      result.totalFetched += records.length;

      for (const record of records) {
        try {
          // 检查是否已存在
          const exists = await waybillExists(record.id);
          
          if (exists) {
            result.skippedCount++;
            continue;
          }

          // 映射并创建
          const waybillData = mapTmsToWaybill(record, config.financierId);
          await createWaybillFromTms(waybillData);
          result.newCount++;
          lastRecordId = record.id;
          
        } catch (err: any) {
          result.errorCount++;
          result.errors.push(`运单 ${record.car_batch}: ${err.message}`);
          if (result.errors.length > 10) {
            result.errors = [...result.errors.slice(0, 10), '...更多错误已省略'];
          }
        }
      }

      // 检查是否还有更多页
      pageNum++;
      hasMore = records.length >= 100;
      
      // 安全限制：最多获取100页（10000条）
      if (pageNum > 100) {
        console.log(`[Crawler] 达到最大页数限制，停止`);
        break;
      }

      // 请求间隔，避免过快
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 更新配置
    await updateCrawlerConfig(config.id, {
      lastSyncTime: new Date().toISOString(),
      lastSyncRecordId: lastRecordId,
      lastSyncCount: result.newCount,
      lastSyncStatus: 'success',
      lastSyncError: undefined,
    });

    // 更新日志
    await updateCrawlerSyncLog(syncLog.id, {
      endTime: new Date().toISOString(),
      status: 'success',
      totalFetched: result.totalFetched,
      newCount: result.newCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
    });

    console.log(`[Crawler] 同步完成: 获取 ${result.totalFetched}, 新增 ${result.newCount}, 跳过 ${result.skippedCount}`);
    
  } catch (error: any) {
    result.success = false;
    result.errors.push(error.message);

    // 更新配置
    await updateCrawlerConfig(config.id, {
      lastSyncTime: new Date().toISOString(),
      lastSyncStatus: 'failed',
      lastSyncError: error.message,
    });

    // 更新日志
    await updateCrawlerSyncLog(syncLog.id, {
      endTime: new Date().toISOString(),
      status: 'failed',
      totalFetched: result.totalFetched,
      newCount: result.newCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      errorMessage: error.message,
    });

    console.error(`[Crawler] 同步失败:`, error.message);
  }

  return result;
}

/**
 * 手动触发同步
 */
export async function triggerSync(configId: string): Promise<SyncResult> {
  return syncWaybills(configId);
}
