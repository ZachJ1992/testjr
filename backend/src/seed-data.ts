/**
 * 数据库种子脚本 - 初始化资金方、融资方和资金流水基础数据
 * 运行方式: npx tsx src/seed-data.ts
 */

import { pool } from "./db.js";
import { randomUUID } from "crypto";

// 资金方基础数据
const fundersData = [
  {
    id: randomUUID(),
    institutionName: "中国工商银行股份有限公司上海分行",
    institutionType: "bank",
    unifiedSocialCreditCode: "91310000MA1FL5XP0G",
    contactPerson: "李明华",
    contactPhone: "021-88881234",
    bankName: "中国工商银行",
    bankAccount: "1001283609026892001",
    accountName: "中国工商银行股份有限公司上海分行",
    cumulativeCreditLimit: 50000000,
    currentLoanBalance: 32500000,
    status: "active"
  },
  {
    id: randomUUID(),
    institutionName: "招商银行股份有限公司深圳分行",
    institutionType: "bank",
    unifiedSocialCreditCode: "91440300MA5DL1J82Q",
    contactPerson: "王大伟",
    contactPhone: "0755-82880088",
    bankName: "招商银行",
    bankAccount: "755916073910805",
    accountName: "招商银行股份有限公司深圳分行",
    cumulativeCreditLimit: 30000000,
    currentLoanBalance: 18750000,
    status: "active"
  },
  {
    id: randomUUID(),
    institutionName: "上海浦东发展银行股份有限公司北京分行",
    institutionType: "bank",
    unifiedSocialCreditCode: "91110000802100293P",
    contactPerson: "张建国",
    contactPhone: "010-65988888",
    bankName: "浦发银行",
    bankAccount: "91010078801000001234",
    accountName: "上海浦东发展银行股份有限公司北京分行",
    cumulativeCreditLimit: 25000000,
    currentLoanBalance: 15000000,
    status: "active"
  },
  {
    id: randomUUID(),
    institutionName: "天津中金商业保理有限公司",
    institutionType: "factoring",
    unifiedSocialCreditCode: "91120116MA05KTXH8D",
    contactPerson: "陈晓东",
    contactPhone: "022-58362888",
    bankName: "民生银行天津分行",
    bankAccount: "622908201035890001",
    accountName: "天津中金商业保理有限公司",
    cumulativeCreditLimit: 15000000,
    currentLoanBalance: 9800000,
    status: "active"
  },
  {
    id: randomUUID(),
    institutionName: "平安商业保理（深圳）有限公司",
    institutionType: "factoring",
    unifiedSocialCreditCode: "91440300MA5DKY8R2A",
    contactPerson: "刘志强",
    contactPhone: "0755-22625000",
    bankName: "平安银行",
    bankAccount: "11008812301234",
    accountName: "平安商业保理（深圳）有限公司",
    cumulativeCreditLimit: 20000000,
    currentLoanBalance: 12500000,
    status: "active"
  },
  {
    id: randomUUID(),
    institutionName: "畅运金融科技平台",
    institutionType: "platform",
    unifiedSocialCreditCode: "91310115MA1K4BWEXJ",
    contactPerson: "赵鹏飞",
    contactPhone: "400-888-9999",
    bankName: "交通银行上海分行",
    bankAccount: "310066726018010123456",
    accountName: "上海畅运金融科技有限公司",
    cumulativeCreditLimit: 10000000,
    currentLoanBalance: 4500000,
    status: "active"
  }
];

