import { Response, Request } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { getLangFromRequest, getErrorMessage } from "./i18n.js";

// 错误消息到i18n键的映射
const errorMessageMap: Record<string, string> = {
  "用户名已存在": "error.users.username_exists",
  "组织不存在": "error.orgs.not_found",
  "存在无效的角色": "error.users.invalid_role",
  "存在无效的用户组": "error.users.invalid_group",
  "创建用户失败": "error.users.create_failed",
  "用户不存在": "error.users.not_found",
  "角色名已存在": "error.roles.name_exists",
  "用户组名已存在": "error.groups.name_exists",
  "父级组织不存在": "error.orgs.parent_not_found",
  "请先删除子组织": "error.orgs.has_children",
  "该组织下存在用户，无法删除": "error.orgs.has_users",
  "code 与 name 必填": "error.permissions.code_name_required",
  "权限 code 已存在": "error.permissions.code_exists",
  "父级权限不存在": "error.permissions.parent_not_found",
  "创建权限失败": "error.permissions.create_failed",
  "权限不存在": "error.permissions.not_found",
  "父级不能是自身": "error.permissions.cannot_be_parent",
  "请先删除子权限": "error.permissions.has_children",
  "该权限已被角色使用，无法删除": "error.permissions.in_use",
  "存在无效的权限": "error.permissions.invalid",
  "lang 与 key 必填": "error.i18n.required_fields",
  "投资编号已存在": "error.investments.number_exists",
  "创建投资记录失败": "error.investments.create_failed",
  "投资记录不存在": "error.investments.not_found",
  "更新投资记录失败": "error.investments.update_failed",
  "创建监管记录失败": "error.supervisions.create_failed",
  "监管记录不存在": "error.supervisions.not_found",
  "更新监管记录失败": "error.supervisions.update_failed",
  "创建合同抽成记录失败": "error.commissions.create_failed",
  "合同抽成记录不存在": "error.commissions.not_found",
  "更新合同抽成记录失败": "error.commissions.update_failed",
  "请选择要结算的记录": "error.commissions.no_selection"
};

/**
 * 从错误消息中获取i18n键
 */
function getErrorKeyFromMessage(msg: string): string {
  // 如果消息已经是i18n键格式，直接返回
  if (msg.startsWith("error.")) {
    return msg;
  }
  // 尝试从映射表中查找
  return errorMessageMap[msg] || msg;
}

/**
 * 发送错误响应，自动使用i18n
 */
export function sendError(
  res: Response,
  req: Request | AuthenticatedRequest,
  status: number,
  errorKey: string
): void {
  const lang = (req as AuthenticatedRequest).lang || getLangFromRequest(req);
  res.status(status).json({ error: getErrorMessage(errorKey, lang) });
}

/**
 * 处理错误，自动转换为i18n消息
 */
export function handleError(
  res: Response,
  req: Request | AuthenticatedRequest,
  status: number,
  err: unknown,
  defaultKey?: string
): void {
  const lang = (req as AuthenticatedRequest).lang || getLangFromRequest(req);
  const msg = String(err).replace(/^Error:\s*/i, "");
  
  // 如果错误消息已经是i18n键格式，直接使用
  if (msg.startsWith("error.")) {
    res.status(status).json({ error: getErrorMessage(msg, lang) });
    return;
  }
  
  // 尝试从映射表中查找
  const mappedKey = errorMessageMap[msg];
  if (mappedKey) {
    res.status(status).json({ error: getErrorMessage(mappedKey, lang) });
    return;
  }
  
  // 如果有默认键，使用默认键
  if (defaultKey) {
    res.status(status).json({ error: getErrorMessage(defaultKey, lang) });
    return;
  }
  
  // 最后使用原始消息（兼容性处理，对于未映射的错误）
  res.status(status).json({ error: msg });
}

