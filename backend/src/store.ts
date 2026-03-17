import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "./db.js";
import { hashPassword } from "./password.js";
import { verifyPassword } from "./password.js";
import {
  OrgUnit,
  Permission,
  PermissionNode,
  Role,
  SafeUser,
  User,
  UserGroup,
  I18nEntry,
  I18nScope,
  Investment,
  InvestmentStatus,
  Supervision,
  SupervisionType,
  SupervisionStatus,
  ContractCommission,
  CommissionStatus,
  CommissionStats,
  Contract,
  ContractType,
  ContractStatus,
  Funder,
  FunderType,
  FunderStatus,
  Financier,
  FinancierScale,
  FinancierStatus,
  FundPoolMonitoring,
  FundProviderShare,
  LiquidityWarning,
  FundFlow,
  SystemParameters,
  CommissionContract,
  CommissionContractStatus,
  CommissionConfigItem,
  CommissionContractStats
} from "./types.js";

// 内存缓存
const cache = {
  permissions: null as PermissionNode[] | null,
  permissionRows: null as any[] | null,
  groups: null as Array<UserGroup & { permissions: Permission[]; userIds: string[] }> | null,
  orgUnits: null as OrgUnit[] | null,
  users: null as SafeUser[] | null
};

// 清除缓存函数
function clearCache(cacheKey?: keyof typeof cache) {
  if (cacheKey) {
    cache[cacheKey] = null;
  } else {
    // 清除所有缓存
    cache.permissions = null;
    cache.permissionRows = null;
    cache.groups = null;
    cache.orgUnits = null;
    cache.users = null;
  }
}

// 清除权限相关缓存（包括权限树和权限行）
function clearPermissionCache() {
  cache.permissions = null;
  cache.permissionRows = null;
}

// 清除用户组缓存
function clearGroupsCache() {
  cache.groups = null;
  // 用户组变更可能影响用户缓存
  cache.users = null;
}

// 清除组织架构缓存
function clearOrgUnitsCache() {
  cache.orgUnits = null;
  // 组织架构变更可能影响用户缓存
  cache.users = null;
}

// 清除用户缓存
function clearUsersCache() {
  cache.users = null;
}

const DEFAULT_PERMISSION_SEED: Array<{
  code: Permission;
  name: string;
  description?: string;
  parentCode?: Permission;
}> = [
  { code: "system", name: "系统管理" },
  {
    code: "manage_users",
    name: "用户管理",
    parentCode: "system"
  },
  {
    code: "manage_roles",
    name: "角色管理",
    parentCode: "system"
  },
  {
    code: "manage_groups",
    name: "用户组管理",
    parentCode: "system"
  },
  {
    code: "manage_orgs",
    name: "组织管理",
    parentCode: "system"
  },
  {
    code: "view_orgs",
    name: "组织查看",
    parentCode: "system"
  },
  {
    code: "manage_permissions",
    name: "权限管理",
    parentCode: "system"
  },
  {
    code: "manage_investments",
    name: "投资管理",
    parentCode: "system"
  },
  {
    code: "manage_supervisions",
    name: "监管管理",
    parentCode: "system"
  },
  {
    code: "manage_commissions",
    name: "合同抽成管理",
    parentCode: "system"
  },
  {
    code: "manage_contracts",
    name: "合同管理",
    parentCode: "system"
  },
  {
    code: "manage_funders",
    name: "资金方管理",
    parentCode: "system"
  },
  {
    code: "manage_financiers",
    name: "融资方管理",
    parentCode: "system"
  },
  {
    code: "view_fund_pool",
    name: "资金池监控",
    parentCode: "system"
  },
  {
    code: "manage_system_parameters",
    name: "参数配置",
    parentCode: "system"
  },
  {
    code: "approve_payments",
    name: "代付审核",
    parentCode: "system"
  },
  {
    code: "view_payment_ledger",
    name: "支付流水台账",
    parentCode: "system"
  },
  {
    code: "view_payment_waybill_ledger",
    name: "单车运单台账",
    parentCode: "system"
  },
  {
    code: "manage_settlements",
    name: "结算管理",
    parentCode: "system"
  },
  {
    code: "view_operation_logs",
    name: "操作日志",
    parentCode: "system"
  },
  {
    code: "manage_waybills",
    name: "运单数据管理",
    parentCode: "system"
  },
  // 定向支付权限
  { code: "manage_directed_pay", name: "定向支付管理" },
  {
    code: "manage_directed_pay_contracts",
    name: "合同管理",
    parentCode: "manage_directed_pay"
  },
  {
    code: "approve_directed_pay_contracts",
    name: "合同审批",
    parentCode: "manage_directed_pay"
  },
  {
    code: "create_directed_payment",
    name: "发起支付",
    parentCode: "manage_directed_pay"
  },
  {
    code: "approve_directed_payment_platform",
    name: "平台审批支付",
    parentCode: "manage_directed_pay"
  },
  {
    code: "approve_directed_payment_funder",
    name: "资金方审批支付",
    parentCode: "manage_directed_pay"
  },
  {
    code: "manage_virtual_accounts",
    name: "虚拟账户管理",
    parentCode: "manage_directed_pay"
  },
  {
    code: "view_virtual_accounts",
    name: "查看虚拟账户",
    parentCode: "manage_directed_pay"
  },
  {
    code: "manage_directed_pay_settlements",
    name: "定向支付结算管理",
    parentCode: "manage_directed_pay"
  },
  {
    code: "view_directed_pay_settlements",
    name: "查看定向支付结算",
    parentCode: "manage_directed_pay"
  },
  // 收益管理权限
  { code: "revenue_management", name: "收益管理" },
  {
    code: "view_platform_revenue",
    name: "平台收益看板",
    parentCode: "revenue_management"
  },
  {
    code: "view_funder_revenue",
    name: "资金方收益",
    parentCode: "revenue_management"
  },
  {
    code: "view_financier_expense",
    name: "融资方支出",
    parentCode: "revenue_management"
  }
];

type UserRow = RowDataPacket & {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  org_id: string | null;
  is_active: number | null;
};

type RoleRow = RowDataPacket & {
  id: string;
  name: string;
  description: string | null;
};

type PermissionRow = RowDataPacket & {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
};

type GroupRow = RowDataPacket & {
  id: string;
  name: string;
  description: string | null;
};

type OrgRow = RowDataPacket & {
  id: string;
  name: string;
  parent_id: string | null;
  is_active: number | null;
  type: string | null;
  related_entity_id: string | null;
};

type RolePermRow = RowDataPacket & {
  role_id: string;
  permission_code: Permission;
};

type UserRoleRow = RowDataPacket & {
  user_id: string;
  role_id: string;
};

type UserGroupRow = RowDataPacket & {
  user_id: string;
  group_id: string;
};

type GroupPermRow = RowDataPacket & {
  group_id: string;
  permission_code: Permission;
};

type I18nRow = RowDataPacket & {
  id: string;
  lang: string;
  tkey: string;
  tvalue: string;
  scope_type: I18nScope;
  scope_id: string | null;
  page: string | null;
};

