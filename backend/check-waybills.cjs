const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3307'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root123',
    database: process.env.DB_NAME || 'testjr',
  });

  console.log("========== 运单统计 ==========");
  
  // 总数
  const [total] = await pool.query("SELECT COUNT(*) as count FROM waybills WHERE deleted_at IS NULL");
  console.log("运单总数:", total[0].count);
  
  // 按状态统计
  const [byStatus] = await pool.query(`
    SELECT status, COUNT(*) as count 
    FROM waybills 
    WHERE deleted_at IS NULL 
    GROUP BY status
  `);
  console.log("\n按状态统计:");
  byStatus.forEach(r => console.log("  -", r.status + ":", r.count));
  
  // 按日期统计（最近7天）
  const [byDate] = await pool.query(`
    SELECT waybill_date, COUNT(*) as count 
    FROM waybills 
    WHERE deleted_at IS NULL 
    GROUP BY waybill_date
    ORDER BY waybill_date DESC
    LIMIT 10
  `);
  console.log("\n按日期统计（最近10天）:");
  byDate.forEach(r => console.log("  -", r.waybill_date + ":", r.count));

  await pool.end();
}

main().catch(console.error);
