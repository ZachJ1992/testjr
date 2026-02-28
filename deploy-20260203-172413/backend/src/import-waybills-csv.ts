import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { pool } from "./db.js";
import type { RowDataPacket } from "mysql2";

/**
 * 从CSV导入运单数据
 * 
 * CSV字段映射：
 * - 批次号 -> waybillNumber
 * - 客户名称/项目名称 -> customerName
 * - 车牌号 -> vehiclePlate
 * - 主驾司机 -> driverName
 * - 发站 -> departurePlace
 * - 到站 -> arrivalPlace
 * - 应收运输费合计 -> freightAmount
 * - 应付油卡 -> oilCardAmount
 * - ETC过路费 -> etcAmount
 * - 应付运输费合计 -> totalPayment
 * - 发车时间 -> waybillDate
 * - 批次状态 -> status (已到达 -> confirmed, 已发车 -> pending)
 */

interface CsvRow {
  序号: string;
  经办人: string;
  主驾司机: string;
  月度分摊费用合计: string;
  副驾司机: string;
  车牌号: string;
  创建时间: string;
  发车时间: string;
  批次备注: string;
  总体积: string;
  车辆线路: string;
  主驾计件: string;
  网点: string;
  批次号: string;
  客户名称: string;
  往返批次号: string;
  项目名称: string;
  批次状态: string;
  批次指派状态: string;
  批次派单状态: string;
  批次标识: string;
  批次来源: string;
  配载类型: string;
  批次类型: string;
  点位数: string;
  交易时间: string;
  始发发车时间: string;
  终点到达时间: string;
  卸车等待时长: string;
  应收运输费合计: string;
  应收运输费: string;
  应收点位费: string;
  应收上楼费: string;
  应收装卸费: string;
  应收现付: string;
  应收到付: string;
  应收回付: string;
  应收其它: string;
  应付运输费合计: string;
  "副驾/装卸计件": string;
  付拼车费: string;
  外调车费: string;
  应付现付: string;
  应付到付: string;
  应付油卡: string;
  应付回付: string;
  发站: string;
  到站: string;
  任务毛利: string;
  任务毛利率: string;
  ETC过路费: string;
}

function parseCSV(content: string): CsvRow[] {
  const lines = content.split("\n");
  if (lines.length < 2) {
    throw new Error("CSV文件格式错误：至少需要表头和一行数据");
  }

  const headers = lines[0].split(",").map(h => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(",");
    const row: any = {};
    
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]?.trim() || "";
    }
    
    rows.push(row as CsvRow);
  }

  return rows;
}

function mapStatus(batchStatus: string): "pending" | "confirmed" | "settled" | "cancelled" {
  const status = batchStatus.trim();
  if (status === "已到达" || status === "已完成") {
    return "confirmed";
  } else if (status === "已结算") {
    return "settled";
  } else if (status === "已取消") {
    return "cancelled";
  }
  return "pending";
}

function parseNumber(value: string): number {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

function parseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  
  // 尝试解析 "2026-01-12 17:46:46" 格式
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }
  
  return new Date().toISOString().slice(0, 10);
}

function extractPlaces(route: string): { departure: string; arrival: string } {
  // 车辆线路格式：发站->到站 或 发站->中转站->到站
  const parts = route.split("->");
  if (parts.length >= 2) {
    return {
      departure: parts[0].trim(),
      arrival: parts[parts.length - 1].trim()
    };
  }
  return { departure: "", arrival: "" };
}

async function testDbConnection() {
  try {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 as test");
    console.log("数据库连接成功");
    return true;
  } catch (error) {
    console.error("数据库连接失败:", error);
    return false;
  }
}

async function checkWaybillExists(waybillNumber: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM waybills WHERE waybill_number = ? LIMIT 1",
    [waybillNumber]
  );
  return rows.length > 0;
}

async function importWaybillsFromCsv(csvPath: string) {
  console.log(`开始读取CSV文件: ${csvPath}`);
  
  // 测试数据库连接
  const connected = await testDbConnection();
  if (!connected) {
    console.error("无法连接数据库，退出");
    process.exit(1);
  }

  // 读取CSV文件
  if (!fs.existsSync(csvPath)) {
    console.error(`文件不存在: ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);
  
  console.log(`解析到 ${rows.length} 条记录`);

  let success = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const waybillNumber = row["批次号"]?.trim();
      if (!waybillNumber) {
        skipped++;
        continue;
      }

      // 检查是否已存在
      const exists = await checkWaybillExists(waybillNumber);
      if (exists) {
        console.log(`跳过已存在的运单: ${waybillNumber}`);
        skipped++;
        continue;
      }

      // 提取发站和到站
      let departurePlace = row["发站"]?.trim() || "";
      let arrivalPlace = row["到站"]?.trim() || "";
      
      // 如果发站/到站为空，从车辆线路中提取
      if (!departurePlace || !arrivalPlace) {
        const places = extractPlaces(row["车辆线路"] || "");
        departurePlace = departurePlace || places.departure;
        arrivalPlace = arrivalPlace || places.arrival;
      }

      // 获取客户名称，优先用项目名称
      const customerName = row["项目名称"]?.trim() || row["客户名称"]?.trim() || "未知客户";
      
      const id = randomUUID();
      const oilCardAmount = parseNumber(row["应付油卡"]);
      const etcAmount = parseNumber(row["ETC过路费"]);
      const cashAmount = parseNumber(row["应付现付"]);
      const totalPayment = oilCardAmount + etcAmount + cashAmount || parseNumber(row["应付运输费合计"]);

      await pool.query(
        `INSERT INTO waybills 
         (id, waybill_number, customer_id, customer_name, contract_id, contract_number,
          business_mode, vehicle_plate, driver_name, driver_phone,
          departure_place, arrival_place, goods_name, goods_weight,
          freight_amount, oil_card_amount, etc_amount, cash_amount, total_payment,
          waybill_date, status, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          waybillNumber,
          randomUUID(), // customer_id 生成一个UUID
          customerName,
          null, // contract_id
          null, // contract_number
          "brokerage", // business_mode 默认居间模式
          row["车牌号"]?.trim() || "",
          row["主驾司机"]?.trim() || "",
          null, // driver_phone
          departurePlace,
          arrivalPlace,
          "货物", // goods_name 默认值
          parseNumber(row["总体积"]), // goods_weight 使用总体积
          parseNumber(row["应收运输费合计"]),
          oilCardAmount,
          etcAmount,
          cashAmount,
          totalPayment,
          parseDate(row["发车时间"]),
          mapStatus(row["批次状态"]),
          row["批次备注"]?.trim() || null
        ]
      );

      success++;
      if (success % 50 === 0) {
        console.log(`已导入 ${success} 条...`);
      }
    } catch (error) {
      failed++;
      errors.push(`行 ${row["序号"]}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("\n========== 导入完成 ==========");
  console.log(`成功: ${success}`);
  console.log(`跳过（已存在或无效）: ${skipped}`);
  console.log(`失败: ${failed}`);
  
  if (errors.length > 0) {
    console.log("\n错误详情（前10条）:");
    errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    if (errors.length > 10) {
      console.log(`  ... 还有 ${errors.length - 10} 条错误`);
    }
  }

  await pool.end();
}

// 获取命令行参数中的CSV文件路径
const csvPath = process.argv[2] || "/Users/zac/Desktop/任务列表.csv";
importWaybillsFromCsv(csvPath);
