/**
 * 多方主体权限 · 统一策略层（阶段 A）
 *
 * 目标：收敛当前散落的 orgType 分支与 if/else 隔离逻辑，输出 4 个核心能力：
 *   - loadUserContext  构建完整用户上下文（含 tenant / dataScopes / grantBoundary）
 *   - requireCapability 能力检查中间件（老权限码向下兼容，新码叠加）
 *   - resolveDataScope 按模块返回数据范围
 *   - ensureTenantWritable 主体冻结硬控制
 *
 * 本阶段不强迁数据：user_data_scopes 若为空，按现有 orgContext 规则生成默认 scope，
 * 保证业务行为不变，同时把入口收敛到这里。
 */

import type { NextFunction, Response } from "express";
import type { RowDataPacket } from "mysql2";

import { pool } from "./db.js";
import {
  AuthenticatedRequest,
  OrgContext,
} from "./auth.js";
import { findOrgById } from "./store.js";
import { getDirectedPayContractsByFunder } from "./directed-pay-contracts-store.js";
import { getErrorMessage, getLangFromRequest } from "./i18n.js";
import type {
  DataScope,
  DataScopeMode,
  GrantBoundary,
  Permission,
  SafeUser,
  TenantContext,
  TenantSummary,
  UserContext,
} from "./types.js";

/* ============================================================
 * 1. 能力码兼容层（老码 -> 新码 的别名映射）
 *
 * 规则：
 *  - 拥有老码 `view_platform_revenue`，等价于拥有新码
 *    `view_page_platform_revenue` / `action_view_revenue` 等
 *  - 上线期间不强制迁移 roles/permissions 表
 *  - 所有 requireCapability 内部都会同时对照老码 + 新码
 * ============================================================ */

const LEGACY_TO_NEW_MAP: Record<string, string[]> = {
  // 用户与权限管理
  manage_users: ["manage_users", "view_page_users", "action_edit_user"],
  manage_roles: ["manage_roles", "view_page_roles", "action_edit_role"],
  manage_permissions: ["manage_permissions", "view_page_permissions"],

  // 合同 / 对账
  manage_contracts: [
    "manage_contracts",
    "view_page_contracts",
    "view_page_recon_batches",
    "action_edit_contract",
  ],

  // 运单
  view_waybills: ["view_waybills", "view_page_waybills", "action_view_waybill"],
  manage_waybills: ["manage_waybills", "action_edit_waybill"],
  export_waybills: ["export_waybills", "action_export_waybill"],

  // 收益
  view_platform_revenue: [
    "view_platform_revenue",
    "view_page_platform_revenue",
    "action_view_revenue",
    "action_export_revenue",
  ],
  view_funder_revenue: [
    "view_funder_revenue",
    "view_page_funder_revenue",
    "action_view_funder_revenue",
    "action_export_funder_revenue",
  ],
  view_financier_expense: [
    "view_financier_expense",
    "view_page_financier_expense",
    "action_export_financier_expense",
  ],

  // 定向支付
  manage_directed_pay: [
    "manage_directed_pay",
    "view_page_directed_pay",
    "action_edit_directed_pay",
  ],
  approve_directed_pay: ["approve_directed_pay", "action_approve_directed_pay"],

  // 日志
  view_operation_logs: ["view_operation_logs", "view_page_operation_logs"],
};

export function expandCapabilities(perms: Permission[]): Set<Permission> {
  const expanded = new Set<Permission>();
  perms.forEach((p) => {
    expanded.add(p);
    const mapped = LEGACY_TO_NEW_MAP[p];
    if (mapped) mapped.forEach((m) => expanded.add(m));
  });
  return expanded;
}

export function hasCapability(
  userPerms: Permission[] | undefined,
  cap: Permission
): boolean {
  if (!userPerms || userPerms.length === 0) return false;
  if (userPerms.includes("*")) return true;
  const expanded = expandCapabilities(userPerms);
  return expanded.has(cap);
}

/* ============================================================
 * 2. 数据权限模板
 * ============================================================ */

