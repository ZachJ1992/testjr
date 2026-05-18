import { Investment, InvestmentStats, InvestmentStatus, OrgUnit, PermissionNode, SafeUser, UserGroupDetail, Supervision, SupervisionStats, SupervisionStatus, SupervisionType, ContractCommission, CommissionStats, CommissionStatus, Contract, ContractType, Funder, FunderType, FunderStatus, Financier, FinancierScale, FinancierStatus, FundPoolMonitoring, SystemParameters, Waybill, WaybillStats, WaybillStatus, BusinessMode, ExternalSystemConfig, DirectedPaymentRequest, PaymentRequestStatus, PaymentRequestStats, ReceiverType, CrawlerConfig, CrawlerSyncLog, CrawlerTestResult, CrawlerSyncResult, CrawlerTemplateMeta } from "./types";

// 自动检测后端地址：
// - 本地开发：直接连 3001 端口
// - 线上部署：统一走同源 /api（由 Nginx 反向代理）
export const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `http://${hostname}:3001/api`;
  }
  return `${window.location.origin}/api`;
};
const API_BASE = getApiBase();
export const API_AI = `${API_BASE}/ai/agent`;

export function resolveFileUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  const base = API_BASE.replace(/\/api\/?$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

export interface AISession {
  id: string;
  userId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any;
  tool_results?: any;
  createdAt: string;
}

// 获取会话列表
export async function getAISessions(): Promise<{ sessions: AISession[] }> {
  return request("/ai/sessions", {
    headers: getAuthHeader()
  });
}

// 删除会话
export async function deleteAISession(sessionId: string): Promise<{ success: boolean }> {
  return request(`/ai/sessions/${sessionId}`, {
    method: "DELETE",
    headers: getAuthHeader()
  });
}

// 获取会话消息
export async function getAISessionMessages(sessionId: string): Promise<{ messages: AIMessage[] }> {
  return request(`/ai/sessions/${sessionId}/messages`, {
    headers: getAuthHeader()
  });
}

/**
 * 从localStorage获取当前语言
 */
function getLangFromStorage(): string {
  return localStorage.getItem("lang") || "zh-CN";
}

/**
 * 从错误对象中提取错误消息，移除重复的 "Error:" 前缀
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // 移除可能存在的 "Error: " 前缀，避免重复
    return err.message.replace(/^Error:\s*/i, "");
  }
  // 处理 antd form validateFields 的错误对象
  if (err && typeof err === 'object' && 'errorFields' in err) {
    const errorFields = (err as { errorFields: Array<{ errors: string[] }> }).errorFields;
    if (errorFields?.length > 0 && errorFields[0].errors?.length > 0) {
      return errorFields[0].errors[0];
    }
    return "表单验证失败";
  }
  const msg = String(err);
  // 移除可能存在的 "Error: " 前缀，避免重复
  return msg.replace(/^Error:\s*/i, "");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const lang = getLangFromStorage();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Lang": lang,
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.error || detail;
    } catch {
      // ignore parse error
    }
    // 移除可能存在的 "Error: " 前缀，避免重复
    const cleanDetail = detail.replace(/^Error:\s*/i, "");
    throw new Error(cleanDetail);
  }

  // 204 No Content 没有响应体，直接返回空对象
  if (res.status === 204) {
    return {} as T;
  }

  // 检查响应体是否为空
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      return await res.json() as T;
    } catch {
      // 如果解析失败，返回空对象
      return {} as T;
    }
  }

  // 非 JSON 响应或无内容类型，返回空对象
  return {} as T;
}

