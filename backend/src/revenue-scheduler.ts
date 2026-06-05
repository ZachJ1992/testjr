/**
 * 收益管理 - 每日收益计算定时任务
 * 
 * 建议在每日凌晨 00:30 执行，计算前一天的收益
 */

import { pool } from "./db.js";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import * as revenueStore from "./revenue-store.js";
import { CreateRevenueRecordInput } from "./revenue-store.js";

function formatDateOnly(value: Date | string): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  if (text.includes("T")) return text.split("T")[0];
  if (text.includes(" ")) return text.split(" ")[0];
  return text;
}

function buildWaybillRevenueDateSql(waybillAlias: string, financierAlias: string): string {
  return `CASE
    WHEN ${financierAlias}.enterprise_name = '融满'
      THEN COALESCE(DATE(${waybillAlias}.created_time), DATE(${waybillAlias}.departure_time), DATE(${waybillAlias}.waybill_date), DATE(${waybillAlias}.created_at))
    ELSE COALESCE(DATE(${waybillAlias}.waybill_date), DATE(${waybillAlias}.created_time), DATE(${waybillAlias}.departure_time), DATE(${waybillAlias}.created_at))
  END`;
}

async function repairWaybillCommissionIntegrity(): Promise<{
  relinked: number;
  deduped: number;
  primaryLinks: number;
  fallbackLinks: number;
}> {
  const [relinkResult] = await pool.query<ResultSetHeader>(`
    UPDATE revenue_records rr
    LEFT JOIN waybills w_current
      ON rr.waybill_id = w_current.id
     AND w_current.deleted_at IS NULL
    JOIN waybills w_target
      ON rr.contract_number = w_target.waybill_number
     AND w_target.deleted_at IS NULL
    LEFT JOIN financiers f_target ON w_target.customer_id = f_target.id
    SET rr.waybill_id = w_target.id,
        rr.contract_id = COALESCE(w_target.customer_id, rr.contract_id),
        rr.financier_id = COALESCE(w_target.customer_id, rr.financier_id),
        rr.financier_name = COALESCE(f_target.enterprise_name, rr.financier_name)
    WHERE rr.source_type = 'waybill_commission'
      AND rr.contract_number IS NOT NULL
      AND rr.status NOT IN ('reconciling', 'reconciled', 'settled', 'accounted')
      AND (rr.waybill_id IS NULL OR w_current.id IS NULL OR rr.waybill_id <> w_target.id)
  `);

  const [dedupeResult] = await pool.query<ResultSetHeader>(`
    DELETE rr_drop
    FROM revenue_records rr_drop
    JOIN revenue_records rr_keep
      ON rr_drop.source_type = 'waybill_commission'
     AND rr_keep.source_type = 'waybill_commission'
     AND rr_drop.contract_number = rr_keep.contract_number
     AND rr_drop.id <> rr_keep.id
    WHERE rr_drop.status = 'confirmed'
      AND rr_keep.status IN ('reconciling', 'reconciled', 'settled', 'accounted')
  `);

  const [primaryResult] = await pool.query<ResultSetHeader>(`
    UPDATE revenue_records rr
    JOIN waybills w ON rr.waybill_id = w.id AND w.deleted_at IS NULL
    JOIN routes r
      ON r.tms_source = w.tms_source
     AND r.tms_node_id = w.tms_branch_node_id
     AND r.status = 'active'
    JOIN contract_routes cr ON cr.route_id = r.id
    JOIN commission_contracts cc ON cc.id = cr.contract_id AND cc.status = 'active'
    SET rr.commission_contract_id = cr.contract_id,
        rr.route_id = r.id,
        rr.contract_id = cr.contract_id
    WHERE rr.source_type = 'waybill_commission'
      AND w.tms_source IS NOT NULL
      AND w.tms_branch_node_id IS NOT NULL
      AND (
        rr.commission_contract_id IS NULL OR rr.route_id IS NULL
        OR rr.commission_contract_id <> cr.contract_id
        OR rr.route_id <> r.id
      )
  `);

  const [fallbackResult] = await pool.query<ResultSetHeader>(`
    UPDATE revenue_records rr
    JOIN waybills w ON rr.waybill_id = w.id AND w.deleted_at IS NULL
    JOIN routes r ON r.name = w.branch AND r.status = 'active'
    JOIN contract_routes cr ON cr.route_id = r.id
    JOIN commission_contracts cc ON cc.id = cr.contract_id AND cc.status = 'active'
    SET rr.commission_contract_id = cr.contract_id,
        rr.route_id = r.id,
        rr.contract_id = cr.contract_id
    WHERE rr.source_type = 'waybill_commission'
      AND rr.commission_contract_id IS NULL
      AND rr.route_id IS NULL
  `);

  return {
    relinked: Number(relinkResult.affectedRows || 0),
    deduped: Number(dedupeResult.affectedRows || 0),
    primaryLinks: Number(primaryResult.affectedRows || 0),
    fallbackLinks: Number(fallbackResult.affectedRows || 0),
  };
}