export function defaultDataScope(
  module: string,
  orgContext?: OrgContext
): DataScope {
  // 平台用户：全量
  if (!orgContext || orgContext.isPlatformUser) {
    return {
      module,
      mode: "all_tenants",
      tenantIds: [],
      includeChildren: false,
      readonly: false,
      exportable: true,
    };
  }

  // 租户用户：默认只看本主体
  return {
    module,
    mode: "tenant_only",
    tenantIds: orgContext.orgId ? [orgContext.orgId] : [],
    includeChildren: false,
    readonly: false,
    exportable: true,
  };
}

/* ============================================================
 * 3. loadUserContext 中间件
 *
 *   - 必须在 authenticate 之后挂载
 *   - 把 `req.userContext` 注入后续链路
 *   - 读取 user_data_scopes / grant_boundaries（若无则回退到默认）
 * ============================================================ */

export async function loadUserContext(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.currentUser;
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const orgContext = req.orgContext;

    // 主体信息 + 冻结判定
    let tenant: TenantSummary | undefined;
    let isFrozen = false;

    if (orgContext?.orgId) {
      const org = await findOrgById(orgContext.orgId);
      if (org) {
        tenant = {
          id: org.id,
          name: org.name,
          type: org.type,
          parentId: org.parentId,
          relatedEntityId: org.relatedEntityId,
          status: org.isActive === false ? "disabled" : "active",
        };
        isFrozen = org.isActive === false;
      }
    }

    // 可访问主体集合（阶段 A 简化：平台 = 全部，其它 = 本主体）
    // accessibleTenantIds 在阶段 B/C 引入 user_data_scopes 后逐模块细化
    const accessibleTenantIds: string[] = [];
    if (orgContext?.isPlatformUser) {
      // 阶段 A 不预加载全部主体 ID，避免大表扫描；平台判断由 isPlatform 兜底
    } else if (orgContext?.orgId) {
      accessibleTenantIds.push(orgContext.orgId);
    }

    const tenantContext: TenantContext = {
      isPlatform: !!orgContext?.isPlatformUser,
      isFrozen,
      accessibleTenantIds,
    };

    // 数据权限：读 user_data_scopes；没配的模块走默认
    const dataScopes = await loadUserDataScopes(user.id, orgContext);

    // 授权上限：读 grant_boundaries；没配视为无限制（null）
    const grantBoundary = await loadGrantBoundary(user.id);

    const ctx: UserContext = {
      user,
      tenant,
      tenantContext,
      roles: user.roleIds.map((id) => ({ id })),
      groups: user.groupIds.map((id) => ({ id })),
      permissions: user.permissions,
      dataScopes,
      grantBoundary,
    };

    (req as AuthenticatedRequest & { userContext?: UserContext }).userContext =
      ctx;
    next();
  } catch (err) {
    console.error("[loadUserContext] failed", err);
    const lang = getLangFromRequest(req);
    res
      .status(500)
      .json({ error: getErrorMessage("error.users.unauthorized", lang) });
  }
}

