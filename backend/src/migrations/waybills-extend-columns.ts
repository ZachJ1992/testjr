/**
 * 运单表字段扩展迁移
 * 
 * 添加 TMS 同步所需的额外字段
 */

import { pool } from '../db.js';

const COLUMNS_TO_ADD = [
  { name: 'financier_id', definition: 'VARCHAR(36) NULL' },
  { name: 'operator', definition: 'VARCHAR(100) NULL' },
  { name: 'co_driver', definition: 'VARCHAR(100) NULL' },
  { name: 'monthly_cost', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'created_time', definition: 'DATETIME NULL' },
  { name: 'departure_time', definition: 'DATETIME NULL' },
  { name: 'receivable_total', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'receivable_transport', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'receivable_point_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'receivable_upstairs_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'receivable_loading_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'receivable_cash', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'receivable_collect', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'receivable_return', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'receivable_other', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_total', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_transport', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_loading_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_upstairs_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_billing_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_arrival_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_receipt_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_point_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_insurance_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_tax', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_cash', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_collect', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_oil_card', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'payable_return', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'driver_piece_rate', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'co_driver_piece_rate', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'carpool_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'external_vehicle_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'etc_fee', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'profit', definition: 'DECIMAL(15, 2) DEFAULT 0' },
  { name: 'profit_rate', definition: 'DECIMAL(8, 4) DEFAULT 0' },
  { name: 'vehicle_route', definition: 'VARCHAR(500) NULL' },
  { name: 'branch', definition: 'VARCHAR(100) NULL' },
  { name: 'return_batch_number', definition: 'VARCHAR(100) NULL' },
  { name: 'project_name', definition: 'VARCHAR(200) NULL' },
  { name: 'batch_status', definition: 'VARCHAR(50) NULL' },
  { name: 'assign_status', definition: 'VARCHAR(50) NULL' },
  { name: 'dispatch_status', definition: 'VARCHAR(50) NULL' },
  { name: 'batch_tag', definition: 'VARCHAR(100) NULL' },
  { name: 'batch_source', definition: 'VARCHAR(50) NULL' },
  { name: 'load_type', definition: 'VARCHAR(50) NULL' },
  { name: 'batch_type', definition: 'VARCHAR(50) NULL' },
  { name: 'point_count', definition: 'INT DEFAULT 0' },
  { name: 'sub_financier', definition: "VARCHAR(200) NULL COMMENT '子融资方'" },
];

/**
 * 检查列是否存在
 */
async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const [rows] = await pool.query<any[]>(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = ? 
     AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

/**
 * 运行运单表字段扩展迁移
 */
export async function runWaybillsExtendColumnsMigration(): Promise<void> {
  console.log('=== 运单表字段扩展迁移 ===\n');
  
  let addedCount = 0;
  
  for (const column of COLUMNS_TO_ADD) {
    const exists = await columnExists('waybills', column.name);
    
    if (exists) {
      console.log(`  - 字段已存在: ${column.name}`);
    } else {
      try {
        await pool.query(`ALTER TABLE waybills ADD COLUMN ${column.name} ${column.definition}`);
        console.log(`  + 添加字段: ${column.name}`);
        addedCount++;
      } catch (error: any) {
        // 如果是重复列错误，忽略
        if (!error.message.includes('Duplicate column')) {
          console.error(`  ! 添加字段失败 ${column.name}: ${error.message}`);
        }
      }
    }
  }
  
  // 添加索引
  try {
    const [indexes] = await pool.query<any[]>(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'waybills' 
       AND INDEX_NAME = 'idx_financier_id'`
    );
    
    if (indexes.length === 0) {
      await pool.query(`ALTER TABLE waybills ADD INDEX idx_financier_id (financier_id)`);
      console.log('  + 添加索引: idx_financier_id');
    }
  } catch (e) {
    // 忽略索引创建错误
  }
  
  console.log(`\n=== 共添加 ${addedCount} 个新字段 ===\n`);
}
