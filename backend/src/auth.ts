import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { findUserById, toSafeUser, findOrgById } from "./store.js";
import { AuthTokenPayload, Permission, SafeUser, OrgType } from "./types.js";

const JWT_SECRET: jwt.Secret =
  process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_EXPIRES_IN: jwt.SignOptions["expiresIn"] =
  (process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) || "7d";
const SIGN_OPTIONS: jwt.SignOptions = { expiresIn: TOKEN_EXPIRES_IN };

export interface OrgContext {
  orgId?: string;
  orgType?: OrgType;
  relatedEntityId?: string;
  isPlatformUser: boolean;
}

export interface AuthenticatedRequest extends Request {
  currentUser?: SafeUser;
  currentPermissions?: Permission[];
  orgContext?: OrgContext;
  lang?: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, SIGN_OPTIONS);
}

import { getLangFromRequest, getErrorMessage } from "./i18n.js";

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const lang = getLangFromRequest(req);
  req.lang = lang;
  
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: getErrorMessage("error.users.unauthorized", lang) });
    return;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    res.status(401).json({ error: getErrorMessage("error.users.unauthorized", lang) });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    const user = payload.userId ? await findUserById(payload.userId) : undefined;
    if (!user) {
      res.status(401).json({ error: getErrorMessage("error.login.user_not_found", lang) });
      return;
    }

    const safeUser = await toSafeUser(user);
    req.currentUser = safeUser;
    req.currentPermissions = safeUser.permissions;
    
    // 设置组织上下文
    if (user.orgId) {
      const org = await findOrgById(user.orgId);
      
      // 判断是否为平台用户：只有明确设置为 platform 类型才是平台用户
      // 如果没有组织或组织类型为空，默认认为不是平台用户（安全起见）
      const isPlatformUser = org?.type === "platform";
      
      req.orgContext = {
        orgId: user.orgId,
        orgType: (org?.type || undefined) as OrgType | undefined,
        relatedEntityId: org?.relatedEntityId,
        isPlatformUser
      };
    } else {
      // 没有组织的用户（如 admin）是平台用户
      req.orgContext = {
        isPlatformUser: true
      };
    }
    
    next();
  } catch (err) {
    res.status(401).json({ error: getErrorMessage("error.users.unauthorized", lang) });
  }
}

export function requirePermissions(required: Permission | Permission[]) {
  const requiredList = Array.isArray(required) ? required : [required];

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const lang = req.lang || getLangFromRequest(req);
    const userPermissions = req.currentPermissions ?? [];
    const hasAll = requiredList.every((perm) => userPermissions.includes(perm));

    if (!hasAll) {
      res.status(403).json({ error: getErrorMessage("error.users.unauthorized", lang) });
      return;
    }

    next();
  };
}

/**
 * 要求用户拥有列表中任意一个权限即可
 * @param required 权限列表，用户只需拥有其中任意一个即可访问
 */
export function requireAnyPermission(required: Permission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const lang = req.lang || getLangFromRequest(req);
    const userPermissions = req.currentPermissions ?? [];
    const hasAny = required.some((perm) => userPermissions.includes(perm));

    if (!hasAny) {
      res.status(403).json({ error: getErrorMessage("error.users.unauthorized", lang) });
      return;
    }

    next();
  };
}

/**
 * 获取用户组织的数据过滤条件
 * 用于在数据查询时根据用户组织类型过滤数据
 */
export function getOrgDataFilter(req: AuthenticatedRequest): {
  isPlatformUser: boolean;
  orgType?: OrgType;
  relatedEntityId?: string;
  funderId?: string;
  financierId?: string;
} {
  const orgContext = req.orgContext;
  
  if (!orgContext || orgContext.isPlatformUser) {
    return { isPlatformUser: true };
  }
  
  const result: ReturnType<typeof getOrgDataFilter> = {
    isPlatformUser: false,
    orgType: orgContext.orgType
  };
  
  if (orgContext.orgType === "funder" && orgContext.relatedEntityId) {
    result.funderId = orgContext.relatedEntityId;
  } else if (orgContext.orgType === "financier" && orgContext.relatedEntityId) {
    result.financierId = orgContext.relatedEntityId;
  }
  
  return result;
}

/**
 * 检查用户是否有权限访问特定资金方的数据
 */
export function canAccessFunder(req: AuthenticatedRequest, funderId: string): boolean {
  const orgContext = req.orgContext;
  
  // 平台用户可以访问所有数据
  if (!orgContext || orgContext.isPlatformUser) {
    return true;
  }
  
  // 资金方用户只能访问自己的数据
  if (orgContext.orgType === "funder") {
    return orgContext.relatedEntityId === funderId;
  }
  
  // 融资方用户暂时不能直接访问资金方数据
  return false;
}

/**
 * 检查用户是否有权限访问特定融资方的数据
 */
export function canAccessFinancier(req: AuthenticatedRequest, financierId: string): boolean {
  const orgContext = req.orgContext;
  
  // 平台用户可以访问所有数据
  if (!orgContext || orgContext.isPlatformUser) {
    return true;
  }
  
  // 融资方用户只能访问自己的数据
  if (orgContext.orgType === "financier") {
    return orgContext.relatedEntityId === financierId;
  }
  
  // 资金方用户可以访问与其有合同关系的融资方数据（后续实现）
  // 目前先返回 false
  return false;
}