async function loadUserDataScopes(
  userId: string,
  orgContext?: OrgContext
): Promise<Record<string, DataScope>> {
  const map: Record<string, DataScope> = {};

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT module_code, scope_mode, tenant_ids, include_child_tenants,
              readonly, exportable
         FROM user_data_scopes
         WHERE user_id = ?`,
      [userId]
    );
    for (const r of rows) {
      const module = String(r.module_code);
      let tenantIds: string[] = [];
      try {
        const raw = r.tenant_ids;
        if (Array.isArray(raw)) tenantIds = raw.map((x) => String(x));
        else if (typeof raw === "string" && raw.length > 0)
          tenantIds = JSON.parse(raw);
      } catch {
        tenantIds = [];
      }
      map[module] = {
        module,
        mode: r.scope_mode as DataScopeMode,
        tenantIds,
        includeChildren: !!r.include_child_tenants,
        readonly: !!r.readonly,
        exportable: !!r.exportable,
      };
    }
  } catch (err: any) {
    // 表不存在（老库未迁移）时静默回退
    if (err?.code !== "ER_NO_SUCH_TABLE") {
      console.warn("[loadUserDataScopes] query failed:", err?.message);
    }
  }

  return map;
}

async function loadGrantBoundary(userId: string): Promise<GrantBoundary> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT grantable_permission_codes, grantable_scope_modes, grantable_tenant_ids
         FROM grant_boundaries
         WHERE user_id = ?
         LIMIT 1`,
      [userId]
    );
    const r = rows[0];
    if (!r) {
      return {
        canGrantPermissionCodes: null,
        canGrantScopeModes: null,
        canGrantTenantIds: null,
      };
    }
    const parseJson = <T = any>(raw: unknown): T | null => {
      if (raw == null) return null;
      if (Array.isArray(raw)) return raw as unknown as T;
      try {
        return JSON.parse(String(raw)) as T;
      } catch {
        return null;
      }
    };
    return {
      canGrantPermissionCodes: parseJson(r.grantable_permission_codes),
      canGrantScopeModes: parseJson(r.grantable_scope_modes),
      canGrantTenantIds: parseJson(r.grantable_tenant_ids),
    };
  } catch (err: any) {
    if (err?.code !== "ER_NO_SUCH_TABLE") {
      console.warn("[loadGrantBoundary] query failed:", err?.message);
    }
    return {
      canGrantPermissionCodes: null,
      canGrantScopeModes: null,
      canGrantTenantIds: null,
    };
  }
}

/* ============================================================
 * 4. requireCapability 中间件
 * ============================================================ */

export function requireCapability(cap: Permission | Permission[]) {
  const list = Array.isArray(cap) ? cap : [cap];
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const perms = req.currentPermissions ?? [];
    if (perms.includes("*")) {
      next();
      return;
    }
    const expanded = expandCapabilities(perms);
    const ok = list.every((c) => expanded.has(c));
    if (!ok) {
      const lang = req.lang || getLangFromRequest(req);
      res
        .status(403)
        .json({ error: getErrorMessage("error.users.unauthorized", lang) });
      return;
    }
    next();
  };
}

/* ============================================================
 * 5. resolveDataScope / buildTenantFilter
 * ============================================================ */

export function resolveDataScope(
  req: AuthenticatedRequest,
  moduleCode: string
): DataScope {
  const ctx =
    (req as AuthenticatedRequest & { userContext?: UserContext }).userContext;
  if (ctx && ctx.dataScopes[moduleCode]) {
    return ctx.dataScopes[moduleCode];
  }
  return defaultDataScope(moduleCode, req.orgContext);
}

export function buildTenantFilter(
  scope: DataScope,
  column: string
): { sql: string; params: any[]; emptyResult: boolean } {
  if (scope.mode === "all_tenants") {
    return { sql: "", params: [], emptyResult: false };
  }
  if (scope.tenantIds.length === 0) {
    // 租户用户但无任何可见主体 -> 查不到数据
    return { sql: "1 = 0", params: [], emptyResult: true };
  }
  const placeholders = scope.tenantIds.map(() => "?").join(",");
  return {
    sql: `${column} IN (${placeholders})`,
    params: scope.tenantIds,
    emptyResult: false,
  };
}

/* ============================================================
 * 5.1 resolveBusinessScope：把主体边界翻译成业务模块过滤维度
 *
 * 各业务表实际过滤的列：
 *   - waybills.customer_id    => financier 实体 ID
 *   - contracts.funder_id     => funder 实体 ID
 *   - contracts.logistics_provider_id => financier 实体 ID
 *   - revenue_records.funder_id / financier_id
 *   - commission_recon_batches.financier_id
 *
 * 因此「主体 → 业务过滤」要按主体类型分流：
 *   - platform：不限制（emptyResult = false，全部字段可空）
 *   - financier：本主体的 financier_id（= orgContext.relatedEntityId）
 *   - funder：本主体的 funder_id（= orgContext.relatedEntityId），
 *     若需要看其放贷的融资方运单，由各模块决定是否解析合同
 * ============================================================ */

