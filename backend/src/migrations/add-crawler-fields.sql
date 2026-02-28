-- 爬虫多模板架构迁移脚本
-- 为 financier_external_systems 表添加爬虫相关字段

-- 使用存储过程安全地添加列
DELIMITER //

DROP PROCEDURE IF EXISTS add_crawler_columns//

CREATE PROCEDURE add_crawler_columns()
BEGIN
    -- 添加 integration_type 字段
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'financier_external_systems' 
        AND COLUMN_NAME = 'integration_type'
    ) THEN
        ALTER TABLE financier_external_systems 
        ADD COLUMN integration_type VARCHAR(20) NOT NULL DEFAULT 'manual';
    END IF;

    -- 添加 crawler_type 字段
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'financier_external_systems' 
        AND COLUMN_NAME = 'crawler_type'
    ) THEN
        ALTER TABLE financier_external_systems 
        ADD COLUMN crawler_type VARCHAR(50);
    END IF;

    -- 添加 crawler_config 字段
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'financier_external_systems' 
        AND COLUMN_NAME = 'crawler_config'
    ) THEN
        ALTER TABLE financier_external_systems 
        ADD COLUMN crawler_config JSON;
    END IF;

    -- 添加 sync_interval_minutes 字段
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'financier_external_systems' 
        AND COLUMN_NAME = 'sync_interval_minutes'
    ) THEN
        ALTER TABLE financier_external_systems 
        ADD COLUMN sync_interval_minutes INT DEFAULT 360;
    END IF;

    -- 添加 last_sync_status 字段
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'financier_external_systems' 
        AND COLUMN_NAME = 'last_sync_status'
    ) THEN
        ALTER TABLE financier_external_systems 
        ADD COLUMN last_sync_status VARCHAR(20);
    END IF;

    -- 添加 last_sync_error 字段
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'financier_external_systems' 
        AND COLUMN_NAME = 'last_sync_error'
    ) THEN
        ALTER TABLE financier_external_systems 
        ADD COLUMN last_sync_error TEXT;
    END IF;

    -- 添加索引（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'financier_external_systems' 
        AND INDEX_NAME = 'idx_integration_type'
    ) THEN
        CREATE INDEX idx_integration_type ON financier_external_systems(integration_type);
    END IF;
END//

DELIMITER ;

-- 执行存储过程
CALL add_crawler_columns();

-- 清理存储过程
DROP PROCEDURE IF EXISTS add_crawler_columns;

-- 提示：运行此脚本后，旧的 crawler_configs 表将不再使用
-- 可以考虑将旧配置迁移到新表结构中