export async function listI18nEntries(input: {
  lang?: string;
  scopeType?: I18nScope;
  scopeId?: string;
  page?: string;
}): Promise<I18nEntry[]> {
  const clauses: string[] = [];
  const params: Array<string | null> = [];
  if (input.lang) {
    clauses.push("lang = ?");
    params.push(input.lang);
  }
  if (input.scopeType) {
    clauses.push("scope_type = ?");
    params.push(input.scopeType);
  }
  if (input.scopeId !== undefined) {
    clauses.push("scope_id <=> ?");
    params.push(input.scopeId);
  }
  if (input.page !== undefined) {
    clauses.push("page <=> ?");
    params.push(input.page);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [rows] = await pool.query<I18nRow[]>(
    `SELECT id, lang, tkey, tvalue, scope_type, scope_id, page
     FROM i18n_entries ${where}
     ORDER BY updated_at DESC`
    , params);

  return rows.map((row) => ({
    id: row.id,
    lang: row.lang,
    key: row.tkey,
    value: row.tvalue,
    scopeType: row.scope_type,
    scopeId: row.scope_id ?? undefined,
    page: row.page ?? undefined
  }));
}

// 辅助函数：安全地添加列（如果不存在）
async function addColumnIfNotExists(tableName: string, columnName: string, columnDefinition: string): Promise<void> {
  try {
    const [columns] = await pool.query<RowDataPacket[]>(
      `SHOW COLUMNS FROM ${tableName} LIKE '${columnName}'`
    );
    if (columns.length === 0) {
      await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    }
  } catch (err: any) {
    // 如果表不存在或其他错误，忽略（表会在 CREATE TABLE 时创建）
    if (err.code !== 'ER_NO_SUCH_TABLE') {
      console.warn(`Failed to add column ${columnName} to ${tableName}:`, err.message);
    }
  }
}

// 辅助函数：安全地创建索引（如果不存在）
async function createIndexIfNotExists(tableName: string, indexName: string, columnNames: string): Promise<void> {
  try {
    const [indexes] = await pool.query<RowDataPacket[]>(
      `SHOW INDEX FROM ${tableName} WHERE Key_name = '${indexName}'`
    );
    if (indexes.length === 0) {
      await pool.query(`CREATE INDEX ${indexName} ON ${tableName}(${columnNames})`);
    }
  } catch (err: any) {
    // 如果表不存在或其他错误，忽略
    if (err.code !== 'ER_NO_SUCH_TABLE') {
      console.warn(`Failed to create index ${indexName} on ${tableName}:`, err.message);
    }
  }
}

async function initSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS permissions (
      id VARCHAR(36) PRIMARY KEY,
      code VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      description VARCHAR(255),
      parent_id VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_perm_parent (parent_id),
      CONSTRAINT fk_perm_parent FOREIGN KEY (parent_id) REFERENCES permissions(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS roles (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS role_permissions (
      role_id VARCHAR(36) NOT NULL,
      permission_code VARCHAR(100) NOT NULL,
      PRIMARY KEY (role_id, permission_code),
      CONSTRAINT fk_role_permissions_role
        FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_role_permissions_permission
        FOREIGN KEY (permission_code) REFERENCES permissions(code)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS user_groups (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS org_units (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      parent_id VARCHAR(36),
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_org_parent (parent_id),
      CONSTRAINT fk_org_parent FOREIGN KEY (parent_id) REFERENCES org_units(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      display_name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      org_id VARCHAR(36),
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_org (org_id),
      CONSTRAINT fk_user_org FOREIGN KEY (org_id) REFERENCES org_units(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS user_roles (
      user_id VARCHAR(36) NOT NULL,
      role_id VARCHAR(36) NOT NULL,
      PRIMARY KEY (user_id, role_id),
      CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS user_group_members (
      user_id VARCHAR(36) NOT NULL,
      group_id VARCHAR(36) NOT NULL,
      PRIMARY KEY (user_id, group_id),
      CONSTRAINT fk_user_group_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_group_group FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS group_permissions (
      group_id VARCHAR(36) NOT NULL,
      permission_code VARCHAR(100) NOT NULL,
      PRIMARY KEY (group_id, permission_code),
      CONSTRAINT fk_group_permissions_group FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
      CONSTRAINT fk_group_permissions_permission FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS i18n_entries (
      id VARCHAR(36) PRIMARY KEY,
      lang VARCHAR(16) NOT NULL,
      tkey VARCHAR(191) NOT NULL,
      tvalue TEXT NOT NULL,
      scope_type VARCHAR(16) NOT NULL,
      scope_id VARCHAR(36),
      page VARCHAR(128),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_i18n (scope_type, scope_id, page, lang, tkey),
      INDEX idx_i18n_lang (lang),
      INDEX idx_i18n_scope (scope_type, scope_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS investments (
      id VARCHAR(36) PRIMARY KEY,
      investment_number VARCHAR(100) NOT NULL UNIQUE,
      amount DECIMAL(15, 2) NOT NULL,
      investor_entity VARCHAR(200) NOT NULL,
      receiving_entity VARCHAR(200) NOT NULL,
      asset_description VARCHAR(500),
      interest_rate DECIMAL(5, 2) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      expected_return DECIMAL(15, 2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'holding',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_investment_number (investment_number),
      INDEX idx_status (status),
      INDEX idx_start_date (start_date),
      INDEX idx_end_date (end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS supervisions (
      id VARCHAR(36) PRIMARY KEY,
      waybill_number VARCHAR(100) NOT NULL,
      license_plate VARCHAR(20) NOT NULL,
      gross_profit DECIMAL(15, 2) NOT NULL,
      supervision_type VARCHAR(50) NOT NULL,
      supervision_rate DECIMAL(5, 2) NOT NULL,
      supervision_amount DECIMAL(15, 2) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'supervising',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_waybill_number (waybill_number),
      INDEX idx_license_plate (license_plate),
      INDEX idx_supervision_type (supervision_type),
      INDEX idx_status (status),
      INDEX idx_start_date (start_date),
      INDEX idx_end_date (end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS contract_commissions (
      id VARCHAR(36) PRIMARY KEY,
      contract_number VARCHAR(100) NOT NULL,
      upstream_customer VARCHAR(200) NOT NULL,
      license_plate VARCHAR(20) NOT NULL,
      vehicle_income DECIMAL(15, 2) NOT NULL,
      commission_rate DECIMAL(5, 2) NOT NULL,
      commission_amount DECIMAL(15, 2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      settlement_time DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_contract_number (contract_number),
      INDEX idx_upstream_customer (upstream_customer),
      INDEX idx_license_plate (license_plate),
      INDEX idx_status (status),
      INDEX idx_settlement_time (settlement_time),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS contracts (
      id VARCHAR(36) PRIMARY KEY,
      type VARCHAR(20) NOT NULL,
      funder_id VARCHAR(36),
      funder_name VARCHAR(200),
      logistics_provider_id VARCHAR(36) NOT NULL,
      logistics_provider_name VARCHAR(200) NOT NULL,
      credit_limit DECIMAL(20, 2) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      annual_interest_rate DECIMAL(5, 2),
      interest_calculation_mode VARCHAR(50),
      profit_sharing_ratio DECIMAL(5, 2),
      settlement_cycle VARCHAR(20) NOT NULL,
      settlement_trigger_day INT,
      settlement_trigger_quarter_end TINYINT(1) DEFAULT 0,
      settlement_trigger_biweekly TINYINT(1) DEFAULT 0,
      auto_settlement TINYINT(1) NOT NULL DEFAULT 1,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_type (type),
      INDEX idx_funder_id (funder_id),
      INDEX idx_logistics_provider_id (logistics_provider_id),
      INDEX idx_status (status),
      INDEX idx_start_date (start_date),
      INDEX idx_end_date (end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS ai_sessions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      title VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_created_at (created_at),
      CONSTRAINT fk_ai_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS ai_messages (
      id VARCHAR(36) PRIMARY KEY,
      session_id VARCHAR(36) NOT NULL,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      tool_calls JSON,
      tool_results JSON,
      sequence_number INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_session_id (session_id),
      INDEX idx_sequence (session_id, sequence_number),
      INDEX idx_created_at (created_at),
      CONSTRAINT fk_ai_messages_session FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS funders (
      id VARCHAR(36) PRIMARY KEY,
      institution_name VARCHAR(200) NOT NULL,
      institution_type VARCHAR(20) NOT NULL,
      unified_social_credit_code VARCHAR(18) NOT NULL UNIQUE,
      business_license_url TEXT,
      financial_license_url TEXT,
      account_opening_permit_url TEXT,
      contact_person VARCHAR(100),
      contact_phone VARCHAR(50),
      bank_name VARCHAR(200),
      bank_account VARCHAR(100),
      account_name VARCHAR(200),
      cumulative_credit_limit DECIMAL(20, 2) NOT NULL DEFAULT 0,
      current_loan_balance DECIMAL(20, 2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      INDEX idx_institution_type (institution_type),
      INDEX idx_status (status),
      INDEX idx_unified_social_credit_code (unified_social_credit_code),
      INDEX idx_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS financiers (
      id VARCHAR(36) PRIMARY KEY,
      enterprise_name VARCHAR(200) NOT NULL,
      unified_social_credit_code VARCHAR(18) NOT NULL UNIQUE,
      legal_representative VARCHAR(100) NOT NULL,
      business_address VARCHAR(500) NOT NULL,
      region VARCHAR(100),
      operating_scale VARCHAR(20) NOT NULL,
      business_license_url TEXT,
      road_transport_license_url TEXT,
      legal_person_id_card_url TEXT,
      total_credit_limit DECIMAL(20, 2) NOT NULL DEFAULT 0,
      initial_credit_amount DECIMAL(20, 2) NOT NULL DEFAULT 0,
      remaining_credit_limit DECIMAL(20, 2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      INDEX idx_operating_scale (operating_scale),
      INDEX idx_status (status),
      INDEX idx_unified_social_credit_code (unified_social_credit_code),
      INDEX idx_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS financier_external_systems (
      id VARCHAR(36) PRIMARY KEY,
      financier_id VARCHAR(36) NOT NULL,
      system_name VARCHAR(100) NOT NULL,
      system_id VARCHAR(200) NOT NULL,
      api_endpoint VARCHAR(500),
      api_key VARCHAR(500),
      sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      last_sync_time DATETIME,
      integration_type VARCHAR(20) NOT NULL DEFAULT 'manual',
      crawler_type VARCHAR(50),
      crawler_config JSON,
      sync_interval_minutes INT DEFAULT 360,
      last_sync_status VARCHAR(20),
      last_sync_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      INDEX idx_financier_id (financier_id),
      INDEX idx_system_name (system_name),
      INDEX idx_system_id (system_id),
      INDEX idx_integration_type (integration_type),
      INDEX idx_deleted_at (deleted_at),
      FOREIGN KEY (financier_id) REFERENCES financiers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS fund_flows (
      id VARCHAR(36) PRIMARY KEY,
      time DATETIME NOT NULL,
      operation_type VARCHAR(20) NOT NULL,
      associated_entity VARCHAR(200) NOT NULL,
      change_amount DECIMAL(20, 2) NOT NULL,
      remaining_balance DECIMAL(20, 2) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_time (time),
      INDEX idx_operation_type (operation_type),
      INDEX idx_associated_entity (associated_entity)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS system_parameters (
      id VARCHAR(36) PRIMARY KEY,
      annual_interest_calculation_days INT NOT NULL DEFAULT 360,
      daily_interest_rounding_rule VARCHAR(20) NOT NULL DEFAULT 'round_half_up',
      default_profit_sharing_ratio DECIMAL(5, 2) NOT NULL DEFAULT 50.00,
      single_payment_limit DECIMAL(20, 2) NOT NULL DEFAULT 500000.00,
      enterprise_daily_payment_limit DECIMAL(20, 2) NOT NULL DEFAULT 5000000.00,
      fund_pool_warning_level DECIMAL(5, 2) NOT NULL DEFAULT 15.00,
      repayment_grace_period INT NOT NULL DEFAULT 3,
      penalty_interest_ratio DECIMAL(5, 2) NOT NULL DEFAULT 1.50,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by VARCHAR(36),
      CONSTRAINT fk_system_parameters_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS waybills (
      id VARCHAR(36) PRIMARY KEY,
      waybill_number VARCHAR(100) NOT NULL UNIQUE,
      customer_id VARCHAR(36) NOT NULL,
      customer_name VARCHAR(200) NOT NULL,
      contract_id VARCHAR(36),
      contract_number VARCHAR(100),
      business_mode VARCHAR(20) NOT NULL,
      vehicle_plate VARCHAR(20) NOT NULL,
      driver_name VARCHAR(100) NOT NULL,
      driver_phone VARCHAR(50),
      departure_place VARCHAR(200) NOT NULL,
      arrival_place VARCHAR(200) NOT NULL,
      goods_name VARCHAR(200) NOT NULL,
      goods_weight DECIMAL(15, 2) NOT NULL DEFAULT 0,
      freight_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
      oil_card_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
      etc_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
      cash_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
      total_payment DECIMAL(15, 2) NOT NULL DEFAULT 0,
      waybill_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      INDEX idx_waybill_number (waybill_number),
      INDEX idx_customer_id (customer_id),
      INDEX idx_customer_name (customer_name),
      INDEX idx_contract_id (contract_id),
      INDEX idx_business_mode (business_mode),
      INDEX idx_vehicle_plate (vehicle_plate),
      INDEX idx_waybill_date (waybill_date),
      INDEX idx_status (status),
      INDEX idx_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS virtual_accounts (
      id VARCHAR(36) PRIMARY KEY,
      account_number VARCHAR(50) NOT NULL UNIQUE,
      owner_type VARCHAR(20) NOT NULL,
      owner_id VARCHAR(36) NOT NULL,
      owner_name VARCHAR(100) NOT NULL,
      balance DECIMAL(18,2) NOT NULL DEFAULT 0,
      frozen_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      total_income DECIMAL(18,2) NOT NULL DEFAULT 0,
      total_expense DECIMAL(18,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      INDEX idx_va_owner (owner_type, owner_id),
      INDEX idx_va_status (status),
      INDEX idx_va_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS virtual_account_transactions (
      id VARCHAR(36) PRIMARY KEY,
      transaction_number VARCHAR(50) NOT NULL UNIQUE,
      account_id VARCHAR(36) NOT NULL,
      txn_type VARCHAR(20) NOT NULL,
      amount DECIMAL(18,2) NOT NULL,
      balance_before DECIMAL(18,2) NOT NULL,
      balance_after DECIMAL(18,2) NOT NULL,
      related_type VARCHAR(50),
      related_id VARCHAR(36),
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_vat_account (account_id),
      INDEX idx_vat_type (txn_type),
      INDEX idx_vat_related (related_type, related_id),
      FOREIGN KEY (account_id) REFERENCES virtual_accounts(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS payment_codes (
      id VARCHAR(36) PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      request_id VARCHAR(36) NOT NULL,
      driver_id VARCHAR(36),
      driver_name VARCHAR(100),
      driver_phone VARCHAR(20),
      amount DECIMAL(18,2) NOT NULL,
      expire_at DATETIME NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      used_at DATETIME,
      used_location VARCHAR(255),
      tms_sync_status VARCHAR(20) DEFAULT 'pending',
      tms_sync_time DATETIME,
      tms_sync_response JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pc_code (code),
      INDEX idx_pc_request (request_id),
      INDEX idx_pc_driver (driver_id),
      INDEX idx_pc_status (status),
      INDEX idx_pc_expire (expire_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  ];

  for (const sql of statements) {
    await pool.query(sql);
  }

  // 为所有表添加 deleted_at 字段（如果不存在）
  await addColumnIfNotExists('permissions', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('user_groups', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('org_units', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('users', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('i18n_entries', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('investments', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('supervisions', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('contract_commissions', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('contracts', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('ai_sessions', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('ai_messages', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('funders', 'deleted_at', 'DATETIME NULL');
  await addColumnIfNotExists('funders', 'business_license_name', 'VARCHAR(255) NULL');
  await addColumnIfNotExists('funders', 'financial_license_name', 'VARCHAR(255) NULL');
  await addColumnIfNotExists('funders', 'account_opening_permit_name', 'VARCHAR(255) NULL');
  await addColumnIfNotExists('financiers', 'deleted_at', 'DATETIME NULL');

  // 为 deleted_at 字段添加索引以提高查询性能
  await createIndexIfNotExists('permissions', 'idx_permissions_deleted_at', 'deleted_at');
  await createIndexIfNotExists('user_groups', 'idx_user_groups_deleted_at', 'deleted_at');
  await createIndexIfNotExists('org_units', 'idx_org_units_deleted_at', 'deleted_at');
  await createIndexIfNotExists('users', 'idx_users_deleted_at', 'deleted_at');
  await createIndexIfNotExists('i18n_entries', 'idx_i18n_entries_deleted_at', 'deleted_at');
  await createIndexIfNotExists('investments', 'idx_investments_deleted_at', 'deleted_at');
  await createIndexIfNotExists('supervisions', 'idx_supervisions_deleted_at', 'deleted_at');
  await createIndexIfNotExists('contract_commissions', 'idx_contract_commissions_deleted_at', 'deleted_at');
  await createIndexIfNotExists('contracts', 'idx_contracts_deleted_at', 'deleted_at');
  await createIndexIfNotExists('ai_sessions', 'idx_ai_sessions_deleted_at', 'deleted_at');
  await createIndexIfNotExists('ai_messages', 'idx_ai_messages_deleted_at', 'deleted_at');
  await createIndexIfNotExists('funders', 'idx_funders_deleted_at', 'deleted_at');
  await createIndexIfNotExists('financiers', 'idx_financiers_deleted_at', 'deleted_at');

  await ensureRolePermissionsColumn();
}

async function ensureRolePermissionsColumn(): Promise<void> {
  const [newCol] = await pool.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM role_permissions LIKE 'permission_code'"
  );
  if (newCol.length) {
    return;
  }

  const [oldCol] = await pool.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM role_permissions LIKE 'permission'"
  );
  if (oldCol.length) {
    await pool.query(
      "ALTER TABLE role_permissions CHANGE COLUMN permission permission_code VARCHAR(100) NOT NULL"
    );
  } else {
    await pool.query(
      "ALTER TABLE role_permissions ADD COLUMN permission_code VARCHAR(100) NOT NULL"
    );
  }
}

async function ensureOrgActiveColumn(): Promise<void> {
  const [col] = await pool.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM org_units LIKE 'is_active'"
  );
  if (col.length) {
    return;
  }
  await pool.query(
    "ALTER TABLE org_units ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1"
  );
}

async function ensureUserActiveColumn(): Promise<void> {
  const [col] = await pool.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM users LIKE 'is_active'"
  );
  if (col.length) {
    return;
  }
  await pool.query(
    "ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1"
  );
}

async function ensureContractSharingModeColumns(): Promise<void> {
  // Check and add sharing_mode column
  const [sharingModeCol] = await pool.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM contracts LIKE 'sharing_mode'"
  );
  if (!sharingModeCol.length) {
    await pool.query(
      "ALTER TABLE contracts ADD COLUMN sharing_mode VARCHAR(20) DEFAULT 'percentage'"
    );
  }
  
  // Check and add fixed_sharing_amount column
  const [fixedAmountCol] = await pool.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM contracts LIKE 'fixed_sharing_amount'"
  );
  if (!fixedAmountCol.length) {
    await pool.query(
      "ALTER TABLE contracts ADD COLUMN fixed_sharing_amount DECIMAL(15, 2) DEFAULT 0"
    );
  }
  
  // Check and add commission_config column (JSON for storing commission configuration)
  const [commissionConfigCol] = await pool.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM contracts LIKE 'commission_config'"
  );
  if (!commissionConfigCol.length) {
    await pool.query(
      "ALTER TABLE contracts ADD COLUMN commission_config JSON DEFAULT NULL"
    );
  }
}

async function ensureContractDeletedAtColumn(): Promise<void> {
  const [col] = await pool.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM contracts LIKE 'deleted_at'"
  );
  if (!col.length) {
    await pool.query(
      "ALTER TABLE contracts ADD COLUMN deleted_at DATETIME DEFAULT NULL"
    );
  }
}

async function ensureI18nIndexes(): Promise<void> {
  await pool.query(
    "ALTER TABLE i18n_entries ADD INDEX IF NOT EXISTS idx_i18n_lang (lang)"
  ).catch(() => {});
}

async function getPermissionRows(): Promise<PermissionRow[]> {
  // 检查缓存
  if (cache.permissionRows) {
    return cache.permissionRows as PermissionRow[];
  }
  
  const [rows] = await pool.query<PermissionRow[]>(
    "SELECT id, code, name, description, parent_id FROM permissions WHERE deleted_at IS NULL"
  );
  
  // 更新缓存
  cache.permissionRows = rows;
  return rows;
}

async function ensureDefaultPermissions(): Promise<void> {
  const existing = await getPermissionRows();
  const codeToId = new Map(existing.map((p) => [p.code, p.id]));

  for (const seed of DEFAULT_PERMISSION_SEED) {
    let parentId: string | null = null;
    if (seed.parentCode) {
      parentId = codeToId.get(seed.parentCode) ?? null;
      if (!parentId) {
        const newParentId = randomUUID();
        await pool.query(
          "INSERT INTO permissions (id, code, name, description, parent_id) VALUES (?, ?, ?, ?, ?)",
          [newParentId, seed.parentCode, seed.parentCode, null, null]
        );
        codeToId.set(seed.parentCode, newParentId);
        parentId = newParentId;
      }
    }

    if (!codeToId.has(seed.code)) {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO permissions (id, code, name, description, parent_id) VALUES (?, ?, ?, ?, ?)",
        [id, seed.code, seed.name, seed.description ?? null, parentId]
      );
      codeToId.set(seed.code, id);
    } else {
      await pool.query(
        "UPDATE permissions SET name = ?, description = ?, parent_id = ? WHERE code = ?",
        [seed.name, seed.description ?? null, parentId, seed.code]
      );
    }
  }
}

function buildPermissionTree(rows: PermissionRow[]): PermissionNode[] {
  const nodes = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? undefined,
    parentId: row.parent_id ?? undefined,
    children: [] as PermissionNode[]
  }));

  const map = new Map<string, PermissionNode>();
  nodes.forEach((n) => map.set(n.id, n));
  const roots: PermissionNode[] = [];
  nodes.forEach((n) => {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)?.children?.push(n);
    } else {
      roots.push(n);
    }
  });
  return roots;
}

async function getPermissionTree(): Promise<PermissionNode[]> {
  // 检查缓存
  if (cache.permissions) {
    return cache.permissions;
  }
  
  const rows = await getPermissionRows();
  const tree = buildPermissionTree(rows);
  
  // 更新缓存
  cache.permissions = tree;
  return tree;
}

async function findPermissionById(
  id: string
): Promise<PermissionRow | undefined> {
  const [rows] = await pool.query<PermissionRow[]>(
    "SELECT id, code, name, description, parent_id FROM permissions WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [id]
  );
  return rows[0];
}

async function findPermissionByCode(
  code: string
): Promise<PermissionRow | undefined> {
  const [rows] = await pool.query<PermissionRow[]>(
    "SELECT id, code, name, description, parent_id FROM permissions WHERE code = ? AND deleted_at IS NULL LIMIT 1",
    [code]
  );
  return rows[0];
}

async function ensurePermissionsExist(codes: Permission[]): Promise<void> {
  if (!codes.length) {
    return;
  }
  const placeholders = codes.map(() => "?").join(",");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as cnt FROM permissions WHERE code IN (${placeholders}) AND deleted_at IS NULL`,
    codes
  );
  const count = Number(rows[0]?.cnt ?? 0);
  if (count !== codes.length) {
    throw new Error("存在无效的权限");
  }
}

async function ensureRoleHasPermissions(
  roleId: string,
  codes: Permission[]
): Promise<void> {
  if (!codes.length) {
    return;
  }
  
  // 保护 admin 角色：确保它始终拥有所有权限
  const [roleRows] = await pool.query<RoleRow[]>(
    "SELECT name FROM roles WHERE id = ? LIMIT 1",
    [roleId]
  );
  if (roleRows[0]?.name === "admin") {
    const allPermRows = await getPermissionRows();
    const allPermCodes = allPermRows.map((p) => p.code);
    codes = allPermCodes; // 强制使用所有权限
  }
  
  await ensurePermissionsExist(codes);
  const [rows] = await pool.query<RolePermRow[]>(
    "SELECT permission_code FROM role_permissions WHERE role_id = ?",
    [roleId]
  );
  const existing = new Set(rows.map((r) => r.permission_code));
  const missing = codes.filter((c) => !existing.has(c));
  if (!missing.length) {
    return;
  }
  const values = missing.map((c) => [roleId, c]);
  await pool.query(
    "INSERT IGNORE INTO role_permissions (role_id, permission_code) VALUES ?",
    [values]
  );
}

async function setGroupPermissions(
  groupId: string,
  codes: Permission[]
): Promise<void> {
  // 保护 Administrators 组：确保它始终拥有所有权限
  const [groupRows] = await pool.query<GroupRow[]>(
    "SELECT name FROM user_groups WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [groupId]
  );
  if (groupRows[0]?.name === "Administrators") {
    const allPermRows = await getPermissionRows();
    const allPermCodes = allPermRows.map((p) => p.code);
    codes = allPermCodes; // 强制使用所有权限
  }
  
  await ensurePermissionsExist(codes);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM group_permissions WHERE group_id = ?", [
      groupId
    ]);
    if (codes.length) {
      const values = codes.map((c) => [groupId, c]);
      await conn.query(
        "INSERT INTO group_permissions (group_id, permission_code) VALUES ?",
        [values]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function setUserGroups(
  userId: string,
  groupIds: string[]
): Promise<void> {
  // 保护 admin 用户：确保它始终在 Administrators 组中
  const user = await findUserById(userId);
  if (user?.username === "admin") {
    const [adminGroupRows] = await pool.query<GroupRow[]>(
      "SELECT id FROM user_groups WHERE name = ? AND deleted_at IS NULL LIMIT 1",
      ["Administrators"]
    );
    if (adminGroupRows[0]?.id) {
      const adminGroupId = adminGroupRows[0].id;
      // 确保 Administrators 组在 groupIds 中
      if (!groupIds.includes(adminGroupId)) {
        groupIds = [...groupIds, adminGroupId];
      }
    }
  }
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM user_group_members WHERE user_id = ?", [
      userId
    ]);
    if (groupIds.length) {
      const values = groupIds.map((g) => [userId, g]);
      await conn.query(
        "INSERT INTO user_group_members (user_id, group_id) VALUES ?",
        [values]
      );
    }
    await conn.commit();
    // 清除用户组和用户缓存（因为成员关系改变了）
    clearGroupsCache();
    clearUsersCache();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function initData(): Promise<void> {
  await initSchema();
  await ensureDefaultPermissions();
  await ensureOrgActiveColumn();
  await ensureUserActiveColumn();
  await ensureContractSharingModeColumns();
  await ensureContractDeletedAtColumn();
  await ensureI18nIndexes();

  const allPermRows = await getPermissionRows();
  const allPermCodes = allPermRows.map((p) => p.code);

  const [adminRoleRows] = await pool.query<RoleRow[]>(
    "SELECT id FROM roles WHERE name = ? LIMIT 1",
    ["admin"]
  );
  let adminRoleId: string;
  if (adminRoleRows[0]?.id) {
    adminRoleId = adminRoleRows[0].id;
    await ensureRoleHasPermissions(adminRoleId, allPermCodes);
  } else {
    const adminRole = await createRole("admin", allPermCodes, "系统管理员");
    adminRoleId = adminRole.id;
  }

  let rootOrgId: string;
  const [rootOrgRows] = await pool.query<OrgRow[]>(
    "SELECT id FROM org_units WHERE name = ? AND deleted_at IS NULL LIMIT 1",
    ["Root"]
  );
  if (rootOrgRows[0]?.id) {
    rootOrgId = rootOrgRows[0].id;
  } else {
    rootOrgId = (await createOrgUnit("Root")).id;
  }

  const [adminGroupRows] = await pool.query<GroupRow[]>(
    "SELECT id FROM user_groups WHERE name = ? AND deleted_at IS NULL LIMIT 1",
    ["Administrators"]
  );
  let adminGroupId: string | undefined;
  if (adminGroupRows[0]?.id) {
    adminGroupId = adminGroupRows[0].id;
    await setGroupPermissions(adminGroupId, allPermCodes);
  } else {
    adminGroupId = (
      await createGroup("Administrators", "系统管理员用户组", allPermCodes)
    ).id;
  }

  const adminExisting = await findUserByUsername("admin");
  if (!adminExisting) {
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";
    await createUser({
      username: "admin",
      displayName: "Administrator",
      password: adminPassword,
      orgId: rootOrgId,
      roleIds: [adminRoleId],
      groupIds: adminGroupId ? [adminGroupId] : []
    });
  } else {
    // 确保 admin 用户有 admin 角色
    await pool.query(
      "INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
      [adminExisting.id, adminRoleId]
    );
    // 确保 admin 用户有 Administrators 组
    if (adminGroupId) {
      await pool.query(
        "INSERT IGNORE INTO user_group_members (user_id, group_id) VALUES (?, ?)",
        [adminExisting.id, adminGroupId]
      );
    }
    // 确保 admin 角色有所有权限
    await ensureRoleHasPermissions(adminRoleId, allPermCodes);
    // 确保 Administrators 组有所有权限
    if (adminGroupId) {
      await setGroupPermissions(adminGroupId, allPermCodes);
    }
  }
}

export async function getRoles(): Promise<Role[]> {
  const [rows] = await pool.query<RoleRow[]>(
    "SELECT id, name, description FROM roles"
  );
  const permsMap = await getRolePermissionsMap();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    permissions: permsMap.get(row.id) ?? []
  }));
}

export async function getGroups(): Promise<
  Array<UserGroup & { permissions: Permission[]; userIds: string[] }>
> {
  // 检查缓存
  if (cache.groups) {
    return cache.groups;
  }
  
  const [rows] = await pool.query<GroupRow[]>(
    "SELECT id, name, description FROM user_groups WHERE deleted_at IS NULL"
  );
  const [permRows] = await pool.query<GroupPermRow[]>(
    "SELECT group_id, permission_code FROM group_permissions"
  );
  const [memberRows] = await pool.query<UserGroupRow[]>(
    "SELECT user_id, group_id FROM user_group_members"
  );

  const permsMap = new Map<string, Permission[]>();
  permRows.forEach((row) => {
    const list = permsMap.get(row.group_id) ?? [];
    list.push(row.permission_code);
    permsMap.set(row.group_id, list);
  });

  const memberMap = new Map<string, string[]>();
  memberRows.forEach((row) => {
    const list = memberMap.get(row.group_id) ?? [];
    list.push(row.user_id);
    memberMap.set(row.group_id, list);
  });

  const result = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    permissions: permsMap.get(row.id) ?? [],
    userIds: memberMap.get(row.id) ?? []
  }));
  
  // 更新缓存
  cache.groups = result;
  return result;
}

export async function getOrgUnits(): Promise<OrgUnit[]> {
  // 检查缓存
  if (cache.orgUnits) {
    return cache.orgUnits;
  }
  
  const [rows] = await pool.query<OrgRow[]>(
    "SELECT id, name, parent_id, is_active, type, related_entity_id FROM org_units WHERE deleted_at IS NULL"
  );

  const result = rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id ?? undefined,
    isActive: row.is_active !== 0,
    type: (row.type || "platform") as OrgUnit["type"],
    relatedEntityId: row.related_entity_id ?? undefined
  }));
  
  // 更新缓存
  cache.orgUnits = result;
  return result;
}

export async function getPermissions(): Promise<PermissionNode[]> {
  return getPermissionTree();
}

export async function createPermission(input: {
  code: Permission;
  name: string;
  description?: string;
  parentId?: string;
}): Promise<PermissionNode> {
  if (!input.code || !input.name) {
    throw new Error("code 与 name 必填");
  }

  const existing = await findPermissionByCode(input.code);
  if (existing) {
    throw new Error("权限 code 已存在");
  }

  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await findPermissionById(input.parentId);
    if (!parent) {
      throw new Error("父级权限不存在");
    }
    parentId = parent.id;
  }

  const id = randomUUID();
  await pool.query(
    "INSERT INTO permissions (id, code, name, description, parent_id) VALUES (?, ?, ?, ?, ?)",
    [id, input.code, input.name, input.description ?? null, parentId]
  );

  // 清除权限缓存
  clearPermissionCache();

  const created = await findPermissionById(id);
  if (!created) {
    throw new Error("创建权限失败");
  }

  return {
    id: created.id,
    code: created.code,
    name: created.name,
    description: created.description ?? undefined,
    parentId: created.parent_id ?? undefined
  };
}

export async function updatePermission(
  id: string,
  input: {
    code?: Permission;
    name?: string;
    description?: string;
    parentId?: string | null;
  }
): Promise<PermissionNode> {
  const current = await findPermissionById(id);
  if (!current) {
    throw new Error("权限不存在");
  }

  let parentId: string | null = current.parent_id;
  if (input.parentId !== undefined) {
    if (input.parentId === id) {
      throw new Error("父级不能是自身");
    }
    if (input.parentId) {
      const parent = await findPermissionById(input.parentId);
      if (!parent) {
        throw new Error("父级权限不存在");
      }
      parentId = parent.id;
    } else {
      parentId = null;
    }
  }

  if (input.code && input.code !== current.code) {
    const exists = await findPermissionByCode(input.code);
    if (exists) {
      throw new Error("权限 code 已存在");
    }
  }

  await pool.query(
    "UPDATE permissions SET code = ?, name = ?, description = ?, parent_id = ? WHERE id = ?",
    [
      input.code ?? current.code,
      input.name ?? current.name,
      input.description ?? current.description,
      parentId,
      id
    ]
  );

  // 清除权限缓存
  clearPermissionCache();

  const updated = await findPermissionById(id);
  if (!updated) {
    throw new Error("权限不存在");
  }

  return {
    id: updated.id,
    code: updated.code,
    name: updated.name,
    description: updated.description ?? undefined,
    parentId: updated.parent_id ?? undefined
  };
}

export async function deletePermission(id: string): Promise<void> {
  const current = await findPermissionById(id);
  if (!current) {
    throw new Error("权限不存在");
  }

  const [childRows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM permissions WHERE parent_id = ? AND deleted_at IS NULL LIMIT 1",
    [id]
  );
  if (childRows.length) {
    throw new Error("请先删除子权限");
  }

  const [usage] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM role_permissions WHERE permission_code = ? LIMIT 1",
    [current.code]
  );
  if (usage.length) {
    throw new Error("该权限已被角色使用，无法删除");
  }

  await pool.query("UPDATE permissions SET deleted_at = NOW() WHERE id = ?", [id]);
  // 清除权限缓存
  clearPermissionCache();
}

export async function getUsers(): Promise<SafeUser[]> {
  const [userRows] = await pool.query<UserRow[]>(
    "SELECT id, username, display_name, password_hash, org_id, is_active FROM users WHERE deleted_at IS NULL"
  );
  const [userRoles] = await pool.query<UserRoleRow[]>(
    "SELECT user_id, role_id FROM user_roles"
  );
  const [userGroups] = await pool.query<UserGroupRow[]>(
    "SELECT user_id, group_id FROM user_group_members"
  );
  const [rolePerms] = await pool.query<RolePermRow[]>(
    "SELECT role_id, permission_code FROM role_permissions"
  );

  const roleIdsByUser = new Map<string, string[]>();
  userRoles.forEach((r) => {
    const list = roleIdsByUser.get(r.user_id) ?? [];
    list.push(r.role_id);
    roleIdsByUser.set(r.user_id, list);
  });

  const groupIdsByUser = new Map<string, string[]>();
  userGroups.forEach((g) => {
    const list = groupIdsByUser.get(g.user_id) ?? [];
    list.push(g.group_id);
    groupIdsByUser.set(g.user_id, list);
  });

  const permsByRole = new Map<string, Permission[]>();
  rolePerms.forEach((rp) => {
    const list = permsByRole.get(rp.role_id) ?? [];
    list.push(rp.permission_code);
    permsByRole.set(rp.role_id, list);
  });

  return userRows.map((row) => {
    const roleIds = roleIdsByUser.get(row.id) ?? [];
    const groupIds = groupIdsByUser.get(row.id) ?? [];
    const permSet = new Set<Permission>();
    roleIds.forEach((roleId) => {
      const rolePermsList = permsByRole.get(roleId) ?? [];
      rolePermsList.forEach((p) => permSet.add(p));
    });

    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      orgId: row.org_id ?? undefined,
      roleIds,
      groupIds,
      permissions: Array.from(permSet),
      isActive: row.is_active !== 0
    };
  });
}

export async function findUserByUsername(
  username: string
): Promise<User | undefined> {
  const [rows] = await pool.query<UserRow[]>(
    "SELECT id, username, display_name, password_hash, org_id, is_active FROM users WHERE username = ? AND deleted_at IS NULL LIMIT 1",
    [username]
  );

  const row = rows[0];
  return row ? mapUserRow(row) : undefined;
}

export async function findUserById(userId: string): Promise<User | undefined> {
  const [rows] = await pool.query<UserRow[]>(
    "SELECT id, username, display_name, password_hash, org_id, is_active FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [userId]
  );

  const row = rows[0];
  return row ? mapUserRow(row) : undefined;
}

export async function findRoleById(
  roleId: string
): Promise<Role | undefined> {
  const [rows] = await pool.query<RoleRow[]>(
    "SELECT id, name, description FROM roles WHERE id = ? LIMIT 1",
    [roleId]
  );

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  const [permRows] = await pool.query<RolePermRow[]>(
    "SELECT permission_code FROM role_permissions WHERE role_id = ?",
    [roleId]
  );
  const permissions = permRows.map((p) => p.permission_code);

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    permissions
  };
}

export async function findGroupById(
  groupId: string
): Promise<UserGroup | undefined> {
  const [rows] = await pool.query<GroupRow[]>(
    "SELECT id, name, description FROM user_groups WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [groupId]
  );

  const row = rows[0];
  return row
    ? {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined
      }
    : undefined;
}

export async function findOrgById(
  orgId: string
): Promise<OrgUnit | undefined> {
  const [rows] = await pool.query<OrgRow[]>(
    "SELECT id, name, parent_id, is_active, type, related_entity_id FROM org_units WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [orgId]
  );

  const row = rows[0];
  return row
    ? {
        id: row.id,
        name: row.name,
        parentId: row.parent_id ?? undefined,
        isActive: row.is_active !== 0,
        type: row.type as OrgUnit["type"],
        relatedEntityId: row.related_entity_id ?? undefined
      }
    : undefined;
}

export async function createUser(input: {
  username: string;
  displayName: string;
  password: string;
  orgId?: string;
  roleIds?: string[];
  groupIds?: string[];
  isActive?: boolean;
}): Promise<SafeUser> {
  const existing = await findUserByUsername(input.username);
  if (existing) {
    throw new Error("用户名已存在");
  }

  if (input.orgId) {
    const org = await findOrgById(input.orgId);
    if (!org) {
      throw new Error("组织不存在");
    }
  }

  const roleIds = input.roleIds ?? [];
  const groupIds = input.groupIds ?? [];

  if (roleIds.length) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as cnt FROM roles WHERE id IN (${roleIds
        .map(() => "?")
        .join(",")})`,
      roleIds
    );
    const count = Number(rows[0]?.cnt ?? 0);
    if (count !== roleIds.length) {
      throw new Error("存在无效的角色");
    }
  }

  if (groupIds.length) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as cnt FROM user_groups WHERE id IN (${groupIds
        .map(() => "?")
        .join(",")}) AND deleted_at IS NULL`,
      groupIds
    );
    const count = Number(rows[0]?.cnt ?? 0);
    if (count !== groupIds.length) {
      throw new Error("存在无效的用户组");
    }
  }

  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  const isActive = input.isActive !== false;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "INSERT INTO users (id, username, display_name, password_hash, org_id, is_active) VALUES (?, ?, ?, ?, ?, ?)",
      [
        userId,
        input.username,
        input.displayName,
        passwordHash,
        input.orgId ?? null,
        isActive ? 1 : 0
      ]
    );

    if (roleIds.length) {
      const values = roleIds.map((roleId) => [userId, roleId]);
      await conn.query(
        "INSERT INTO user_roles (user_id, role_id) VALUES ?",
        [values]
      );
    }

    if (groupIds.length) {
      const values = groupIds.map((groupId) => [userId, groupId]);
      await conn.query(
        "INSERT INTO user_group_members (user_id, group_id) VALUES ?",
        [values]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const safe = await getSafeUserById(userId);
  if (!safe) {
    throw new Error("创建用户失败");
  }
  return safe;
}

export async function createRole(
  name: string,
  permissions: Permission[],
  description?: string
): Promise<Role> {
  await ensurePermissionsExist(permissions);

  const [exists] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM roles WHERE name = ? LIMIT 1",
    [name]
  );
  if (exists.length) {
    throw new Error("角色名已存在");
  }

  const roleId = randomUUID();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "INSERT INTO roles (id, name, description) VALUES (?, ?, ?)",
      [roleId, name, description ?? null]
    );

    if (permissions.length) {
      const values = permissions.map((p) => [roleId, p]);
      await conn.query(
        "INSERT INTO role_permissions (role_id, permission_code) VALUES ?",
        [values]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return {
    id: roleId,
    name,
    description,
    permissions
  };
}

export async function createGroup(
  name: string,
  description?: string,
  permissionCodes?: Permission[]
): Promise<UserGroup & { permissions: Permission[]; userIds: string[] }> {
  const [exists] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM user_groups WHERE name = ? LIMIT 1",
    [name]
  );
  if (exists.length) {
    throw new Error("用户组名已存在");
  }

  const id = randomUUID();
  await pool.query(
    "INSERT INTO user_groups (id, name, description) VALUES (?, ?, ?)",
    [id, name, description ?? null]
  );

  if (permissionCodes?.length) {
    await setGroupPermissions(id, permissionCodes);
  }

  // 清除用户组缓存
  clearGroupsCache();

  return {
    id,
    name,
    description,
    permissions: permissionCodes ?? [],
    userIds: []
  };
}

export async function createOrgUnit(
  name: string,
  parentId?: string,
  isActive = true,
  type: OrgUnit["type"] = "platform",
  relatedEntityId?: string
): Promise<OrgUnit> {
  if (parentId) {
    const parent = await findOrgById(parentId);
    if (!parent) {
      throw new Error("父级组织不存在");
    }
  }

  const id = randomUUID();
  await pool.query(
    "INSERT INTO org_units (id, name, parent_id, is_active, type, related_entity_id) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, parentId ?? null, isActive ? 1 : 0, type, relatedEntityId ?? null]
  );

  // 清除组织架构缓存
  clearOrgUnitsCache();

  return { id, name, parentId, isActive, type, relatedEntityId };
}

export async function updateOrgUnit(input: {
  id: string;
  name?: string;
  parentId?: string | null;
  isActive?: boolean;
}): Promise<OrgUnit> {
  const current = await findOrgById(input.id);
  if (!current) {
    throw new Error("组织不存在");
  }

  let parentId = current.parentId ?? null;
  if (input.parentId !== undefined) {
    if (input.parentId === input.id) {
      throw new Error("父级不能是自身");
    }
    if (input.parentId) {
      const parent = await findOrgById(input.parentId);
      if (!parent) {
        throw new Error("父级组织不存在");
      }
      parentId = parent.id;
    } else {
      parentId = null;
    }
  }

  const name = input.name ?? current.name;
  const isActive =
    input.isActive !== undefined ? (input.isActive ? 1 : 0) : current.isActive ? 1 : 0;

  await pool.query(
    "UPDATE org_units SET name = ?, parent_id = ?, is_active = ? WHERE id = ?",
    [name, parentId, isActive, input.id]
  );

  // 清除组织架构缓存
  clearOrgUnitsCache();

  return {
    id: input.id,
    name,
    parentId: parentId ?? undefined,
    isActive: Boolean(isActive),
    type: current.type || "platform",
    relatedEntityId: current.relatedEntityId
  };
}

export async function deleteOrgUnit(id: string): Promise<void> {
  const current = await findOrgById(id);
  if (!current) {
    throw new Error("组织不存在");
  }

  const [childRows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM org_units WHERE parent_id = ? AND deleted_at IS NULL LIMIT 1",
    [id]
  );
  if (childRows.length) {
    throw new Error("请先删除子组织");
  }

  const [userRows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM users WHERE org_id = ? AND deleted_at IS NULL LIMIT 1",
    [id]
  );
  if (userRows.length) {
    throw new Error("该组织下存在用户，无法删除");
  }

  await pool.query("UPDATE org_units SET deleted_at = NOW() WHERE id = ?", [id]);
  // 清除组织架构缓存
  clearOrgUnitsCache();
}

export async function getTranslations(input: {
  lang: string;
  page?: string;
  orgId?: string;
  userId?: string;
}): Promise<Record<string, string>> {
  const rows = await queryTranslations(input.lang, input.page, input.orgId, input.userId);
  // 优先级：page > user > org > global （后写覆盖前写）
  const priority = (scope: I18nScope) => {
    switch (scope) {
      case "page":
        return 4;
      case "user":
        return 3;
      case "org":
        return 2;
      default:
        return 1;
    }
  };
  const sorted = rows.sort((a, b) => priority(a.scope_type) - priority(b.scope_type));
  const map: Record<string, string> = {};
  sorted.forEach((row) => {
    map[row.tkey] = row.tvalue;
  });
  return map;
}

async function queryTranslations(
  lang: string,
  page?: string,
  orgId?: string,
  userId?: string
): Promise<I18nRow[]> {
  const params: Array<string | null> = [lang];
  const clauses = ["lang = ?"];
  const scopeClauses: string[] = ["scope_type = 'global'"];

  if (page) {
    scopeClauses.push("(scope_type = 'page' AND page = ?)");
    params.push(page);
  }
  if (orgId) {
    scopeClauses.push("(scope_type = 'org' AND scope_id = ?)");
    params.push(orgId);
  }
  if (userId) {
    scopeClauses.push("(scope_type = 'user' AND scope_id = ?)");
    params.push(userId);
  }

  clauses.push(`(${scopeClauses.join(" OR ")})`);

  const [rows] = await pool.query<I18nRow[]>(
    `SELECT id, lang, tkey, tvalue, scope_type, scope_id, page
     FROM i18n_entries
     WHERE ${clauses.join(" AND ")}`
    , params);
  return rows;
}

export async function upsertTranslation(entry: {
  lang: string;
  key: string;
  value: string;
  scopeType: I18nScope;
  scopeId?: string;
  page?: string;
}): Promise<I18nEntry> {
  if (!entry.lang || !entry.key) {
    throw new Error("lang 与 key 必填");
  }
  if (entry.scopeType === "org" && !entry.scopeId) {
    throw new Error("org 级别需要 scopeId");
  }
  if (entry.scopeType === "user" && !entry.scopeId) {
    throw new Error("user 级别需要 scopeId");
  }
  if (entry.scopeType === "page" && !entry.page) {
    throw new Error("page 级别需要 page 名称");
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO i18n_entries (id, lang, tkey, tvalue, scope_type, scope_id, page)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE tvalue = VALUES(tvalue)`,
    [
      id,
      entry.lang,
      entry.key,
      entry.value,
      entry.scopeType,
      entry.scopeId ?? null,
      entry.page ?? null
    ]
  );

  const [rows] = await pool.query<I18nRow[]>(
    "SELECT id, lang, tkey, tvalue, scope_type, scope_id, page FROM i18n_entries WHERE scope_type = ? AND IFNULL(scope_id, '') = IFNULL(?, '') AND IFNULL(page, '') = IFNULL(?, '') AND lang = ? AND tkey = ? AND deleted_at IS NULL LIMIT 1",
    [
      entry.scopeType,
      entry.scopeId ?? "",
      entry.page ?? "",
      entry.lang,
      entry.key
    ]
  );
  const row = rows[0];
  return {
    id: row.id,
    lang: row.lang,
    key: row.tkey,
    value: row.tvalue,
    scopeType: row.scope_type,
    scopeId: row.scope_id ?? undefined,
    page: row.page ?? undefined
  };
}

export async function deleteTranslation(id: string): Promise<void> {
  const [rows] = await pool.query<I18nRow[]>(
    "SELECT id FROM i18n_entries WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [id]
  );
  if (!rows[0]) {
    throw new Error("记录不存在");
  }
  await pool.query("UPDATE i18n_entries SET deleted_at = NOW() WHERE id = ?", [id]);
}

export async function updateGroup(input: {
  id: string;
  name?: string;
  description?: string;
  permissionCodes?: Permission[];
}): Promise<UserGroup & { permissions: Permission[]; userIds: string[] }> {
  const current = await findGroupById(input.id);
  if (!current) {
    throw new Error("用户组不存在");
  }

  // 保护 Administrators 组：不允许修改其权限
  if (current.name === "Administrators" && input.permissionCodes) {
    throw new Error("不允许修改 Administrators 组的权限");
  }

  if (input.name && input.name !== current.name) {
    // 保护 Administrators 组：不允许修改名称
    if (current.name === "Administrators") {
      throw new Error("不允许修改 Administrators 组的名称");
    }
    const [exists] = await pool.query<RowDataPacket[]>(
      "SELECT 1 FROM user_groups WHERE name = ? AND id <> ? AND deleted_at IS NULL LIMIT 1",
      [input.name, input.id]
    );
    if (exists.length) {
      throw new Error("用户组名已存在");
    }
  }

  await pool.query(
    "UPDATE user_groups SET name = ?, description = ? WHERE id = ?",
    [input.name ?? current.name, input.description ?? current.description, input.id]
  );

  if (input.permissionCodes) {
    await setGroupPermissions(input.id, input.permissionCodes);
  }

  // 清除用户组缓存
  clearGroupsCache();

  const [perms] = await pool.query<GroupPermRow[]>(
    "SELECT permission_code FROM group_permissions WHERE group_id = ?",
    [input.id]
  );
  const [members] = await pool.query<UserGroupRow[]>(
    "SELECT user_id, group_id FROM user_group_members WHERE group_id = ?",
    [input.id]
  );

  return {
    id: input.id,
    name: input.name ?? current.name,
    description: input.description ?? current.description ?? undefined,
    permissions: perms.map((p) => p.permission_code),
    userIds: members.map((m) => m.user_id)
  };
}

export async function assignRoleToUser(
  userId: string,
  roleId: string
): Promise<SafeUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("用户不存在");
  }
  
  // 保护 admin 用户：不允许修改其角色（admin 用户必须始终有 admin 角色）
  if (user.username === "admin") {
    const [adminRoleRows] = await pool.query<RoleRow[]>(
      "SELECT id FROM roles WHERE name = ? LIMIT 1",
      ["admin"]
    );
    if (adminRoleRows[0]?.id && roleId !== adminRoleRows[0].id) {
      throw new Error("不允许修改 admin 用户的角色");
    }
  }
  
  const role = await findRoleById(roleId);
  if (!role) {
    throw new Error("角色不存在");
  }

  await pool.query(
    "INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
    [userId, roleId]
  );

  // 清除用户缓存（因为角色关系改变了）
  clearUsersCache();

  const safe = await getSafeUserById(userId);
  if (!safe) {
    throw new Error("用户不存在");
  }
  return safe;
}

export async function addUserToGroup(
  userId: string,
  groupId: string
): Promise<SafeUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("用户不存在");
  }
  const group = await findGroupById(groupId);
  if (!group) {
    throw new Error("用户组不存在");
  }

  // admin 用户必须始终在 Administrators 组中，但允许添加其他组
  // 这里不需要特殊处理，因为 admin 用户应该已经在 Administrators 组中

  await pool.query(
    "INSERT IGNORE INTO user_group_members (user_id, group_id) VALUES (?, ?)",
    [userId, groupId]
  );

  // 清除用户组和用户缓存
  clearGroupsCache();
  clearUsersCache();

  const safe = await getSafeUserById(userId);
  if (!safe) {
    throw new Error("用户不存在");
  }
  return safe;
}

export async function removeUserFromGroup(
  userId: string,
  groupId: string
): Promise<SafeUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("用户不存在");
  }
  const group = await findGroupById(groupId);
  if (!group) {
    throw new Error("用户组不存在");
  }

  // 保护 admin 用户：不允许从 Administrators 组中移除
  if (user.username === "admin" && group.name === "Administrators") {
    throw new Error("不允许将 admin 用户从 Administrators 组中移除");
  }

  await pool.query(
    "DELETE FROM user_group_members WHERE user_id = ? AND group_id = ?",
    [userId, groupId]
  );

  // 清除用户组和用户缓存
  clearGroupsCache();
  clearUsersCache();

  const safe = await getSafeUserById(userId);
  if (!safe) {
    throw new Error("用户不存在");
  }
  return safe;
}

export async function updateUser(
  userId: string,
  input: {
    displayName?: string;
    password?: string;
    orgId?: string | null;
    groupIds?: string[];
    isActive?: boolean;
  }
): Promise<SafeUser> {
  const current = await findUserById(userId);
  if (!current) {
    throw new Error("用户不存在");
  }

  // 保护 admin 用户：不允许修改其用户组（admin 用户必须始终在 Administrators 组中）
  if (current.username === "admin" && input.groupIds !== undefined) {
    const [adminGroupRows] = await pool.query<GroupRow[]>(
      "SELECT id FROM user_groups WHERE name = ? AND deleted_at IS NULL LIMIT 1",
      ["Administrators"]
    );
    if (adminGroupRows[0]?.id) {
      const adminGroupId = adminGroupRows[0].id;
      // 确保 Administrators 组在 groupIds 中
      if (!input.groupIds.includes(adminGroupId)) {
        throw new Error("admin 用户必须始终在 Administrators 组中");
      }
    }
  }

  const currentRelations = await getUserRelations(userId);

  if (input.orgId !== undefined && input.orgId !== null) {
    const org = await findOrgById(input.orgId);
    if (!org) {
      throw new Error("组织不存在");
    }
  }

  const groupIds = input.groupIds ?? currentRelations.groupIds;
  if (groupIds.length) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as cnt FROM user_groups WHERE id IN (${groupIds
        .map(() => "?")
        .join(",")}) AND deleted_at IS NULL`,
      groupIds
    );
    const count = Number(rows[0]?.cnt ?? 0);
    if (count !== groupIds.length) {
      throw new Error("存在无效的用户组");
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (input.password) {
      const passwordHash = await hashPassword(input.password);
      await conn.query(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        [passwordHash, userId]
      );
    }

    await conn.query(
      "UPDATE users SET display_name = ?, org_id = ?, is_active = ? WHERE id = ?",
      [
        input.displayName ?? current.displayName,
        input.orgId === undefined ? current.orgId ?? null : input.orgId,
        input.isActive !== undefined
          ? input.isActive
            ? 1
            : 0
          : current.isActive !== false
          ? 1
          : 0,
        userId
      ]
    );

    if (input.groupIds) {
      await setUserGroups(userId, input.groupIds);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const safe = await getSafeUserById(userId);
  if (!safe) {
    throw new Error("用户不存在");
  }
  return safe;
}

export async function deleteUser(userId: string): Promise<void> {
  const current = await findUserById(userId);
  if (!current) {
    throw new Error("用户不存在");
  }

  // 保护 admin 用户：不允许删除
  if (current.username === "admin") {
    throw new Error("不允许删除 admin 用户");
  }

  // 逻辑删除用户的 i18n 条目
  await pool.query("UPDATE i18n_entries SET deleted_at = NOW() WHERE scope_type = 'user' AND scope_id = ? AND deleted_at IS NULL", [userId]);

  // 逻辑删除用户
  await pool.query("UPDATE users SET deleted_at = NOW() WHERE id = ?", [userId]);
  
  // 清除用户缓存
  clearUsersCache();
}

export async function changePasswordForUser(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("用户不存在");
  }
  const ok = await verifyPassword(oldPassword, user.passwordHash);
  if (!ok) {
    const err: any = new Error("原密码不正确");
    err.code = "BAD_OLD_PASSWORD";
    throw err;
  }
  const hash = await hashPassword(newPassword);
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [
    hash,
    userId
  ]);
}

export async function resetAdminPassword(
  newPassword = "admin123"
): Promise<void> {
  const admin = await findUserByUsername("admin");
  if (!admin) {
    throw new Error("admin 用户不存在");
  }
  const hash = await hashPassword(newPassword);
  await pool.query(
    "UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?",
    [hash, admin.id]
  );
}

export async function getUserPermissionsByUserId(
  userId: string
): Promise<Permission[]> {
  const [roleRows] = await pool.query<RowDataPacket[]>(
    `SELECT rp.permission_code
     FROM user_roles ur
     JOIN role_permissions rp ON ur.role_id = rp.role_id
     WHERE ur.user_id = ?`,
    [userId]
  );

  const [groupRows] = await pool.query<RowDataPacket[]>(
    `SELECT gp.permission_code
     FROM user_group_members ug
     JOIN group_permissions gp ON ug.group_id = gp.group_id
     WHERE ug.user_id = ?`,
    [userId]
  );

  const perms = new Set<Permission>();
  roleRows.forEach((r) => perms.add(r.permission_code as Permission));
  groupRows.forEach((r) => perms.add(r.permission_code as Permission));
  return Array.from(perms);
}

export async function toSafeUser(user: User): Promise<SafeUser> {
  const relations = await getUserRelations(user.id);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    orgId: user.orgId,
    roleIds: relations.roleIds,
    groupIds: relations.groupIds,
    permissions: relations.permissions,
    isActive: user.isActive !== false
  };
}

export async function getSafeUserById(
  userId: string
): Promise<SafeUser | undefined> {
  const user = await findUserById(userId);
  if (!user) {
    return undefined;
  }
  return toSafeUser(user);
}

async function getRolePermissionsMap(): Promise<Map<string, Permission[]>> {
  const [rows] = await pool.query<RolePermRow[]>(
    "SELECT role_id, permission_code FROM role_permissions"
  );

  const map = new Map<string, Permission[]>();
  rows.forEach((row) => {
    const list = map.get(row.role_id) ?? [];
    list.push(row.permission_code);
    map.set(row.role_id, list);
  });
  return map;
}

async function getUserRelations(userId: string): Promise<{
  roleIds: string[];
  groupIds: string[];
  permissions: Permission[];
}> {
  const [roleRows] = await pool.query<UserRoleRow[]>(
    "SELECT role_id FROM user_roles WHERE user_id = ?",
    [userId]
  );
  const [groupRows] = await pool.query<UserGroupRow[]>(
    "SELECT group_id FROM user_group_members WHERE user_id = ?",
    [userId]
  );
  const permissions = await getUserPermissionsByUserId(userId);

  return {
    roleIds: roleRows.map((r) => r.role_id),
    groupIds: groupRows.map((g) => g.group_id),
    permissions
  };
}

function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    orgId: row.org_id ?? undefined,
    roleIds: [],
    groupIds: [],
    isActive: row.is_active !== 0
  };
}

// Investment related functions
interface InvestmentRow extends RowDataPacket {
  id: string;
  investment_number: string;
  amount: number;
  investor_entity: string;
  receiving_entity: string;
  asset_description: string | null;
  interest_rate: number;
  start_date: string;
  end_date: string;
  expected_return: number;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapInvestmentRow(row: InvestmentRow): Investment {
  return {
    id: row.id,
    investmentNumber: row.investment_number,
    amount: Number(row.amount),
    investorEntity: row.investor_entity,
    receivingEntity: row.receiving_entity,
    assetDescription: row.asset_description || "",
    interestRate: Number(row.interest_rate),
    startDate: row.start_date,
    endDate: row.end_date,
    expectedReturn: Number(row.expected_return),
    status: row.status as InvestmentStatus,
    createdAt: row.created_at
  };
}

export async function getInvestments(search?: string): Promise<Investment[]> {
  let query = `
    SELECT id, investment_number, amount, investor_entity, receiving_entity,
           asset_description, interest_rate, start_date, end_date,
           expected_return, status, created_at, updated_at
    FROM investments
  `;
  const params: any[] = [];

  if (search) {
    query += ` WHERE (investment_number LIKE ? OR receiving_entity LIKE ?) AND deleted_at IS NULL`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern);
  } else {
    query += ` WHERE deleted_at IS NULL`;
  }

  query += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<InvestmentRow[]>(query, params);
  return rows.map(mapInvestmentRow);
}

export async function getInvestmentById(id: string): Promise<Investment | undefined> {
  const [rows] = await pool.query<InvestmentRow[]>(
    `SELECT id, investment_number, amount, investor_entity, receiving_entity,
            asset_description, interest_rate, start_date, end_date,
            expected_return, status, created_at, updated_at
     FROM investments WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] ? mapInvestmentRow(rows[0]) : undefined;
}

export async function createInvestment(input: {
  investmentNumber: string;
  amount: number;
  investorEntity: string;
  receivingEntity: string;
  assetDescription?: string;
  interestRate: number;
  startDate: string;
  endDate: string;
  expectedReturn: number;
  status?: InvestmentStatus;
}): Promise<Investment> {
  // Check if investment number already exists
  const [existing] = await pool.query<InvestmentRow[]>(
    "SELECT id FROM investments WHERE investment_number = ? AND deleted_at IS NULL LIMIT 1",
    [input.investmentNumber]
  );
  if (existing.length > 0) {
    throw new Error("投资编号已存在");
  }

  const id = randomUUID();
  const status = input.status || "holding";

  await pool.query(
    `INSERT INTO investments 
     (id, investment_number, amount, investor_entity, receiving_entity,
      asset_description, interest_rate, start_date, end_date,
      expected_return, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.investmentNumber,
      input.amount,
      input.investorEntity,
      input.receivingEntity,
      input.assetDescription || null,
      input.interestRate,
      input.startDate,
      input.endDate,
      input.expectedReturn,
      status
    ]
  );

  const investment = await getInvestmentById(id);
  if (!investment) {
    throw new Error("创建投资记录失败");
  }
  return investment;
}

export async function updateInvestment(
  id: string,
  input: {
    amount?: number;
    investorEntity?: string;
    receivingEntity?: string;
    assetDescription?: string;
    interestRate?: number;
    startDate?: string;
    endDate?: string;
    expectedReturn?: number;
    status?: InvestmentStatus;
  }
): Promise<Investment> {
  const current = await getInvestmentById(id);
  if (!current) {
    throw new Error("投资记录不存在");
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (input.amount !== undefined) {
    updates.push("amount = ?");
    params.push(input.amount);
  }
  if (input.investorEntity !== undefined) {
    updates.push("investor_entity = ?");
    params.push(input.investorEntity);
  }
  if (input.receivingEntity !== undefined) {
    updates.push("receiving_entity = ?");
    params.push(input.receivingEntity);
  }
  if (input.assetDescription !== undefined) {
    updates.push("asset_description = ?");
    params.push(input.assetDescription || null);
  }
  if (input.interestRate !== undefined) {
    updates.push("interest_rate = ?");
    params.push(input.interestRate);
  }
  if (input.startDate !== undefined) {
    updates.push("start_date = ?");
    params.push(input.startDate);
  }
  if (input.endDate !== undefined) {
    updates.push("end_date = ?");
    params.push(input.endDate);
  }
  if (input.expectedReturn !== undefined) {
    updates.push("expected_return = ?");
    params.push(input.expectedReturn);
  }
  if (input.status !== undefined) {
    updates.push("status = ?");
    params.push(input.status);
  }

  if (updates.length === 0) {
    return current;
  }

  params.push(id);
  await pool.query(
    `UPDATE investments SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  const updated = await getInvestmentById(id);
  if (!updated) {
    throw new Error("更新投资记录失败");
  }
  return updated;
}

export async function deleteInvestment(id: string): Promise<void> {
  const current = await getInvestmentById(id);
  if (!current) {
    throw new Error("投资记录不存在");
  }
  await pool.query("UPDATE investments SET deleted_at = NOW() WHERE id = ?", [id]);
}

export async function getInvestmentStats(): Promise<{
  totalAmount: number;
  monthlyAmount: number;
  averageRate: number;
}> {
  const [totalRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM investments WHERE status = 'holding' AND deleted_at IS NULL`
  );

  const [monthlyRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) as total 
     FROM investments 
     WHERE DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') AND deleted_at IS NULL`
  );

  const [rateRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(AVG(interest_rate), 0) as avg_rate 
     FROM investments 
     WHERE status = 'holding' AND deleted_at IS NULL`
  );

  return {
    totalAmount: Number(totalRows[0]?.total || 0),
    monthlyAmount: Number(monthlyRows[0]?.total || 0),
    averageRate: Number(rateRows[0]?.avg_rate || 0)
  };
}

// Supervision related functions
interface SupervisionRow extends RowDataPacket {
  id: string;
  waybill_number: string;
  license_plate: string;
  gross_profit: number;
  supervision_type: string;
  supervision_rate: number;
  supervision_amount: number;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapSupervisionRow(row: SupervisionRow): Supervision {
  return {
    id: row.id,
    waybillNumber: row.waybill_number,
    licensePlate: row.license_plate,
    grossProfit: Number(row.gross_profit),
    supervisionType: row.supervision_type as SupervisionType,
    supervisionRate: Number(row.supervision_rate),
    supervisionAmount: Number(row.supervision_amount),
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as SupervisionStatus,
    createdAt: row.created_at
  };
}

export async function getSupervisions(filters?: {
  licensePlate?: string;
  supervisionType?: SupervisionType;
  status?: SupervisionStatus;
}): Promise<Supervision[]> {
  let query = `
    SELECT id, waybill_number, license_plate, gross_profit, supervision_type,
           supervision_rate, supervision_amount, start_date, end_date,
           status, created_at, updated_at
    FROM supervisions
    WHERE deleted_at IS NULL
  `;
  const params: any[] = [];

  if (filters?.licensePlate) {
    query += ` AND license_plate LIKE ?`;
    params.push(`%${filters.licensePlate}%`);
  }
  if (filters?.supervisionType) {
    query += ` AND supervision_type = ?`;
    params.push(filters.supervisionType);
  }
  if (filters?.status) {
    query += ` AND status = ?`;
    params.push(filters.status);
  }

  query += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<SupervisionRow[]>(query, params);
  return rows.map(mapSupervisionRow);
}

export async function getSupervisionById(id: string): Promise<Supervision | undefined> {
  const [rows] = await pool.query<SupervisionRow[]>(
    `SELECT id, waybill_number, license_plate, gross_profit, supervision_type,
            supervision_rate, supervision_amount, start_date, end_date,
            status, created_at, updated_at
     FROM supervisions WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] ? mapSupervisionRow(rows[0]) : undefined;
}

export async function createSupervision(input: {
  waybillNumber: string;
  licensePlate: string;
  grossProfit: number;
  supervisionType: SupervisionType;
  supervisionRate: number;
  supervisionAmount: number;
  startDate: string;
  endDate: string;
  status?: SupervisionStatus;
}): Promise<Supervision> {
  const id = randomUUID();
  const status = input.status || "supervising";

  await pool.query(
    `INSERT INTO supervisions 
     (id, waybill_number, license_plate, gross_profit, supervision_type,
      supervision_rate, supervision_amount, start_date, end_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.waybillNumber,
      input.licensePlate,
      input.grossProfit,
      input.supervisionType,
      input.supervisionRate,
      input.supervisionAmount,
      input.startDate,
      input.endDate,
      status
    ]
  );

  const supervision = await getSupervisionById(id);
  if (!supervision) {
    throw new Error("创建监管记录失败");
  }
  return supervision;
}

export async function updateSupervision(
  id: string,
  input: {
    waybillNumber?: string;
    licensePlate?: string;
    grossProfit?: number;
    supervisionType?: SupervisionType;
    supervisionRate?: number;
    supervisionAmount?: number;
    startDate?: string;
    endDate?: string;
    status?: SupervisionStatus;
  }
): Promise<Supervision> {
  const current = await getSupervisionById(id);
  if (!current) {
    throw new Error("监管记录不存在");
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (input.waybillNumber !== undefined) {
    updates.push("waybill_number = ?");
    params.push(input.waybillNumber);
  }
  if (input.licensePlate !== undefined) {
    updates.push("license_plate = ?");
    params.push(input.licensePlate);
  }
  if (input.grossProfit !== undefined) {
    updates.push("gross_profit = ?");
    params.push(input.grossProfit);
  }
  if (input.supervisionType !== undefined) {
    updates.push("supervision_type = ?");
    params.push(input.supervisionType);
  }
  if (input.supervisionRate !== undefined) {
    updates.push("supervision_rate = ?");
    params.push(input.supervisionRate);
  }
  if (input.supervisionAmount !== undefined) {
    updates.push("supervision_amount = ?");
    params.push(input.supervisionAmount);
  }
  if (input.startDate !== undefined) {
    updates.push("start_date = ?");
    params.push(input.startDate);
  }
  if (input.endDate !== undefined) {
    updates.push("end_date = ?");
    params.push(input.endDate);
  }
  if (input.status !== undefined) {
    updates.push("status = ?");
    params.push(input.status);
  }

  if (updates.length === 0) {
    return current;
  }

  params.push(id);
  await pool.query(
    `UPDATE supervisions SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  const updated = await getSupervisionById(id);
  if (!updated) {
    throw new Error("更新监管记录失败");
  }
  return updated;
}

export async function deleteSupervision(id: string): Promise<void> {
  const current = await getSupervisionById(id);
  if (!current) {
    throw new Error("监管记录不存在");
  }
  await pool.query("UPDATE supervisions SET deleted_at = NOW() WHERE id = ?", [id]);
}

export async function getSupervisionStats(): Promise<{
  totalSupervising: number;
  monthlyAdded: number;
  monthlyReleased: number;
}> {
  const [totalRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(supervision_amount), 0) as total 
     FROM supervisions 
     WHERE status = 'supervising' AND deleted_at IS NULL`
  );

  const [monthlyAddedRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(supervision_amount), 0) as total 
     FROM supervisions 
     WHERE DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') AND deleted_at IS NULL`
  );

  const [monthlyReleasedRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(supervision_amount), 0) as total 
     FROM supervisions 
     WHERE status = 'released' 
     AND DATE_FORMAT(updated_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
     AND deleted_at IS NULL`
  );

  return {
    totalSupervising: Number(totalRows[0]?.total || 0),
    monthlyAdded: Number(monthlyAddedRows[0]?.total || 0),
    monthlyReleased: Number(monthlyReleasedRows[0]?.total || 0)
  };
}

// Contract Commission related functions
interface CommissionRow extends RowDataPacket {
  id: string;
  contract_number: string;
  upstream_customer: string;
  license_plate: string;
  vehicle_income: number;
  commission_rate: number;
  commission_amount: number;
  status: string;
  settlement_time: string | null;
  created_at: string;
  updated_at: string;
}

function mapCommissionRow(row: CommissionRow): ContractCommission {
  return {
    id: row.id,
    contractNumber: row.contract_number,
    upstreamCustomer: row.upstream_customer,
    licensePlate: row.license_plate,
    vehicleIncome: Number(row.vehicle_income),
    commissionRate: Number(row.commission_rate),
    commissionAmount: Number(row.commission_amount),
    status: row.status as CommissionStatus,
    settlementTime: row.settlement_time || undefined,
    createdAt: row.created_at
  };
}

export async function getContractCommissions(filters?: {
  upstreamCustomer?: string;
  startDate?: string;
  endDate?: string;
  status?: CommissionStatus;
}): Promise<ContractCommission[]> {
  let query = `
    SELECT id, contract_number, upstream_customer, license_plate, vehicle_income,
           commission_rate, commission_amount, status, settlement_time,
           created_at, updated_at
    FROM contract_commissions
    WHERE deleted_at IS NULL
  `;
  const params: any[] = [];

  if (filters?.upstreamCustomer) {
    query += ` AND upstream_customer LIKE ?`;
    params.push(`%${filters.upstreamCustomer}%`);
  }
  if (filters?.startDate) {
    query += ` AND created_at >= ?`;
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    query += ` AND created_at <= ?`;
    params.push(filters.endDate + " 23:59:59");
  }
  if (filters?.status) {
    query += ` AND status = ?`;
    params.push(filters.status);
  }

  query += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<CommissionRow[]>(query, params);
  return rows.map(mapCommissionRow);
}

export async function getContractCommissionById(id: string): Promise<ContractCommission | undefined> {
  const [rows] = await pool.query<CommissionRow[]>(
    `SELECT id, contract_number, upstream_customer, license_plate, vehicle_income,
            commission_rate, commission_amount, status, settlement_time,
            created_at, updated_at
     FROM contract_commissions WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] ? mapCommissionRow(rows[0]) : undefined;
}

export async function createContractCommission(input: {
  contractNumber: string;
  upstreamCustomer: string;
  licensePlate: string;
  vehicleIncome: number;
  commissionRate: number;
  commissionAmount: number;
  status?: CommissionStatus;
}): Promise<ContractCommission> {
  const id = randomUUID();
  const status = input.status || "pending";

  await pool.query(
    `INSERT INTO contract_commissions 
     (id, contract_number, upstream_customer, license_plate, vehicle_income,
      commission_rate, commission_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.contractNumber,
      input.upstreamCustomer,
      input.licensePlate,
      input.vehicleIncome,
      input.commissionRate,
      input.commissionAmount,
      status
    ]
  );

  const commission = await getContractCommissionById(id);
  if (!commission) {
    throw new Error("创建合同抽成记录失败");
  }
  return commission;
}

export async function updateContractCommission(
  id: string,
  input: {
    contractNumber?: string;
    upstreamCustomer?: string;
    licensePlate?: string;
    vehicleIncome?: number;
    commissionRate?: number;
    commissionAmount?: number;
    status?: CommissionStatus;
    settlementTime?: string | null;
  }
): Promise<ContractCommission> {
  const current = await getContractCommissionById(id);
  if (!current) {
    throw new Error("合同抽成记录不存在");
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (input.contractNumber !== undefined) {
    updates.push("contract_number = ?");
    params.push(input.contractNumber);
  }
  if (input.upstreamCustomer !== undefined) {
    updates.push("upstream_customer = ?");
    params.push(input.upstreamCustomer);
  }
  if (input.licensePlate !== undefined) {
    updates.push("license_plate = ?");
    params.push(input.licensePlate);
  }
  if (input.vehicleIncome !== undefined) {
    updates.push("vehicle_income = ?");
    params.push(input.vehicleIncome);
  }
  if (input.commissionRate !== undefined) {
    updates.push("commission_rate = ?");
    params.push(input.commissionRate);
  }
  if (input.commissionAmount !== undefined) {
    updates.push("commission_amount = ?");
    params.push(input.commissionAmount);
  }
  if (input.status !== undefined) {
    updates.push("status = ?");
    params.push(input.status);
  }
  if (input.settlementTime !== undefined) {
    updates.push("settlement_time = ?");
    params.push(input.settlementTime);
  }

  if (updates.length === 0) {
    return current;
  }

  params.push(id);
  await pool.query(
    `UPDATE contract_commissions SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  const updated = await getContractCommissionById(id);
  if (!updated) {
    throw new Error("更新合同抽成记录失败");
  }
  return updated;
}

export async function deleteContractCommission(id: string): Promise<void> {
  const current = await getContractCommissionById(id);
  if (!current) {
    throw new Error("合同抽成记录不存在");
  }
  await pool.query("UPDATE contract_commissions SET deleted_at = NOW() WHERE id = ?", [id]);
}

export async function batchSettleCommissions(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    throw new Error("请选择要结算的记录");
  }

  const settlementDate = new Date().toISOString().split("T")[0];
  await pool.query(
    `UPDATE contract_commissions 
     SET status = 'settled', settlement_time = ? 
     WHERE id IN (${ids.map(() => "?").join(",")}) AND status = 'pending' AND deleted_at IS NULL`,
    [settlementDate, ...ids]
  );
}

export async function getCommissionStats(filters?: {
  startDate?: string;
  endDate?: string;
}): Promise<CommissionStats> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.startDate) {
    conditions.push("created_at >= ?");
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    conditions.push("created_at <= ?");
    params.push(filters.endDate + " 23:59:59");
  }

  const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") + " AND deleted_at IS NULL" : "WHERE deleted_at IS NULL";

  // Pending query
  const pendingConditions = [...conditions, "status = 'pending'", "deleted_at IS NULL"];
  const pendingWhere = "WHERE " + pendingConditions.join(" AND ");
  const [pendingRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(commission_amount), 0) as total 
     FROM contract_commissions 
     ${pendingWhere}`,
    params
  );

  // Monthly settled query
  const settledConditions: string[] = [];
  const settledParams: any[] = [];
  if (filters?.startDate && filters?.endDate) {
    if (filters.startDate) {
      settledConditions.push("created_at >= ?");
      settledParams.push(filters.startDate);
    }
    if (filters.endDate) {
      settledConditions.push("created_at <= ?");
      settledParams.push(filters.endDate + " 23:59:59");
    }
  } else {
    settledConditions.push("DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')");
  }
  settledConditions.push("status = 'settled'", "deleted_at IS NULL");
  const settledWhere = "WHERE " + settledConditions.join(" AND ");
  const [settledRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(commission_amount), 0) as total 
     FROM contract_commissions 
     ${settledWhere}`,
    settledParams
  );

  // Frozen query
  const frozenConditions = [...conditions, "status = 'frozen'", "deleted_at IS NULL"];
  const frozenWhere = "WHERE " + frozenConditions.join(" AND ");
  const [frozenRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(commission_amount), 0) as total 
     FROM contract_commissions 
     ${frozenWhere}`,
    params
  );

  return {
    totalPending: Number(pendingRows[0]?.total || 0),
    monthlySettled: Number(settledRows[0]?.total || 0),
    totalFrozen: Number(frozenRows[0]?.total || 0)
  };
}

// Contract related functions
interface ContractRow extends RowDataPacket {
  id: string;
  type: string;
  funder_id: string | null;
  funder_name: string | null;
  logistics_provider_id: string;
  logistics_provider_name: string;
  credit_limit: number;
  start_date: string;
  end_date: string;
  annual_interest_rate: number | null;
  interest_calculation_mode: string | null;
  sharing_mode: string | null;
  profit_sharing_ratio: number | null;
  fixed_sharing_amount: number | null;
  commission_config: string | null;
  settlement_cycle: string;
  settlement_trigger_day: number | null;
  settlement_trigger_quarter_end: number;
  settlement_trigger_biweekly: number;
  auto_settlement: number;
  status: string;
  created_at: string;
  updated_at: string;
  total_disbursed: number | null;
  outstanding_principal: number | null;
  accrued_interest: number | null;
}

function mapContractRow(row: ContractRow): Contract {
  // 计算合同状态
  const today = new Date();
  const endDate = new Date(row.end_date);
  const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  let status: ContractStatus = row.status as ContractStatus;
  // disabled 状态优先，不应被“临近到期/已过期”规则覆盖
  if (status !== "disabled") {
    if (daysUntilExpiry < 0) {
      status = "expired";
    } else if (status === "active" && daysUntilExpiry <= 30 && daysUntilExpiry >= 0) {
      status = "expiring_soon";
    }
  }

  return {
    id: row.id,
    type: row.type as ContractType,
    funderId: row.funder_id || undefined,
    funderName: row.funder_name || undefined,
    logisticsProviderId: row.logistics_provider_id,
    logisticsProviderName: row.logistics_provider_name,
    creditLimit: Number(row.credit_limit),
    startDate: row.start_date,
    endDate: row.end_date,
    annualInterestRate: row.annual_interest_rate ? Number(row.annual_interest_rate) : undefined,
    interestCalculationMode: row.interest_calculation_mode as "daily_balance" | "other" | undefined,
    sharingMode: (row.sharing_mode as "percentage" | "fixed") || "percentage",
    profitSharingRatio: row.profit_sharing_ratio ? Number(row.profit_sharing_ratio) : undefined,
    fixedSharingAmount: row.fixed_sharing_amount ? Number(row.fixed_sharing_amount) : undefined,
    commissionConfig: row.commission_config ? (typeof row.commission_config === 'string' ? JSON.parse(row.commission_config) : row.commission_config) : undefined,
    settlementCycle: row.settlement_cycle as "monthly" | "quarterly" | "biweekly",
    settlementTriggerDay: row.settlement_trigger_day || undefined,
    settlementTriggerQuarterEnd: row.settlement_trigger_quarter_end === 1,
    settlementTriggerBiweekly: row.settlement_trigger_biweekly === 1,
    autoSettlement: row.auto_settlement === 1,
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usedAmount: row.total_disbursed ? Number(row.total_disbursed) : 0,
    outstandingPrincipal: row.outstanding_principal ? Number(row.outstanding_principal) : 0,
    accruedInterest: row.accrued_interest ? Number(row.accrued_interest) : 0
  };
}

export async function getContracts(filters?: {
  type?: ContractType;
  funderId?: string;
  logisticsProviderId?: string;
}): Promise<Contract[]> {
  let query = `
    SELECT id, type, funder_id, funder_name, logistics_provider_id, logistics_provider_name,
           credit_limit, start_date, end_date, annual_interest_rate, interest_calculation_mode,
           sharing_mode, profit_sharing_ratio, fixed_sharing_amount, commission_config,
           settlement_cycle, settlement_trigger_day, settlement_trigger_quarter_end, 
           settlement_trigger_biweekly, auto_settlement, status, created_at, updated_at,
           total_disbursed, outstanding_principal, accrued_interest
    FROM contracts
    WHERE deleted_at IS NULL
  `;
  const params: any[] = [];

  if (filters?.type) {
    query += ` AND type = ?`;
    params.push(filters.type);
  }

  if (filters?.funderId) {
    query += ` AND funder_id = ?`;
    params.push(filters.funderId);
  }

  if (filters?.logisticsProviderId) {
    query += ` AND logistics_provider_id = ?`;
    params.push(filters.logisticsProviderId);
  }

  query += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<ContractRow[]>(query, params);
  return rows.map(mapContractRow);
}

export async function getContractById(id: string): Promise<Contract | undefined> {
  const [rows] = await pool.query<ContractRow[]>(
    `SELECT id, type, funder_id, funder_name, logistics_provider_id, logistics_provider_name,
            credit_limit, start_date, end_date, annual_interest_rate, interest_calculation_mode,
            sharing_mode, profit_sharing_ratio, fixed_sharing_amount, commission_config,
            settlement_cycle, settlement_trigger_day, settlement_trigger_quarter_end, 
            settlement_trigger_biweekly, auto_settlement, status, created_at, updated_at,
            total_disbursed, outstanding_principal, accrued_interest
     FROM contracts WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] ? mapContractRow(rows[0]) : undefined;
}

export async function createFinancingContract(input: {
  funderId: string;
  funderName: string;
  logisticsProviderId: string;
  logisticsProviderName: string;
  creditLimit: number;
  startDate: string;
  endDate: string;
  annualInterestRate: number;
  interestCalculationMode: "daily_balance" | "other";
  settlementCycle: "monthly" | "quarterly" | "biweekly";
  settlementTriggerDay?: number;
  settlementTriggerQuarterEnd?: boolean;
  settlementTriggerBiweekly?: boolean;
  autoSettlement: boolean;
  profitSharingEnabled?: boolean;
  profitSharingRatio?: number;
}): Promise<Contract> {
  const id = randomUUID();

  await pool.query(
    `INSERT INTO contracts 
     (id, type, funder_id, funder_name, logistics_provider_id, logistics_provider_name,
      credit_limit, start_date, end_date, annual_interest_rate, interest_calculation_mode,
      settlement_cycle, settlement_trigger_day, settlement_trigger_quarter_end,
      settlement_trigger_biweekly, auto_settlement, sharing_mode, profit_sharing_ratio, status)
     VALUES (?, 'financing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      id,
      input.funderId,
      input.funderName,
      input.logisticsProviderId,
      input.logisticsProviderName,
      input.creditLimit,
      input.startDate,
      input.endDate,
      input.annualInterestRate,
      input.interestCalculationMode,
      input.settlementCycle,
      input.settlementTriggerDay || null,
      input.settlementTriggerQuarterEnd ? 1 : 0,
      input.settlementTriggerBiweekly ? 1 : 0,
      input.autoSettlement ? 1 : 0,
      input.profitSharingEnabled ? "percentage" : null,
      input.profitSharingEnabled ? (input.profitSharingRatio || 0) : null
    ]
  );

  const contract = await getContractById(id);
  if (!contract) {
    throw new Error("创建三方融资合同失败");
  }
  return contract;
}

export async function createBrokerageContract(input: {
  logisticsProviderId: string;
  logisticsProviderName: string;
  creditLimit: number;
  startDate: string;
  endDate: string;
  commissionConfig?: Array<{
    fieldKey: string;
    fieldLabel: string;
    mode: "percentage" | "fixed";
    value: number;
  }>;
  settlementCycle: "monthly" | "quarterly" | "biweekly";
  settlementTriggerDay?: number;
  settlementTriggerQuarterEnd?: boolean;
  settlementTriggerBiweekly?: boolean;
  autoSettlement: boolean;
}): Promise<Contract> {
  const id = randomUUID();

  await pool.query(
    `INSERT INTO contracts 
     (id, type, logistics_provider_id, logistics_provider_name,
      credit_limit, start_date, end_date, commission_config,
      settlement_cycle, settlement_trigger_day, 
      settlement_trigger_quarter_end, settlement_trigger_biweekly, auto_settlement, status)
     VALUES (?, 'brokerage', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      id,
      input.logisticsProviderId,
      input.logisticsProviderName,
      input.creditLimit,
      input.startDate,
      input.endDate,
      JSON.stringify(input.commissionConfig || []),
      input.settlementCycle,
      input.settlementTriggerDay || null,
      input.settlementTriggerQuarterEnd ? 1 : 0,
      input.settlementTriggerBiweekly ? 1 : 0,
      input.autoSettlement ? 1 : 0
    ]
  );

  const contract = await getContractById(id);
  if (!contract) {
    throw new Error("创建撮合业务合同失败");
  }
  return contract;
}

export async function updateContractStatus(
  id: string,
  status: "active" | "disabled" | "expiring_soon" | "expired"
): Promise<Contract> {
  await pool.query(
    `UPDATE contracts SET status = ?, updated_at = NOW() WHERE id = ?`,
    [status, id]
  );

  const contract = await getContractById(id);
  if (!contract) {
    throw new Error("合同不存在");
  }
  return contract;
}

export async function updateContract(
  id: string,
  input: Partial<{
    funderId: string;
    funderName: string;
    logisticsProviderId: string;
    logisticsProviderName: string;
    creditLimit: number;
    startDate: string;
    endDate: string;
    annualInterestRate: number;
    interestCalculationMode: "daily_balance" | "other";
    sharingMode: "percentage" | "fixed";
    profitSharingRatio: number;
    fixedSharingAmount: number;
    settlementCycle: "monthly" | "quarterly" | "biweekly";
    settlementTriggerDay: number;
    autoSettlement: boolean;
  }>
): Promise<Contract> {
  const fields: string[] = [];
  const values: any[] = [];

  if (input.funderId !== undefined) {
    fields.push("funder_id = ?");
    values.push(input.funderId);
  }
  if (input.funderName !== undefined) {
    fields.push("funder_name = ?");
    values.push(input.funderName);
  }
  if (input.logisticsProviderId !== undefined) {
    fields.push("logistics_provider_id = ?");
    values.push(input.logisticsProviderId);
  }
  if (input.logisticsProviderName !== undefined) {
    fields.push("logistics_provider_name = ?");
    values.push(input.logisticsProviderName);
  }
  if (input.creditLimit !== undefined) {
    fields.push("credit_limit = ?");
    values.push(input.creditLimit);
  }
  if (input.startDate !== undefined) {
    fields.push("start_date = ?");
    values.push(input.startDate);
  }
  if (input.endDate !== undefined) {
    fields.push("end_date = ?");
    values.push(input.endDate);
  }
  if (input.annualInterestRate !== undefined) {
    fields.push("annual_interest_rate = ?");
    values.push(input.annualInterestRate);
  }
  if (input.interestCalculationMode !== undefined) {
    fields.push("interest_calculation_mode = ?");
    values.push(input.interestCalculationMode);
  }
  if (input.sharingMode !== undefined) {
    fields.push("sharing_mode = ?");
    values.push(input.sharingMode);
  }
  if (input.profitSharingRatio !== undefined) {
    fields.push("profit_sharing_ratio = ?");
    values.push(input.profitSharingRatio);
  }
  if (input.fixedSharingAmount !== undefined) {
    fields.push("fixed_sharing_amount = ?");
    values.push(input.fixedSharingAmount);
  }
  if (input.settlementCycle !== undefined) {
    fields.push("settlement_cycle = ?");
    values.push(input.settlementCycle);
  }
  if (input.settlementTriggerDay !== undefined) {
    fields.push("settlement_trigger_day = ?");
    values.push(input.settlementTriggerDay);
  }
  if (input.autoSettlement !== undefined) {
    fields.push("auto_settlement = ?");
    values.push(input.autoSettlement ? 1 : 0);
  }

  if (fields.length === 0) {
    const contract = await getContractById(id);
    if (!contract) throw new Error("合同不存在");
    return contract;
  }

  fields.push("updated_at = NOW()");
  values.push(id);

  await pool.query(
    `UPDATE contracts SET ${fields.join(", ")} WHERE id = ?`,
    values
  );

  const contract = await getContractById(id);
  if (!contract) {
    throw new Error("合同不存在");
  }
  return contract;
}

export async function deleteContract(id: string): Promise<void> {
  await pool.query(
    `UPDATE contracts SET deleted_at = NOW() WHERE id = ?`,
    [id]
  );
}

// Re-export funder, financier, and fund pool functions
export {
  getFunders,
  getFunderById,
  createFunder,
  updateFunder,
  deleteFunder
} from "./funders-store.js";

export {
  getFinanciers,
  getFinancierById,
  createFinancier,
  updateFinancier,
  deleteFinancier
} from "./financiers-store.js";

export {
  getFundPoolMonitoring,
  addFundFlow
} from "./fund-pool-store.js";

export {
  getWaybills,
  getWaybillById,
  getWaybillByNumber,
  createWaybill,
  updateWaybill,
  deleteWaybill,
  getWaybillStats,
  importWaybills
} from "./waybills-store.js";

// System Parameters functions
interface SystemParametersRow extends RowDataPacket {
  id: string;
  annual_interest_calculation_days: number;
  daily_interest_rounding_rule: string;
  default_profit_sharing_ratio: number;
  single_payment_limit: number;
  enterprise_daily_payment_limit: number;
  fund_pool_warning_level: number;
  repayment_grace_period: number;
  penalty_interest_ratio: number;
  updated_at: string;
  updated_by: string | null;
}

async function mapSystemParametersRow(row: SystemParametersRow): Promise<SystemParameters> {
  return {
    annualInterestCalculationDays: row.annual_interest_calculation_days === 365 ? 365 : 360,
    dailyInterestRoundingRule: row.daily_interest_rounding_rule as "round_up" | "round_half_up" | "round_down",
    defaultProfitSharingRatio: Number(row.default_profit_sharing_ratio),
    singlePaymentLimit: Number(row.single_payment_limit),
    enterpriseDailyPaymentLimit: Number(row.enterprise_daily_payment_limit),
    fundPoolWarningLevel: Number(row.fund_pool_warning_level),
    repaymentGracePeriod: row.repayment_grace_period,
    penaltyInterestRatio: Number(row.penalty_interest_ratio)
  };
}

export async function getSystemParameters(): Promise<SystemParameters> {
  const [rows] = await pool.query<SystemParametersRow[]>(
    `SELECT * FROM system_parameters ORDER BY updated_at DESC LIMIT 1`
  );
  
  if (rows.length === 0) {
    // 返回默认值
    return {
      annualInterestCalculationDays: 360,
      dailyInterestRoundingRule: "round_half_up",
      defaultProfitSharingRatio: 50,
      singlePaymentLimit: 500000,
      enterpriseDailyPaymentLimit: 5000000,
      fundPoolWarningLevel: 15,
      repaymentGracePeriod: 3,
      penaltyInterestRatio: 1.5
    };
  }
  
  return mapSystemParametersRow(rows[0]);
}

export async function updateSystemParameters(
  params: Partial<SystemParameters>,
  updatedBy?: string
): Promise<SystemParameters> {
  // 先检查是否存在记录
  const [existingRows] = await pool.query<SystemParametersRow[]>(
    `SELECT id FROM system_parameters LIMIT 1`
  );
  
  if (existingRows.length === 0) {
    // 创建新记录
    const id = randomUUID();
    await pool.query(
      `INSERT INTO system_parameters 
       (id, annual_interest_calculation_days, daily_interest_rounding_rule, default_profit_sharing_ratio,
        single_payment_limit, enterprise_daily_payment_limit, fund_pool_warning_level,
        repayment_grace_period, penalty_interest_ratio, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.annualInterestCalculationDays ?? 360,
        params.dailyInterestRoundingRule ?? "round_half_up",
        params.defaultProfitSharingRatio ?? 50,
        params.singlePaymentLimit ?? 500000,
        params.enterpriseDailyPaymentLimit ?? 5000000,
        params.fundPoolWarningLevel ?? 15,
        params.repaymentGracePeriod ?? 3,
        params.penaltyInterestRatio ?? 1.5,
        updatedBy || null
      ]
    );
  } else {
    // 更新现有记录
    const updates: string[] = [];
    const values: any[] = [];
    
    if (params.annualInterestCalculationDays !== undefined) {
      updates.push("annual_interest_calculation_days = ?");
      values.push(params.annualInterestCalculationDays);
    }
    if (params.dailyInterestRoundingRule !== undefined) {
      updates.push("daily_interest_rounding_rule = ?");
      values.push(params.dailyInterestRoundingRule);
    }
    if (params.defaultProfitSharingRatio !== undefined) {
      updates.push("default_profit_sharing_ratio = ?");
      values.push(params.defaultProfitSharingRatio);
    }
    if (params.singlePaymentLimit !== undefined) {
      updates.push("single_payment_limit = ?");
      values.push(params.singlePaymentLimit);
    }
    if (params.enterpriseDailyPaymentLimit !== undefined) {
      updates.push("enterprise_daily_payment_limit = ?");
      values.push(params.enterpriseDailyPaymentLimit);
    }
    if (params.fundPoolWarningLevel !== undefined) {
      updates.push("fund_pool_warning_level = ?");
      values.push(params.fundPoolWarningLevel);
    }
    if (params.repaymentGracePeriod !== undefined) {
      updates.push("repayment_grace_period = ?");
      values.push(params.repaymentGracePeriod);
    }
    if (params.penaltyInterestRatio !== undefined) {
      updates.push("penalty_interest_ratio = ?");
      values.push(params.penaltyInterestRatio);
    }
    if (updatedBy) {
      updates.push("updated_by = ?");
      values.push(updatedBy);
    }
    
    if (updates.length > 0) {
      const id = existingRows[0].id;
      values.push(id);
      await pool.query(
        `UPDATE system_parameters SET ${updates.join(", ")} WHERE id = ?`,
        values
      );
    }
  }
  
  return getSystemParameters();
}

export async function resetSystemParameters(updatedBy?: string): Promise<SystemParameters> {
  // 重置为默认值
  return updateSystemParameters({
    annualInterestCalculationDays: 360,
    dailyInterestRoundingRule: "round_half_up",
    defaultProfitSharingRatio: 50,
    singlePaymentLimit: 500000,
    enterpriseDailyPaymentLimit: 5000000,
    fundPoolWarningLevel: 15,
    repaymentGracePeriod: 3,
    penaltyInterestRatio: 1.5
  }, updatedBy);
}

// =============================================
// 抽成合同 (Commission Contracts) CRUD
// =============================================

function mapCommissionContractRow(row: any): CommissionContract {
  return {
    id: row.id,
    customerName: row.customer_name,
    financierId: row.financier_id ?? undefined,
    customerSystemId: row.customer_system_id ?? undefined,
    startDate: row.start_date,
    endDate: row.end_date,
    settlementCycle: row.settlement_cycle ?? undefined,
    settlementDay: row.settlement_day ?? undefined,
    remark: row.remark || undefined,
    commissionConfig: row.commission_config ? (typeof row.commission_config === "string" ? JSON.parse(row.commission_config) : row.commission_config) : [],
    status: row.status as CommissionContractStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getCommissionContracts(params?: {
  status?: CommissionContractStatus;
  customerName?: string;
}): Promise<{ contracts: CommissionContract[]; total: number }> {
  let query = "SELECT * FROM commission_contracts WHERE 1=1";
  const values: any[] = [];

  if (params?.status) {
    query += " AND status = ?";
    values.push(params.status);
  }
  if (params?.customerName) {
    query += " AND customer_name LIKE ?";
    values.push(`%${params.customerName}%`);
  }

  query += " ORDER BY created_at DESC";

  const [rows] = await pool.query<RowDataPacket[]>(query, values);
  const contracts = rows.map(mapCommissionContractRow);

  return {
    contracts,
    total: contracts.length
  };
}

export async function getCommissionContractById(id: string): Promise<CommissionContract | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM commission_contracts WHERE id = ?",
    [id]
  );
  return rows[0] ? mapCommissionContractRow(rows[0]) : undefined;
}

export async function createCommissionContract(input: {
  customerName: string;
  financierId?: string;
  customerSystemId?: string;
  startDate: string;
  endDate: string;
  settlementCycle?: "monthly" | "biweekly" | "weekly";
  settlementDay?: number;
  remark?: string;
  commissionConfig: CommissionConfigItem[];
  status?: CommissionContractStatus;
}): Promise<CommissionContract> {
  const id = randomUUID();

  let status: CommissionContractStatus = input.status || "active";
  const today = new Date();
  const endDate = new Date(input.endDate);
  const daysUntilEnd = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilEnd < 0) {
    status = "expired";
  } else if (daysUntilEnd <= 30) {
    status = "expiring_soon";
  }

  await pool.query(
    `INSERT INTO commission_contracts 
     (id, customer_name, financier_id, customer_system_id, start_date, end_date, 
      settlement_cycle, settlement_day, remark, commission_config, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      input.customerName,
      input.financierId || null,
      input.customerSystemId || null,
      input.startDate,
      input.endDate,
      input.settlementCycle || null,
      input.settlementDay ?? null,
      input.remark || null,
      JSON.stringify(input.commissionConfig),
      status
    ]
  );

  const contract = await getCommissionContractById(id);
  if (!contract) {
    throw new Error("创建抽成合同失败");
  }
  return contract;
}

export async function updateCommissionContract(
  id: string,
  input: Partial<{
    customerName: string;
    financierId: string;
    customerSystemId: string;
    startDate: string;
    endDate: string;
    settlementCycle: "monthly" | "biweekly" | "weekly";
    settlementDay: number;
    remark: string;
    commissionConfig: CommissionConfigItem[];
    status: CommissionContractStatus;
  }>
): Promise<CommissionContract> {
  const updates: string[] = [];
  const values: any[] = [];

  if (input.customerName !== undefined) {
    updates.push("customer_name = ?");
    values.push(input.customerName);
  }
  if (input.financierId !== undefined) {
    updates.push("financier_id = ?");
    values.push(input.financierId);
  }
  if (input.customerSystemId !== undefined) {
    updates.push("customer_system_id = ?");
    values.push(input.customerSystemId);
  }
  if (input.startDate !== undefined) {
    updates.push("start_date = ?");
    values.push(input.startDate);
  }
  if (input.endDate !== undefined) {
    updates.push("end_date = ?");
    values.push(input.endDate);
  }
  if (input.settlementCycle !== undefined) {
    updates.push("settlement_cycle = ?");
    values.push(input.settlementCycle);
  }
  if (input.settlementDay !== undefined) {
    updates.push("settlement_day = ?");
    values.push(input.settlementDay);
  }
  if (input.remark !== undefined) {
    updates.push("remark = ?");
    values.push(input.remark);
  }
  if (input.commissionConfig !== undefined) {
    updates.push("commission_config = ?");
    values.push(JSON.stringify(input.commissionConfig));
  }
  if (input.status !== undefined) {
    updates.push("status = ?");
    values.push(input.status);
  }

  if (updates.length === 0) {
    const contract = await getCommissionContractById(id);
    if (!contract) throw new Error("抽成合同不存在");
    return contract;
  }

  updates.push("updated_at = NOW()");
  values.push(id);

  await pool.query(
    `UPDATE commission_contracts SET ${updates.join(", ")} WHERE id = ?`,
    values
  );

  const contract = await getCommissionContractById(id);
  if (!contract) throw new Error("抽成合同不存在");
  return contract;
}

export async function deleteCommissionContract(id: string): Promise<void> {
  await pool.query("DELETE FROM commission_contracts WHERE id = ?", [id]);
}

export async function getCommissionContractStats(): Promise<CommissionContractStats> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM commission_contracts"
  );

  const contracts = rows.map(mapCommissionContractRow);
  const activeCount = contracts.filter(c => c.status === "active").length;
  
  // 计算总配置项数
  const totalConfigCount = contracts.reduce((sum, c) => sum + c.commissionConfig.length, 0);
  
  // 计算平均抽成比例（仅比例模式）
  const percentageConfigs = contracts.flatMap(c => 
    c.commissionConfig.filter((cfg: CommissionConfigItem) => cfg.mode === "percentage")
  );
  const avgRatio = percentageConfigs.length > 0
    ? percentageConfigs.reduce((sum: number, cfg: CommissionConfigItem) => sum + cfg.value, 0) / percentageConfigs.length
    : 0;

  return {
    totalCount: contracts.length,
    activeCount,
    totalConfigCount,
    avgRatio
  };
}


// 确保抽成合同表存在
export async function ensureCommissionContractsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commission_contracts (
      id VARCHAR(36) PRIMARY KEY,
      customer_name VARCHAR(200) NOT NULL,
      customer_system_id VARCHAR(100),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      settlement_cycle ENUM('monthly', 'biweekly', 'weekly') NOT NULL DEFAULT 'monthly',
      settlement_day INT NOT NULL DEFAULT 10,
      remark TEXT,
      commission_config JSON,
      status ENUM('active', 'expiring_soon', 'expired', 'disabled') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_commission_contract_status (status),
      INDEX idx_commission_contract_customer (customer_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
