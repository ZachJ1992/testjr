import { Router, type Request, type Response, type NextFunction } from "express";
import {
  authenticate,
  AuthenticatedRequest,
  requirePermissions,
  requireAnyPermission,
  signToken
} from "./auth.js";
import { pool } from "./db.js";
import { RowDataPacket } from "mysql2";
import * as directedPayStore from "./directed-pay-contracts-store.js";
import directedPaymentRoutes from "./directed-payment-routes.js";
import crawlerRoutes from "./crawler/crawler-routes.js";
import * as commissionV2Store from "./commission-v2-store.js";
import * as reconStore from "./reconciliation-store.js";
import { createSettlement as createSettlementRecord } from "./settlements-store.js";
import { verifyPassword } from "./password.js";
import { getLangFromRequest, getErrorMessage } from "./i18n.js";
import { sendError, handleError } from "./errorHandler.js";
import {
  addUserToGroup,
  assignRoleToUser,
  createGroup,
  createOrgUnit,
  createPermission,
  createRole,
  createUser,
  deletePermission,
  deleteTranslation,
  deleteOrgUnit,
  findUserByUsername,
  getGroups,
  getOrgUnits,
  getPermissions,
  getRoles,
  getUsers,
  getSafeUserById,
  getTranslations,
  updateOrgUnit,
  removeUserFromGroup,
  updateGroup,
  upsertTranslation,
  listI18nEntries,
  updatePermission,
  updateUser,
  deleteUser,
  changePasswordForUser,
  resetAdminPassword,
  getInvestments,
  getInvestmentById,
  createInvestment,
  updateInvestment,
  deleteInvestment,
  getInvestmentStats,
  getSupervisions,
  getSupervisionById,
  createSupervision,
  updateSupervision,
  deleteSupervision,
  getSupervisionStats,
  getContractCommissions,
  getContractCommissionById,
  createContractCommission,
  updateContractCommission,
  deleteContractCommission,
  batchSettleCommissions,
  getCommissionStats,
  getContracts,
  getContractById,
  createFinancingContract,
  createBrokerageContract,
  updateContractStatus,
  updateContract,
  deleteContract,
  getFunders,
  getFunderById,
  createFunder,
  updateFunder,
  deleteFunder,
  getFinanciers,
  getFinancierById,
  createFinancier,
  updateFinancier,
  deleteFinancier,
  getFundPoolMonitoring,
  getSystemParameters,
  updateSystemParameters,
  resetSystemParameters,
  getWaybills,
  getWaybillById,
  createWaybill,
  updateWaybill,
  deleteWaybill,
  getWaybillStats,
  importWaybills,
  getCommissionContracts,
  getCommissionContractById,
  createCommissionContract,
  updateCommissionContract,
  deleteCommissionContract,
  getCommissionContractStats,
  ensureCommissionContractsTable
} from "./store.js";
import {
  getSettlements,
  getSettlementById,
  createSettlement,
  confirmSettlement,
  markSettlementPaid,
  registerSettlementInvoice,
  settleSettlement,
  getSettlementStats,
  updateOverdueSettlements,
  generateFinancingRepaymentSettlement,
  generateCommissionSettlement,
  ensureSettlementsTable
} from "./settlements-store.js";
import { Permission } from "./types.js";
import { upload, getFileUrl } from "./upload.js";
import {
  getExternalSystemsByFinancierId,
  getExternalSystemById,
  createExternalSystem,
  updateExternalSystem,
  deleteExternalSystem,
} from "./external-systems-store.js";
import {
  ensureDirectedPaySettlementsTables,
  getDirectedPaySettlements,
  getDirectedPaySettlementById,
  getDirectedPaySettlementItems,
  generateSettlement as generateDirectedPaySettlement,
  confirmDirectedPaySettlement,
  processDirectedPayRepayment,
  updateOverdueDirectedPaySettlements,
  getDirectedPaySettlementStats,
  getDirectedPayContracts,
  calculateInterest,
} from "./directed-pay-settlements-store.js";
import {
  createVirtualAccount,
  getVirtualAccountById,
  getVirtualAccountByOwner,
  getVirtualAccounts,
  creditAccount,
  debitAccount,
  freezeAmount,
  unfreezeAmount,
  getAccountTransactions,
  updateAccountStatus,
} from "./virtual-accounts-store.js";
import {
  createPaymentCode,
  getPaymentCodeById,
  getPaymentCodeByCode,
  getPaymentCodes,
  usePaymentCode,
  cancelPaymentCode,
  updateTmsSyncStatus,
  getPaymentCodesByRequestId,
} from "./payment-codes-store.js";
import {
  createPaymentRequest,
  getPaymentRequestById,
  getPaymentRequests,
  getPendingApprovals,
  getPaymentRequestStats,
  platformApprove,
  platformReject,
  funderApprove,
  funderReject,
  cancelRequest as cancelPaymentRequest,
  executePayment,
  batchCreatePaymentRequests,
  ensureDirectedPaymentTables,
  type ReceiverType,
} from "./directed-payment-requests-store.js";
import { syncPaymentCodeToTms, verifyTmsCallback, type TmsCallbackPayload } from "./tms-service.js";
import path from "path";
import fs from "fs/promises";
import { resolveWaybillAccessScope } from "./waybills-query.js";

const router = Router();

// 整合定向支付路由
router.use(directedPaymentRoutes);

// 整合爬虫路由
router.use(crawlerRoutes);

router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const lang = getLangFromRequest(req);
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      res.status(400).json({ error: getErrorMessage("error.login.username_password_required", lang) });
      return;
    }

    const user = await findUserByUsername(username);
    if (!user) {
      res.status(401).json({ error: getErrorMessage("error.login.invalid_credentials", lang) });
      return;
    }

    if (user.isActive === false) {
      res.status(403).json({ error: getErrorMessage("error.login.account_disabled", lang) });
      return;
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: getErrorMessage("error.login.invalid_credentials", lang) });
      return;
    }

    const safeUser = await getSafeUserById(user.id);
    if (!safeUser) {
      res.status(401).json({ error: getErrorMessage("error.login.user_not_found", lang) });
      return;
    }

    const token = signToken(user.id);
    res.json({ token, user: safeUser });
  } catch (err) {
    const lang = getLangFromRequest(req);
    res.status(500).json({ error: getErrorMessage("error.login.failed", lang), detail: String(err) });
  }
});

router.get(
  "/auth/me",
  authenticate,
  (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.currentUser });
  }
);

router.get(
  "/users",
  authenticate,
  requirePermissions("manage_users"),
  async (_req: AuthenticatedRequest, res: Response) => {
    const users = await getUsers();
    res.json({ users });
  }
);

