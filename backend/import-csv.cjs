const fs = require('fs');
const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');

/**
 * 从CSV导入运单数据 - 支持所有CSV字段
 */

function parseCSV(content) {
  const lines = content.split("\n");
  if (lines.length < 2) {
    throw new Error("CSV文件格式错误：至少需要表头和一行数据");
  }

  const headers = lines[0].split(",").map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // 跳过合计行
    if (line.startsWith("合计,")) continue;

    const values = line.split(",");
    const row = {};
    
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]?.trim() || "";
    }
    
    rows.push(row);
  }

  return rows;
}

function parseNumber(value) {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

function parseDateTime(dateStr) {
  if (!dateStr || dateStr === "") return null;
  // 处理 "2026-01-12 17:46:46" 格式
  return dateStr;
}

async function main() {
  const csvPath = process.argv[2] || "/Users/zac/Desktop/任务列表.csv";
  
  console.log("========== 运单CSV导入工具（完整字段版）==========");
  console.log("CSV文件路径:", csvPath);
  
  // 创建数据库连接
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3307'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root123',
    database: process.env.DB_NAME || 'testjr',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // 测试数据库连接
  try {
    await pool.query("SELECT 1");
    console.log("数据库连接成功");
  } catch (error) {
    console.error("数据库连接失败:", error.message);
    process.exit(1);
  }

  // 读取CSV文件
  if (!fs.existsSync(csvPath)) {
    console.error("文件不存在:", csvPath);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);
  
  console.log("解析到", rows.length, "条记录");

  // 先清空旧数据
  console.log("清空旧数据...");
  await pool.query("DELETE FROM waybills");

  let success = 0;
  let failed = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const waybillNumber = (row["批次号"] || "").trim();
      if (!waybillNumber) {
        failed++;
        continue;
      }

      const id = randomUUID();

      await pool.query(
        `INSERT INTO waybills 
         (id, waybill_number, operator, driver_name, co_driver, vehicle_plate, 
          monthly_cost, created_time, departure_time, remark, total_volume, 
          vehicle_route, driver_piece_rate, branch, customer_name, 
          return_batch_number, project_name, batch_status, assign_status, 
          dispatch_status, batch_tag, batch_source, load_type, batch_type, 
          point_count, transaction_time, origin_departure_time, dest_arrival_time, 
          unload_wait_time, receivable_total, receivable_transport, receivable_point_fee, 
          receivable_upstairs_fee, receivable_loading_fee, receivable_cash, 
          receivable_collect, receivable_return, receivable_other, payable_total, 
          co_driver_piece_rate, carpool_fee, external_vehicle_fee, payable_cash, 
          payable_collect, payable_oil_card, payable_return, departure_place, 
          arrival_place, profit, profit_rate, etc_fee,
          customer_id, business_mode, status, waybill_date, freight_amount, 
          oil_card_amount, etc_amount, cash_amount, total_payment, goods_name, goods_weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          waybillNumber, // waybill_number = 批次号
          (row["经办人"] || "").trim() || null, // operator
          (row["主驾司机"] || "").trim() || null, // driver_name
          (row["副驾司机"] || "").trim() || null, // co_driver
          (row["车牌号"] || "").trim() || null, // vehicle_plate
          parseNumber(row["月度分摊费用合计"]), // monthly_cost
          parseDateTime(row["创建时间"]), // created_time
          parseDateTime(row["发车时间"]), // departure_time
          (row["批次备注"] || "").trim() || null, // remark
          parseNumber(row["总体积"]), // total_volume
          (row["车辆线路"] || "").trim() || null, // vehicle_route
          parseNumber(row["主驾计件"]), // driver_piece_rate
          (row["网点"] || "").trim() || null, // branch
          (row["客户名称"] || "").trim() || null, // customer_name
          (row["往返批次号"] || "").trim() || null, // return_batch_number
          (row["项目名称"] || "").trim() || null, // project_name
          (row["批次状态"] || "").trim() || null, // batch_status
          (row["批次指派状态"] || "").trim() || null, // assign_status
          (row["批次派单状态"] || "").trim() || null, // dispatch_status
          (row["批次标识"] || "").trim() || null, // batch_tag
          (row["批次来源"] || "").trim() || null, // batch_source
          (row["配载类型"] || "").trim() || null, // load_type
          (row["批次类型"] || "").trim() || null, // batch_type
          parseInt(row["点位数"]) || 0, // point_count
          parseDateTime(row["交易时间"]), // transaction_time
          parseDateTime(row["始发发车时间"]), // origin_departure_time
          parseDateTime(row["终点到达时间"]), // dest_arrival_time
          (row["卸车等待时长"] || "").trim() || null, // unload_wait_time
          parseNumber(row["应收运输费合计"]), // receivable_total
          parseNumber(row["应收运输费"]), // receivable_transport
          parseNumber(row["应收点位费"]), // receivable_point_fee
          parseNumber(row["应收上楼费"]), // receivable_upstairs_fee
          parseNumber(row["应收装卸费"]), // receivable_loading_fee
          parseNumber(row["应收现付"]), // receivable_cash
          parseNumber(row["应收到付"]), // receivable_collect
          parseNumber(row["应收回付"]), // receivable_return
          parseNumber(row["应收其它"]), // receivable_other
          parseNumber(row["应付运输费合计"]), // payable_total
          parseNumber(row["副驾/装卸计件"]), // co_driver_piece_rate
          parseNumber(row["付拼车费"]), // carpool_fee
          parseNumber(row["外调车费"]), // external_vehicle_fee
          parseNumber(row["应付现付"]), // payable_cash
          parseNumber(row["应付到付"]), // payable_collect
          parseNumber(row["应付油卡"]), // payable_oil_card
          parseNumber(row["应付回付"]), // payable_return
          (row["发站"] || "").trim() || null, // departure_place
          (row["到站"] || "").trim() || null, // arrival_place
          parseNumber(row["任务毛利"]), // profit
          parseNumber(row["任务毛利率"]), // profit_rate
          parseNumber(row["ETC过路费"]), // etc_fee
          // 兼容旧字段
          randomUUID(), // customer_id
          "brokerage", // business_mode
          "confirmed", // status
          row["发车时间"] ? row["发车时间"].split(" ")[0] : null, // waybill_date
          parseNumber(row["应收运输费合计"]), // freight_amount = 应收运输费合计
          parseNumber(row["应付油卡"]), // oil_card_amount
          parseNumber(row["ETC过路费"]), // etc_amount
          parseNumber(row["应付现付"]), // cash_amount
          parseNumber(row["应付运输费合计"]), // total_payment
          "货物", // goods_name
          parseNumber(row["总体积"]) // goods_weight
        ]
      );

      success++;
      if (success % 50 === 0) {
        console.log("已导入", success, "条...");
      }
    } catch (error) {
      failed++;
      errors.push("行 " + row["序号"] + ": " + error.message);
    }
  }

  console.log("\n========== 导入完成 ==========");
  console.log("成功:", success);
  console.log("失败:", failed);
  
  if (errors.length > 0) {
    console.log("\n错误详情（前10条）:");
    errors.slice(0, 10).forEach(e => console.log("  -", e));
    if (errors.length > 10) {
      console.log("  ... 还有", errors.length - 10, "条错误");
    }
  }

  await pool.end();
}

main().catch(console.error);