// 融资方基础数据
const financiersData = [
  {
    id: randomUUID(),
    enterpriseName: "上海顺达物流有限公司",
    unifiedSocialCreditCode: "91310115MA1K4XYZ01",
    legalRepresentative: "周建明",
    businessAddress: "上海市浦东新区张江高科技园区博云路2号",
    region: "华东",
    operatingScale: "large",
    initialCreditAmount: 5000000,
    status: "active"
  },
  {
    id: randomUUID(),
    enterpriseName: "广州市通达货运代理有限公司",
    unifiedSocialCreditCode: "91440101MA5CPWM82B",
    legalRepresentative: "林志华",
    businessAddress: "广州市白云区太和镇大源南路88号",
    region: "华南",
    operatingScale: "medium",
    initialCreditAmount: 3000000,
    status: "active"
  },
  {
    id: randomUUID(),
    enterpriseName: "北京快捷运输有限责任公司",
    unifiedSocialCreditCode: "91110105MA01WXYZ56",
    legalRepresentative: "吴建华",
    businessAddress: "北京市朝阳区来广营西路8号国创产业园",
    region: "华北",
    operatingScale: "large",
    initialCreditAmount: 8000000,
    status: "active"
  },
  {
    id: randomUUID(),
    enterpriseName: "成都通捷物流股份有限公司",
    unifiedSocialCreditCode: "91510100MA6CXYZ123",
    legalRepresentative: "何小明",
    businessAddress: "成都市双流区西航港工业园区腾飞路168号",
    region: "西南",
    operatingScale: "medium",
    initialCreditAmount: 2500000,
    status: "active"
  },
  {
    id: randomUUID(),
    enterpriseName: "武汉长江货运有限公司",
    unifiedSocialCreditCode: "91420100MA4KXYZ789",
    legalRepresentative: "黄国强",
    businessAddress: "武汉市汉阳区四新北路特8号",
    region: "华中",
    operatingScale: "medium",
    initialCreditAmount: 2000000,
    status: "warning"
  },
  {
    id: randomUUID(),
    enterpriseName: "杭州恒通物流科技有限公司",
    unifiedSocialCreditCode: "91330100MA2BXYZ456",
    legalRepresentative: "徐明辉",
    businessAddress: "杭州市余杭区临平街道迎宾路868号",
    region: "华东",
    operatingScale: "small",
    initialCreditAmount: 1000000,
    status: "active"
  }
];