/**
 * 每日收益计算任务
 */
export async function calculateDailyRevenue(targetDate?: string): Promise<{
  financingInterest: number;
  directedPayInterest: number;
  brokerageCommission: number;
  commissionFee: number;
  totalRecords: number;
}> {
  const date = targetDate || getPreviousDate();
  console.log(`开始计算 ${date} 的收益...`);

  let totalRecords = 0;

  // 1. 计算三方融资合同利息
  const financingRecords = await calculateFinancingInterest(date);
  totalRecords += financingRecords;

  // 2. 计算定向支付利息
  const directedPayRecords = await calculateDirectedPayInterest(date);
  totalRecords += directedPayRecords;

  // 3. 撮合业务抽成 (在结算时生成，这里不处理)
  // 4. 抽成合同费用 (在结算时生成，这里不处理)

  // 5. 运单平台抽成（按融资方规则：融满/金罗均为应收合计 2.5%）
  const waybillCommissionRecords = await calculateWaybillPlatformRevenue();
  totalRecords += waybillCommissionRecords;

  // 6. 历史运单抽成全量重算：同步那些"首次计算后运费被 TMS 修正"的存量记录
  //    （增量计算只新建不更新，故每日重算一次拉齐非锁定记录；已对账记录自动跳过）
  try {
    const recalc = await recalculateHistoricalWaybillCommissions();
    console.log(
      `${date} 运单抽成历史重算: 更新 ${recalc.updated} 条, 新增 ${recalc.inserted} 条`
    );
  } catch (err) {
    console.error(`${date} 运单抽成历史重算失败（不影响其他收益计算）:`, err);
  }

  console.log(`${date} 收益计算完成，共生成 ${totalRecords} 条记录`);

  return {
    financingInterest: financingRecords,
    directedPayInterest: directedPayRecords,
    brokerageCommission: 0,
    commissionFee: waybillCommissionRecords,
    totalRecords,
  };
}

/**
 * 计算三方融资合同每日利息
 */