export async function loginApi(input: {
  username: string;
  password: string;
}): Promise<{ token: string; user: SafeUser }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchMe(token: string): Promise<{
  user: SafeUser;
  permissions?: string[];
  orgContext?: SafeUser["orgContext"];
  tenant?: SafeUser["tenant"];
  tenantContext?: SafeUser["tenantContext"];
  roles?: SafeUser["roles"];
  groups?: SafeUser["groups"];
  dataScopes?: SafeUser["dataScopes"];
  grantBoundary?: SafeUser["grantBoundary"];
}> {
  return request("/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

// 老权限码 -> 新细粒度码映射（与后端 permission-policy.ts 保持一致）
const LEGACY_TO_NEW_CAP_MAP: Record<string, string[]> = {
  manage_users: ["manage_users", "view_page_users", "action_edit_user"],
  manage_roles: ["manage_roles", "view_page_roles", "action_edit_role"],
  manage_permissions: ["manage_permissions", "view_page_permissions"],
  manage_contracts: [
    "manage_contracts",
    "view_page_contracts",
    "view_page_recon_batches",
    "action_edit_contract"
  ],
  view_waybills: ["view_waybills", "view_page_waybills", "action_view_waybill"],
  manage_waybills: ["manage_waybills", "action_edit_waybill"],
  export_waybills: ["export_waybills", "action_export_waybill"],
  view_platform_revenue: [
    "view_platform_revenue",
    "view_page_platform_revenue",
    "action_view_revenue",
    "action_export_revenue"
  ],
  view_funder_revenue: [
    "view_funder_revenue",
    "view_page_funder_revenue",
    "action_view_funder_revenue",
    "action_export_funder_revenue"
  ],
  view_financier_expense: [
    "view_financier_expense",
    "view_page_financier_expense",
    "action_export_financier_expense"
  ],
  manage_directed_pay: [
    "manage_directed_pay",
    "view_page_directed_pay",
    "action_edit_directed_pay"
  ],
  approve_directed_pay: ["approve_directed_pay", "action_approve_directed_pay"],
  view_operation_logs: ["view_operation_logs", "view_page_operation_logs"]
};

function expandCapabilities(perms: string[] | undefined): Set<string> {
  const expanded = new Set<string>();
  (perms || []).forEach((p) => {
    expanded.add(p);
    const mapped = LEGACY_TO_NEW_CAP_MAP[p];
    if (mapped) mapped.forEach((m) => expanded.add(m));
  });
  return expanded;
}

/**
 * 统一的权限判断工具：兼容老权限码与新细粒度码。
 * 组件里如果还在用 `user?.permissions?.includes("xxx")`，可继续使用；
 * 若要检查新码（view_page_xxx / action_edit_xxx），请切换到 `hasCapability`。
 */
export function hasCapability(
  user: Pick<SafeUser, "permissions"> | undefined | null,
  cap: string
): boolean {
  const perms = user?.permissions;
  if (!perms || perms.length === 0) return false;
  if (perms.includes("*")) return true;
  return expandCapabilities(perms).has(cap);
}

export async function fetchPermissions(
  token: string
): Promise<{ permissions: PermissionNode[] }> {
  return request("/permissions", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function fetchTranslations(
  lang: string,
  page?: string
): Promise<{ lang: string; translations: Record<string, string> }> {
  const params = new URLSearchParams({ lang });
  if (page) params.append("page", page);
  const res = await fetch(`${API_BASE}/i18n?${params.toString()}`, {
    headers: getAuthHeader()
  });
  if (!res.ok) {
    return { lang, translations: {} };
  }
  return res.json();
}

export async function fetchI18nEntries(
  token: string,
  filters?: { lang?: string; scopeType?: string; scopeId?: string; page?: string }
): Promise<{ entries: Array<{ id: string; lang: string; key: string; value: string; scopeType: string; scopeId?: string; page?: string }> }> {
  const params = new URLSearchParams();
  if (filters?.lang) params.append("lang", filters.lang);
  if (filters?.scopeType) params.append("scopeType", filters.scopeType);
  if (filters?.scopeId !== undefined) params.append("scopeId", filters.scopeId);
  if (filters?.page !== undefined) params.append("page", filters.page);
  return request(`/i18n/entries?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function upsertI18nEntry(
  token: string,
  payload: {
    lang: string;
    key: string;
    value: string;
    scopeType: string;
    scopeId?: string;
    page?: string;
  }
): Promise<{ entry: any }> {
  return request("/i18n", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteI18nEntry(
  token: string,
  id: string
): Promise<void> {
  await request(`/i18n/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

function getAuthHeader(): HeadersInit | undefined {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export function getToken(): string | undefined {
  return localStorage.getItem("auth_token") ?? undefined;
}
export async function fetchGroups(
  token: string
): Promise<{ groups: UserGroupDetail[] }> {
  return request("/groups", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function fetchOrgs(
  token: string
): Promise<{ orgs: OrgUnit[] }> {
  return request("/orgs", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createOrgApi(
  token: string,
  payload: { name: string; parentId?: string; isActive?: boolean }
): Promise<{ org: OrgUnit }> {
  return request("/orgs", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateOrgApi(
  token: string,
  id: string,
  payload: { name?: string; parentId?: string | null; isActive?: boolean }
): Promise<{ org: OrgUnit }> {
  return request(`/orgs/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteOrgApi(
  token: string,
  id: string
): Promise<void> {
  await request(`/orgs/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 主体启用 / 停用（阶段 B）
export async function enableTenantApi(
  token: string,
  id: string
): Promise<{ org: OrgUnit }> {
  return request(`/tenants/${id}/enable`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function disableTenantApi(
  token: string,
  id: string
): Promise<{ org: OrgUnit }> {
  return request(`/tenants/${id}/disable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Confirmed": "true"
    }
  });
}

// 角色管理（阶段 B 补齐）
export interface RoleDetail {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
}

export async function fetchRoles(token: string): Promise<{ roles: RoleDetail[] }> {
  return request(`/roles`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createRoleApi(
  token: string,
  payload: { name: string; description?: string; permissions: string[] }
): Promise<{ role: RoleDetail }> {
  return request(`/roles`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateRoleApi(
  token: string,
  id: string,
  payload: { name?: string; description?: string; permissions?: string[] }
): Promise<{ role: RoleDetail }> {
  return request(`/roles/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteRoleApi(token: string, id: string): Promise<void> {
  await request(`/roles/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 操作日志
export interface OperationLogItem {
  id: string;
  operatorUserId?: string;
  operatorTenantId?: string;
  targetType?: string;
  targetId?: string;
  action: string;
  beforeSnapshot?: any;
  afterSnapshot?: any;
  isSensitive: boolean;
  confirmed: boolean;
  ip?: string;
  ua?: string;
  createdAt: string;
}

export async function fetchOperationLogs(
  token: string,
  query?: {
    tenantId?: string;
    operatorUserId?: string;
    action?: string;
    isSensitive?: boolean;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{ items: OperationLogItem[]; total: number }> {
  const params = new URLSearchParams();
  if (query?.tenantId) params.append("tenantId", query.tenantId);
  if (query?.operatorUserId) params.append("operatorUserId", query.operatorUserId);
  if (query?.action) params.append("action", query.action);
  if (query?.isSensitive !== undefined)
    params.append("isSensitive", String(query.isSensitive));
  if (query?.startDate) params.append("startDate", query.startDate);
  if (query?.endDate) params.append("endDate", query.endDate);
  if (query?.page) params.append("page", String(query.page));
  if (query?.pageSize) params.append("pageSize", String(query.pageSize));
  const qs = params.toString();
  return request(`/operation-logs${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 用户授权上限
export interface GrantBoundaryPayload {
  canGrantPermissionCodes: string[] | null;
  canGrantScopeModes: string[] | null;
  canGrantTenantIds: string[] | null;
}

export async function fetchUserGrantBoundary(
  token: string,
  userId: string
): Promise<{ userId: string; boundary: GrantBoundaryPayload }> {
  return request(`/users/${userId}/grant-boundary`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function updateUserGrantBoundary(
  token: string,
  userId: string,
  boundary: GrantBoundaryPayload
): Promise<{ ok: boolean }> {
  return request(`/users/${userId}/grant-boundary`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(boundary)
  });
}

export async function createGroupApi(
  token: string,
  payload: {
    name: string;
    description?: string;
    permissionCodes?: string[];
  }
): Promise<{ group: UserGroupDetail }> {
  return request("/groups", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateGroupApi(
  token: string,
  id: string,
  payload: {
    name?: string;
    description?: string;
    permissionCodes?: string[];
  }
): Promise<{ group: UserGroupDetail }> {
  return request(`/groups/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function addUserToGroupApi(
  token: string,
  groupId: string,
  userId: string
): Promise<void> {
  await request(`/groups/${groupId}/users/${userId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function removeUserFromGroupApi(
  token: string,
  groupId: string,
  userId: string
): Promise<void> {
  await request(`/groups/${groupId}/users/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchUsers(
  token: string
): Promise<{ users: SafeUser[] }> {
  return request("/users", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createUserApi(
  token: string,
  payload: {
    username: string;
    password: string;
    displayName: string;
    orgId?: string;
    roleIds?: string[];
    groupIds?: string[];
    isActive?: boolean;
  }
): Promise<{ user: SafeUser }> {
  return request("/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateUserApi(
  token: string,
  id: string,
  payload: {
    displayName?: string;
    password?: string;
    orgId?: string | null;
    groupIds?: string[];
    roleIds?: string[];
    isActive?: boolean;
  }
): Promise<{ user: SafeUser }> {
  return request(`/users/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteUserApi(token: string, id: string): Promise<void> {
  await request(`/users/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function changePasswordApi(
  token: string,
  payload: { oldPassword: string; newPassword: string }
): Promise<{ success: boolean }> {
  return request("/users/change-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function createPermissionApi(
  token: string,
  payload: {
    code: string;
    name: string;
    description?: string;
    parentId?: string;
  }
): Promise<{ permission: PermissionNode }> {
  return request("/permissions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export async function updatePermissionApi(
  token: string,
  id: string,
  payload: {
    code?: string;
    name?: string;
    description?: string;
    parentId?: string | null;
  }
): Promise<{ permission: PermissionNode }> {
  return request(`/permissions/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export async function deletePermissionApi(
  token: string,
  id: string
): Promise<void> {
  await request(`/permissions/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

// Investment APIs
export async function fetchInvestmentStats(token: string): Promise<InvestmentStats> {
  return request("/investments/stats", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchInvestments(
  token: string,
  search?: string
): Promise<{ investments: Investment[] }> {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  return request(`/investments${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchInvestmentById(
  token: string,
  id: string
): Promise<{ investment: Investment }> {
  return request(`/investments/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createInvestmentApi(
  token: string,
  payload: {
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
  }
): Promise<{ investment: Investment }> {
  return request("/investments", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateInvestmentApi(
  token: string,
  id: string,
  payload: {
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
): Promise<{ investment: Investment }> {
  return request(`/investments/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteInvestmentApi(token: string, id: string): Promise<void> {
  await request(`/investments/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Supervision APIs
export async function fetchSupervisionStats(token: string): Promise<SupervisionStats> {
  return request("/supervisions/stats", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchSupervisions(
  token: string,
  filters?: {
    licensePlate?: string;
    supervisionType?: SupervisionType;
    status?: SupervisionStatus;
  }
): Promise<{ supervisions: Supervision[] }> {
  const params = new URLSearchParams();
  if (filters?.licensePlate) params.append("licensePlate", filters.licensePlate);
  if (filters?.supervisionType) params.append("supervisionType", filters.supervisionType);
  if (filters?.status) params.append("status", filters.status);
  const queryString = params.toString();
  return request(`/supervisions${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchSupervisionById(
  token: string,
  id: string
): Promise<{ supervision: Supervision }> {
  return request(`/supervisions/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createSupervisionApi(
  token: string,
  payload: {
    waybillNumber: string;
    licensePlate: string;
    grossProfit: number;
    supervisionType: SupervisionType;
    supervisionRate: number;
    supervisionAmount: number;
    startDate: string;
    endDate: string;
    status?: SupervisionStatus;
  }
): Promise<{ supervision: Supervision }> {
  return request("/supervisions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateSupervisionApi(
  token: string,
  id: string,
  payload: {
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
): Promise<{ supervision: Supervision }> {
  return request(`/supervisions/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteSupervisionApi(token: string, id: string): Promise<void> {
  await request(`/supervisions/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Contract Commission APIs
export async function fetchCommissionStats(
  token: string,
  filters?: { startDate?: string; endDate?: string }
): Promise<CommissionStats> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  const queryString = params.toString();
  return request(`/commissions/stats${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchContractCommissions(
  token: string,
  filters?: {
    upstreamCustomer?: string;
    startDate?: string;
    endDate?: string;
    status?: CommissionStatus;
  }
): Promise<{ commissions: ContractCommission[] }> {
  const params = new URLSearchParams();
  if (filters?.upstreamCustomer) params.append("upstreamCustomer", filters.upstreamCustomer);
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.status) params.append("status", filters.status);
  const queryString = params.toString();
  return request(`/commissions${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchContractCommissionById(
  token: string,
  id: string
): Promise<{ commission: ContractCommission }> {
  return request(`/commissions/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createContractCommissionApi(
  token: string,
  payload: {
    contractNumber: string;
    upstreamCustomer: string;
    licensePlate: string;
    vehicleIncome: number;
    commissionRate: number;
    commissionAmount: number;
    status?: CommissionStatus;
  }
): Promise<{ commission: ContractCommission }> {
  return request("/commissions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateContractCommissionApi(
  token: string,
  id: string,
  payload: {
    contractNumber?: string;
    upstreamCustomer?: string;
    licensePlate?: string;
    vehicleIncome?: number;
    commissionRate?: number;
    commissionAmount?: number;
    status?: CommissionStatus;
    settlementTime?: string | null;
  }
): Promise<{ commission: ContractCommission }> {
  return request(`/commissions/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteContractCommissionApi(token: string, id: string): Promise<void> {
  await request(`/commissions/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function batchSettleCommissionsApi(token: string, ids: string[]): Promise<{ success: boolean }> {
  return request("/commissions/batch-settle", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ids })
  });
}

// Contract APIs

export async function fetchContracts(
  token: string,
  filters?: {
    type?: ContractType;
    funderId?: string;
    logisticsProviderId?: string;
  }
): Promise<{ contracts: Contract[] }> {
  const params = new URLSearchParams();
  if (filters?.type) params.append("type", filters.type);
  if (filters?.funderId) params.append("funderId", filters.funderId);
  if (filters?.logisticsProviderId) params.append("logisticsProviderId", filters.logisticsProviderId);
  const queryString = params.toString();
  return request(`/contracts${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchContractById(
  token: string,
  id: string
): Promise<{ contract: Contract }> {
  return request(`/contracts/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createFinancingContractApi(
  token: string,
  payload: {
    funderId: string;
    funderName: string;
    logisticsProviderId: string;
    logisticsProviderName: string;
    creditLimit?: number;
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
    contractFiles?: string[];
  }
): Promise<{ contract: Contract }> {
  return request("/contracts/financing", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function createBrokerageContractApi(
  token: string,
  payload: {
    logisticsProviderId: string;
    logisticsProviderName: string;
    upstreamShipper?: string;
    creditLimit?: number;
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
    contractFiles?: string[];
  }
): Promise<{ contract: Contract }> {
  return request("/contracts/brokerage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateContractStatusApi(
  token: string,
  id: string,
  status: "active" | "disabled" | "expiring_soon" | "expired"
): Promise<{ contract: Contract }> {
  return request(`/contracts/${id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status })
  });
}

export async function updateContractApi(
  token: string,
  id: string,
  payload: Partial<{
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
    commissionConfig: Array<{
      fieldKey: string;
      fieldLabel: string;
      mode: "percentage" | "fixed";
      value: number;
    }>;
    settlementCycle: "monthly" | "quarterly" | "biweekly";
    settlementTriggerDay: number;
    autoSettlement: boolean;
  }>
): Promise<{ contract: Contract }> {
  return request(`/contracts/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteContractApi(token: string, id: string): Promise<void> {
  await request(`/contracts/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Funder APIs
export async function fetchFunders(
  token: string,
  filters?: {
    institutionName?: string;
    contactPerson?: string;
    institutionType?: FunderType;
    status?: FunderStatus;
  }
): Promise<{ funders: Funder[] }> {
  const params = new URLSearchParams();
  if (filters?.institutionName) params.append("institutionName", filters.institutionName);
  if (filters?.contactPerson) params.append("contactPerson", filters.contactPerson);
  if (filters?.institutionType) params.append("institutionType", filters.institutionType);
  if (filters?.status) params.append("status", filters.status);
  const queryString = params.toString();
  return request(`/funders${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchFunderById(
  token: string,
  id: string
): Promise<{ funder: Funder }> {
  return request(`/funders/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createFunderApi(
  token: string,
  payload: {
    institutionName: string;
    institutionType: FunderType;
    unifiedSocialCreditCode: string;
    businessLicenseUrl?: string;
    businessLicenseName?: string;
    financialLicenseUrl?: string;
    financialLicenseName?: string;
    accountOpeningPermitUrl?: string;
    accountOpeningPermitName?: string;
    contactPerson?: string;
    contactPhone?: string;
    bankName?: string;
    bankAccount?: string;
    accountName?: string;
    cumulativeCreditLimit?: number;
  }
): Promise<{ funder: Funder }> {
  return request("/funders", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateFunderApi(
  token: string,
  id: string,
  payload: {
    institutionName?: string;
    institutionType?: FunderType;
    unifiedSocialCreditCode?: string;
    businessLicenseUrl?: string;
    businessLicenseName?: string;
    financialLicenseUrl?: string;
    financialLicenseName?: string;
    accountOpeningPermitUrl?: string;
    accountOpeningPermitName?: string;
    contactPerson?: string;
    contactPhone?: string;
    bankName?: string;
    bankAccount?: string;
    accountName?: string;
    cumulativeCreditLimit?: number;
    status?: FunderStatus;
  }
): Promise<{ funder: Funder }> {
  return request(`/funders/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteFunderApi(token: string, id: string): Promise<void> {
  await request(`/funders/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function uploadFileApi(
  token: string,
  file: File
): Promise<{ url: string; filename: string; originalName: string }> {
  const formData = new FormData();
  formData.append("file", file);
  
  const response = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || "文件上传失败");
  }
  
  return response.json();
}

// Financier APIs
export async function fetchFinanciers(
  token: string,
  filters?: {
    enterpriseName?: string;
    legalRepresentative?: string;
    region?: string;
    operatingScale?: FinancierScale;
    status?: FinancierStatus;
  }
): Promise<{ financiers: Financier[] }> {
  const params = new URLSearchParams();
  if (filters?.enterpriseName) params.append("enterpriseName", filters.enterpriseName);
  if (filters?.legalRepresentative) params.append("legalRepresentative", filters.legalRepresentative);
  if (filters?.region) params.append("region", filters.region);
  if (filters?.operatingScale) params.append("operatingScale", filters.operatingScale);
  if (filters?.status) params.append("status", filters.status);
  const queryString = params.toString();
  return request(`/financiers${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchFinancierById(
  token: string,
  id: string
): Promise<{ financier: Financier }> {
  return request(`/financiers/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createFinancierApi(
  token: string,
  payload: {
    enterpriseName: string;
    unifiedSocialCreditCode: string;
    legalRepresentative: string;
    businessAddress: string;
    region?: string;
    operatingScale: FinancierScale;
    businessLicenseUrl?: string;
    roadTransportLicenseUrl?: string;
    legalPersonIdCardUrl?: string;
    initialCreditAmount: number;
  }
): Promise<{ financier: Financier }> {
  return request("/financiers", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateFinancierApi(
  token: string,
  id: string,
  payload: {
    enterpriseName?: string;
    unifiedSocialCreditCode?: string;
    legalRepresentative?: string;
    businessAddress?: string;
    region?: string;
    operatingScale?: FinancierScale;
    businessLicenseUrl?: string;
    roadTransportLicenseUrl?: string;
    legalPersonIdCardUrl?: string;
    totalCreditLimit?: number;
    remainingCreditLimit?: number;
    status?: FinancierStatus;
  }
): Promise<{ financier: Financier }> {
  return request(`/financiers/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteFinancierApi(token: string, id: string): Promise<void> {
  await request(`/financiers/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// External System Configuration APIs
export async function fetchExternalSystems(
  token: string,
  financierId: string
): Promise<{ systems: ExternalSystemConfig[] }> {
  return request(`/financiers/${financierId}/external-systems`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchExternalSystemById(
  token: string,
  financierId: string,
  systemId: string
): Promise<{ system: ExternalSystemConfig }> {
  return request(`/financiers/${financierId}/external-systems/${systemId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createExternalSystemApi(
  token: string,
  financierId: string,
  payload: {
    systemName: string;
    systemId: string;
    apiEndpoint?: string;
    apiKey?: string;
    syncEnabled?: boolean;
    integrationType?: 'crawler' | 'api' | 'manual';
    crawlerType?: string;
    crawlerConfig?: Record<string, any>;
    syncIntervalMinutes?: number;
  }
): Promise<{ system: ExternalSystemConfig }> {
  return request(`/financiers/${financierId}/external-systems`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateExternalSystemApi(
  token: string,
  financierId: string,
  systemId: string,
  payload: {
    systemName?: string;
    systemId?: string;
    apiEndpoint?: string;
    apiKey?: string;
    syncEnabled?: boolean;
    integrationType?: 'crawler' | 'api' | 'manual';
    crawlerType?: string;
    crawlerConfig?: Record<string, any>;
    syncIntervalMinutes?: number;
  }
): Promise<{ system: ExternalSystemConfig }> {
  return request(`/financiers/${financierId}/external-systems/${systemId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

// Crawler Template APIs
export async function fetchCrawlerTemplates(
  token: string
): Promise<CrawlerTemplateMeta[]> {
  return request("/crawler-templates", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Trigger sync for external system
export async function triggerExternalSystemSync(
  token: string,
  externalSystemId: string
): Promise<{ success: boolean; message: string }> {
  return request(`/external-systems/${externalSystemId}/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Test connection for external system
export async function testExternalSystemConnection(
  token: string,
  externalSystemId: string
): Promise<{ success: boolean; message: string }> {
  return request(`/external-systems/${externalSystemId}/test-connection`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function deleteExternalSystemApi(
  token: string,
  financierId: string,
  systemId: string
): Promise<void> {
  await request(`/financiers/${financierId}/external-systems/${systemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Fund Pool Monitoring APIs
export async function fetchFundPoolMonitoring(
  token: string
): Promise<{ monitoring: FundPoolMonitoring }> {
  return request("/fund-pool/monitoring", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// System Parameters APIs
export async function fetchSystemParameters(
  token: string
): Promise<{ parameters: SystemParameters }> {
  return request("/system/parameters", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function updateSystemParametersApi(
  token: string,
  params: Partial<SystemParameters>
): Promise<{ parameters: SystemParameters }> {
  return request("/system/parameters", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(params)
  });
}

export async function resetSystemParametersApi(
  token: string
): Promise<{ parameters: SystemParameters }> {
  return request("/system/parameters/reset", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Waybill APIs
export async function fetchWaybillStats(token: string): Promise<WaybillStats> {
  return request("/waybills/stats", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export interface WaybillOverview {
  waybillCount: number;
  totalReceivable: number;
}

export async function fetchWaybillOverview(
  token: string,
  filters?: {
    customerName?: string;
    contractNumber?: string;
    businessMode?: BusinessMode;
    status?: WaybillStatus;
    batchStatus?: string;
    batchSource?: string;
    routeName?: string;
    startDate?: string;
    endDate?: string;
    areaId?: string;
    waybillNumber?: string;
    vehiclePlate?: string;
  }
): Promise<WaybillOverview> {
  const params = new URLSearchParams();
  if (filters?.customerName) params.append("customerName", filters.customerName);
  if (filters?.contractNumber) params.append("contractNumber", filters.contractNumber);
  if (filters?.businessMode) params.append("businessMode", filters.businessMode);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.batchStatus) params.append("batchStatus", filters.batchStatus);
  if (filters?.batchSource) params.append("batchSource", filters.batchSource);
  if (filters?.routeName) params.append("routeName", filters.routeName);
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.areaId) params.append("areaId", filters.areaId);
  if (filters?.waybillNumber) params.append("waybillNumber", filters.waybillNumber);
  if (filters?.vehiclePlate) params.append("vehiclePlate", filters.vehiclePlate);
  const queryString = params.toString();
  return request(`/waybills/overview${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchWaybills(
  token: string,
  filters?: {
    customerName?: string;
    contractNumber?: string;
    businessMode?: BusinessMode;
    status?: WaybillStatus;
    batchStatus?: string;
    batchSource?: string;
    routeName?: string;
    startDate?: string;
    endDate?: string;
    areaId?: string;
    waybillNumber?: string;
    vehiclePlate?: string;
  }
): Promise<{ waybills: Waybill[] }> {
  const params = new URLSearchParams();
  if (filters?.customerName) params.append("customerName", filters.customerName);
  if (filters?.contractNumber) params.append("contractNumber", filters.contractNumber);
  if (filters?.businessMode) params.append("businessMode", filters.businessMode);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.batchStatus) params.append("batchStatus", filters.batchStatus);
  if (filters?.batchSource) params.append("batchSource", filters.batchSource);
  if (filters?.routeName) params.append("routeName", filters.routeName);
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.areaId) params.append("areaId", filters.areaId);
  if (filters?.waybillNumber) params.append("waybillNumber", filters.waybillNumber);
  if (filters?.vehiclePlate) params.append("vehiclePlate", filters.vehiclePlate);
  const queryString = params.toString();
  return request(`/waybills${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchWaybillById(
  token: string,
  id: string
): Promise<{ waybill: Waybill }> {
  return request(`/waybills/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createWaybillApi(
  token: string,
  payload: {
    waybillNumber: string;
    customerId: string;
    customerName: string;
    contractId?: string;
    contractNumber?: string;
    businessMode: BusinessMode;
    vehiclePlate: string;
    driverName: string;
    driverPhone?: string;
    departurePlace: string;
    arrivalPlace: string;
    goodsName: string;
    goodsWeight?: number;
    freightAmount?: number;
    oilCardAmount?: number;
    etcAmount?: number;
    cashAmount?: number;
    waybillDate: string;
    remark?: string;
  }
): Promise<{ waybill: Waybill }> {
  return request("/waybills", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateWaybillApi(
  token: string,
  id: string,
  payload: {
    customerId?: string;
    customerName?: string;
    contractId?: string;
    contractNumber?: string;
    businessMode?: BusinessMode;
    vehiclePlate?: string;
    driverName?: string;
    driverPhone?: string;
    departurePlace?: string;
    arrivalPlace?: string;
    goodsName?: string;
    goodsWeight?: number;
    freightAmount?: number;
    oilCardAmount?: number;
    etcAmount?: number;
    cashAmount?: number;
    waybillDate?: string;
    status?: WaybillStatus;
    remark?: string;
  }
): Promise<{ waybill: Waybill }> {
  return request(`/waybills/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteWaybillApi(token: string, id: string): Promise<void> {
  await request(`/waybills/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function importWaybillsApi(
  token: string,
  data: {
    waybills: any[];
    customerId?: string;  // 平台用户上传时需要指定
  }
): Promise<{ success: number; failed: number; errors: string[] }> {
  return request("/waybills/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });
}

// Settlement Types
export type SettlementType = "financing_repayment" | "commission" | "profit_sharing";
export type SettlementStatus = "pending" | "confirmed" | "paid" | "invoiced" | "settled" | "overdue";

export interface SettlementDetail {
  fieldKey: string;
  fieldLabel: string;
  amount: number;
}

export interface Settlement {
  id: string;
  settlementNumber: string;
  type: SettlementType;
  contractId: string;
  contractType: string;
  customerId: string;
  customerName: string;
  periodStart: string;
  periodEnd: string;
  repaymentType?: "principal" | "interest";
  principal?: number;
  interest?: number;
  totalDue?: number;
  waybillCount?: number;
  totalAmount?: number;
  details?: SettlementDetail[];
  status: SettlementStatus;
  dueDate: string;
  paymentProofUrl?: string;
  paidDate?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  invoiceRemark?: string;
  invoiceAttachmentUrl?: string;
  settledDate?: string;
  localPartnerName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementStats {
  pendingCount: number;
  pendingAmount: number;
  settledCount: number;
  settledAmount: number;
  overdueCount: number;
  overdueAmount: number;
}

// Settlement APIs
export async function fetchSettlementStats(
  token: string,
  filters?: { type?: SettlementType }
): Promise<SettlementStats> {
  const params = new URLSearchParams();
  if (filters?.type) params.append("type", filters.type);
  const queryString = params.toString();
  return request(`/settlements/stats${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchSettlements(
  token: string,
  filters?: {
    type?: SettlementType;
    status?: SettlementStatus;
    customerId?: string;
    contractId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<{ settlements: Settlement[] }> {
  const params = new URLSearchParams();
  if (filters?.type) params.append("type", filters.type);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.customerId) params.append("customerId", filters.customerId);
  if (filters?.contractId) params.append("contractId", filters.contractId);
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  const queryString = params.toString();
  return request(`/settlements${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchSettlementById(
  token: string,
  id: string
): Promise<{ settlement: Settlement }> {
  return request(`/settlements/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createSettlementApi(
  token: string,
  payload: {
    type: SettlementType;
    contractId: string;
    contractType: string;
    customerId: string;
    customerName: string;
    periodStart: string;
    periodEnd: string;
    repaymentType?: "principal" | "interest";
    principal?: number;
    interest?: number;
    totalDue?: number;
    waybillCount?: number;
    totalAmount?: number;
    details?: SettlementDetail[];
    dueDate: string;
  }
): Promise<{ settlement: Settlement }> {
  return request("/settlements", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function confirmSettlementApi(
  token: string,
  id: string
): Promise<{ settlement: Settlement }> {
  return request(`/settlements/${id}/confirm`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function settleSettlementApi(
  token: string,
  id: string
): Promise<{ settlement: Settlement }> {
  return request(`/settlements/${id}/settle`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function markSettlementPaidApi(
  token: string,
  id: string,
  paymentProofUrl?: string
): Promise<{ settlement: Settlement }> {
  return request(`/settlements/${id}/mark-paid`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ paymentProofUrl }),
  });
}

export async function registerSettlementInvoiceApi(
  token: string,
  id: string,
  data: { invoiceNumber: string; invoiceDate: string; invoiceAmount: number; invoiceRemark?: string; invoiceAttachmentUrl?: string }
): Promise<{ settlement: Settlement }> {
  return request(`/settlements/${id}/register-invoice`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function generateFinancingRepaymentSettlementApi(
  token: string,
  payload: {
    contractId: string;
    contractType?: string;
    customerId: string;
    customerName: string;
    periodStart: string;
    periodEnd: string;
    repaymentType: "principal" | "interest";
    principal?: number;
    interest?: number;
    annualInterestRate?: number;
    usedAmount?: number;
    daysInPeriod?: number;
    annualDays?: 360 | 365;
  }
): Promise<{ settlement: Settlement }> {
  return request("/settlements/generate/financing-repayment", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function generateCommissionSettlementApi(
  token: string,
  payload: {
    type: "commission" | "profit_sharing";
    contractId: string;
    contractType?: string;
    customerId: string;
    customerName: string;
    periodStart: string;
    periodEnd: string;
    waybillCount?: number;
    details?: SettlementDetail[];
  }
): Promise<{ settlement: Settlement }> {
  return request("/settlements/generate/commission", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateOverdueSettlementsApi(
  token: string
): Promise<{ success: boolean; updatedCount: number }> {
  return request("/settlements/update-overdue", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// =============================================
// 抽成合同 (Commission Contracts) API
// =============================================

export interface CommissionConfigItem {
  fieldKey: string;
  fieldLabel: string;
  mode: "percentage" | "fixed";
  value: number;
}

export type CommissionContractStatus = "active" | "expiring_soon" | "expired" | "disabled";

export interface ContractRoute {
  id: string;
  contractId: string;
  routeId: string;
  routeName?: string;
  areaName?: string;
  localPartnerName?: string;
  createdAt: string;
}

export interface CommissionContract {
  id: string;
  contractName?: string;
  customerName: string;
  financierId?: string;
  customerSystemId?: string;
  startDate: string;
  endDate: string;
  settlementCycle?: "monthly" | "biweekly" | "weekly";
  settlementDay?: number;
  remark?: string;
  commissionConfig: CommissionConfigItem[];
  status: CommissionContractStatus;
  createdAt: string;
  updatedAt: string;
  routes?: ContractRoute[];
}

export interface CommissionContractStats {
  totalCount: number;
  activeCount: number;
  totalConfigCount: number;
  avgRatio: number;
  localPartnerCount: number;
  routeCount: number;
}

export async function fetchCommissionContracts(
  token: string,
  params?: { status?: CommissionContractStatus; customerName?: string }
): Promise<{ contracts: CommissionContract[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.append("status", params.status);
  if (params?.customerName) searchParams.append("customerName", params.customerName);
  
  const query = searchParams.toString();
  return request(`/commission-contracts${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchCommissionContractById(
  token: string,
  id: string
): Promise<{ contract: CommissionContract }> {
  return request(`/commission-contracts/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchCommissionContractStats(
  token: string
): Promise<CommissionContractStats> {
  return request("/commission-contracts/stats", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createCommissionContractApi(
  token: string,
  payload: {
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
    routeIds?: string[];
  }
): Promise<{ contract: CommissionContract }> {
  return request("/commission-contracts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateCommissionContractApi(
  token: string,
  id: string,
  payload: Partial<{
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
    routeIds: string[];
  }>
): Promise<{ contract: CommissionContract }> {
  return request(`/commission-contracts/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteCommissionContractApi(
  token: string,
  id: string
): Promise<{ success: boolean }> {
  return request(`/commission-contracts/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// =============================================
// 定向支付申请 API
// =============================================

// 获取支付申请统计
export async function fetchPaymentRequestStats(
  token: string,
  filters?: { contractId?: string; startDate?: string; endDate?: string }
): Promise<PaymentRequestStats> {
  const params = new URLSearchParams();
  if (filters?.contractId) params.append("contractId", filters.contractId);
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  const queryString = params.toString();
  return request(`/directed-pay/requests/stats${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取待审批列表
export async function fetchPendingApprovals(
  token: string,
  type: "platform" | "funder"
): Promise<{ requests: DirectedPaymentRequest[] }> {
  return request(`/directed-pay/requests/pending-approvals?type=${type}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取运单可申请的费用类别
export interface AvailablePaymentCategory {
  id: string;
  contractId: string;
  categoryCode: string;
  categoryName: string;
  paymentRatio: number;
  minAmount?: number;
  maxAmount?: number;
  unlockStatus: string;
  isUnlocked: boolean;
}

export async function fetchAvailableCategories(
  token: string,
  waybillId: string
): Promise<{ categories: AvailablePaymentCategory[] }> {
  return request(`/waybills/${waybillId}/available-categories`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取支付申请列表
export async function fetchPaymentRequests(
  token: string,
  filters?: {
    contractId?: string;
    waybillId?: string;
    status?: PaymentRequestStatus;
    driverId?: string;
    categoryCode?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<{ requests: DirectedPaymentRequest[] }> {
  const params = new URLSearchParams();
  if (filters?.contractId) params.append("contractId", filters.contractId);
  if (filters?.waybillId) params.append("waybillId", filters.waybillId);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.driverId) params.append("driverId", filters.driverId);
  if (filters?.categoryCode) params.append("categoryCode", filters.categoryCode);
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  const queryString = params.toString();
  return request(`/directed-pay/requests${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取支付申请详情
export async function fetchPaymentRequestById(
  token: string,
  id: string
): Promise<{ request: DirectedPaymentRequest }> {
  return request(`/directed-pay/requests/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 创建支付申请
export async function createPaymentRequestApi(
  token: string,
  payload: {
    contractId: string;
    waybillId?: string;
    waybillNumber?: string;
    categoryCode: string;
    categoryName: string;
    paymentAmount: number;
    serviceFee?: number;
    receiverType: ReceiverType;
    receiverName?: string;
    receiverAccount?: string;
    receiverBank?: string;
    driverId?: string;
    driverName?: string;
    driverPhone?: string;
    remark?: string;
    skipApproval?: boolean;
  }
): Promise<{ request: DirectedPaymentRequest }> {
  return request("/directed-pay/requests", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

// 批量创建支付申请
export async function batchCreatePaymentRequestsApi(
  token: string,
  requests: Array<{
    contractId: string;
    waybillId?: string;
    waybillNumber?: string;
    categoryCode: string;
    categoryName: string;
    paymentAmount: number;
    serviceFee?: number;
    receiverType: ReceiverType;
    receiverName?: string;
    receiverAccount?: string;
    receiverBank?: string;
    driverId?: string;
    driverName?: string;
    driverPhone?: string;
    remark?: string;
    skipApproval?: boolean;
  }>
): Promise<{ requests: DirectedPaymentRequest[]; count: number }> {
  return request("/directed-pay/requests/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ requests })
  });
}

// 平台审批通过
export async function platformApproveApi(
  token: string,
  id: string,
  remark?: string
): Promise<{ request: DirectedPaymentRequest }> {
  return request(`/directed-pay/requests/${id}/platform-approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ remark })
  });
}

// 平台审批拒绝
export async function platformRejectApi(
  token: string,
  id: string,
  remark?: string
): Promise<{ request: DirectedPaymentRequest }> {
  return request(`/directed-pay/requests/${id}/platform-reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ remark })
  });
}

// 资金方审批通过
export async function funderApproveApi(
  token: string,
  id: string,
  remark?: string
): Promise<{ request: DirectedPaymentRequest }> {
  return request(`/directed-pay/requests/${id}/funder-approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ remark })
  });
}

// 资金方审批拒绝
export async function funderRejectApi(
  token: string,
  id: string,
  remark?: string
): Promise<{ request: DirectedPaymentRequest }> {
  return request(`/directed-pay/requests/${id}/funder-reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ remark })
  });
}

// 取消支付申请
export async function cancelPaymentRequestApi(
  token: string,
  id: string
): Promise<{ request: DirectedPaymentRequest }> {
  return request(`/directed-pay/requests/${id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 执行支付
export async function executePaymentApi(
  token: string,
  id: string
): Promise<{ request: DirectedPaymentRequest }> {
  return request(`/directed-pay/requests/${id}/execute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// =============================================
// 定向支付结算 API
// =============================================

export type DirectedPaySettlementStatus = "pending" | "confirmed" | "partial_paid" | "paid" | "overdue";

export interface DirectedPaySettlement {
  id: string;
  settlementNumber: string;
  contractId: string;
  contractNumber?: string;
  financierName?: string;
  periodStart: string;
  periodEnd: string;
  paymentCount: number;
  principalAmount: number;
  interestAmount: number;
  serviceAmount: number;
  totalAmount: number;
  dueDate: string;
  actualPaidAmount: number;
  paidAt?: string;
  status: DirectedPaySettlementStatus;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DirectedPaySettlementItem {
  id: string;
  settlementId: string;
  paymentRequestId: string;
  paymentAmount: number;
  paymentTime: string;
  interestDays: number;
  interestAmount: number;
  serviceFee: number;
  createdAt: string;
}

export interface DirectedPaySettlementStats {
  totalPending: number;
  totalConfirmed: number;
  totalPaid: number;
  totalOverdue: number;
  totalAmount: number;
  totalPaidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
}

export async function fetchDirectedPaySettlementStats(
  token: string,
  contractId?: string
): Promise<DirectedPaySettlementStats> {
  const params = new URLSearchParams();
  if (contractId) params.append("contractId", contractId);
  const queryString = params.toString();
  return request(`/directed-pay/settlements/stats${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchDirectedPaySettlements(
  token: string,
  filters?: {
    contractId?: string;
    financierId?: string;
    status?: DirectedPaySettlementStatus;
    startDate?: string;
    endDate?: string;
  }
): Promise<{ settlements: DirectedPaySettlement[] }> {
  const params = new URLSearchParams();
  if (filters?.contractId) params.append("contractId", filters.contractId);
  if (filters?.financierId) params.append("financierId", filters.financierId);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  const queryString = params.toString();
  return request(`/directed-pay/settlements${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchDirectedPaySettlementById(
  token: string,
  id: string
): Promise<{ settlement: DirectedPaySettlement; items: DirectedPaySettlementItem[] }> {
  return request(`/directed-pay/settlements/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function generateDirectedPaySettlement(
  token: string,
  payload: { contractId: string; periodEnd: string }
): Promise<{ settlement: DirectedPaySettlement }> {
  return request("/directed-pay/settlements/generate", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function confirmDirectedPaySettlementApi(
  token: string,
  id: string
): Promise<{ settlement: DirectedPaySettlement }> {
  return request(`/directed-pay/settlements/${id}/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function payDirectedPaySettlementApi(
  token: string,
  id: string,
  amount: number
): Promise<{ settlement: DirectedPaySettlement }> {
  return request(`/directed-pay/settlements/${id}/pay`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount })
  });
}

export async function updateOverdueDirectedPaySettlementsApi(
  token: string
): Promise<{ success: boolean; updatedCount: number }> {
  return request("/directed-pay/settlements/update-overdue", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function calculateInterestApi(
  token: string,
  payload: {
    principal: number;
    annualRate: number;
    paymentTime: string;
    settlementTime: string;
    calcBase?: number;
  }
): Promise<{ days: number; interest: number }> {
  return request("/directed-pay/calculate-interest", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

// =============================================
// 定向支付合同 API
// =============================================

export type DirectedPayContractStatus = 
  | "draft" | "pending_approval" | "active" | "suspended" | "expired" | "terminated";

export interface DirectedPayContract {
  id: string;
  contractNumber: string;
  funderId: string;
  funderName?: string;
  financierId: string;
  financierName?: string;
  funderAccountId?: string;
  creditLimit: number;
  usedAmount: number;
  availableAmount: number;
  annualInterestRate: number;
  interestCalcBase: number;
  startDate: string;
  endDate: string;
  settlementCycle: "monthly" | "biweekly" | "weekly";
  settlementDay: number;
  gracePeriodDays: number;
  autoPaymentEnabled: boolean;
  status: DirectedPayContractStatus;
  remark?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentCategoryConfig {
  id: string;
  contractId: string;
  categoryCode: string;
  categoryName: string;
  paymentRatio: number;  // 支付比例 (0-100)，如80表示最多支付原始金额的80%
  minAmount?: number;
  maxAmount?: number;
  dailyLimit?: number;
  requirePlatformApproval: boolean;
  requireFunderApproval: boolean;
  platformApprovalThreshold?: number;
  funderApprovalThreshold?: number;
  autoPaymentEnabled: boolean;
  isEnabled: boolean;
  createdAt: string;
}

export interface DirectedPayContractStats {
  totalCount: number;
  activeCount: number;
  suspendedCount: number;
  expiredCount: number;
  totalCreditLimit: number;
  totalUsedAmount: number;
  totalAvailableAmount: number;
}

// 获取定向支付合同列表
export async function fetchDirectedPayContracts(
  token: string,
  filters?: {
    funderId?: string;
    financierId?: string;
    status?: DirectedPayContractStatus;
    keyword?: string;
  }
): Promise<{ contracts: DirectedPayContract[] }> {
  const params = new URLSearchParams();
  if (filters?.funderId) params.append("funderId", filters.funderId);
  if (filters?.financierId) params.append("financierId", filters.financierId);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.keyword) params.append("keyword", filters.keyword);
  
  const query = params.toString();
  return request(`/directed-pay/contracts${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取定向支付合同详情
export async function fetchDirectedPayContractById(
  token: string,
  id: string
): Promise<{ contract: DirectedPayContract }> {
  return request(`/directed-pay/contracts/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取定向支付合同统计
export async function fetchDirectedPayContractStats(
  token: string
): Promise<DirectedPayContractStats> {
  return request(`/directed-pay/contracts/stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 创建定向支付合同
export async function createDirectedPayContractApi(
  token: string,
  payload: {
    funderId: string;
    financierId: string;
    funderAccountId?: string;
    creditLimit: number;
    annualInterestRate: number;
    interestCalcBase?: number;
    startDate: string;
    endDate: string;
    settlementCycle: "monthly" | "biweekly" | "weekly";
    settlementDay: number;
    gracePeriodDays?: number;
    remark?: string;
  }
): Promise<{ contract: DirectedPayContract }> {
  return request(`/directed-pay/contracts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

// 更新定向支付合同
export async function updateDirectedPayContractApi(
  token: string,
  id: string,
  payload: Partial<{
    funderAccountId: string;
    creditLimit: number;
    annualInterestRate: number;
    endDate: string;
    settlementCycle: "monthly" | "biweekly" | "weekly";
    settlementDay: number;
    gracePeriodDays: number;
    autoPaymentEnabled: boolean;
    remark: string;
  }>
): Promise<{ contract: DirectedPayContract }> {
  return request(`/directed-pay/contracts/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

// 删除定向支付合同
export async function deleteDirectedPayContractApi(
  token: string,
  id: string
): Promise<{ success: boolean }> {
  return request(`/directed-pay/contracts/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 更新定向支付合同状态
export async function updateDirectedPayContractStatus(
  token: string,
  id: string,
  action: "approve" | "submit" | "suspend" | "resume" | "terminate"
): Promise<{ success: boolean }> {
  return request(`/directed-pay/contracts/${id}/${action}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取支付类别模板
export async function fetchPaymentCategoryTemplates(
  token: string
): Promise<{ templates: { code: string; name: string }[] }> {
  return request(`/directed-pay/category-templates`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取合同的支付类别配置
export async function fetchPaymentCategoriesByContract(
  token: string,
  contractId: string
): Promise<{ categories: PaymentCategoryConfig[] }> {
  return request(`/directed-pay/contracts/${contractId}/categories`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 添加支付类别
export async function addPaymentCategoryApi(
  token: string,
  contractId: string,
  payload: {
    categoryCode: string;
    categoryName: string;
    paymentRatio?: number;  // 支付比例 (0-100)
    minAmount?: number;
    maxAmount?: number;
    dailyLimit?: number;
    requirePlatformApproval?: boolean;
    requireFunderApproval?: boolean;
    platformApprovalThreshold?: number;
    funderApprovalThreshold?: number;
    autoPaymentEnabled?: boolean;
    unlockStatus?: string;  // 解锁状态
  }
): Promise<{ category: PaymentCategoryConfig }> {
  return request(`/directed-pay/contracts/${contractId}/categories`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

// 更新支付类别
export async function updatePaymentCategoryApi(
  token: string,
  contractId: string,
  categoryId: string,
  payload: Partial<{
    categoryName: string;
    paymentRatio: number;  // 支付比例 (0-100)
    minAmount: number | null;
    maxAmount: number | null;
    dailyLimit: number | null;
    requirePlatformApproval: boolean;
    requireFunderApproval: boolean;
    platformApprovalThreshold: number | null;
    funderApprovalThreshold: number | null;
    autoPaymentEnabled: boolean;
    isEnabled: boolean;
    unlockStatus: string;  // 解锁状态
  }>
): Promise<{ category: PaymentCategoryConfig }> {
  return request(`/directed-pay/contracts/${contractId}/categories/${categoryId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

// 删除支付类别
export async function deletePaymentCategoryApi(
  token: string,
  contractId: string,
  categoryId: string
): Promise<{ success: boolean }> {
  return request(`/directed-pay/contracts/${contractId}/categories/${categoryId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// =============================================
// 爬虫配置 API (Crawler Configuration)
// =============================================

// 获取爬虫配置列表
export async function fetchCrawlerConfigs(
  token: string,
  financierId: string
): Promise<{ configs: CrawlerConfig[] }> {
  return request(`/crawlers?financierId=${financierId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取单个爬虫配置
export async function fetchCrawlerConfigById(
  token: string,
  id: string
): Promise<{ config: CrawlerConfig }> {
  return request(`/crawlers/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 创建爬虫配置
export async function createCrawlerConfigApi(
  token: string,
  payload: {
    financierId: string;
    name: string;
    systemUrl: string;
    apiEndpoint: string;
    cookies: string;
    companyId?: string;
    userId?: string;
    groupId?: string;
    syncIntervalMinutes: number;
    syncEnabled: boolean;
  }
): Promise<{ config: CrawlerConfig }> {
  return request('/crawlers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

// 更新爬虫配置
export async function updateCrawlerConfigApi(
  token: string,
  id: string,
  payload: Partial<{
    name: string;
    systemUrl: string;
    apiEndpoint: string;
    cookies: string;
    companyId: string;
    userId: string;
    groupId: string;
    syncIntervalMinutes: number;
    syncEnabled: boolean;
  }>
): Promise<{ config: CrawlerConfig }> {
  return request(`/crawlers/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

// 删除爬虫配置
export async function deleteCrawlerConfigApi(
  token: string,
  id: string
): Promise<void> {
  await request(`/crawlers/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 测试爬虫连接（新配置测试）
export async function testCrawlerConnectionApi(
  token: string,
  payload: {
    systemUrl: string;
    apiEndpoint: string;
    cookies: string;
    companyId?: string;
    userId?: string;
    groupId?: string;
  }
): Promise<CrawlerTestResult> {
  return request('/crawlers/test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

// 测试已有配置的连接
export async function testExistingCrawlerConnectionApi(
  token: string,
  id: string
): Promise<CrawlerTestResult> {
  return request(`/crawlers/${id}/test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 手动触发同步
export async function triggerCrawlerSyncApi(
  token: string,
  id: string
): Promise<CrawlerSyncResult> {
  return request(`/crawlers/${id}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取同步日志
export async function fetchCrawlerLogsApi(
  token: string,
  configId: string,
  limit?: number
): Promise<{ logs: CrawlerSyncLog[] }> {
  const params = new URLSearchParams();
  if (limit) params.append("limit", limit.toString());
  const queryString = params.toString();
  return request(`/crawlers/${configId}/logs${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// =============================================
// 平台收益管理 API
// =============================================

// 收益来源类型
export type RevenueSourceType = 
  | 'financing_interest'      // 三方融资利息
  | 'directed_pay_interest'   // 定向支付利息
  | 'brokerage_commission'    // 撮合业务抽成
  | 'commission_fee'          // 抽成合同费用
  | 'waybill_commission';     // 运单平台抽成

// 收益状态
export type RevenueStatus = 'pending' | 'confirmed' | 'reconciling' | 'reconciled' | 'settled' | 'accounted';

// 收益统计
export interface RevenueStats {
  totalRevenue: number;         // 总收益
  confirmedRevenue: number;     // 已确认
  pendingRevenue: number;       // 待确认
  estimatedRevenue: number;     // 预估(未来30天)
  periodRevenue: number;        // 本期新增
  // 扩展字段 - 收益增长分析
  growthRate?: number;          // 环比增长率(%)
  dailyAverage?: number;        // 日均收益
  settledRevenue?: number;      // 已结算收益
  unsettledRevenue?: number;    // 待结算收益
  // 扩展字段 - 业务增长指标
  activeContracts?: number;     // 有效合同数
  newContractsPeriod?: number;  // 本期新增合同数
  activeFunders?: number;       // 活跃资金方数
  newFundersPeriod?: number;    // 本期新增资金方
  activeFinanciers?: number;    // 活跃融资方数
  newFinanciersPeriod?: number; // 本期新增融资方
  periodWaybills?: number;      // 本期运单量
  periodTotalWeight?: number;   // 本期总吨位
  periodActiveRoutes?: number;  // 本期活跃线路数
  conversionRate?: number;      // 收益转化率(收益/在投金额)
}

// 收益趋势数据点
export interface RevenueTrendPoint {
  date: string;
  amount: number;
  confirmedAmount: number;
  pendingAmount: number;
}

export interface OperationTrendPoint {
  date: string;
  waybillCount: number;
  totalWeight: number;
  activeRoutes: number;
}

// 收益构成
export interface RevenueComposition {
  sourceType: RevenueSourceType;
  sourceName: string;
  amount: number;
  percentage: number;
}

// 排行榜项
export interface RevenueRankItem {
  id: string;
  name: string;
  amount: number;
  count: number;
}

// 收益记录
export interface RevenueRecord {
  id: string;
  recordType: 'revenue' | 'expense';
  sourceType: RevenueSourceType;
  contractId: string;
  contractNumber?: string;
  funderId?: string;
  funderName?: string;
  financierId?: string;
  financierName?: string;
  amount: number;
  principalAmount?: number;
  rate?: number;
  revenueDate: string;
  status: RevenueStatus;
  remark?: string;
  vehiclePlate?: string;
  driverName?: string;
  subFinancier?: string;
  commissionContractId?: string;
  routeId?: string;
  areaName?: string;
  localPartnerName?: string;
  routeName?: string;
  createdAt: string;
}

// 获取平台收益统计
export async function fetchPlatformRevenueStats(
  token: string,
  filters?: { startDate?: string; endDate?: string; dateMode?: 'revenue' | 'business' }
): Promise<RevenueStats> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.dateMode) params.append("dateMode", filters.dateMode);
  const queryString = params.toString();
  return request(`/revenue/platform/stats${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取平台收益明细列表
export async function fetchPlatformRevenueList(
  token: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    sourceType?: RevenueSourceType;
    funderId?: string;
    financierId?: string;
    financierName?: string;
    status?: RevenueStatus;
    subFinancier?: string;
    commissionContractId?: string;
    localPartnerId?: string;
    areaId?: string;
    useWaybillDate?: boolean;
    page?: number;
    pageSize?: number;
  }
): Promise<{ records: RevenueRecord[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.sourceType) params.append("sourceType", filters.sourceType);
  if (filters?.funderId) params.append("funderId", filters.funderId);
  if (filters?.financierId) params.append("financierId", filters.financierId);
  if (filters?.financierName) params.append("financierName", filters.financierName);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.subFinancier) params.append("subFinancier", filters.subFinancier);
  if (filters?.commissionContractId) params.append("commissionContractId", filters.commissionContractId);
  if (filters?.localPartnerId) params.append("localPartnerId", filters.localPartnerId);
  if (filters?.areaId) params.append("areaId", filters.areaId);
  if (filters?.useWaybillDate) params.append("useWaybillDate", "true");
  if (filters?.page) params.append("page", filters.page.toString());
  if (filters?.pageSize) params.append("pageSize", filters.pageSize.toString());
  const queryString = params.toString();
  return request(`/revenue/platform/list${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取平台收益趋势
export async function fetchPlatformRevenueTrend(
  token: string,
  filters: { startDate: string; endDate: string; groupBy?: 'day' | 'week' | 'month' | 'year'; dateMode?: 'revenue' | 'business' }
): Promise<{ trend: RevenueTrendPoint[] }> {
  const params = new URLSearchParams();
  params.append("startDate", filters.startDate);
  params.append("endDate", filters.endDate);
  if (filters.groupBy) params.append("groupBy", filters.groupBy);
  if (filters.dateMode) params.append("dateMode", filters.dateMode);
  return request(`/revenue/platform/trend?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchPlatformOperationTrend(
  token: string,
  filters: { startDate: string; endDate: string; groupBy?: 'day' | 'week' | 'month' | 'year' }
): Promise<{ trend: OperationTrendPoint[] }> {
  const params = new URLSearchParams();
  params.append("startDate", filters.startDate);
  params.append("endDate", filters.endDate);
  if (filters.groupBy) params.append("groupBy", filters.groupBy);
  return request(`/revenue/platform/operation-trend?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取平台收益构成
export async function fetchPlatformRevenueComposition(
  token: string,
  filters?: { startDate?: string; endDate?: string; dateMode?: 'revenue' | 'business' }
): Promise<{ composition: RevenueComposition[] }> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.dateMode) params.append("dateMode", filters.dateMode);
  const queryString = params.toString();
  return request(`/revenue/platform/composition${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取资金方收益排行
export async function fetchPlatformRevenueFunderRanking(
  token: string,
  filters?: { startDate?: string; endDate?: string; limit?: number; dateMode?: 'revenue' | 'business' }
): Promise<{ ranking: RevenueRankItem[] }> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.limit) params.append("limit", filters.limit.toString());
  if (filters?.dateMode) params.append("dateMode", filters.dateMode);
  const queryString = params.toString();
  return request(`/revenue/platform/ranking/funders${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取融资方收益排行
export async function fetchPlatformRevenueFinancierRanking(
  token: string,
  filters?: { startDate?: string; endDate?: string; limit?: number; dateMode?: 'revenue' | 'business' }
): Promise<{ ranking: RevenueRankItem[] }> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.limit) params.append("limit", filters.limit.toString());
  if (filters?.dateMode) params.append("dateMode", filters.dateMode);
  const queryString = params.toString();
  return request(`/revenue/platform/ranking/financiers${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 导出平台收益
export function getPlatformRevenueExportUrl(
  token: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    sourceType?: RevenueSourceType;
    funderId?: string;
    financierId?: string;
    status?: RevenueStatus;
  }
): string {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.sourceType) params.append("sourceType", filters.sourceType);
  if (filters?.funderId) params.append("funderId", filters.funderId);
  if (filters?.financierId) params.append("financierId", filters.financierId);
  if (filters?.status) params.append("status", filters.status);
  const queryString = params.toString();
  return `${API_BASE}/revenue/platform/export${queryString ? `?${queryString}` : ""}`;
}

// =============================================
// 融资方支出管理 API
// =============================================

// 获取融资方支出统计
export async function fetchFinancierExpenseStats(
  token: string,
  filters?: { startDate?: string; endDate?: string }
): Promise<RevenueStats> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  const queryString = params.toString();
  return request(`/expense/financier/stats${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取融资方支出明细列表
export async function fetchFinancierExpenseList(
  token: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    sourceType?: RevenueSourceType;
    funderId?: string;
    status?: RevenueStatus;
    page?: number;
    pageSize?: number;
  }
): Promise<{ records: RevenueRecord[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.sourceType) params.append("sourceType", filters.sourceType);
  if (filters?.funderId) params.append("funderId", filters.funderId);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.page) params.append("page", filters.page.toString());
  if (filters?.pageSize) params.append("pageSize", filters.pageSize.toString());
  const queryString = params.toString();
  return request(`/expense/financier/list${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取融资方支出趋势
export async function fetchFinancierExpenseTrend(
  token: string,
  filters: { startDate: string; endDate: string; groupBy?: 'day' | 'week' | 'month' | 'year' }
): Promise<{ trend: RevenueTrendPoint[] }> {
  const params = new URLSearchParams();
  params.append("startDate", filters.startDate);
  params.append("endDate", filters.endDate);
  if (filters.groupBy) params.append("groupBy", filters.groupBy);
  return request(`/expense/financier/trend?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取融资方支出构成
export async function fetchFinancierExpenseComposition(
  token: string,
  filters?: { startDate?: string; endDate?: string }
): Promise<{ composition: RevenueComposition[] }> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  const queryString = params.toString();
  return request(`/expense/financier/composition${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取融资方合作资金方排行
export async function fetchFinancierFunderRanking(
  token: string,
  filters?: { startDate?: string; endDate?: string; limit?: number }
): Promise<{ ranking: RevenueRankItem[] }> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.limit) params.append("limit", filters.limit.toString());
  const queryString = params.toString();
  return request(`/expense/financier/ranking/funders${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 导出融资方支出
export function getFinancierExpenseExportUrl(
  token: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    sourceType?: RevenueSourceType;
    funderId?: string;
    status?: RevenueStatus;
  }
): string {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.sourceType) params.append("sourceType", filters.sourceType);
  if (filters?.funderId) params.append("funderId", filters.funderId);
  if (filters?.status) params.append("status", filters.status);
  const queryString = params.toString();
  return `${API_BASE}/expense/financier/export${queryString ? `?${queryString}` : ""}`;
}

// =============================================
// 资金方收益 API
// =============================================

// 获取资金方收益统计
export async function fetchFunderRevenueStats(
  token: string,
  filters?: { startDate?: string; endDate?: string }
): Promise<RevenueStats> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  const queryString = params.toString();
  return request(`/revenue/funder/stats${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取资金方收益明细列表
export async function fetchFunderRevenueList(
  token: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    sourceType?: RevenueSourceType;
    financierId?: string;
    status?: RevenueStatus;
    page?: number;
    pageSize?: number;
  }
): Promise<{ records: RevenueRecord[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.sourceType) params.append("sourceType", filters.sourceType);
  if (filters?.financierId) params.append("financierId", filters.financierId);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.page) params.append("page", filters.page.toString());
  if (filters?.pageSize) params.append("pageSize", filters.pageSize.toString());
  const queryString = params.toString();
  return request(`/revenue/funder/list${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取资金方收益趋势
export async function fetchFunderRevenueTrend(
  token: string,
  filters: { startDate: string; endDate: string; groupBy?: 'day' | 'week' | 'month' | 'year' }
): Promise<{ trend: RevenueTrendPoint[] }> {
  const params = new URLSearchParams();
  params.append("startDate", filters.startDate);
  params.append("endDate", filters.endDate);
  if (filters.groupBy) params.append("groupBy", filters.groupBy);
  return request(`/revenue/funder/trend?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取资金方收益构成
export async function fetchFunderRevenueComposition(
  token: string,
  filters?: { startDate?: string; endDate?: string }
): Promise<{ composition: RevenueComposition[] }> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  const queryString = params.toString();
  return request(`/revenue/funder/composition${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 获取资金方合作融资方排行
export async function fetchFunderFinancierRanking(
  token: string,
  filters?: { startDate?: string; endDate?: string; limit?: number }
): Promise<{ ranking: RevenueRankItem[] }> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.limit) params.append("limit", filters.limit.toString());
  const queryString = params.toString();
  return request(`/revenue/funder/ranking/financiers${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 导出资金方收益
export function getFunderRevenueExportUrl(
  filters?: {
    startDate?: string;
    endDate?: string;
    sourceType?: RevenueSourceType;
    financierId?: string;
    status?: RevenueStatus;
  }
): string {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.sourceType) params.append("sourceType", filters.sourceType);
  if (filters?.financierId) params.append("financierId", filters.financierId);
  if (filters?.status) params.append("status", filters.status);
  const queryString = params.toString();
  return `${API_BASE}/revenue/funder/export${queryString ? `?${queryString}` : ""}`;
}

// =============================================
// 落地合作方 (Local Partners) API
// =============================================

export interface LocalPartner {
  id: string;
  name: string;
  financierId: string;
  financierName?: string;
  areaId?: string;
  areaName?: string;
  contactPerson?: string;
  contactPhone?: string;
  remark?: string;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export async function fetchLocalPartners(
  token: string,
  params?: { financierId?: string; areaId?: string; status?: string }
): Promise<{ localPartners: LocalPartner[] }> {
  const sp = new URLSearchParams();
  if (params?.financierId) sp.append("financierId", params.financierId);
  if (params?.areaId) sp.append("areaId", params.areaId);
  if (params?.status) sp.append("status", params.status);
  const q = sp.toString();
  return request(`/local-partners${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createLocalPartnerApi(
  token: string,
  payload: { name: string; financierId: string; areaId?: string; contactPerson?: string; contactPhone?: string; remark?: string }
): Promise<{ localPartner: LocalPartner }> {
  return request("/local-partners", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function updateLocalPartnerApi(
  token: string,
  id: string,
  payload: Partial<{ name: string; financierId: string; areaId: string | null; contactPerson: string; contactPhone: string; remark: string; status: "active" | "disabled" }>
): Promise<{ localPartner: LocalPartner }> {
  return request(`/local-partners/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function deleteLocalPartnerApi(
  token: string,
  id: string
): Promise<{ success: boolean }> {
  return request(`/local-partners/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// =============================================
// 线路 (Routes) API
// =============================================

export interface Area {
  id: string;
  name: string;
  financierId: string;
  financierName?: string;
  remark?: string;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export async function fetchAreas(
  token: string,
  params?: { financierId?: string; status?: string }
): Promise<{ areas: Area[] }> {
  const sp = new URLSearchParams();
  if (params?.financierId) sp.append("financierId", params.financierId);
  if (params?.status) sp.append("status", params.status);
  const q = sp.toString();
  return request(`/areas${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createAreaApi(
  token: string,
  payload: { name: string; financierId: string; remark?: string }
): Promise<{ area: Area }> {
  return request("/areas", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function updateAreaApi(
  token: string,
  id: string,
  payload: Partial<{ name: string; financierId: string; remark: string; status: "active" | "disabled" }>
): Promise<{ area: Area }> {
  return request(`/areas/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function deleteAreaApi(
  token: string,
  id: string
): Promise<{ success: boolean }> {
  return request(`/areas/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface RouteItem {
  id: string;
  name: string;
  localPartnerId: string;
  localPartnerName?: string;
  areaName?: string;
  remark?: string;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
  tmsSource?: string;
  tmsNodeId?: string;
  tmsNodeName?: string;
  /** 与 TMS 字典的绑定状态：bound=已绑且字典命中；stale=已绑但字典失联；unbound=未绑，运维需要对齐 */
  tmsBindingStatus?: "bound" | "stale" | "unbound";
}

export interface TmsOrgNode {
  id: string;
  tmsSource: string;
  nodeId: string;
  nodeName: string;
  shortName?: string;
  companyCode?: string;
  accountCode?: string;
  nodeType?: string;
  nodeTypeLabel?: string;
  property?: string;
  propertyLabel?: string;
  state?: string;
  stateLabel?: string;
  parentNodeId?: string;
  province?: string;
  city?: string;
}

export async function fetchTmsOrgNodes(
  token: string,
  params?: {
    tmsSource?: string;
    state?: string;
    nodeType?: string;
    keyword?: string;
    pageSize?: number;
  }
): Promise<{ items: TmsOrgNode[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.tmsSource) sp.append("tmsSource", params.tmsSource);
  if (params?.state) sp.append("state", params.state);
  if (params?.nodeType) sp.append("nodeType", params.nodeType);
  if (params?.keyword) sp.append("keyword", params.keyword);
  if (params?.pageSize) sp.append("pageSize", String(params.pageSize));
  const q = sp.toString();
  return request(`/tms-org-nodes${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchRoutes(
  token: string,
  params?: { localPartnerId?: string; financierId?: string; areaId?: string; status?: string }
): Promise<{ routes: RouteItem[] }> {
  const sp = new URLSearchParams();
  if (params?.localPartnerId) sp.append("localPartnerId", params.localPartnerId);
  if (params?.financierId) sp.append("financierId", params.financierId);
  if (params?.areaId) sp.append("areaId", params.areaId);
  if (params?.status) sp.append("status", params.status);
  const q = sp.toString();
  return request(`/routes${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createRouteApi(
  token: string,
  payload: {
    name: string;
    localPartnerId: string;
    remark?: string;
    tmsSource?: string;
    tmsNodeId?: string;
  }
): Promise<{ route: RouteItem }> {
  return request("/routes", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function updateRouteApi(
  token: string,
  id: string,
  payload: Partial<{
    name: string;
    localPartnerId: string;
    remark: string;
    status: "active" | "disabled";
    tmsSource: string | null;
    tmsNodeId: string | null;
  }>
): Promise<{ route: RouteItem }> {
  return request(`/routes/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function deleteRouteApi(
  token: string,
  id: string
): Promise<{ success: boolean }> {
  return request(`/routes/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// =============================================
// 对账批次 (Reconciliation) API
// =============================================

export type ReconBatchStatus = "reconciling" | "reconciled" | "settlement_generated" | "paid_offline" | "accounted" | "cancelled";

export interface ReconBatch {
  id: string;
  batchNumber: string;
  contractId: string;
  financierId?: string;
  financierName?: string;
  areaName?: string;
  localPartnerName?: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  itemCount: number;
  status: ReconBatchStatus;
  settlementId?: string;
  exportUrl?: string;
  paymentProofUrl?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReconStats {
  totalRevenue: number;
  pendingAmount: number;
  accountedAmount: number;
}

export async function fetchReconBatches(
  token: string,
  params?: { contractId?: string; financierId?: string; areaId?: string; status?: ReconBatchStatus; startDate?: string; endDate?: string }
): Promise<{ batches: ReconBatch[] }> {
  const sp = new URLSearchParams();
  if (params?.contractId) sp.append("contractId", params.contractId);
  if (params?.financierId) sp.append("financierId", params.financierId);
  if (params?.areaId) sp.append("areaId", params.areaId);
  if (params?.status) sp.append("status", params.status);
  if (params?.startDate) sp.append("startDate", params.startDate);
  if (params?.endDate) sp.append("endDate", params.endDate);
  const q = sp.toString();
  return request(`/recon-batches${q ? `?${q}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function fetchReconStats(token: string): Promise<ReconStats> {
  return request("/recon-batches/stats", { headers: { Authorization: `Bearer ${token}` } });
}

export async function fetchReconBatchById(
  token: string,
  id: string
): Promise<{ batch: ReconBatch; revenueRecordIds: string[] }> {
  return request(`/recon-batches/${id}`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function createReconBatch(
  token: string,
  payload: {
    contractId: string;
    financierId?: string;
    financierName?: string;
    periodStart: string;
    periodEnd: string;
    revenueRecordIds: string[];
    remark?: string;
  }
): Promise<{ batch: ReconBatch }> {
  return request("/recon-batches", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function markReconReconciled(token: string, id: string): Promise<{ batch: ReconBatch }> {
  return request(`/recon-batches/${id}/reconciled`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function generateReconSettlement(token: string, id: string): Promise<{ batch: ReconBatch }> {
  return request(`/recon-batches/${id}/generate-settlement`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function markReconPaidOffline(token: string, id: string, paymentProofUrl?: string): Promise<{ batch: ReconBatch }> {
  return request(`/recon-batches/${id}/paid-offline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ paymentProofUrl }),
  });
}

export async function markReconAccounted(token: string, id: string): Promise<{ batch: ReconBatch }> {
  return request(`/recon-batches/${id}/accounted`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function cancelReconBatch(token: string, id: string): Promise<{ batch: ReconBatch }> {
  return request(`/recon-batches/${id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchBatchRevenueRecords(token: string, batchId: string): Promise<{ records: RevenueRecord[] }> {
  return request(`/recon-batches/${batchId}/records`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
