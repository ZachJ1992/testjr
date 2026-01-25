const mysql = require('mysql2/promise');

/**
 * 运单表迁移脚本 - 添加CSV中的所有字段
 */

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3307'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root123',
    database: process.env.DB_NAME || 'testjr',
  });

  console.log("========== 运单表迁移 ==========");

  // 添加列的辅助函数
  async function addColumnIfNotExists(column, definition) {
    try {
      const [rows] = await pool.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'waybills' 
        AND COLUMN_NAME = ?
      `, [column]);
      
      if (rows.length === 0) {
        await pool.query(`ALTER TABLE waybills ADD COLUMN ${column} ${definition}`);
        console.log(`✓ 添加字段: ${column}`);
      } else {
        console.log(`- 字段已存在: ${column}`);
      }
    } catch (err) {
      console.error(`✗ 添加字段失败 ${column}:`, err.message);
    }
  }

  // 新增字段 - 按照CSV字段顺序
  const newColumns = [
    // 基础信息
    ['operator', 'VARCHAR(100) COMMENT "经办人"'],
    ['co_driver', 'VARCHAR(100) COMMENT "副驾司机"'],
    ['monthly_cost', 'DECIMAL(15,2) DEFAULT 0 COMMENT "月度分摊费用合计"'],
    ['created_time', 'DATETIME COMMENT "创建时间"'],
    ['departure_time', 'DATETIME COMMENT "发车时间"'],
    ['total_volume', 'DECIMAL(15,2) DEFAULT 0 COMMENT "总体积"'],
    ['vehicle_route', 'VARCHAR(500) COMMENT "车辆线路"'],
    ['driver_piece_rate', 'DECIMAL(15,2) DEFAULT 0 COMMENT "主驾计件"'],
    ['branch', 'VARCHAR(200) COMMENT "网点"'],
    ['batch_number', 'VARCHAR(100) COMMENT "批次号"'],  // 这是原来的 waybill_number
    ['return_batch_number', 'VARCHAR(100) COMMENT "往返批次号"'],
    ['project_name', 'VARCHAR(200) COMMENT "项目名称"'],
    ['batch_status', 'VARCHAR(50) COMMENT "批次状态"'],
    ['assign_status', 'VARCHAR(50) COMMENT "批次指派状态"'],
    ['dispatch_status', 'VARCHAR(50) COMMENT "批次派单状态"'],
    ['batch_tag', 'VARCHAR(100) COMMENT "批次标识"'],
    ['batch_source', 'VARCHAR(50) COMMENT "批次来源"'],
    ['load_type', 'VARCHAR(50) COMMENT "配载类型"'],
    ['batch_type', 'VARCHAR(50) COMMENT "批次类型"'],
    ['point_count', 'INT DEFAULT 0 COMMENT "点位数"'],
    ['transaction_time', 'DATETIME COMMENT "交易时间"'],
    ['origin_departure_time', 'DATETIME COMMENT "始发发车时间"'],
    ['dest_arrival_time', 'DATETIME COMMENT "终点到达时间"'],
    ['unload_wait_time', 'VARCHAR(100) COMMENT "卸车等待时长"'],
    
    // 应收费用
    ['receivable_total', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应收运输费合计"'],
    ['receivable_transport', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应收运输费"'],
    ['receivable_point_fee', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应收点位费"'],
    ['receivable_upstairs_fee', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应收上楼费"'],
    ['receivable_loading_fee', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应收装卸费"'],
    ['receivable_cash', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应收现付"'],
    ['receivable_collect', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应收到付"'],
    ['receivable_return', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应收回付"'],
    ['receivable_other', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应收其它"'],
    
    // 应付费用
    ['payable_total', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应付运输费合计"'],
    ['co_driver_piece_rate', 'DECIMAL(15,2) DEFAULT 0 COMMENT "副驾/装卸计件"'],
    ['carpool_fee', 'DECIMAL(15,2) DEFAULT 0 COMMENT "付拼车费"'],
    ['external_vehicle_fee', 'DECIMAL(15,2) DEFAULT 0 COMMENT "外调车费"'],
    ['payable_cash', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应付现付"'],
    ['payable_collect', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应付到付"'],
    ['payable_oil_card', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应付油卡"'],
    ['payable_return', 'DECIMAL(15,2) DEFAULT 0 COMMENT "应付回付"'],
    
    // 利润
    ['profit', 'DECIMAL(15,2) DEFAULT 0 COMMENT "任务毛利"'],
    ['profit_rate', 'DECIMAL(10,4) DEFAULT 0 COMMENT "任务毛利率"'],
    ['etc_fee', 'DECIMAL(15,2) DEFAULT 0 COMMENT "ETC过路费"'],
  ];

  for (const [column, definition] of newColumns) {
    await addColumnIfNotExists(column, definition);
  }

  console.log("\n========== 迁移完成 ==========");
  await pool.end();
}

main().catch(console.error);