export interface BusinessScope {
  isPlatform: boolean;
  emptyResult: boolean;
  funderId?: string;       // 本资金方的实体 ID
  financierId?: string;    // 本融资方的实体 ID
  customerIds?: string[];  // 派生：funder 的合同对手 financier 列表
}

export async function resolveBusinessScope(
  req: AuthenticatedRequest,
  options?: {
    deriveFunderCustomers?: boolean; // funder 是否解析为对手 financierId 列表
  }
): Promise<BusinessScope> {
  const ctx = req.orgContext;

  if (!ctx || ctx.isPlatformUser) {
    return { isPlatform: true, emptyResult: false };
  }

  if (ctx.orgType === "financier") {
    if (!ctx.relatedEntityId) {
      return { isPlatform: false, emptyResult: true };
    }
    return {
      isPlatform: false,
      emptyResult: false,
      financierId: ctx.relatedEntityId,
    };
  }

  if (ctx.orgType === "funder") {
    if (!ctx.relatedEntityId) {
      return { isPlatform: false, emptyResult: true };
    }
    const scope: BusinessScope = {
      isPlatform: false,
      emptyResult: false,
      funderId: ctx.relatedEntityId,
    };
    if (options?.deriveFunderCustomers) {
      try {
        const contracts = await getDirectedPayContractsByFunder(
          ctx.relatedEntityId
        );
        const ids = Array.from(
          new Set(contracts.map((c) => c.financierId).filter(Boolean))
        );
        scope.customerIds = ids;
        if (ids.length === 0) {
          scope.emptyResult = true;
        }
      } catch (err: any) {
        console.warn(
          "[resolveBusinessScope] derive funder customers failed:",
          err?.message
        );
      }
    }
    return scope;
  }

  // 未知主体类型，安全起见空集
  return { isPlatform: false, emptyResult: true };
}

/* ============================================================
 * 6. ensureTenantWritable：主体冻结硬控制
 *    - 平台用户：放行
 *    - 租户用户：tenantContext.isFrozen == true 时拒绝写
 * ============================================================ */

export function ensureTenantWritable(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const ctx =
    (req as AuthenticatedRequest & { userContext?: UserContext }).userContext;
  if (!ctx) {
    // 未挂 loadUserContext -> 回退到 orgContext 判断
    next();
    return;
  }
  if (ctx.tenantContext.isPlatform) {
    next();
    return;
  }
  if (ctx.tenantContext.isFrozen) {
    const lang = req.lang || getLangFromRequest(req);
    res.status(403).json({
      error: getErrorMessage("error.tenant.frozen", lang),
      code: "TENANT_FROZEN",
    });
    return;
  }
  next();
}

/* ============================================================
 * 7. 工具：把 SafeUser + req 打包成 UserContext（供 /auth/me 直接返回）
 * ============================================================ */

export async function buildUserContextPayload(
  user: SafeUser,
  orgContext?: OrgContext
): Promise<UserContext> {
  let tenant: TenantSummary | undefined;
  let isFrozen = false;

  if (orgContext?.orgId) {
    const org = await findOrgById(orgContext.orgId);
    if (org) {
      tenant = {
        id: org.id,
        name: org.name,
        type: org.type,
        parentId: org.parentId,
        relatedEntityId: org.relatedEntityId,
        status: org.isActive === false ? "disabled" : "active",
      };
      isFrozen = org.isActive === false;
    }
  }

  const accessibleTenantIds: string[] = [];
  if (!orgContext?.isPlatformUser && orgContext?.orgId) {
    accessibleTenantIds.push(orgContext.orgId);
  }

  const dataScopes = await loadUserDataScopes(user.id, orgContext);
  const grantBoundary = await loadGrantBoundary(user.id);

  return {
    user,
    tenant,
    tenantContext: {
      isPlatform: !!orgContext?.isPlatformUser,
      isFrozen,
      accessibleTenantIds,
    },
    roles: user.roleIds.map((id) => ({ id })),
    groups: user.groupIds.map((id) => ({ id })),
    permissions: user.permissions,
    dataScopes,
    grantBoundary,
  };
}
