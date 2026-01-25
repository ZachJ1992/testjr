/**
 * 生成收益测试数据脚本 - 优化版
 * 基于现有合同数据生成更真实的收益记录
 */

const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');

// 生成正态分布随机数（更自然的波动）
function gaussianRandom(mean, stdDev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stdDev + mean;
}

// 判断是否为工作日
function isWorkday(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

// 获取业务增长系数（近期业务量更大）
function getGrowthFactor(daysAgo) {
  // 60天前系数0.7，今天系数1.0，模拟业务增长
  return 0.7 + (60 - daysAgo) * 0.005;
}

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3307'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root123',
    database: process.env.DB_NAME || 'testjr',
  });

  console.log('=== 开始生成优化的收益测试数据 ===\n');

  // 1. 获取三方融资合同
  const [financingContracts] = await pool.query(`
    SELECT c.id, c.type, c.credit_limit, c.annual_interest_rate, 
           c.funder_id, c.funder_name, 
           c.logistics_provider_id as financier_id, c.logistics_provider_name as financier_name,
           f.institution_name as funder_institution_name,
           fi.enterprise_name as financier_enterprise_name
    FROM contracts c
    LEFT JOIN funders f ON c.funder_id = f.id
    LEFT JOIN financiers fi ON c.logistics_provider_id = fi.id
    WHERE c.type = 'financing' AND c.status = 'active' AND c.annual_interest_rate > 0
  `);
  console.log(`找到 ${financingContracts.length} 个活跃的三方融资合同`);

  // 2. 获取撮合合同
  const [brokerageContracts] = await pool.query(`
    SELECT c.id, c.type, c.credit_limit, c.profit_sharing_ratio,
           c.funder_id, c.funder_name, 
           c.logistics_provider_id as financier_id, c.logistics_provider_name as financier_name,
           f.institution_name as funder_institution_name,
           fi.enterprise_name as financier_enterprise_name
    FROM contracts c
    LEFT JOIN funders f ON c.funder_id = f.id
    LEFT JOIN financiers fi ON c.logistics_provider_id = fi.id
    WHERE c.type = 'brokerage' AND c.status = 'active'
  `);
  console.log(`找到 ${brokerageContracts.length} 个活跃的撮合合同`);

  // 3. 获取定向支付合同
  const [directedPayContracts] = await pool.query(`
    SELECT dpc.id, dpc.contract_number, dpc.credit_limit, dpc.used_amount, dpc.annual_interest_rate,
           dpc.funder_id, dpc.financier_id,
           f.institution_name as funder_name,
           fi.enterprise_name as financier_name
    FROM directed_pay_contracts dpc
    LEFT JOIN funders f ON dpc.funder_id = f.id
    LEFT JOIN financiers fi ON dpc.financier_id = fi.id
    WHERE dpc.status = 'active'
  `);
  console.log(`找到 ${directedPayContracts.length} 个活跃的定向支付合同`);

  // 生成过去90天的日期（更长的时间范围）
  const today = new Date();
  const dates = [];
  for (let i = 90; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push({
      dateStr: date.toISOString().split('T')[0],
      daysAgo: i,
      isWorkday: isWorkday(date.toISOString().split('T')[0]),
    });
  }

  const revenueRecords = [];

  // 4. 为三方融资合同生成每日利息收益
  console.log('\n生成三方融资利息收益...');
  for (const contract of financingContracts) {
    const creditLimit = Number(contract.credit_limit);
    // 合理的年化利率范围：6%-18%
    let annualRate = Number(contract.annual_interest_rate);
    if (annualRate > 100) annualRate = annualRate / 100; // 如果存储的是百分比数值
    if (annualRate > 0.5) annualRate = annualRate / 100; // 再次检查
    if (annualRate < 0.01 || annualRate > 0.25) {
      annualRate = 0.06 + Math.random() * 0.12; // 默认6%-18%
    }
    
    // 基础使用金额（信用额度的40%-70%）
    const baseUsedRatio = 0.4 + Math.random() * 0.3;
    const baseUsedAmount = creditLimit * baseUsedRatio;
    
    if (baseUsedAmount < 10000) continue; // 跳过金额太小的

    const funderName = contract.funder_institution_name || contract.funder_name || '未知资金方';
    const financierName = contract.financier_enterprise_name || contract.financier_name || '未知融资方';

    for (const dateInfo of dates) {
      // 工作日使用率波动更大
      const dailyVariation = dateInfo.isWorkday 
        ? gaussianRandom(1.0, 0.15) // 工作日：波动15%
        : gaussianRandom(0.85, 0.1); // 周末：略低，波动10%
      
      // 业务增长系数
      const growthFactor = getGrowthFactor(dateInfo.daysAgo);
      
      // 当日实际使用金额
      const usedAmount = Math.max(baseUsedAmount * dailyVariation * growthFactor, 0);
      const dailyInterest = (usedAmount * annualRate) / 360;
      
      if (dailyInterest < 10) continue; // 跳过太小的金额

      // 资金方收益
      revenueRecords.push({
        id: randomUUID(),
        record_type: 'revenue',
        beneficiary_type: 'funder',
        beneficiary_id: contract.funder_id,
        source_type: 'financing_interest',
        contract_id: contract.id,
        contract_number: null,
        contract_type: 'financing',
        funder_id: contract.funder_id,
        funder_name: funderName,
        financier_id: contract.financier_id,
        financier_name: financierName,
        amount: Math.round(dailyInterest * 100) / 100,
        principal_amount: Math.round(usedAmount * 100) / 100,
        rate: annualRate,
        revenue_date: dateInfo.dateStr,
        status: dateInfo.daysAgo > 14 ? 'confirmed' : (dateInfo.daysAgo > 7 ? (Math.random() > 0.3 ? 'confirmed' : 'pending') : 'pending'),
        remark: `三方融资日利息`,
      });

      // 融资方支出
      revenueRecords.push({
        id: randomUUID(),
        record_type: 'expense',
        beneficiary_type: 'financier',
        beneficiary_id: contract.financier_id,
        source_type: 'financing_interest',
        contract_id: contract.id,
        contract_number: null,
        contract_type: 'financing',
        funder_id: contract.funder_id,
        funder_name: funderName,
        financier_id: contract.financier_id,
        financier_name: financierName,
        amount: Math.round(dailyInterest * 100) / 100,
        principal_amount: Math.round(usedAmount * 100) / 100,
        rate: annualRate,
        revenue_date: dateInfo.dateStr,
        status: dateInfo.daysAgo > 14 ? 'confirmed' : (dateInfo.daysAgo > 7 ? (Math.random() > 0.3 ? 'confirmed' : 'pending') : 'pending'),
        remark: `三方融资利息支出`,
      });

      // 平台服务费（利息的8%-15%，作为主要收入来源）
      const platformFeeRate = 0.08 + Math.random() * 0.07;
      const platformFee = dailyInterest * platformFeeRate;
      if (platformFee >= 5) {
        revenueRecords.push({
          id: randomUUID(),
          record_type: 'revenue',
          beneficiary_type: 'platform',
          beneficiary_id: null,
          source_type: 'financing_interest',
          contract_id: contract.id,
          contract_number: null,
          contract_type: 'financing',
          funder_id: contract.funder_id,
          funder_name: funderName,
          financier_id: contract.financier_id,
          financier_name: financierName,
          amount: Math.round(platformFee * 100) / 100,
          principal_amount: Math.round(usedAmount * 100) / 100,
          rate: platformFeeRate,
          revenue_date: dateInfo.dateStr,
          status: dateInfo.daysAgo > 14 ? 'confirmed' : (dateInfo.daysAgo > 7 ? (Math.random() > 0.3 ? 'confirmed' : 'pending') : 'pending'),
          remark: `三方融资服务费`,
        });
      }
    }
  }

  // 5. 为撮合合同生成抽成收益（不固定周期，根据交易发生）
  console.log('生成撮合业务抽成收益...');
  for (const contract of brokerageContracts) {
    const creditLimit = Number(contract.credit_limit);
    if (creditLimit < 10000) continue;
    
    // 抽成比例：0.5%-2%（更合理的比例）
    const shareRatio = Number(contract.profit_sharing_ratio || 0) / 100;
    const actualShareRatio = shareRatio > 0 && shareRatio < 0.05 ? shareRatio : (0.005 + Math.random() * 0.015);
    
    const funderName = contract.funder_institution_name || contract.funder_name || '未知资金方';
    const financierName = contract.financier_enterprise_name || contract.financier_name || '未知融资方';

    // 每个合同平均每周1-2次交易
    const transactionsPerWeek = 1 + Math.floor(Math.random() * 2);
    
    for (const dateInfo of dates) {
      // 只在工作日发生交易，且有随机性
      if (!dateInfo.isWorkday) continue;
      if (Math.random() > transactionsPerWeek / 5) continue;
      
      const growthFactor = getGrowthFactor(dateInfo.daysAgo);
      
      // 每次交易金额：信用额度的0.5%-3%（更合理的交易规模）
      const transactionRatio = 0.005 + Math.random() * 0.025;
      const transactionAmount = creditLimit * transactionRatio * growthFactor;
      const commission = transactionAmount * actualShareRatio;
      
      if (commission < 20) continue; // 最小抽成20元

      // 平台收益
      revenueRecords.push({
        id: randomUUID(),
        record_type: 'revenue',
        beneficiary_type: 'platform',
        beneficiary_id: null,
        source_type: 'brokerage_commission',
        contract_id: contract.id,
        contract_number: null,
        contract_type: 'brokerage',
        funder_id: contract.funder_id,
        funder_name: funderName,
        financier_id: contract.financier_id,
        financier_name: financierName,
        amount: Math.round(commission * 100) / 100,
        principal_amount: Math.round(transactionAmount * 100) / 100,
        rate: actualShareRatio,
        revenue_date: dateInfo.dateStr,
        status: dateInfo.daysAgo > 10 ? 'confirmed' : 'pending',
        remark: `撮合业务抽成`,
      });
    }
  }

  // 6. 为定向支付合同生成利息收益
  console.log('生成定向支付利息收益...');
  for (const contract of directedPayContracts) {
    const creditLimit = Number(contract.credit_limit);
    const storedUsedAmount = Number(contract.used_amount);
    
    // 合理的年化利率：8%-15%
    let annualRate = Number(contract.annual_interest_rate);
    if (annualRate > 1) annualRate = annualRate / 100;
    if (annualRate < 0.01 || annualRate > 0.25) {
      annualRate = 0.08 + Math.random() * 0.07;
    }
    
    // 基础使用金额
    const baseUsedAmount = storedUsedAmount > 0 
      ? storedUsedAmount 
      : creditLimit * (0.3 + Math.random() * 0.4);
    
    if (baseUsedAmount < 50000) continue; // 定向支付金额通常较大

    const funderName = contract.funder_name || '未知资金方';
    const financierName = contract.financier_name || '未知融资方';

    for (const dateInfo of dates) {
      // 定向支付的使用金额相对稳定，波动较小
      const dailyVariation = gaussianRandom(1.0, 0.08);
      const growthFactor = getGrowthFactor(dateInfo.daysAgo);
      
      const usedAmount = Math.max(baseUsedAmount * dailyVariation * growthFactor, 0);
      const dailyInterest = (usedAmount * annualRate) / 360;
      
      if (dailyInterest < 50) continue;

      // 资金方收益
      revenueRecords.push({
        id: randomUUID(),
        record_type: 'revenue',
        beneficiary_type: 'funder',
        beneficiary_id: contract.funder_id,
        source_type: 'directed_pay_interest',
        contract_id: contract.id,
        contract_number: contract.contract_number,
        contract_type: 'directed_pay',
        funder_id: contract.funder_id,
        funder_name: funderName,
        financier_id: contract.financier_id,
        financier_name: financierName,
        amount: Math.round(dailyInterest * 100) / 100,
        principal_amount: Math.round(usedAmount * 100) / 100,
        rate: annualRate,
        revenue_date: dateInfo.dateStr,
        status: dateInfo.daysAgo > 14 ? 'confirmed' : (dateInfo.daysAgo > 7 ? (Math.random() > 0.3 ? 'confirmed' : 'pending') : 'pending'),
        remark: `定向支付日利息`,
      });

      // 融资方支出
      revenueRecords.push({
        id: randomUUID(),
        record_type: 'expense',
        beneficiary_type: 'financier',
        beneficiary_id: contract.financier_id,
        source_type: 'directed_pay_interest',
        contract_id: contract.id,
        contract_number: contract.contract_number,
        contract_type: 'directed_pay',
        funder_id: contract.funder_id,
        funder_name: funderName,
        financier_id: contract.financier_id,
        financier_name: financierName,
        amount: Math.round(dailyInterest * 100) / 100,
        principal_amount: Math.round(usedAmount * 100) / 100,
        rate: annualRate,
        revenue_date: dateInfo.dateStr,
        status: dateInfo.daysAgo > 14 ? 'confirmed' : (dateInfo.daysAgo > 7 ? (Math.random() > 0.3 ? 'confirmed' : 'pending') : 'pending'),
        remark: `定向支付利息支出`,
      });

      // 平台服务费（5%-10%）
      const platformFeeRate = 0.05 + Math.random() * 0.05;
      const platformFee = dailyInterest * platformFeeRate;
      if (platformFee >= 10) {
        revenueRecords.push({
          id: randomUUID(),
          record_type: 'revenue',
          beneficiary_type: 'platform',
          beneficiary_id: null,
          source_type: 'directed_pay_interest',
          contract_id: contract.id,
          contract_number: contract.contract_number,
          contract_type: 'directed_pay',
          funder_id: contract.funder_id,
          funder_name: funderName,
          financier_id: contract.financier_id,
          financier_name: financierName,
          amount: Math.round(platformFee * 100) / 100,
          principal_amount: Math.round(usedAmount * 100) / 100,
          rate: platformFeeRate,
          revenue_date: dateInfo.dateStr,
          status: dateInfo.daysAgo > 14 ? 'confirmed' : (dateInfo.daysAgo > 7 ? (Math.random() > 0.3 ? 'confirmed' : 'pending') : 'pending'),
          remark: `定向支付服务费`,
        });
      }
    }
  }

  console.log(`\n共生成 ${revenueRecords.length} 条收益记录`);

  // 7. 批量插入数据
  if (revenueRecords.length > 0) {
    console.log('正在插入数据...');
    
    await pool.query('DELETE FROM revenue_records');
    console.log('已清空现有收益记录');

    const batchSize = 1000;
    for (let i = 0; i < revenueRecords.length; i += batchSize) {
      const batch = revenueRecords.slice(i, i + batchSize);
      const values = batch.map(r => [
        r.id, r.record_type, r.beneficiary_type, r.beneficiary_id, r.source_type,
        r.contract_id, r.contract_number, r.contract_type,
        r.funder_id, r.funder_name, r.financier_id, r.financier_name,
        r.amount, r.principal_amount, r.rate, r.revenue_date, r.status,
        null, null, null, r.remark,
      ]);

      await pool.query(
        `INSERT INTO revenue_records (
          id, record_type, beneficiary_type, beneficiary_id, source_type,
          contract_id, contract_number, contract_type,
          funder_id, funder_name, financier_id, financier_name,
          amount, principal_amount, rate, revenue_date, status,
          settlement_id, payment_request_id, waybill_id, remark
        ) VALUES ?`,
        [values]
      );
      console.log(`已插入 ${Math.min(i + batchSize, revenueRecords.length)}/${revenueRecords.length} 条`);
    }
  }

  // 8. 统计结果
  console.log('\n=== 数据统计 ===');
  
  const [overallStats] = await pool.query(`
    SELECT 
      beneficiary_type,
      record_type,
      COUNT(*) as count,
      ROUND(SUM(amount), 2) as total_amount,
      ROUND(AVG(amount), 2) as avg_amount,
      ROUND(MIN(amount), 2) as min_amount,
      ROUND(MAX(amount), 2) as max_amount
    FROM revenue_records
    GROUP BY beneficiary_type, record_type
    ORDER BY beneficiary_type, record_type
  `);

  for (const row of overallStats) {
    console.log(`\n${row.beneficiary_type} (${row.record_type}):`);
    console.log(`  记录数: ${row.count} 条`);
    console.log(`  总金额: ¥${Number(row.total_amount).toLocaleString()}`);
    console.log(`  平均: ¥${row.avg_amount} | 最小: ¥${row.min_amount} | 最大: ¥${row.max_amount}`);
  }

  // 按来源类型统计
  const [sourceStats] = await pool.query(`
    SELECT 
      source_type,
      COUNT(*) as count,
      ROUND(SUM(amount), 2) as total_amount
    FROM revenue_records
    WHERE beneficiary_type = 'platform'
    GROUP BY source_type
  `);

  console.log('\n--- 平台收益来源构成 ---');
  for (const row of sourceStats) {
    const sourceName = {
      'financing_interest': '三方融资服务费',
      'directed_pay_interest': '定向支付服务费',
      'brokerage_commission': '撮合业务抽成',
    }[row.source_type] || row.source_type;
    console.log(`  ${sourceName}: ${row.count}条, ¥${Number(row.total_amount).toLocaleString()}`);
  }

  await pool.end();
  console.log('\n=== 优化版收益测试数据生成完成 ===');
}

main().catch(console.error);