async function calculateFinancingInterest(date: string): Promise<number> {
  try {
    // 查询所有 active 状态的融资合同，且有在贷金额（使用 outstanding_principal 剩余本金）
    const [contracts] = await pool.query<RowDataPacket[]>(`
      SELECT 
        c.id,
        CONCAT('RZ', DATE_FORMAT(c.created_at, '%Y%m%d'), LEFT(c.id, 4)) as contract_number,
        c.funder_id,
        c.logistics_provider_id as financier_id,
        c.outstanding_principal as used_amount,
        c.annual_interest_rate,
        f.institution_name as funder_name,
        fn.enterprise_name as financier_name
      FROM contracts c
      LEFT JOIN funders f ON c.funder_id = f.id
      LEFT JOIN financiers fn ON c.logistics_provider_id = fn.id
      WHERE c.type = 'financing' 
      AND c.status = 'active'
      AND c.deleted_at IS NULL
      AND c.outstanding_principal > 0
    `);

    let count = 0;
    const records: CreateRevenueRecordInput[] = [];

    for (const contract of contracts) {
      // 检查是否已生成
      const exists = await revenueStore.checkDailyRevenueExists(
        date,
        contract.id,
        "financing_interest"
      );
      if (exists) continue;

      // 日利息 = 本金 × (年化利率/100) / 360
      const dailyInterest =
        (Number(contract.used_amount) * Number(contract.annual_interest_rate) / 100) / 360;

      // 资金方收益
      records.push({
        recordType: "revenue",
        beneficiaryType: "funder",
        beneficiaryId: contract.funder_id,
        sourceType: "financing_interest",
        contractId: contract.id,
        contractNumber: contract.contract_number,
        contractType: "financing",
        funderId: contract.funder_id,
        funderName: contract.funder_name,
        financierId: contract.financier_id,
        financierName: contract.financier_name,
        amount: Math.round(dailyInterest * 100) / 100, // 保留两位小数
        principalAmount: Number(contract.used_amount),
        rate: Number(contract.annual_interest_rate),
        revenueDate: date,
        status: "pending",
      });

      // 融资方支出
      records.push({
        recordType: "expense",
        beneficiaryType: "financier",
        beneficiaryId: contract.financier_id,
        sourceType: "financing_interest",
        contractId: contract.id,
        contractNumber: contract.contract_number,
        contractType: "financing",
        funderId: contract.funder_id,
        funderName: contract.funder_name,
        financierId: contract.financier_id,
        financierName: contract.financier_name,
        amount: Math.round(dailyInterest * 100) / 100,
        principalAmount: Number(contract.used_amount),
        rate: Number(contract.annual_interest_rate),
        revenueDate: date,
        status: "pending",
      });

      count += 2;
    }

    // 批量插入
    if (records.length > 0) {
      await revenueStore.batchCreateRevenueRecords(records);
    }

    return count;
  } catch (err) {
    console.error("计算融资利息失败:", err);
    return 0;
  }
}

/**
 * 计算定向支付每日利息
 */
