import { pool } from "../db.js";

export async function createCrawlerTables(): Promise<void> {
  console.log("Creating crawler tables...");

  // 爬虫配置表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crawler_configs (
      id VARCHAR(36) PRIMARY KEY,
      financier_id VARCHAR(36) NOT NULL,
      name VARCHAR(100) NOT NULL,
      system_url VARCHAR(255) NOT NULL,
      api_endpoint VARCHAR(255) NOT NULL,
      cookies TEXT NOT NULL,
      company_id VARCHAR(50),
      user_id VARCHAR(50),
      group_id VARCHAR(50),
      extra_params JSON,
      sync_enabled BOOLEAN DEFAULT true,
      sync_interval_minutes INT DEFAULT 60,
      last_sync_time DATETIME,
      last_sync_record_id VARCHAR(50),
      last_sync_count INT DEFAULT 0,
      last_sync_status VARCHAR(20),
      last_sync_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME DEFAULT NULL,
      INDEX idx_financier_id (financier_id),
      INDEX idx_sync_enabled (sync_enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 同步日志表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crawler_sync_logs (
      id VARCHAR(36) PRIMARY KEY,
      config_id VARCHAR(36) NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      status VARCHAR(20) NOT NULL,
      total_fetched INT DEFAULT 0,
      new_count INT DEFAULT 0,
      updated_count INT DEFAULT 0,
      skipped_count INT DEFAULT 0,
      error_count INT DEFAULT 0,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_config_id (config_id),
      INDEX idx_start_time (start_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 为 waybills 表添加 external_id 字段（用于增量同步）
  try {
    await pool.query(`
      ALTER TABLE waybills 
      ADD COLUMN IF NOT EXISTS external_id VARCHAR(50),
      ADD INDEX IF NOT EXISTS idx_external_id (external_id)
    `);
  } catch (err: any) {
    // MySQL 5.7 不支持 IF NOT EXISTS，尝试直接添加
    if (err.code === 'ER_PARSE_ERROR') {
      try {
        await pool.query(`ALTER TABLE waybills ADD COLUMN external_id VARCHAR(50)`);
        await pool.query(`ALTER TABLE waybills ADD INDEX idx_external_id (external_id)`);
      } catch (alterErr: any) {
        // 列已存在，忽略
        if (alterErr.code !== 'ER_DUP_FIELDNAME' && alterErr.code !== 'ER_DUP_KEYNAME') {
          console.log("Note: external_id column may already exist");
        }
      }
    }
  }

  console.log("Crawler tables created successfully");
}