router.post(
  "/users",
  authenticate,
  requirePermissions("manage_users"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { username, password, displayName, orgId, roleIds, groupIds, isActive } =
        req.body ?? {};
      if (!username || !password || !displayName) {
        sendError(res, req, 400, "error.users.required_fields");
        return;
      }

      const user = await createUser({
        username,
        password,
        displayName,
        orgId,
        roleIds,
        groupIds,
        isActive
      });
      res.status(201).json({ user });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/users/:id",
  authenticate,
  requirePermissions("manage_users"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { displayName, password, orgId, groupIds, isActive } = req.body ?? {};
      const user = await updateUser(req.params.id, {
        displayName,
        password,
        orgId,
        groupIds,
        isActive
      });
      res.json({ user });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/users/:id",
  authenticate,
  requirePermissions("manage_users"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteUser(req.params.id);
      res.status(204).send();
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.post(
  "/users/change-password",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { oldPassword, newPassword } = req.body ?? {};
      if (!oldPassword || !newPassword) {
        sendError(res, req, 400, "error.users.password_required");
        return;
      }
      if (!req.currentUser?.id) {
        sendError(res, req, 401, "error.users.unauthorized");
        return;
      }
      await changePasswordForUser(req.currentUser.id, oldPassword, newPassword);
      res.json({ success: true });
    } catch (err) {
      if ((err as any)?.code === "BAD_OLD_PASSWORD") {
        sendError(res, req, 400, "error.users.invalid_password");
      } else {
        handleError(res, req, 400, err);
      }
    }
  }
);

router.post(
  "/users/reset-admin",
  authenticate,
  requirePermissions("manage_permissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await resetAdminPassword("admin123");
      res.json({ success: true, username: "admin", password: "admin123" });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.get(
  "/roles",
  authenticate,
  requirePermissions("manage_roles"),
  async (_req: AuthenticatedRequest, res: Response) => {
    const roles = await getRoles();
    res.json({ roles });
  }
);

router.post(
  "/roles",
  authenticate,
  requirePermissions("manage_roles"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, permissions, description } = req.body ?? {};
      if (!name || !Array.isArray(permissions)) {
        sendError(res, req, 400, "error.roles.name_required");
        return;
      }

      const role = await createRole(
        name,
        permissions as Permission[],
        description
      );
      res.status(201).json({ role });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.get(
  "/permissions",
  authenticate,
  requirePermissions("manage_permissions"),
  async (_req: AuthenticatedRequest, res: Response) => {
    const permissions = await getPermissions();
    res.json({ permissions });
  }
);

router.post(
  "/permissions",
  authenticate,
  requirePermissions("manage_permissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { code, name, description, parentId } = req.body ?? {};
      if (!code || !name) {
        sendError(res, req, 400, "error.permissions.code_name_required");
        return;
      }
      const permission = await createPermission({
        code,
        name,
        description,
        parentId
      });
      res.status(201).json({ permission });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/permissions/:id",
  authenticate,
  requirePermissions("manage_permissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const permission = await updatePermission(req.params.id, req.body ?? {});
      res.json({ permission });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/permissions/:id",
  authenticate,
  requirePermissions("manage_permissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deletePermission(req.params.id);
      res.status(204).send();
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.get(
  "/i18n",
  async (req: Request, res: Response) => {
    try {
      const lang = (req.query.lang as string) || "zh-CN";
      const page = req.query.page as string | undefined;
      // i18n 接口不需要鉴权，允许未登录用户获取翻译
      // 如果需要用户或组织的特定翻译，可以通过 query 参数传递
      const orgId = req.query.orgId as string | undefined;
      const userId = req.query.userId as string | undefined;
      const translations = await getTranslations({ lang, page, orgId, userId });
      res.json({ lang, translations });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.get(
  "/i18n/entries",
  authenticate,
  requirePermissions("manage_permissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const entries = await listI18nEntries({
        lang: req.query.lang as string | undefined,
        scopeType: req.query.scopeType as any,
        scopeId: req.query.scopeId as string | undefined,
        page: req.query.page as string | undefined
      });
      res.json({ entries });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.post(
  "/i18n",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { lang, key, value, scopeType, scopeId, page } = req.body ?? {};
      if (!lang || !key || !value || !scopeType) {
        sendError(res, req, 400, "error.i18n.required_fields");
        return;
      }
      // 权限：自己可写 personal，自组织需 manage_orgs，其他需 manage_permissions
      if (scopeType === "user" && scopeId && scopeId !== req.currentUser?.id) {
        sendError(res, req, 403, "error.i18n.no_permission_other");
        return;
      }
      if (scopeType === "org") {
        if (!req.currentPermissions?.includes("manage_orgs") &&
            !req.currentPermissions?.includes("manage_permissions")) {
          sendError(res, req, 403, "error.i18n.no_permission_org");
          return;
        }
      } else if (scopeType !== "user") {
        if (!req.currentPermissions?.includes("manage_permissions")) {
          sendError(res, req, 403, "error.i18n.no_permission_global");
          return;
        }
      }
      const entry = await upsertTranslation({
        lang,
        key,
        value,
        scopeType,
        scopeId,
        page
      });
      res.status(201).json({ entry });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/i18n/:id",
  authenticate,
  requirePermissions("manage_permissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteTranslation(req.params.id);
      res.status(204).send();
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.get(
  "/groups",
  authenticate,
  requirePermissions("manage_groups"),
  async (_req: AuthenticatedRequest, res: Response) => {
    const groups = await getGroups();
    res.json({ groups });
  }
);

router.post(
  "/groups",
  authenticate,
  requirePermissions("manage_groups"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, description, permissionCodes } = req.body ?? {};
      if (!name) {
        sendError(res, req, 400, "error.groups.name_required");
        return;
      }

      const group = await createGroup(name, description, permissionCodes);
      res.status(201).json({ group });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/groups/:id",
  authenticate,
  requirePermissions("manage_groups"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const group = await updateGroup({
        id: req.params.id,
        name: req.body?.name,
        description: req.body?.description,
        permissionCodes: req.body?.permissionCodes
      });
      res.json({ group });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.get(
  "/orgs",
  authenticate,
  requirePermissions("view_orgs"),
  async (_req: AuthenticatedRequest, res: Response) => {
    const orgs = await getOrgUnits();
    res.json({ orgs });
  }
);

router.post(
  "/orgs",
  authenticate,
  requirePermissions("manage_orgs"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, parentId, isActive } = req.body ?? {};
      if (!name) {
        sendError(res, req, 400, "error.orgs.name_required");
        return;
      }

      const org = await createOrgUnit(name, parentId, isActive ?? true);
      res.status(201).json({ org });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/orgs/:id",
  authenticate,
  requirePermissions("manage_orgs"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const org = await updateOrgUnit({
        id: req.params.id,
        name: req.body?.name,
        parentId: req.body?.parentId,
        isActive: req.body?.isActive
      });
      res.json({ org });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/orgs/:id",
  authenticate,
  requirePermissions("manage_orgs"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteOrgUnit(req.params.id);
      res.status(204).send();
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.post(
  "/groups/:groupId/users/:userId",
  authenticate,
  requirePermissions(["manage_groups", "manage_users"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId, userId } = req.params;
      const user = await addUserToGroup(userId, groupId);
      res.json({ user });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.delete(
  "/groups/:groupId/users/:userId",
  authenticate,
  requirePermissions(["manage_groups", "manage_users"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId, userId } = req.params;
      const user = await removeUserFromGroup(userId, groupId);
      res.json({ user });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.post(
  "/users/:userId/roles/:roleId",
  authenticate,
  requirePermissions(["manage_roles", "manage_users"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId, roleId } = req.params;
      const user = await assignRoleToUser(userId, roleId);
      res.json({ user });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

// Investment routes
router.get(
  "/investments/stats",
  authenticate,
  requirePermissions("manage_investments"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await getInvestmentStats();
      res.json(stats);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.get(
  "/investments",
  authenticate,
  requirePermissions("manage_investments"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const search = req.query.search as string | undefined;
      const investments = await getInvestments(search);
      res.json({ investments });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.get(
  "/investments/:id",
  authenticate,
  requirePermissions("manage_investments"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const investment = await getInvestmentById(req.params.id);
      if (!investment) {
        sendError(res, req, 404, "error.investments.not_found");
        return;
      }
      res.json({ investment });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.post(
  "/investments",
  authenticate,
  requirePermissions("manage_investments"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        investmentNumber,
        amount,
        investorEntity,
        receivingEntity,
        assetDescription,
        interestRate,
        startDate,
        endDate,
        expectedReturn,
        status
      } = req.body ?? {};

      if (!investmentNumber || !amount || !investorEntity || !receivingEntity || !interestRate || !startDate || !endDate || expectedReturn === undefined) {
        sendError(res, req, 400, "error.investments.required_fields");
        return;
      }

      const investment = await createInvestment({
        investmentNumber,
        amount: Number(amount),
        investorEntity,
        receivingEntity,
        assetDescription,
        interestRate: Number(interestRate),
        startDate,
        endDate,
        expectedReturn: Number(expectedReturn),
        status
      });
      res.status(201).json({ investment });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/investments/:id",
  authenticate,
  requirePermissions("manage_investments"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        amount,
        investorEntity,
        receivingEntity,
        assetDescription,
        interestRate,
        startDate,
        endDate,
        expectedReturn,
        status
      } = req.body ?? {};

      const updateData: any = {};
      if (amount !== undefined) updateData.amount = Number(amount);
      if (investorEntity !== undefined) updateData.investorEntity = investorEntity;
      if (receivingEntity !== undefined) updateData.receivingEntity = receivingEntity;
      if (assetDescription !== undefined) updateData.assetDescription = assetDescription;
      if (interestRate !== undefined) updateData.interestRate = Number(interestRate);
      if (startDate !== undefined) updateData.startDate = startDate;
      if (endDate !== undefined) updateData.endDate = endDate;
      if (expectedReturn !== undefined) updateData.expectedReturn = Number(expectedReturn);
      if (status !== undefined) updateData.status = status;

      const investment = await updateInvestment(req.params.id, updateData);
      res.json({ investment });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/investments/:id",
  authenticate,
  requirePermissions("manage_investments"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteInvestment(req.params.id);
      res.status(204).send();
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// Supervision routes
router.get(
  "/supervisions/stats",
  authenticate,
  requirePermissions("manage_supervisions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await getSupervisionStats();
      res.json(stats);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.get(
  "/supervisions",
  authenticate,
  requirePermissions("manage_supervisions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.licensePlate) {
        filters.licensePlate = req.query.licensePlate as string;
      }
      if (req.query.supervisionType) {
        filters.supervisionType = req.query.supervisionType;
      }
      if (req.query.status) {
        filters.status = req.query.status;
      }
      const supervisions = await getSupervisions(filters);
      res.json({ supervisions });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.get(
  "/supervisions/:id",
  authenticate,
  requirePermissions("manage_supervisions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const supervision = await getSupervisionById(req.params.id);
      if (!supervision) {
        sendError(res, req, 404, "error.supervisions.not_found");
        return;
      }
      res.json({ supervision });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.post(
  "/supervisions",
  authenticate,
  requirePermissions("manage_supervisions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        waybillNumber,
        licensePlate,
        grossProfit,
        supervisionType,
        supervisionRate,
        supervisionAmount,
        startDate,
        endDate,
        status
      } = req.body ?? {};

      if (!waybillNumber || !licensePlate || grossProfit === undefined || !supervisionType || supervisionRate === undefined || supervisionAmount === undefined || !startDate || !endDate) {
        sendError(res, req, 400, "error.supervisions.required_fields");
        return;
      }

      const supervision = await createSupervision({
        waybillNumber,
        licensePlate,
        grossProfit: Number(grossProfit),
        supervisionType,
        supervisionRate: Number(supervisionRate),
        supervisionAmount: Number(supervisionAmount),
        startDate,
        endDate,
        status
      });
      res.status(201).json({ supervision });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.put(
  "/supervisions/:id",
  authenticate,
  requirePermissions("manage_supervisions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        waybillNumber,
        licensePlate,
        grossProfit,
        supervisionType,
        supervisionRate,
        supervisionAmount,
        startDate,
        endDate,
        status
      } = req.body ?? {};

      const updateData: any = {};
      if (waybillNumber !== undefined) updateData.waybillNumber = waybillNumber;
      if (licensePlate !== undefined) updateData.licensePlate = licensePlate;
      if (grossProfit !== undefined) updateData.grossProfit = Number(grossProfit);
      if (supervisionType !== undefined) updateData.supervisionType = supervisionType;
      if (supervisionRate !== undefined) updateData.supervisionRate = Number(supervisionRate);
      if (supervisionAmount !== undefined) updateData.supervisionAmount = Number(supervisionAmount);
      if (startDate !== undefined) updateData.startDate = startDate;
      if (endDate !== undefined) updateData.endDate = endDate;
      if (status !== undefined) updateData.status = status;

      const supervision = await updateSupervision(req.params.id, updateData);
      res.json({ supervision });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.delete(
  "/supervisions/:id",
  authenticate,
  requirePermissions("manage_supervisions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteSupervision(req.params.id);
      res.status(204).send();
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// Contract Commission routes
router.get(
  "/commissions/stats",
  authenticate,
  requirePermissions("manage_commissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.startDate) filters.startDate = req.query.startDate as string;
      if (req.query.endDate) filters.endDate = req.query.endDate as string;
      const stats = await getCommissionStats(filters);
      res.json(stats);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.get(
  "/commissions",
  authenticate,
  requirePermissions("manage_commissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.upstreamCustomer) {
        filters.upstreamCustomer = req.query.upstreamCustomer as string;
      }
      if (req.query.startDate) {
        filters.startDate = req.query.startDate as string;
      }
      if (req.query.endDate) {
        filters.endDate = req.query.endDate as string;
      }
      if (req.query.status) {
        filters.status = req.query.status;
      }
      const commissions = await getContractCommissions(filters);
      res.json({ commissions });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.get(
  "/commissions/:id",
  authenticate,
  requirePermissions("manage_commissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const commission = await getContractCommissionById(req.params.id);
      if (!commission) {
        sendError(res, req, 404, "error.commissions.not_found");
        return;
      }
      res.json({ commission });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.post(
  "/commissions",
  authenticate,
  requirePermissions("manage_commissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        contractNumber,
        upstreamCustomer,
        licensePlate,
        vehicleIncome,
        commissionRate,
        commissionAmount,
        status
      } = req.body ?? {};

      if (!contractNumber || !upstreamCustomer || !licensePlate || vehicleIncome === undefined || commissionRate === undefined || commissionAmount === undefined) {
        sendError(res, req, 400, "error.commissions.required_fields");
        return;
      }

      const commission = await createContractCommission({
        contractNumber,
        upstreamCustomer,
        licensePlate,
        vehicleIncome: Number(vehicleIncome),
        commissionRate: Number(commissionRate),
        commissionAmount: Number(commissionAmount),
        status
      });
      res.status(201).json({ commission });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.put(
  "/commissions/:id",
  authenticate,
  requirePermissions("manage_commissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        contractNumber,
        upstreamCustomer,
        licensePlate,
        vehicleIncome,
        commissionRate,
        commissionAmount,
        status,
        settlementTime
      } = req.body ?? {};

      const updateData: any = {};
      if (contractNumber !== undefined) updateData.contractNumber = contractNumber;
      if (upstreamCustomer !== undefined) updateData.upstreamCustomer = upstreamCustomer;
      if (licensePlate !== undefined) updateData.licensePlate = licensePlate;
      if (vehicleIncome !== undefined) updateData.vehicleIncome = Number(vehicleIncome);
      if (commissionRate !== undefined) updateData.commissionRate = Number(commissionRate);
      if (commissionAmount !== undefined) updateData.commissionAmount = Number(commissionAmount);
      if (status !== undefined) updateData.status = status;
      if (settlementTime !== undefined) updateData.settlementTime = settlementTime;

      const commission = await updateContractCommission(req.params.id, updateData);
      res.json({ commission });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

router.delete(
  "/commissions/:id",
  authenticate,
  requirePermissions("manage_commissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteContractCommission(req.params.id);
      res.status(204).send();
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.post(
  "/commissions/batch-settle",
  authenticate,
  requirePermissions("manage_commissions"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ids } = req.body ?? {};
      if (!Array.isArray(ids) || ids.length === 0) {
        sendError(res, req, 400, "error.commissions.ids_required");
        return;
      }
      await batchSettleCommissions(ids);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  }
);

// Contract management routes
router.get(
  "/contracts",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filters: { 
        type?: "financing" | "brokerage";
        funderId?: string;
        logisticsProviderId?: string;
      } = {};
      if (req.query.type === "financing" || req.query.type === "brokerage") {
        filters.type = req.query.type;
      }
      if (req.query.funderId) {
        filters.funderId = req.query.funderId as string;
      }
      if (req.query.logisticsProviderId) {
        filters.logisticsProviderId = req.query.logisticsProviderId as string;
      }
      const contracts = await getContracts(filters);
      res.json({ contracts });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.get(
  "/contracts/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contract = await getContractById(req.params.id);
      if (!contract) {
        sendError(res, req, 404, "error.contracts.not_found");
        return;
      }
      res.json({ contract });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.post(
  "/contracts/financing",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        funderId = "",
        funderName = "",
        logisticsProviderId = "",
        logisticsProviderName = "",
        creditLimit = 0,
        startDate = new Date().toISOString().split("T")[0],
        endDate = new Date().toISOString().split("T")[0],
        annualInterestRate = 0,
        interestCalculationMode = "daily_balance",
        settlementCycle = "monthly",
        settlementTriggerDay,
        settlementTriggerQuarterEnd,
        settlementTriggerBiweekly,
        autoSettlement,
        profitSharingEnabled,
        profitSharingRatio
      } = req.body ?? {};

      // 跳过必填字段验证

      const contract = await createFinancingContract({
        funderId,
        funderName,
        logisticsProviderId,
        logisticsProviderName,
        creditLimit: Number(creditLimit) || 0,
        startDate,
        endDate,
        annualInterestRate: Number(annualInterestRate) || 0,
        interestCalculationMode,
        settlementCycle,
        settlementTriggerDay,
        settlementTriggerQuarterEnd,
        settlementTriggerBiweekly,
        autoSettlement: autoSettlement !== false,
        profitSharingEnabled: profitSharingEnabled === true,
        profitSharingRatio: profitSharingEnabled ? Number(profitSharingRatio) || 0 : undefined
      });
      res.status(201).json({ contract });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.post(
  "/contracts/brokerage",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        logisticsProviderId = "",
        logisticsProviderName = "",
        creditLimit = 0,
        startDate = new Date().toISOString().split("T")[0],
        endDate = new Date().toISOString().split("T")[0],
        commissionConfig = [],
        settlementCycle = "monthly",
        settlementTriggerDay,
        settlementTriggerQuarterEnd,
        settlementTriggerBiweekly,
        autoSettlement
      } = req.body ?? {};

      // 跳过必填字段验证

      const contract = await createBrokerageContract({
        logisticsProviderId,
        logisticsProviderName,
        creditLimit: Number(creditLimit) || 0,
        startDate,
        endDate,
        commissionConfig,
        settlementCycle,
        settlementTriggerDay,
        settlementTriggerQuarterEnd,
        settlementTriggerBiweekly,
        autoSettlement: autoSettlement !== false
      });
      res.status(201).json({ contract });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// Update contract status
router.patch(
  "/contracts/:id/status",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status } = req.body ?? {};
      if (!status || !["active", "disabled", "expiring_soon", "expired"].includes(status)) {
        sendError(res, req, 400, "error.contracts.invalid_status");
        return;
      }

      const contract = await updateContractStatus(req.params.id, status);
      res.json({ contract });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// Update contract
router.put(
  "/contracts/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contract = await updateContract(req.params.id, req.body ?? {});
      res.json({ contract });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// Delete contract
router.delete(
  "/contracts/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteContract(req.params.id);
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// Funders routes
router.get(
  "/funders",
  authenticate,
  requireAnyPermission(["manage_funders", "manage_contracts"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { institutionName, contactPerson, institutionType, status } = req.query ?? {};
      const funders = await getFunders({
        institutionName: institutionName as string,
        contactPerson: contactPerson as string,
        institutionType: institutionType as any,
        status: status as any
      });
      res.json({ funders });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/funders/:id",
  authenticate,
  requirePermissions("manage_funders"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const funder = await getFunderById(id);
      if (!funder) {
        sendError(res, req, 404, "error.funders.not_found");
        return;
      }
      res.json({ funder });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.post(
  "/funders",
  authenticate,
  requirePermissions("manage_funders"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        institutionName,
        institutionType,
        unifiedSocialCreditCode,
        businessLicenseUrl,
        businessLicenseName,
        financialLicenseUrl,
        financialLicenseName,
        accountOpeningPermitUrl,
        accountOpeningPermitName,
        contactPerson,
        contactPhone,
        bankName,
        bankAccount,
        accountName
      } = req.body ?? {};

      if (!institutionName || !institutionType || !unifiedSocialCreditCode) {
        sendError(res, req, 400, "error.funders.required_fields");
        return;
      }

      const funder = await createFunder({
        institutionName,
        institutionType,
        unifiedSocialCreditCode,
        businessLicenseUrl,
        businessLicenseName,
        financialLicenseUrl,
        financialLicenseName,
        accountOpeningPermitUrl,
        accountOpeningPermitName,
        contactPerson,
        contactPhone,
        bankName,
        bankAccount,
        accountName
      });
      res.status(201).json({ funder });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/funders/:id",
  authenticate,
  requirePermissions("manage_funders"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const {
        institutionName,
        institutionType,
        unifiedSocialCreditCode,
        businessLicenseUrl,
        businessLicenseName,
        financialLicenseUrl,
        financialLicenseName,
        accountOpeningPermitUrl,
        accountOpeningPermitName,
        contactPerson,
        contactPhone,
        bankName,
        bankAccount,
        accountName,
        cumulativeCreditLimit,
        status
      } = req.body ?? {};

      const funder = await updateFunder(id, {
        institutionName,
        institutionType,
        unifiedSocialCreditCode,
        businessLicenseUrl,
        businessLicenseName,
        financialLicenseUrl,
        financialLicenseName,
        accountOpeningPermitUrl,
        accountOpeningPermitName,
        contactPerson,
        contactPhone,
        bankName,
        bankAccount,
        accountName,
        cumulativeCreditLimit,
        status
      });
      res.json({ funder });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/funders/:id",
  authenticate,
  requirePermissions("manage_funders"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await deleteFunder(id);
      res.status(204).send();
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// Financiers routes
router.get(
  "/financiers",
  authenticate,
  requireAnyPermission(["manage_financiers", "manage_contracts"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { enterpriseName, legalRepresentative, region, operatingScale, status } = req.query ?? {};
      const financiers = await getFinanciers({
        enterpriseName: enterpriseName as string,
        legalRepresentative: legalRepresentative as string,
        region: region as string,
        operatingScale: operatingScale as any,
        status: status as any
      });
      res.json({ financiers });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/financiers/:id",
  authenticate,
  requirePermissions("manage_financiers"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const financier = await getFinancierById(id);
      if (!financier) {
        sendError(res, req, 404, "error.financiers.not_found");
        return;
      }
      res.json({ financier });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.post(
  "/financiers",
  authenticate,
  requirePermissions("manage_financiers"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        enterpriseName,
        unifiedSocialCreditCode,
        legalRepresentative,
        businessAddress,
        region,
        operatingScale,
        businessLicenseUrl,
        roadTransportLicenseUrl,
        legalPersonIdCardUrl,
        initialCreditAmount
      } = req.body ?? {};

      if (!enterpriseName || !unifiedSocialCreditCode || !legalRepresentative || 
          !businessAddress || !operatingScale || initialCreditAmount === undefined) {
        sendError(res, req, 400, "error.financiers.required_fields");
        return;
      }

      const financier = await createFinancier({
        enterpriseName,
        unifiedSocialCreditCode,
        legalRepresentative,
        businessAddress,
        region,
        operatingScale,
        businessLicenseUrl,
        roadTransportLicenseUrl,
        legalPersonIdCardUrl,
        initialCreditAmount: Number(initialCreditAmount)
      });
      res.status(201).json({ financier });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/financiers/:id",
  authenticate,
  requirePermissions("manage_financiers"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const {
        enterpriseName,
        unifiedSocialCreditCode,
        legalRepresentative,
        businessAddress,
        region,
        operatingScale,
        businessLicenseUrl,
        roadTransportLicenseUrl,
        legalPersonIdCardUrl,
        totalCreditLimit,
        remainingCreditLimit,
        status
      } = req.body ?? {};

      const financier = await updateFinancier(id, {
        enterpriseName,
        unifiedSocialCreditCode,
        legalRepresentative,
        businessAddress,
        region,
        operatingScale,
        businessLicenseUrl,
        roadTransportLicenseUrl,
        legalPersonIdCardUrl,
        totalCreditLimit: totalCreditLimit !== undefined ? Number(totalCreditLimit) : undefined,
        remainingCreditLimit: remainingCreditLimit !== undefined ? Number(remainingCreditLimit) : undefined,
        status
      });
      res.json({ financier });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/financiers/:id",
  authenticate,
  requirePermissions("manage_financiers"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await deleteFinancier(id);
      res.status(204).send();
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 外部系统配置路由 - Financier External Systems
router.get(
  "/financiers/:financierId/external-systems",
  authenticate,
  requirePermissions("manage_financiers"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { financierId } = req.params;
      const systems = await getExternalSystemsByFinancierId(financierId);
      res.json({ systems });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/financiers/:financierId/external-systems/:systemId",
  authenticate,
  requirePermissions("manage_financiers"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { systemId } = req.params;
      const system = await getExternalSystemById(systemId);
      if (!system) {
        sendError(res, req, 404, "error.external_systems.not_found");
        return;
      }
      res.json({ system });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.post(
  "/financiers/:financierId/external-systems",
  authenticate,
  requirePermissions("manage_financiers"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { financierId } = req.params;
      const { 
        systemName, 
        systemId, 
        apiEndpoint, 
        apiKey, 
        syncEnabled,
        integrationType,
        crawlerType,
        crawlerConfig,
        syncIntervalMinutes,
      } = req.body ?? {};

      if (!systemName) {
        sendError(res, req, 400, "error.external_systems.required_fields");
        return;
      }

      const system = await createExternalSystem({
        financierId,
        systemName,
        systemId: systemId || '',  // systemId 现在是可选的
        apiEndpoint,
        apiKey,
        syncEnabled: syncEnabled ?? false,
        integrationType: integrationType ?? 'manual',
        crawlerType,
        crawlerConfig,
        syncIntervalMinutes: syncIntervalMinutes ?? 360,
      });
      res.status(201).json({ system });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/financiers/:financierId/external-systems/:systemId",
  authenticate,
  requirePermissions("manage_financiers"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { systemId } = req.params;
      const { 
        systemName, 
        systemId: newSystemId, 
        apiEndpoint, 
        apiKey, 
        syncEnabled,
        integrationType,
        crawlerType,
        crawlerConfig,
        syncIntervalMinutes,
      } = req.body ?? {};

      const system = await updateExternalSystem(systemId, {
        systemName,
        systemId: newSystemId,
        apiEndpoint,
        apiKey,
        syncEnabled,
        integrationType,
        crawlerType,
        crawlerConfig,
        syncIntervalMinutes,
      });

      if (!system) {
        sendError(res, req, 404, "error.external_systems.not_found");
        return;
      }
      res.json({ system });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/financiers/:financierId/external-systems/:systemId",
  authenticate,
  requirePermissions("manage_financiers"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { systemId } = req.params;
      const deleted = await deleteExternalSystem(systemId);
      if (!deleted) {
        sendError(res, req, 404, "error.external_systems.not_found");
        return;
      }
      res.status(204).send();
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// Fund pool monitoring routes
router.get(
  "/fund-pool/monitoring",
  authenticate,
  requirePermissions("view_fund_pool"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const monitoring = await getFundPoolMonitoring();
      res.json({ monitoring });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// System parameters routes
router.get(
  "/system/parameters",
  authenticate,
  requirePermissions("manage_system_parameters"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parameters = await getSystemParameters();
      res.json({ parameters });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.put(
  "/system/parameters",
  authenticate,
  requirePermissions("manage_system_parameters"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.currentUser?.id;
      const parameters = await updateSystemParameters(req.body, userId);
      res.json({ parameters });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.post(
  "/system/parameters/reset",
  authenticate,
  requirePermissions("manage_system_parameters"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.currentUser?.id;
      const parameters = await resetSystemParameters(userId);
      res.json({ parameters });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// Waybills routes
router.get(
  "/waybills/stats",
  authenticate,
  // requirePermissions("manage_waybills"), // 暂时移除权限检查
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await getWaybillStats();
      res.json(stats);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/waybills",
  authenticate,
  // requirePermissions("manage_waybills"), // 暂时移除权限检查
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        customerName,
        contractNumber,
        businessMode,
        status,
        startDate,
        endDate,
        waybillNumber,
        vehiclePlate,
        batchStatus,
        batchSource,
        routeName,
        areaId,
      } = req.query ?? {};

      const scope = await resolveWaybillAccessScope(req.orgContext);
      if (scope.emptyResult) {
        return res.json({ waybills: [] });
      }

      const waybills = await getWaybills({
        customerName: customerName as string,
        contractNumber: contractNumber as string,
        businessMode: businessMode as any,
        status: status as any,
        startDate: startDate as string,
        endDate: endDate as string,
        waybillNumber: waybillNumber as string,
        vehiclePlate: vehiclePlate as string,
        batchStatus: batchStatus as string,
        batchSource: batchSource as string,
        routeName: routeName as string,
        areaId: areaId as string,
        customerId: scope.customerId,
        customerIds: scope.customerIds,
      });
      res.json({ waybills });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/waybills/:id",
  authenticate,
  // requirePermissions("manage_waybills"), // 暂时移除权限检查
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const waybill = await getWaybillById(id);
      if (!waybill) {
        sendError(res, req, 404, "error.waybills.not_found");
        return;
      }
      res.json({ waybill });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取运单可申请的费用类别
router.get(
  "/waybills/:waybillId/available-categories",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const waybillId = req.params.waybillId;
      
      // 1. 获取运单信息
      const waybill = await getWaybillById(waybillId);
      if (!waybill) {
        sendError(res, req, 404, "error.waybills.not_found");
        return;
      }
      
      const waybillStatus = waybill.status || "created";
      
      // 2. 获取运单关联合同的费用类别配置
      // 如果运单没有关联融资方，返回所有可用类别
      const financierId = waybill.customerId;
      
      const [categoryRows] = await pool.query<RowDataPacket[]>(
        `SELECT pcc.* 
         FROM payment_category_configs pcc
         JOIN directed_pay_contracts dpc ON pcc.contract_id = dpc.id
         WHERE dpc.financier_id = ? AND pcc.is_enabled = 1 AND dpc.status = 'active'`,
        [financierId]
      );
      
      // 3. 运单状态顺序（pending 视为最初状态，与 created 同级）
      const statusOrder = [
        "pending", "created", "dispatched", "loading", "in_transit",
        "delivered", "signed", "settled", "completed"
      ];
      
      // pending 状态视为 created，允许解锁 created 阶段的类别
      const normalizedStatus = waybillStatus === "pending" ? "created" : waybillStatus;
      const currentStatusIndex = statusOrder.indexOf(normalizedStatus);
      
      // 4. 判断每个类别是否已解锁
      const categories = categoryRows.map((row: RowDataPacket) => {
        const unlockStatus = row.unlock_status || "created";
        const unlockIndex = statusOrder.indexOf(unlockStatus);
        const isUnlocked = currentStatusIndex >= unlockIndex;
        
        return {
          id: row.id,
          contractId: row.contract_id,
          categoryCode: row.category_code,
          categoryName: row.category_name,
          paymentRatio: Number(row.payment_ratio || 100),
          minAmount: row.min_amount ? Number(row.min_amount) : undefined,
          maxAmount: row.max_amount ? Number(row.max_amount) : undefined,
          unlockStatus: unlockStatus,
          isUnlocked: isUnlocked,
        };
      });
      
      // 如果没有找到配置，返回默认类别
      if (categories.length === 0) {
        const defaultCategories = [
          { categoryCode: "FREIGHT", categoryName: "运费", paymentRatio: 100 },
          { categoryCode: "OIL_CARD", categoryName: "油卡", paymentRatio: 100 },
          { categoryCode: "ETC", categoryName: "ETC", paymentRatio: 100 },
          { categoryCode: "SALARY", categoryName: "工资", paymentRatio: 100 },
        ].map(c => ({
          ...c,
          id: "",
          contractId: "",
          unlockStatus: "created",
          isUnlocked: true,
        }));
        res.json({ categories: defaultCategories });
        return;
      }
      
      res.json({ categories });
    } catch (error: any) {
      console.error("获取可申请费用类别失败:", error);
      handleError(res, req, 500, error);
    }
  }
);

router.post(
  "/waybills",
  authenticate,
  // requirePermissions("manage_waybills"), // 暂时移除权限检查
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        waybillNumber,
        customerId,
        customerName,
        contractId,
        contractNumber,
        businessMode,
        vehiclePlate,
        driverName,
        driverPhone,
        departurePlace,
        arrivalPlace,
        goodsName,
        goodsWeight,
        freightAmount,
        oilCardAmount,
        etcAmount,
        cashAmount,
        waybillDate,
        remark
      } = req.body ?? {};

      if (!waybillNumber || !customerId || !customerName || !businessMode || 
          !vehiclePlate || !driverName || !departurePlace || !arrivalPlace || 
          !goodsName || !waybillDate) {
        sendError(res, req, 400, "error.waybills.required_fields");
        return;
      }

      const waybill = await createWaybill({
        waybillNumber,
        customerId,
        customerName,
        contractId,
        contractNumber,
        businessMode,
        vehiclePlate,
        driverName,
        driverPhone,
        departurePlace,
        arrivalPlace,
        goodsName,
        goodsWeight: Number(goodsWeight) || 0,
        freightAmount: Number(freightAmount) || 0,
        oilCardAmount: Number(oilCardAmount) || 0,
        etcAmount: Number(etcAmount) || 0,
        cashAmount: Number(cashAmount) || 0,
        waybillDate,
        remark
      });
      res.status(201).json({ waybill });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/waybills/:id",
  authenticate,
  // requirePermissions("manage_waybills"), // 暂时移除权限检查
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const {
        customerId,
        customerName,
        contractId,
        contractNumber,
        businessMode,
        vehiclePlate,
        driverName,
        driverPhone,
        departurePlace,
        arrivalPlace,
        goodsName,
        goodsWeight,
        freightAmount,
        oilCardAmount,
        etcAmount,
        cashAmount,
        waybillDate,
        status,
        remark
      } = req.body ?? {};

      const waybill = await updateWaybill(id, {
        customerId,
        customerName,
        contractId,
        contractNumber,
        businessMode,
        vehiclePlate,
        driverName,
        driverPhone,
        departurePlace,
        arrivalPlace,
        goodsName,
        goodsWeight: goodsWeight !== undefined ? Number(goodsWeight) : undefined,
        freightAmount: freightAmount !== undefined ? Number(freightAmount) : undefined,
        oilCardAmount: oilCardAmount !== undefined ? Number(oilCardAmount) : undefined,
        etcAmount: etcAmount !== undefined ? Number(etcAmount) : undefined,
        cashAmount: cashAmount !== undefined ? Number(cashAmount) : undefined,
        waybillDate,
        status,
        remark
      });
      res.json({ waybill });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/waybills/:id",
  authenticate,
  // requirePermissions("manage_waybills"), // 暂时移除权限检查
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await deleteWaybill(id);
      res.status(204).send();
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 运单批量导入
router.post(
  "/waybills/import",
  authenticate,
  // requirePermissions("manage_waybills"), // 暂时移除权限检查
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgContext = req.orgContext;
      
      // 1. 权限检查：资金方不允许上传
      if (orgContext && !orgContext.isPlatformUser) {
        if (orgContext.orgType === "funder") {
          return res.status(403).json({ error: "资金方无权上传运单数据" });
        }
      }
      
      // 2. 确定 customerId
      let customerId: string | undefined;
      
      if (orgContext?.isPlatformUser) {
        // 平台用户：从请求体获取，必填
        customerId = req.body.customerId;
        if (!customerId) {
          return res.status(400).json({ error: "平台用户上传时必须指定融资方" });
        }
      } else if (orgContext?.orgType === "financier") {
        // 融资方用户：自动使用关联的融资方ID
        customerId = orgContext.relatedEntityId;
      }
      
      const { waybills } = req.body ?? {};
      
      if (!Array.isArray(waybills) || waybills.length === 0) {
        sendError(res, req, 400, "error.waybills.import_empty");
        return;
      }

      // 3. 调用导入函数，传入 customerId
      const result = await importWaybills(waybills, customerId);
      res.json(result);
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 文件上传接口
router.post(
  "/upload",
  authenticate,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = (req as any).file;
      if (!file) {
        sendError(res, req as any, 400, "error.upload.no_file");
        return;
      }
      
      const fileUrl = getFileUrl(file.filename);
      res.json({
        url: fileUrl,
        filename: file.filename,
        originalName: file.originalname
      });
    } catch (err) {
      handleError(res, req as any, 400, err);
    }
  }
);

// 文件访问接口（无需认证，文件名为UUID不可猜测）
router.get(
  "/uploads/:filename",
  async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const filePath = path.resolve(process.cwd(), "backend", "uploads", filename);
      
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch {
        sendError(res, req, 404, "error.upload.file_not_found");
        return;
      }
      
      res.sendFile(filePath);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// Settlement routes - 结算中心

// 初始化数据库表（在应用启动时调用）
ensureSettlementsTable().catch(err => {
  console.error("Failed to ensure settlements table:", err);
});

ensureCommissionContractsTable().catch(err => {
  console.error("Failed to ensure commission_contracts table:", err);
});


// 获取结算单统计
router.get(
  "/settlements/stats",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { type } = req.query;
      const stats = await getSettlementStats({
        type: type as any
      });
      res.json(stats);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取结算单列表
router.get(
  "/settlements",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { type, status, customerId, contractId, startDate, endDate } = req.query;
      const settlements = await getSettlements({
        type: type as any,
        status: status as any,
        customerId: customerId as string,
        contractId: contractId as string,
        startDate: startDate as string,
        endDate: endDate as string
      });
      res.json({ settlements });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取单个结算单
router.get(
  "/settlements/:id",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const settlement = await getSettlementById(id);
      if (!settlement) {
        sendError(res, req, 404, "error.settlements.not_found");
        return;
      }
      res.json({ settlement });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 创建结算单（手动创建）
router.post(
  "/settlements",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        type,
        contractId,
        contractType,
        customerId,
        customerName,
        periodStart,
        periodEnd,
        repaymentType,
        principal,
        interest,
        totalDue,
        waybillCount,
        totalAmount,
        details,
        dueDate
      } = req.body ?? {};

      if (!type || !contractId || !contractType || !customerId || !customerName || !periodStart || !periodEnd || !dueDate) {
        sendError(res, req, 400, "error.settlements.required_fields");
        return;
      }

      const settlement = await createSettlement({
        type,
        contractId,
        contractType,
        customerId,
        customerName,
        periodStart,
        periodEnd,
        repaymentType,
        principal: principal !== undefined ? Number(principal) : undefined,
        interest: interest !== undefined ? Number(interest) : undefined,
        totalDue: totalDue !== undefined ? Number(totalDue) : undefined,
        waybillCount: waybillCount !== undefined ? Number(waybillCount) : undefined,
        totalAmount: totalAmount !== undefined ? Number(totalAmount) : undefined,
        details,
        dueDate
      });
      res.status(201).json({ settlement });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 确认结算单
router.put(
  "/settlements/:id/confirm",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const settlement = await confirmSettlement(id);
      res.json({ settlement });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 结算结算单
router.put(
  "/settlements/:id/settle",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const settlement = await settleSettlement(id);
      res.json({ settlement });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 标记已到账
router.put(
  "/settlements/:id/mark-paid",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { paymentProofUrl } = req.body;
      const settlement = await markSettlementPaid(id, paymentProofUrl);
      res.json({ settlement });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 登记发票
router.put(
  "/settlements/:id/register-invoice",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { invoiceNumber, invoiceDate, invoiceAmount, invoiceRemark, invoiceAttachmentUrl } = req.body;
      if (!invoiceNumber || !invoiceDate || invoiceAmount == null) {
        res.status(400).json({ error: "发票号、开票日期和发票金额为必填" });
        return;
      }
      const settlement = await registerSettlementInvoice(id, { invoiceNumber, invoiceDate, invoiceAmount, invoiceRemark, invoiceAttachmentUrl });
      res.json({ settlement });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 手动触发生成账单（融资还款）
router.post(
  "/settlements/generate/financing-repayment",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        contractId,
        contractType,
        customerId,
        customerName,
        periodStart,
        periodEnd,
        repaymentType,
        principal,
        interest,
        annualInterestRate,
        usedAmount,
        daysInPeriod,
        annualDays
      } = req.body ?? {};

      if (!contractId || !customerId || !customerName || !periodStart || !periodEnd || !repaymentType) {
        sendError(res, req, 400, "error.settlements.required_fields");
        return;
      }

      const settlement = await generateFinancingRepaymentSettlement({
        contractId,
        contractType: contractType || "financing",
        customerId,
        customerName,
        periodStart,
        periodEnd,
        repaymentType,
        principal: principal !== undefined ? Number(principal) : undefined,
        interest: interest !== undefined ? Number(interest) : undefined,
        annualInterestRate: Number(annualInterestRate) || 0,
        usedAmount: Number(usedAmount) || 0,
        daysInPeriod: Number(daysInPeriod) || 30,
        annualDays: annualDays || 360
      });
      res.status(201).json({ settlement });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 手动触发生成账单（分成/抽成）
router.post(
  "/settlements/generate/commission",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        type,
        contractId,
        contractType,
        customerId,
        customerName,
        periodStart,
        periodEnd,
        waybillCount,
        details
      } = req.body ?? {};

      if (!type || !contractId || !customerId || !customerName || !periodStart || !periodEnd) {
        sendError(res, req, 400, "error.settlements.required_fields");
        return;
      }

      const settlement = await generateCommissionSettlement({
        type,
        contractId,
        contractType: contractType || "brokerage",
        customerId,
        customerName,
        periodStart,
        periodEnd,
        waybillCount: Number(waybillCount) || 0,
        details: details || []
      });
      res.status(201).json({ settlement });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 更新逾期状态（可由定时任务调用）
router.post(
  "/settlements/update-overdue",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const updatedCount = await updateOverdueSettlements();
      res.json({ success: true, updatedCount });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// =============================================
// 抽成合同 (Commission Contracts) API
// =============================================

// 获取抽成合同列表
router.get(
  "/commission-contracts",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, customerName } = req.query;
      const result = await getCommissionContracts({
        status: status as any,
        customerName: customerName as string
      });
      // 为每个合同附带关联线路
      for (const c of result.contracts) {
        c.routes = await commissionV2Store.getContractRoutes(c.id);
      }
      res.json(result);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取抽成合同统计
router.get(
  "/commission-contracts/stats",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await getCommissionContractStats();
      res.json(stats);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取单个抽成合同
router.get(
  "/commission-contracts/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contract = await getCommissionContractById(req.params.id);
      if (!contract) {
        sendError(res, req, 404, "error.commission_contracts.not_found");
        return;
      }
      contract.routes = await commissionV2Store.getContractRoutes(contract.id);
      res.json({ contract });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 创建抽成合同
router.post(
  "/commission-contracts",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        contractName,
        customerName,
        financierId,
        customerSystemId,
        startDate,
        endDate,
        settlementCycle,
        settlementDay,
        remark,
        commissionConfig,
        status,
        routeIds
      } = req.body ?? {};

      const contract = await createCommissionContract({
        contractName: contractName || undefined,
        customerName: customerName || "",
        financierId: financierId || undefined,
        customerSystemId: customerSystemId || undefined,
        startDate: startDate || new Date().toISOString().split("T")[0],
        endDate: endDate || new Date().toISOString().split("T")[0],
        settlementCycle: settlementCycle || undefined,
        settlementDay: settlementDay != null ? Number(settlementDay) : undefined,
        remark,
        commissionConfig: commissionConfig || [],
        status
      });

      if (Array.isArray(routeIds) && routeIds.length > 0) {
        const routes = await commissionV2Store.setContractRoutes(contract.id, routeIds);
        contract.routes = routes;
      }

      res.status(201).json({ contract });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 更新抽成合同
router.put(
  "/commission-contracts/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { routeIds, ...rest } = req.body ?? {};
      const contract = await updateCommissionContract(req.params.id, rest);

      if (Array.isArray(routeIds)) {
        contract.routes = await commissionV2Store.setContractRoutes(contract.id, routeIds);
      }

      res.json({ contract });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 删除抽成合同
router.delete(
  "/commission-contracts/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteCommissionContract(req.params.id);
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);


// =============================================
// 虚拟账户 API
// =============================================

// 创建虚拟账户
router.post(
  "/virtual-accounts",
  authenticate,
  requirePermissions("manage_virtual_accounts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ownerType, ownerId, ownerName } = req.body ?? {};
      if (!ownerType || !ownerId || !ownerName) {
        sendError(res, req, 400, "error.virtual_accounts.required_fields");
        return;
      }
      const account = await createVirtualAccount({ ownerType, ownerId, ownerName });
      res.status(201).json({ account });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 获取虚拟账户列表
router.get(
  "/virtual-accounts",
  authenticate,
  requireAnyPermission(["manage_virtual_accounts", "view_virtual_accounts"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ownerType, status, keyword } = req.query;
      const accounts = await getVirtualAccounts({
        ownerType: ownerType as any,
        status: status as any,
        keyword: keyword as string
      });
      res.json({ accounts });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取单个虚拟账户
router.get(
  "/virtual-accounts/:id",
  authenticate,
  requireAnyPermission(["manage_virtual_accounts", "view_virtual_accounts"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const account = await getVirtualAccountById(req.params.id);
      if (!account) {
        sendError(res, req, 404, "error.virtual_accounts.not_found");
        return;
      }
      res.json({ account });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取账户流水
router.get(
  "/virtual-accounts/:id/transactions",
  authenticate,
  requireAnyPermission(["manage_virtual_accounts", "view_virtual_accounts"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { txnType, startDate, endDate } = req.query;
      const transactions = await getAccountTransactions(req.params.id, {
        txnType: txnType as any,
        startDate: startDate as string,
        endDate: endDate as string
      });
      res.json({ transactions });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 冻结资金
router.post(
  "/virtual-accounts/:id/freeze",
  authenticate,
  requirePermissions("manage_virtual_accounts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { amount, relatedType, relatedId, remark } = req.body ?? {};
      if (!amount || amount <= 0) {
        sendError(res, req, 400, "error.virtual_accounts.invalid_amount");
        return;
      }
      const transaction = await freezeAmount(req.params.id, Number(amount), relatedType, relatedId, remark);
      res.json({ transaction });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 解冻资金
router.post(
  "/virtual-accounts/:id/unfreeze",
  authenticate,
  requirePermissions("manage_virtual_accounts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { amount, relatedType, relatedId, remark } = req.body ?? {};
      if (!amount || amount <= 0) {
        sendError(res, req, 400, "error.virtual_accounts.invalid_amount");
        return;
      }
      const transaction = await unfreezeAmount(req.params.id, Number(amount), relatedType, relatedId, remark);
      res.json({ transaction });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// =============================================
// 定向支付申请 API
// =============================================

// 获取支付申请统计
router.get(
  "/directed-pay/requests/stats",
  authenticate,
  requireAnyPermission(["create_directed_payment", "approve_directed_payment_platform", "approve_directed_payment_funder"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId, startDate, endDate } = req.query;
      
      // 根据用户组织过滤统计数据
      const orgContext = req.orgContext;
      let filterFinancierId: string | undefined;
      let filterFunderId: string | undefined;
      
      if (orgContext && !orgContext.isPlatformUser) {
        if (orgContext.orgType === "financier") {
          filterFinancierId = orgContext.relatedEntityId;
        } else if (orgContext.orgType === "funder") {
          filterFunderId = orgContext.relatedEntityId;
        }
      }
      
      const stats = await getPaymentRequestStats({
        contractId: contractId as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        financierId: filterFinancierId,
        funderId: filterFunderId,
      });
      res.json(stats);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取待审批列表
router.get(
  "/directed-pay/requests/pending-approvals",
  authenticate,
  requireAnyPermission(["approve_directed_payment_platform", "approve_directed_payment_funder"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { type } = req.query;
      if (type !== "platform" && type !== "funder") {
        sendError(res, req, 400, "error.payment_requests.invalid_type");
        return;
      }
      
      // 权限验证
      const orgContext = req.orgContext;
      
      // 平台审批列表：只有平台用户可以查看
      if (type === "platform" && orgContext && !orgContext.isPlatformUser) {
        res.json({ requests: [] });
        return;
      }
      
      // 资金方审批列表：只有对应资金方用户或平台用户可以查看
      let filterFunderId: string | undefined;
      if (type === "funder" && orgContext && !orgContext.isPlatformUser) {
        if (orgContext.orgType !== "funder") {
          res.json({ requests: [] });
          return;
        }
        filterFunderId = orgContext.relatedEntityId;
      }
      
      const requests = await getPendingApprovals({ type, funderId: filterFunderId });
      res.json({ requests });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取支付申请列表
router.get(
  "/directed-pay/requests",
  authenticate,
  requireAnyPermission(["create_directed_payment", "approve_directed_payment_platform", "approve_directed_payment_funder"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId, waybillId, status, driverId, categoryCode, startDate, endDate } = req.query;
      
      // 根据用户组织过滤数据
      const orgContext = req.orgContext;
      let filterFinancierId: string | undefined;
      let filterFunderId: string | undefined;
      
      if (orgContext && !orgContext.isPlatformUser) {
        if (orgContext.orgType === "financier") {
          filterFinancierId = orgContext.relatedEntityId;
        } else if (orgContext.orgType === "funder") {
          filterFunderId = orgContext.relatedEntityId;
        }
      }
      
      const requests = await getPaymentRequests({
        contractId: contractId as string | undefined,
        waybillId: waybillId as string | undefined,
        status: status as any,
        driverId: driverId as string | undefined,
        categoryCode: categoryCode as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        financierId: filterFinancierId,
        funderId: filterFunderId,
      });
      res.json({ requests });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取支付申请详情
router.get(
  "/directed-pay/requests/:id",
  authenticate,
  requireAnyPermission(["create_directed_payment", "approve_directed_payment_platform", "approve_directed_payment_funder"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const request = await getPaymentRequestById(req.params.id);
      if (!request) {
        sendError(res, req, 404, "error.payment_requests.not_found");
        return;
      }
      res.json({ request });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 创建支付申请
router.post(
  "/directed-pay/requests",
  authenticate,
  requirePermissions("create_directed_payment"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        contractId, waybillId, waybillNumber, categoryCode, categoryName,
        paymentAmount, serviceFee, receiverType, receiverName, receiverAccount,
        receiverBank, driverId, driverName, driverPhone, remark, skipApproval
      } = req.body ?? {};

      if (!contractId || !categoryCode || !categoryName || !paymentAmount || !receiverType) {
        sendError(res, req, 400, "error.payment_requests.required_fields");
        return;
      }

      // 权限验证：非平台用户只能在自己组织关联的合同下创建申请
      const orgContext = req.orgContext;
      
      if (orgContext && !orgContext.isPlatformUser) {
        const contract = await directedPayStore.getDirectedPayContractById(contractId);
        if (!contract) {
          sendError(res, req, 404, "error.contracts.not_found");
          return;
        }
        
        // 融资方用户只能在自己的合同下创建申请
        if (orgContext.orgType === "financier" && contract.financierId !== orgContext.relatedEntityId) {
          sendError(res, req, 403, "error.payment_requests.no_permission");
          return;
        }
        // 资金方用户只能在自己的合同下创建申请
        if (orgContext.orgType === "funder" && contract.funderId !== orgContext.relatedEntityId) {
          sendError(res, req, 403, "error.payment_requests.no_permission");
          return;
        }
      }

      // admin 用户可以跳过审批
      const isAdmin = req.currentUser?.username === "admin";

      const request = await createPaymentRequest({
        contractId,
        waybillId,
        waybillNumber,
        categoryCode,
        categoryName,
        paymentAmount: Number(paymentAmount),
        serviceFee: serviceFee !== undefined ? Number(serviceFee) : undefined,
        receiverType: receiverType as ReceiverType,
        receiverName,
        receiverAccount,
        receiverBank,
        driverId,
        driverName,
        driverPhone,
        remark,
        createdBy: req.currentUser?.id,
        skipApproval: isAdmin && skipApproval,
      });

      res.status(201).json({ request });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 批量创建支付申请
router.post(
  "/directed-pay/requests/batch",
  authenticate,
  requirePermissions("create_directed_payment"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { requests: requestsInput } = req.body ?? {};
      if (!Array.isArray(requestsInput) || requestsInput.length === 0) {
        sendError(res, req, 400, "error.payment_requests.batch_empty");
        return;
      }

      const isAdmin = req.currentUser?.username === "admin";
      const requestsWithUser = requestsInput.map(r => ({
        ...r,
        createdBy: req.currentUser?.id,
        skipApproval: isAdmin && r.skipApproval,
      }));

      const requests = await batchCreatePaymentRequests(requestsWithUser);
      res.status(201).json({ requests, count: requests.length });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 平台审批通过
router.post(
  "/directed-pay/requests/:id/platform-approve",
  authenticate,
  requirePermissions("approve_directed_payment_platform"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 权限验证：只有平台用户可以进行平台审批
      const orgContext = req.orgContext;
      if (orgContext && !orgContext.isPlatformUser) {
        sendError(res, req, 403, "error.payment_requests.platform_only");
        return;
      }
      
      const { remark } = req.body ?? {};
      const request = await platformApprove(req.params.id, req.currentUser!.id, remark);
      res.json({ request });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 平台审批拒绝
router.post(
  "/directed-pay/requests/:id/platform-reject",
  authenticate,
  requirePermissions("approve_directed_payment_platform"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 权限验证：只有平台用户可以进行平台审批
      const orgContext = req.orgContext;
      if (orgContext && !orgContext.isPlatformUser) {
        sendError(res, req, 403, "error.payment_requests.platform_only");
        return;
      }
      
      const { remark } = req.body ?? {};
      const request = await platformReject(req.params.id, req.currentUser!.id, remark);
      res.json({ request });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 资金方审批通过
router.post(
  "/directed-pay/requests/:id/funder-approve",
  authenticate,
  requirePermissions("approve_directed_payment_funder"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 权限验证：只有对应资金方用户或平台用户可以进行资金方审批
      const orgContext = req.orgContext;
      if (orgContext && !orgContext.isPlatformUser) {
        if (orgContext.orgType !== "funder") {
          sendError(res, req, 403, "error.payment_requests.funder_only");
          return;
        }
        // 验证是否是该合同的资金方
        const paymentRequest = await getPaymentRequestById(req.params.id);
        if (paymentRequest) {
          const contract = await directedPayStore.getDirectedPayContractById(paymentRequest.contractId);
          if (contract && contract.funderId !== orgContext.relatedEntityId) {
            sendError(res, req, 403, "error.payment_requests.funder_mismatch");
            return;
          }
        }
      }
      
      const { remark } = req.body ?? {};
      const request = await funderApprove(req.params.id, req.currentUser!.id, remark);
      res.json({ request });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 资金方审批拒绝
router.post(
  "/directed-pay/requests/:id/funder-reject",
  authenticate,
  requirePermissions("approve_directed_payment_funder"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 权限验证：只有对应资金方用户或平台用户可以进行资金方审批
      const orgContext = req.orgContext;
      if (orgContext && !orgContext.isPlatformUser) {
        if (orgContext.orgType !== "funder") {
          sendError(res, req, 403, "error.payment_requests.funder_only");
          return;
        }
        // 验证是否是该合同的资金方
        const paymentRequest = await getPaymentRequestById(req.params.id);
        if (paymentRequest) {
          const contract = await directedPayStore.getDirectedPayContractById(paymentRequest.contractId);
          if (contract && contract.funderId !== orgContext.relatedEntityId) {
            sendError(res, req, 403, "error.payment_requests.funder_mismatch");
            return;
          }
        }
      }
      
      const { remark } = req.body ?? {};
      const request = await funderReject(req.params.id, req.currentUser!.id, remark);
      res.json({ request });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 取消支付申请
router.post(
  "/directed-pay/requests/:id/cancel",
  authenticate,
  requirePermissions("create_directed_payment"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const request = await cancelPaymentRequest(req.params.id);
      res.json({ request });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 执行支付
router.post(
  "/directed-pay/requests/:id/execute",
  authenticate,
  requireAnyPermission(["create_directed_payment", "approve_directed_payment_platform"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const request = await executePayment(req.params.id);
      
      // 如果是付款码方式，推送到TMS
      if (request.receiverType === "payment_code" && request.executionTransactionId) {
        const tmsResult = await syncPaymentCodeToTms({
          code: request.executionTransactionId,
          amount: request.paymentAmount,
          expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          driverId: request.driverId,
          driverPhone: request.driverPhone,
          waybillNumber: request.waybillNumber,
          categoryName: request.categoryName,
          remark: request.remark,
        });
        
        if (tmsResult.success) {
          await updateTmsSyncStatus(request.executionTransactionId, "synced", { tmsCodeId: tmsResult.tmsCodeId });
        }
      }
      
      res.json({ request });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// =============================================
// 付款码 API (定向支付)
// =============================================

// 查询付款码
router.get(
  "/directed-pay/payment-codes/:code",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const paymentCode = await getPaymentCodeByCode(req.params.code);
      if (!paymentCode) {
        sendError(res, req, 404, "error.payment_codes.not_found");
        return;
      }
      res.json({ paymentCode });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// TMS回调（使用付款码）
router.post(
  "/directed-pay/payment-codes/callback",
  async (req: Request, res: Response) => {
    try {
      const { code, usedLocation, syncData } = req.body ?? {};
      if (!code) {
        res.status(400).json({ error: "付款码不能为空" });
        return;
      }
      
      // 使用付款码
      const paymentCode = await usePaymentCode(code, usedLocation);
      
      // 更新同步状态
      await updateTmsSyncStatus(code, "synced", syncData);
      
      res.json({ success: true, paymentCode });
    } catch (err) {
      // 记录同步失败
      const { code } = req.body ?? {};
      if (code) {
        await updateTmsSyncStatus(code, "failed", { error: String(err) }).catch(() => {});
      }
      res.status(400).json({ error: String(err) });
    }
  }
);

// 取消付款码
router.post(
  "/directed-pay/payment-codes/:code/cancel",
  authenticate,
  requireAnyPermission(["create_directed_payment", "approve_directed_payment_platform"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await cancelPaymentCode(req.params.code);
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// =============================================
// 定向支付合同管理 API
// =============================================

// 初始化定向支付合同表
directedPayStore.ensureDirectedPayContractsTables().catch(console.error);

// 获取定向支付合同列表
router.get(
  "/directed-pay/contracts",
  authenticate,
  requireAnyPermission(["manage_directed_pay_contracts", "view_directed_pay_contracts"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { funderId, financierId, status, keyword } = req.query;
      const contracts = await directedPayStore.getDirectedPayContracts({
        funderId: funderId as string,
        financierId: financierId as string,
        status: status as directedPayStore.DirectedPayContractStatus,
        keyword: keyword as string,
      });
      res.json({ contracts });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取定向支付合同统计
router.get(
  "/directed-pay/contracts/stats",
  authenticate,
  requireAnyPermission(["manage_directed_pay_contracts", "view_directed_pay_contracts"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await directedPayStore.getDirectedPayContractStats();
      res.json(stats);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取支付类别模板
router.get(
  "/directed-pay/category-templates",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json({ templates: directedPayStore.getPaymentCategoryTemplates() });
  }
);

// 获取定向支付合同详情
router.get(
  "/directed-pay/contracts/:id",
  authenticate,
  requireAnyPermission(["manage_directed_pay_contracts", "view_directed_pay_contracts"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contract = await directedPayStore.getDirectedPayContractById(req.params.id);
      if (!contract) {
        return res.status(404).json({ error: "合同不存在" });
      }
      res.json({ contract });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 创建定向支付合同
router.post(
  "/directed-pay/contracts",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contract = await directedPayStore.createDirectedPayContract({
        ...req.body,
        createdBy: req.currentUser?.id,
      });
      res.json({ contract });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 更新定向支付合同
router.put(
  "/directed-pay/contracts/:id",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contract = await directedPayStore.updateDirectedPayContract(req.params.id, req.body);
      res.json({ contract });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 删除定向支付合同
router.delete(
  "/directed-pay/contracts/:id",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await directedPayStore.deleteDirectedPayContract(req.params.id);
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 审批合同（状态变更为 active）
router.post(
  "/directed-pay/contracts/:id/approve",
  authenticate,
  requirePermissions("approve_directed_pay_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await directedPayStore.updateDirectedPayContractStatus(req.params.id, "active");
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 提交审批（状态变更为 pending_approval）
router.post(
  "/directed-pay/contracts/:id/submit",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await directedPayStore.updateDirectedPayContractStatus(req.params.id, "pending_approval");
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 暂停合同
router.post(
  "/directed-pay/contracts/:id/suspend",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await directedPayStore.updateDirectedPayContractStatus(req.params.id, "suspended");
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 恢复合同
router.post(
  "/directed-pay/contracts/:id/resume",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await directedPayStore.updateDirectedPayContractStatus(req.params.id, "active");
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 终止合同
router.post(
  "/directed-pay/contracts/:id/terminate",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await directedPayStore.updateDirectedPayContractStatus(req.params.id, "terminated");
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// ========== 支付类别配置 ==========

// 获取合同的支付类别
router.get(
  "/directed-pay/contracts/:id/categories",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const categories = await directedPayStore.getPaymentCategoriesByContract(req.params.id);
      res.json({ categories });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 添加支付类别
router.post(
  "/directed-pay/contracts/:id/categories",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const category = await directedPayStore.addPaymentCategory(req.params.id, req.body);
      res.json({ category });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 更新支付类别
router.put(
  "/directed-pay/contracts/:id/categories/:catId",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const category = await directedPayStore.updatePaymentCategory(req.params.catId, req.body);
      res.json({ category });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 删除支付类别
router.delete(
  "/directed-pay/contracts/:id/categories/:catId",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await directedPayStore.deletePaymentCategory(req.params.catId);
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// =============================================
// 定向支付结算 API
// =============================================

// 初始化定向支付结算表
ensureDirectedPaySettlementsTables().catch(err => {
  console.error("Failed to ensure directed pay settlements tables:", err);
});

// 获取定向支付结算统计
router.get(
  "/directed-pay/settlements/stats",
  authenticate,
  requireAnyPermission(["manage_directed_pay_settlements", "view_directed_pay_settlements"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId } = req.query;
      const stats = await getDirectedPaySettlementStats(contractId as string);
      res.json(stats);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取定向支付结算单列表
router.get(
  "/directed-pay/settlements",
  authenticate,
  requireAnyPermission(["manage_directed_pay_settlements", "view_directed_pay_settlements"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId, financierId, status, startDate, endDate } = req.query;
      const settlements = await getDirectedPaySettlements({
        contractId: contractId as string,
        financierId: financierId as string,
        status: status as any,
        startDate: startDate as string,
        endDate: endDate as string
      });
      res.json({ settlements });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 获取单个定向支付结算单详情
router.get(
  "/directed-pay/settlements/:id",
  authenticate,
  requireAnyPermission(["manage_directed_pay_settlements", "view_directed_pay_settlements"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const settlement = await getDirectedPaySettlementById(id);
      if (!settlement) {
        sendError(res, req, 404, "error.directed_pay_settlements.not_found");
        return;
      }
      // 同时获取明细
      const items = await getDirectedPaySettlementItems(id);
      res.json({ settlement, items });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 生成定向支付结算单
router.post(
  "/directed-pay/settlements/generate",
  authenticate,
  requirePermissions("manage_directed_pay_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId, periodEnd } = req.body ?? {};
      
      if (!contractId || !periodEnd) {
        sendError(res, req, 400, "error.directed_pay_settlements.required_fields");
        return;
      }
      
      const settlement = await generateDirectedPaySettlement(
        contractId,
        new Date(periodEnd)
      );
      res.status(201).json({ settlement });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 确认定向支付结算单
router.post(
  "/directed-pay/settlements/:id/confirm",
  authenticate,
  requirePermissions("manage_directed_pay_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const settlement = await confirmDirectedPaySettlement(req.params.id);
      res.json({ settlement });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 还款处理
router.post(
  "/directed-pay/settlements/:id/pay",
  authenticate,
  requirePermissions("manage_directed_pay_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { amount } = req.body ?? {};
      
      if (!amount || amount <= 0) {
        sendError(res, req, 400, "error.directed_pay_settlements.invalid_amount");
        return;
      }
      
      const settlement = await processDirectedPayRepayment(req.params.id, Number(amount));
      res.json({ settlement });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 更新定向支付逾期状态（用于定时任务）
router.post(
  "/directed-pay/settlements/update-overdue",
  authenticate,
  requirePermissions("manage_directed_pay_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const updatedCount = await updateOverdueDirectedPaySettlements();
      res.json({ success: true, updatedCount });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 计算利息（工具接口）
router.post(
  "/directed-pay/calculate-interest",
  authenticate,
  requireAnyPermission(["manage_directed_pay_settlements", "view_directed_pay_settlements"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { principal, annualRate, paymentTime, settlementTime, calcBase } = req.body ?? {};
      
      if (!principal || !annualRate || !paymentTime || !settlementTime) {
        sendError(res, req, 400, "error.directed_pay_settlements.required_fields");
        return;
      }
      
      const result = calculateInterest(
        Number(principal),
        Number(annualRate),
        new Date(paymentTime),
        new Date(settlementTime),
        Number(calcBase) || 360
      );
      
      res.json(result);
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// =============================================
// 结算调度器 API
// =============================================

import { triggerSettlementManually } from "./settlement-scheduler.js";

// 手动触发结算任务
router.post(
  "/settlements/trigger-scheduler",
  authenticate,
  requirePermissions("manage_settlements"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await triggerSettlementManually();
      res.json({ 
        success: true, 
        message: "结算任务执行完成",
        result 
      });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// =============================================
// 区域 (Areas) API
// =============================================

router.get(
  "/areas",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { financierId, status } = req.query;
      const items = await commissionV2Store.getAreas({
        financierId: financierId as string,
        status: status as string,
      });
      res.json({ areas: items });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.post(
  "/areas",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, financierId, remark } = req.body ?? {};
      if (!name || !financierId) {
        sendError(res, req, 400, "区域名称和合作方为必填");
        return;
      }
      const item = await commissionV2Store.createArea({ name, financierId, remark });
      res.status(201).json({ area: item });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/areas/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const item = await commissionV2Store.updateArea(req.params.id, req.body);
      res.json({ area: item });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/areas/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await commissionV2Store.deleteArea(req.params.id);
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// =============================================
// 落地合作方 (Local Partners) API
// =============================================

router.get(
  "/local-partners",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { financierId, areaId, status } = req.query;
      const items = await commissionV2Store.getLocalPartners({
        financierId: financierId as string,
        areaId: areaId as string,
        status: status as string,
      });
      res.json({ localPartners: items });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/local-partners/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const item = await commissionV2Store.getLocalPartnerById(req.params.id);
      if (!item) { sendError(res, req, 404, "落地合作方不存在"); return; }
      res.json({ localPartner: item });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.post(
  "/local-partners",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, financierId, areaId, contactPerson, contactPhone, remark } = req.body ?? {};
      if (!name || !financierId) {
        sendError(res, req, 400, "名称和合作方为必填");
        return;
      }
      const item = await commissionV2Store.createLocalPartner({ name, financierId, areaId, contactPerson, contactPhone, remark });
      res.status(201).json({ localPartner: item });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/local-partners/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const item = await commissionV2Store.updateLocalPartner(req.params.id, req.body);
      res.json({ localPartner: item });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/local-partners/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await commissionV2Store.deleteLocalPartner(req.params.id);
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// =============================================
// 线路 (Routes) API
// =============================================

router.get(
  "/routes",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { localPartnerId, financierId, areaId, status } = req.query;
      const items = await commissionV2Store.getRoutes({
        localPartnerId: localPartnerId as string,
        financierId: financierId as string,
        areaId: areaId as string,
        status: status as string,
      });
      res.json({ routes: items });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.post(
  "/routes",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, localPartnerId, remark } = req.body ?? {};
      if (!name || !localPartnerId) {
        sendError(res, req, 400, "名称和落地合作方为必填");
        return;
      }
      const item = await commissionV2Store.createRoute({ name, localPartnerId, remark });
      res.status(201).json({ route: item });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.put(
  "/routes/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const item = await commissionV2Store.updateRoute(req.params.id, req.body);
      res.json({ route: item });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

router.delete(
  "/routes/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await commissionV2Store.deleteRoute(req.params.id);
      res.json({ success: true });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// =============================================
// 对账批次 (Reconciliation) API
// ENABLE_COMMISSION_RECON_V2 灰度开关
// =============================================

function requireReconV2(_req: Request, res: Response, next: NextFunction) {
  if (process.env.ENABLE_COMMISSION_RECON_V2 !== "true") {
    res.status(403).json({ error: "对账 v2 功能尚未启用" });
    return;
  }
  next();
}

router.get(
  "/recon-batches",
  authenticate,
  requireReconV2,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId, financierId, areaId, status, startDate, endDate } = req.query;
      const batches = await reconStore.getReconBatches({
        contractId: contractId as string,
        financierId: financierId as string,
        areaId: areaId as string,
        status: status as any,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      res.json({ batches });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/recon-batches/stats",
  authenticate,
  requireReconV2,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await reconStore.getReconStats();
      res.json(stats);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/recon-batches/:id",
  authenticate,
  requireReconV2,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const batch = await reconStore.getReconBatchById(req.params.id);
      if (!batch) { sendError(res, req, 404, "对账批次不存在"); return; }
      const recordIds = await reconStore.getBatchRevenueRecordIds(batch.id);
      res.json({ batch, revenueRecordIds: recordIds });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 创建对账批次（选中收益单 → 标记正在对账）
router.post(
  "/recon-batches",
  authenticate,
  requireReconV2,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId, financierId, financierName, periodStart, periodEnd, revenueRecordIds, remark } = req.body ?? {};
      if (!contractId || !periodStart || !periodEnd || !Array.isArray(revenueRecordIds) || revenueRecordIds.length === 0) {
        sendError(res, req, 400, "合同ID、日期范围、收益记录ID列表为必填");
        return;
      }
      const batch = await reconStore.createReconBatch({
        contractId, financierId, financierName, periodStart, periodEnd, revenueRecordIds, remark,
      });
      res.status(201).json({ batch });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 标记对账完成
router.post(
  "/recon-batches/:id/reconciled",
  authenticate,
  requireReconV2,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const batch = await reconStore.markReconciled(req.params.id);
      res.json({ batch });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 生成结算单
router.post(
  "/recon-batches/:id/generate-settlement",
  authenticate,
  requireReconV2,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const batch = await reconStore.getReconBatchById(req.params.id);
      if (!batch) { sendError(res, req, 404, "对账批次不存在"); return; }

      const settlement = await createSettlementRecord({
        type: "commission",
        contractId: batch.contractId,
        contractType: "commission_contract",
        customerId: batch.financierId || "",
        customerName: batch.financierName || "",
        periodStart: batch.periodStart,
        periodEnd: batch.periodEnd,
        waybillCount: batch.itemCount,
        totalAmount: batch.totalAmount,
        dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0],
      });

      const updated = await reconStore.generateSettlementForBatch(batch.id, settlement.id);
      res.json({ batch: updated, settlement });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 标记线下已付款
router.post(
  "/recon-batches/:id/paid-offline",
  authenticate,
  requireReconV2,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { paymentProofUrl } = req.body ?? {};
      const batch = await reconStore.markPaidOffline(req.params.id, paymentProofUrl);
      res.json({ batch });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 标记已入账
router.post(
  "/recon-batches/:id/accounted",
  authenticate,
  requireReconV2,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const batch = await reconStore.markAccounted(req.params.id);
      res.json({ batch });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 取消对账批次（退回）
router.post(
  "/recon-batches/:id/cancel",
  authenticate,
  requireReconV2,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const batch = await reconStore.cancelReconBatch(req.params.id);
      res.json({ batch });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

// 获取批次关联的收益记录明细
router.get(
  "/recon-batches/:id/records",
  authenticate,
  requireReconV2,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const records = await reconStore.getBatchRevenueRecords(req.params.id);
      res.json({ records });
    } catch (err) {
      handleError(res, req, 400, err);
    }
  }
);

export default router;