async function calculateDirectedPayInterest(date: string): Promise<number> {
  try {
    // 查询所有已成功支付且未完全还款的支付申请
    const [requests] = await pool.query<RowDataPacket[]>(`
      SELECT 
        dpr.id as request_id,
        dpr.contract_id,
        dpr.payment_amount,
        dpr.interest_start_time,
        dpc.contract_number,
        dpc.annual_interest_rate,
        dpc.funder_id,
        dpc.financier_id,
        f.institution_name as funder_name,
        fn.enterprise_name as financier_name
      FROM directed_payment_requests dpr
      JOIN directed_pay_contracts dpc ON dpr.contract_id = dpc.id
      LEFT JOIN funders f ON dpc.funder_id = f.id
      LEFT JOIN financiers fn ON dpc.financier_id = fn.id
      WHERE dpr.status = 'success'
      AND dpc.status = 'active'
      AND dpc.deleted_at IS NULL
      AND dpr.interest_start_time IS NOT NULL
      AND DATE(dpr.interest_start_time) <= ?
    `, [date]);

    let count = 0;
    const records: CreateRevenueRecordInput[] = [];

    for (const request of requests) {
      // 检查是否已生成（使用 payment_request_id 来区分）
      // 这里我们用 contract_id + date 来检查，因为一个合同可能有多笔支付申请
      const [existingRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM revenue_records 
         WHERE revenue_date = ? AND payment_request_id = ? AND source_type = 'directed_pay_interest'`,
        [date, request.request_id]
      );
      if (existingRows[0].count > 0) continue;

      // 日利息 = 本金 × (年化利率/100) / 360
      const dailyInterest =
        (Number(request.payment_amount) * Number(request.annual_interest_rate) / 100) / 360;

      // 资金方收益
      records.push({
        recordType: "revenue",
        beneficiaryType: "funder",
        beneficiaryId: request.funder_id,
        sourceType: "directed_pay_interest",
        contractId: request.contract_id,
        contractNumber: request.contract_number,
        contractType: "directed_pay",
        funderId: request.funder_id,
        funderName: request.funder_name,
        financierId: request.financier_id,
        financierName: request.financier_name,
        amount: Math.round(dailyInterest * 100) / 100,
        principalAmount: Number(request.payment_amount),
        rate: Number(request.annual_interest_rate),
        revenueDate: date,
        status: "pending",
        paymentRequestId: request.request_id,
      });

      // 融资方支出
      records.push({
        recordType: "expense",
        beneficiaryType: "financier",
        beneficiaryId: request.financier_id,
        sourceType: "directed_pay_interest",
        contractId: request.contract_id,
        contractNumber: request.contract_number,
        contractType: "directed_pay",
        funderId: request.funder_id,
        funderName: request.funder_name,
        financierId: request.financier_id,
        financierName: request.financier_name,
        amount: Math.round(dailyInterest * 100) / 100,
        principalAmount: Number(request.payment_amount),
        rate: Number(request.annual_interest_rate),
        revenueDate: date,
        status: "pending",
        paymentRequestId: request.request_id,
      });

      count += 2;
    }

    // 批量插入
    if (records.length > 0) {
      await revenueStore.batchCreateRevenueRecords(records);
    }

    return count;
  } catch (err) {
    console.error("计算定向支付利息失败:", err);
    return 0;
  }
}

/**
 * 生成撮合业务抽成记录
 * (在运单结算时调用)
 */
export async function createBrokerageCommissionRecord(params: {
  contractId: string;
  contractNumber: string;
  financierId: string;
  financierName: string;
  waybillId: string;
  amount: number;
  rate: number;
  freightAmount: number;
  revenueDate: string;
}): Promise<void> {
  // 平台收益（撮合业务是平台收益，没有资金方）
  await revenueStore.createRevenueRecord({
    recordType: "revenue",
    beneficiaryType: "platform",
    sourceType: "brokerage_commission",
    contractId: params.contractId,
    contractNumber: params.contractNumber,
    contractType: "brokerage",
    financierId: params.financierId,
    financierName: params.financierName,
    amount: params.amount,
    principalAmount: params.freightAmount,
    rate: params.rate,
    revenueDate: params.revenueDate,
    status: "pending",
    waybillId: params.waybillId,
  });
}

/**
 * 生成抽成合同费用记录
 * (在结算时调用)
 */
export async function createCommissionFeeRecord(params: {
  contractId: string;
  contractNumber: string;
  financierId: string;
  financierName: string;
  settlementId: string;
  amount: number;
  rate: number;
  baseAmount: number;
  revenueDate: string;
}): Promise<void> {
  // 平台收益
  await revenueStore.createRevenueRecord({
    recordType: "revenue",
    beneficiaryType: "platform",
    sourceType: "commission_fee",
    contractId: params.contractId,
    contractNumber: params.contractNumber,
    contractType: "commission",
    financierId: params.financierId,
    financierName: params.financierName,
    amount: params.amount,
    principalAmount: params.baseAmount,
    rate: params.rate,
    revenueDate: params.revenueDate,
    status: "pending",
    settlementId: params.settlementId,
  });

  // 融资方支出
  await revenueStore.createRevenueRecord({
    recordType: "expense",
    beneficiaryType: "financier",
    beneficiaryId: params.financierId,
    sourceType: "commission_fee",
    contractId: params.contractId,
    contractNumber: params.contractNumber,
    contractType: "commission",
    financierId: params.financierId,
    financierName: params.financierName,
    amount: params.amount,
    principalAmount: params.baseAmount,
    rate: params.rate,
    revenueDate: params.revenueDate,
    status: "pending",
    settlementId: params.settlementId,
  });
}

/**
 * 计算运单平台抽成收益
 * 从 commission_contracts 的 commission_config 动态读取抽成规则
 * 匹配路径: tms_source+tms_branch_node_id → routes；未命中则 waybills.branch → routes.name
 */
export async function calculateWaybillPlatformRevenue(): Promise<number> {
  try {
    const repairResult = await repairWaybillCommissionIntegrity();
    if (
      repairResult.relinked > 0 ||
      repairResult.deduped > 0 ||
      repairResult.primaryLinks > 0 ||
      repairResult.fallbackLinks > 0
    ) {
      console.log(
        `[WaybillRevenue] 数据修复: 回链 ${repairResult.relinked} 条, 去重 ${repairResult.deduped} 条, 主匹配补链 ${repairResult.primaryLinks} 条, 兜底 ${repairResult.fallbackLinks} 条`
      );
    }

    const revenueDateExpr = buildWaybillRevenueDateSql("w", "f");
    const [backfillRevenueDateResult] = await pool.query<ResultSetHeader>(`
      UPDATE revenue_records rr
      JOIN waybills w ON rr.waybill_id = w.id
      LEFT JOIN financiers f ON w.customer_id = f.id
      SET rr.revenue_date = COALESCE(${revenueDateExpr}, rr.revenue_date)
      WHERE rr.source_type = 'waybill_commission'
        AND w.deleted_at IS NULL
        AND rr.status NOT IN ('reconciling', 'reconciled', 'settled', 'accounted')
        AND rr.revenue_date <> COALESCE(${revenueDateExpr}, rr.revenue_date)
    `);
    if (Number(backfillRevenueDateResult.affectedRows || 0) > 0) {
      console.log(`[WaybillRevenue] 已按最新口径回填历史收益日期 ${backfillRevenueDateResult.affectedRows} 条`);
    }

    // 字段映射（与 commission-calculation.ts 保持一致）
    const FIELD_MAP: Record<string, string> = {
      receivableTotal: "receivable_total",
      payableTotal: "payable_total",
      receivableTransport: "receivable_transport",
      freight: "freight_amount",
      pickupFee: "pickup_fee",
      deliveryFee: "delivery_fee",
      receiptFee: "receipt_fee",
      packagingFee: "packaging_fee",
      insuranceFee: "insurance_fee",
      premiumFee: "premium_fee",
      handlingFee: "handling_fee",
    };
    const COMPUTED: Record<string, (w: any) => number> = {
      priceDiff: (w) => Number(w.receivable_total || 0) - Number(w.payable_total || 0),
    };

    // 1. 加载所有 active 合同及其线路、落地合作方
    const [contractRows] = await pool.query<RowDataPacket[]>(`
      SELECT cc.id as contract_id, cc.commission_config, cc.financier_id, cc.customer_name,
             r.id as route_id, r.name as route_name,
             r.tms_source as route_tms_source, r.tms_node_id as route_tms_node_id
      FROM commission_contracts cc
      JOIN contract_routes cr ON cc.id = cr.contract_id
      JOIN routes r ON cr.route_id = r.id
      WHERE cc.status = 'active' AND r.status = 'active'
    `);

    if (contractRows.length === 0) {
      console.log("[WaybillRevenue] 无 active 合同或线路配置，跳过");
      return 0;
    }

    type RouteCfg = {
      contractId: string;
      routeId: string;
      commissionConfig: any[];
      financierId: string;
      financierName: string;
    };

    const routeByTmsKey = new Map<string, RouteCfg>();
    const routeByName = new Map<string, RouteCfg>();

    const financierIdSet = new Set<string>();

    for (const row of contractRows) {
      let config = row.commission_config;
      if (typeof config === 'string') {
        try { config = JSON.parse(config); } catch { config = []; }
      }
      if (!Array.isArray(config) || config.length === 0) continue;

      const cfg: RouteCfg = {
        contractId: row.contract_id,
        routeId: row.route_id,
        commissionConfig: config,
        financierId: row.financier_id,
        financierName: row.customer_name,
      };
      const tmsSrc = row.route_tms_source != null ? String(row.route_tms_source).trim() : "";
      const tmsNode = row.route_tms_node_id != null ? String(row.route_tms_node_id).trim() : "";
      if (tmsSrc && tmsNode) {
        routeByTmsKey.set(`${tmsSrc}::${tmsNode}`, cfg);
      }
      routeByName.set(row.route_name, cfg);
      if (row.financier_id) financierIdSet.add(row.financier_id);
    }

    if (routeByName.size === 0 || financierIdSet.size === 0) {
      console.log("[WaybillRevenue] 无有效的线路-合同配置，跳过");
      return 0;
    }

    console.log(`[WaybillRevenue] 加载到 ${routeByName.size} 条线路配置，涉及 ${financierIdSet.size} 个合作方`);

    // 3. 查询这些合作方下未计算收益的运单
    const financierIds = Array.from(financierIdSet);
    const placeholders = financierIds.map(() => '?').join(',');

    const [waybills] = await pool.query<RowDataPacket[]>(
      `SELECT w.*, f.enterprise_name as financier_name
       FROM waybills w
       LEFT JOIN financiers f ON w.customer_id = f.id
       LEFT JOIN revenue_records rr ON rr.waybill_id = w.id AND rr.source_type = 'waybill_commission'
       LEFT JOIN revenue_records rr_cn ON rr_cn.contract_number = w.waybill_number AND rr_cn.source_type = 'waybill_commission'
       WHERE w.deleted_at IS NULL
         AND w.customer_id IN (${placeholders})
         AND rr.id IS NULL
         AND rr_cn.id IS NULL`,
      financierIds
    );

    if (waybills.length === 0) {
      console.log("[WaybillRevenue] 无新运单需要计算收益");
      return 0;
    }

    // 4. 逐条匹配并计算
    const records: CreateRevenueRecordInput[] = [];
    let skippedNoRoute = 0;
    let skippedNoBase = 0;
    let fallbackHits = 0;
    type FallbackHitDetail = {
      waybill: string;
      branch: string;
      tms: string;
      routeId: string;
    };
    const fallbackHitDetails: FallbackHitDetail[] = [];

    for (const w of waybills) {
      let routeConfig: RouteCfg | undefined;
      const wbTms = w.tms_source != null ? String(w.tms_source).trim() : "";
      const wbNode = w.tms_branch_node_id != null ? String(w.tms_branch_node_id).trim() : "";
      if (wbTms && wbNode) {
        routeConfig = routeByTmsKey.get(`${wbTms}::${wbNode}`);
      }
      if (!routeConfig && w.branch) {
        routeConfig = routeByName.get(w.branch);
        if (routeConfig) {
          fallbackHits++;
          fallbackHitDetails.push({
            waybill: String(w.waybill_number ?? ""),
            branch: String(w.branch),
            tms: `${w.tms_source || "null"}::${w.tms_branch_node_id || "null"}`,
            routeId: routeConfig.routeId,
          });
        }
      }
      if (!routeConfig) {
        skippedNoRoute++;
        continue;
      }

      const cfg = routeConfig.commissionConfig[0];
      if (!cfg || !cfg.fieldKey) {
        skippedNoRoute++;
        continue;
      }

      // 读取基数金额
      const computeFn = COMPUTED[cfg.fieldKey];
      const baseAmount = computeFn
        ? computeFn(w)
        : Number(w[FIELD_MAP[cfg.fieldKey] || cfg.fieldKey] || 0);

      if (baseAmount <= 0) {
        skippedNoBase++;
        continue;
      }

      let amount: number;
      let rate: number;

      if (cfg.mode === 'percentage') {
        rate = cfg.value / 100;
        amount = Math.round(baseAmount * rate * 100) / 100;
      } else {
        amount = cfg.value;
        rate = 0;
      }

      // 收益日期口径：
      // - 融满：created_time（TMS发车时间）优先
      // - 其他：使用运单业务日期（waybill_date）优先
      const isRongman = String(w.financier_name || routeConfig.financierName || "").trim() === "融满";
      const revenueDateSource = isRongman
        ? (w.created_time || w.departure_time || w.waybill_date || w.created_at)
        : (w.waybill_date || w.created_time || w.departure_time || w.created_at);
      const revenueDate = revenueDateSource
        ? formatDateOnly(revenueDateSource)
        : new Date().toISOString().split('T')[0];

      records.push({
        recordType: "revenue",
        beneficiaryType: "platform",
        sourceType: "waybill_commission",
        contractId: routeConfig.contractId,
        contractNumber: w.waybill_number,
        contractType: "waybill",
        financierId: w.customer_id,
        financierName: w.financier_name || routeConfig.financierName,
        amount,
        principalAmount: baseAmount,
        rate,
        revenueDate,
        status: "confirmed",
        waybillId: w.id,
        commissionContractId: routeConfig.contractId,
        routeId: routeConfig.routeId,
      });
    }

    if (fallbackHits > 0) {
      if (fallbackHits <= 10) {
        for (const d of fallbackHitDetails) {
          console.log(
            `[WaybillRevenue] Fallback 命中: waybill=${d.waybill} branch="${d.branch}" tms=${d.tms} → route_id=${d.routeId}`
          );
        }
      } else {
        for (const d of fallbackHitDetails.slice(0, 5)) {
          console.log(
            `[WaybillRevenue] Fallback 命中: waybill=${d.waybill} branch="${d.branch}" tms=${d.tms} → route_id=${d.routeId}`
          );
        }
        console.log(`[WaybillRevenue] 共 ${fallbackHits} 条 fallback 命中（仅展示前 5 条）`);
      }
    }

    if (records.length > 0) {
      await revenueStore.batchCreateRevenueRecords(records);
    }

    console.log(
      `[WaybillRevenue] 运单 ${waybills.length} 条: 生成收益 ${records.length} 条, ` +
        `无匹配线路 ${skippedNoRoute}, 基数为0 ${skippedNoBase}, Fallback 命中 ${fallbackHits}`
    );
    return records.length;
  } catch (err) {
    console.error("[WaybillRevenue] 计算运单平台抽成失败:", err);
    return 0;
  }
}

/**
 * 回算历史运单抽成记录（全量）
 * - 已有记录：按当前规则重算 amount / rate / principal_amount
 * - 缺失记录：补齐 waybill_commission 记录
 */
export async function recalculateHistoricalWaybillCommissions(): Promise<{
  updated: number;
  inserted: number;
  totalAffected: number;
}> {
  try {
    const repairResult = await repairWaybillCommissionIntegrity();
    if (
      repairResult.relinked > 0 ||
      repairResult.deduped > 0 ||
      repairResult.primaryLinks > 0 ||
      repairResult.fallbackLinks > 0
    ) {
      console.log(
        `[WaybillRevenue] 历史回算前数据修复: 回链 ${repairResult.relinked} 条, 去重 ${repairResult.deduped} 条, 主匹配补链 ${repairResult.primaryLinks} 条, 兜底 ${repairResult.fallbackLinks} 条`
      );
    }

    const revenueDateExpr = buildWaybillRevenueDateSql("w", "f");
    const [updateResult] = await pool.query<ResultSetHeader>(`
      UPDATE revenue_records rr
      JOIN waybills w ON rr.waybill_id = w.id
      JOIN financiers f ON w.customer_id = f.id
      SET
        rr.contract_id = w.customer_id,
        rr.contract_number = w.waybill_number,
        rr.contract_type = 'waybill',
        rr.financier_id = w.customer_id,
        rr.financier_name = f.enterprise_name,
        -- 业务口径（2026-06 修订）：融满抽成基数=应付合计(payable_total)，金罗=应收合计(receivable_total)，均 × 2.5%。
        -- 临沂（融满名下、56qqt 来源）应付==应收，跟随融满走应付口径、金额不变。
        -- 已对账/对账中/已结算/已入账的记录通过下方 WHERE 过滤跳过，保持锁定时口径不变。
        rr.principal_amount = CASE
          WHEN f.enterprise_name = '融满' THEN COALESCE(w.payable_total, 0)
          ELSE COALESCE(w.receivable_total, 0)
        END,
        rr.rate = 0.025,
        rr.amount = CASE
          WHEN f.enterprise_name = '融满' THEN ROUND(COALESCE(w.payable_total, 0) * 0.025, 2)
          ELSE ROUND(COALESCE(w.receivable_total, 0) * 0.025, 2)
        END,
        rr.record_type = 'revenue',
        rr.beneficiary_type = 'platform',
        rr.revenue_date = COALESCE(${revenueDateExpr}, rr.revenue_date),
        rr.status = 'confirmed'
      WHERE rr.source_type = 'waybill_commission'
        AND w.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND f.enterprise_name IN ('融满', '金罗')
        AND rr.status NOT IN ('reconciling', 'reconciled', 'settled', 'accounted')
    `);

    const [insertResult] = await pool.query<ResultSetHeader>(`
      INSERT INTO revenue_records (
        id, record_type, beneficiary_type, source_type,
        contract_id, contract_number, contract_type,
        financier_id, financier_name,
        amount, principal_amount, rate,
        revenue_date, status, waybill_id
      )
      SELECT
        UUID(), 'revenue', 'platform', 'waybill_commission',
        w.customer_id, w.waybill_number, 'waybill',
        w.customer_id, f.enterprise_name,
        -- 业务口径（2026-06 修订）：融满=应付合计(payable_total)，金罗=应收合计(receivable_total)，均 × 2.5%。
        CASE WHEN f.enterprise_name = '融满'
          THEN ROUND(COALESCE(w.payable_total, 0) * 0.025, 2)
          ELSE ROUND(COALESCE(w.receivable_total, 0) * 0.025, 2)
        END AS amount,
        CASE WHEN f.enterprise_name = '融满'
          THEN COALESCE(w.payable_total, 0)
          ELSE COALESCE(w.receivable_total, 0)
        END AS principal_amount,
        0.025 AS rate,
        COALESCE(${revenueDateExpr}, CURRENT_DATE) AS revenue_date,
        'confirmed' AS status,
        w.id AS waybill_id
      FROM waybills w
      JOIN financiers f ON w.customer_id = f.id
      LEFT JOIN revenue_records rr
        ON rr.waybill_id = w.id
       AND rr.source_type = 'waybill_commission'
      LEFT JOIN revenue_records rr_cn
        ON rr_cn.contract_number = w.waybill_number
       AND rr_cn.source_type = 'waybill_commission'
      WHERE w.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND f.enterprise_name IN ('融满', '金罗')
        AND rr.id IS NULL
        AND rr_cn.id IS NULL
        AND CASE WHEN f.enterprise_name = '融满'
              THEN COALESCE(w.payable_total, 0) > 0
              ELSE COALESCE(w.receivable_total, 0) > 0
            END
    `);

    const updated = Number(updateResult.affectedRows || 0);
    const inserted = Number(insertResult.affectedRows || 0);
    const totalAffected = updated + inserted;

    console.log(`[WaybillRevenue] 历史回算完成: 更新 ${updated} 条, 新增 ${inserted} 条`);
    return { updated, inserted, totalAffected };
  } catch (err) {
    console.error("[WaybillRevenue] 历史回算失败:", err);
    throw err;
  }
}

// 辅助函数
function getPreviousDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split("T")[0];
}

/**
 * 启动定时任务
 * 在服务器启动时调用，每天凌晨 00:30 执行
 */
export function startRevenueScheduler(): void {
  const SCHEDULE_HOUR = 0;
  const SCHEDULE_MINUTE = 30;

  const scheduleNextRun = () => {
    const now = new Date();
    const next = new Date();
    next.setHours(SCHEDULE_HOUR, SCHEDULE_MINUTE, 0, 0);

    // 如果今天的时间已过，则安排明天
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    const delay = next.getTime() - now.getTime();
    console.log(
      `[RevenueScheduler] 下次执行时间: ${next.toISOString()}, 延迟: ${Math.round(delay / 1000 / 60)} 分钟`
    );

    setTimeout(async () => {
      console.log(`[RevenueScheduler] 开始执行每日收益计算...`);
      try {
        const result = await calculateDailyRevenue();
        console.log(`[RevenueScheduler] 执行完成:`, result);
      } catch (err) {
        console.error(`[RevenueScheduler] 执行失败:`, err);
      }
      // 安排下一次执行
      scheduleNextRun();
    }, delay);
  };

  scheduleNextRun();
  console.log(`[RevenueScheduler] 收益计算定时任务已启动`);
}