// 运单基础数据
function generateWaybills(financiersList: typeof financiersData) {
  const waybills = [];
  const vehicles = [
    { plate: "沪A12345", driver: "张三", phone: "13800138001" },
    { plate: "沪B67890", driver: "李四", phone: "13800138002" },
    { plate: "粤A11111", driver: "王五", phone: "13800138003" },
    { plate: "粤B22222", driver: "赵六", phone: "13800138004" },
    { plate: "京A33333", driver: "钱七", phone: "13800138005" },
    { plate: "京B44444", driver: "孙八", phone: "13800138006" },
    { plate: "川A55555", driver: "周九", phone: "13800138007" },
    { plate: "鄂A66666", driver: "吴十", phone: "13800138008" },
    { plate: "浙A77777", driver: "郑伟", phone: "13800138009" },
    { plate: "苏A88888", driver: "冯磊", phone: "13800138010" }
  ];
  
  const routes = [
    { from: "上海市浦东新区", to: "北京市朝阳区", goods: "电子产品" },
    { from: "广州市白云区", to: "上海市嘉定区", goods: "服装纺织" },
    { from: "深圳市南山区", to: "杭州市余杭区", goods: "数码配件" },
    { from: "成都市双流区", to: "武汉市汉阳区", goods: "机械零件" },
    { from: "武汉市江夏区", to: "南京市江宁区", goods: "建材设备" },
    { from: "北京市通州区", to: "天津市滨海新区", goods: "食品饮料" },
    { from: "杭州市萧山区", to: "宁波市鄞州区", goods: "化工原料" },
    { from: "南京市栖霞区", to: "合肥市蜀山区", goods: "农产品" },
    { from: "重庆市渝北区", to: "成都市锦江区", goods: "家具家电" },
    { from: "西安市雁塔区", to: "郑州市金水区", goods: "医药用品" }
  ];
  
  const statuses = ["pending", "confirmed", "settled", "pending", "confirmed"];
  const businessModes = ["financing", "financing", "brokerage", "financing"];
  
  const now = new Date();
  
  // 生成最近60天的运单数据，每天3-8单
  for (let i = 60; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    
    const waybillsPerDay = Math.floor(Math.random() * 6) + 3;
    
    for (let j = 0; j < waybillsPerDay; j++) {
      const financier = financiersList[Math.floor(Math.random() * financiersList.length)];
      const vehicle = vehicles[Math.floor(Math.random() * vehicles.length)];
      const route = routes[Math.floor(Math.random() * routes.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const businessMode = businessModes[Math.floor(Math.random() * businessModes.length)];
      
      const freightAmount = Math.floor(Math.random() * 15000) + 5000;
      const oilCardAmount = Math.floor(Math.random() * 3000) + 1000;
      const etcAmount = Math.floor(Math.random() * 800) + 200;
      const cashAmount = Math.floor(Math.random() * 2000) + 500;
      const goodsWeight = Math.round((Math.random() * 20 + 2) * 100) / 100;
      
      waybills.push({
        id: randomUUID(),
        waybillNumber: `WB${dateStr.replace(/-/g, '')}${String(j + 1).padStart(4, '0')}`,
        customerId: financier.id,
        customerName: financier.enterpriseName,
        businessMode,
        vehiclePlate: vehicle.plate,
        driverName: vehicle.driver,
        driverPhone: vehicle.phone,
        departurePlace: route.from,
        arrivalPlace: route.to,
        goodsName: route.goods,
        goodsWeight,
        freightAmount,
        oilCardAmount,
        etcAmount,
        cashAmount,
        totalPayment: oilCardAmount + etcAmount + cashAmount,
        waybillDate: dateStr,
        status
      });
    }
  }
  
  return waybills;
}

// 资金流水数据
function generateFundFlows() {
  const flows = [];
  const entities = [
    "上海顺达物流有限公司",
    "广州市通达货运代理有限公司",
    "北京快捷运输有限责任公司",
    "成都通捷物流股份有限公司",
    "武汉长江货运有限公司",
    "杭州恒通物流科技有限公司"
  ];
  
  let balance = 150000000; // 起始余额
  const now = new Date();
  
  // 生成最近30天的流水
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // 每天生成1-3笔交易
    const transactionsPerDay = Math.floor(Math.random() * 3) + 1;
    
    for (let j = 0; j < transactionsPerDay; j++) {
      const entity = entities[Math.floor(Math.random() * entities.length)];
      const isPayment = Math.random() > 0.4; // 60%是代付，40%是还款
      const operationType = isPayment ? "payment" : "repayment";
      
      // 代付金额范围：10万-100万，还款金额范围：5万-80万
      const changeAmount = isPayment 
        ? Math.floor(Math.random() * 900000 + 100000)
        : Math.floor(Math.random() * 750000 + 50000);
      
      if (isPayment) {
        balance -= changeAmount;
      } else {
        balance += changeAmount;
      }
      
      // 确保余额在合理范围内
      if (balance < 50000000) {
        balance = 50000000 + Math.floor(Math.random() * 10000000);
      }
      if (balance > 150000000) {
        balance = 150000000 - Math.floor(Math.random() * 10000000);
      }
      
      const hour = Math.floor(Math.random() * 10) + 8; // 8点到18点
      const minute = Math.floor(Math.random() * 60);
      date.setHours(hour, minute, 0, 0);
      
      flows.push({
        id: randomUUID(),
        time: date.toISOString().slice(0, 19).replace('T', ' '),
        operationType,
        associatedEntity: entity,
        changeAmount,
        remainingBalance: balance
      });
    }
  }
  
  return flows;
}

async function seedData() {
  console.log("🌱 开始初始化基础数据...\n");
  
  try {
    // 测试数据库连接
    console.log("🔌 测试数据库连接...");
    const connection = await pool.getConnection();
    console.log("✅ 数据库连接成功\n");
    connection.release();
    
    // 1. 清理现有数据（可选）
    console.log("📦 清理现有数据...");
    await pool.query("DELETE FROM fund_flows");
    await pool.query("DELETE FROM financiers WHERE deleted_at IS NULL");
    await pool.query("DELETE FROM funders WHERE deleted_at IS NULL");
    console.log("✅ 数据清理完成\n");
    
    // 2. 插入资金方数据
    console.log("🏦 插入资金方数据...");
    for (const funder of fundersData) {
      await pool.query(
        `INSERT INTO funders 
         (id, institution_name, institution_type, unified_social_credit_code,
          contact_person, contact_phone, bank_name, bank_account, account_name,
          cumulative_credit_limit, current_loan_balance, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          funder.id,
          funder.institutionName,
          funder.institutionType,
          funder.unifiedSocialCreditCode,
          funder.contactPerson,
          funder.contactPhone,
          funder.bankName,
          funder.bankAccount,
          funder.accountName,
          funder.cumulativeCreditLimit,
          funder.currentLoanBalance,
          funder.status
        ]
      );
      console.log(`  ✓ ${funder.institutionName}`);
    }
    console.log(`✅ 已插入 ${fundersData.length} 条资金方记录\n`);
    
    // 3. 插入融资方数据
    console.log("🏭 插入融资方数据...");
    for (const financier of financiersData) {
      await pool.query(
        `INSERT INTO financiers 
         (id, enterprise_name, unified_social_credit_code, legal_representative,
          business_address, region, operating_scale,
          total_credit_limit, initial_credit_amount, remaining_credit_limit,
          status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          financier.id,
          financier.enterpriseName,
          financier.unifiedSocialCreditCode,
          financier.legalRepresentative,
          financier.businessAddress,
          financier.region,
          financier.operatingScale,
          financier.initialCreditAmount,
          financier.initialCreditAmount,
          Math.floor(financier.initialCreditAmount * (0.3 + Math.random() * 0.5)), // 剩余30%-80%的额度
          financier.status
        ]
      );
      console.log(`  ✓ ${financier.enterpriseName}`);
    }
    console.log(`✅ 已插入 ${financiersData.length} 条融资方记录\n`);
    
    // 4. 插入资金流水数据
    console.log("💸 插入资金流水数据...");
    const fundFlows = generateFundFlows();
    for (const flow of fundFlows) {
      await pool.query(
        `INSERT INTO fund_flows 
         (id, time, operation_type, associated_entity, change_amount, remaining_balance)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          flow.id,
          flow.time,
          flow.operationType,
          flow.associatedEntity,
          flow.changeAmount,
          flow.remainingBalance
        ]
      );
    }
    console.log(`✅ 已插入 ${fundFlows.length} 条资金流水记录\n`);
    
    // 5. 插入运单数据
    console.log("📋 插入运单数据...");
    await pool.query("DELETE FROM waybills WHERE deleted_at IS NULL");
    const waybills = generateWaybills(financiersData);
    for (const waybill of waybills) {
      await pool.query(
        `INSERT INTO waybills 
         (id, waybill_number, customer_id, customer_name, business_mode,
          vehicle_plate, driver_name, driver_phone,
          departure_place, arrival_place, goods_name, goods_weight,
          freight_amount, oil_card_amount, etc_amount, cash_amount, total_payment,
          waybill_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          waybill.id,
          waybill.waybillNumber,
          waybill.customerId,
          waybill.customerName,
          waybill.businessMode,
          waybill.vehiclePlate,
          waybill.driverName,
          waybill.driverPhone,
          waybill.departurePlace,
          waybill.arrivalPlace,
          waybill.goodsName,
          waybill.goodsWeight,
          waybill.freightAmount,
          waybill.oilCardAmount,
          waybill.etcAmount,
          waybill.cashAmount,
          waybill.totalPayment,
          waybill.waybillDate,
          waybill.status
        ]
      );
    }
    console.log(`✅ 已插入 ${waybills.length} 条运单记录\n`);
    
    console.log("🎉 基础数据初始化完成！");
    console.log("\n📊 数据汇总：");
    console.log(`   - 资金方: ${fundersData.length} 条`);
    console.log(`   - 融资方: ${financiersData.length} 条`);
    console.log(`   - 资金流水: ${fundFlows.length} 条`);
    console.log(`   - 运单: ${waybills.length} 条`);
    
  } catch (error) {
    console.error("❌ 数据初始化失败:", error);
    throw error;
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// 运行种子脚本
seedData();
