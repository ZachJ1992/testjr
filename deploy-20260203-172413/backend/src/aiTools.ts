import { FunctionTool } from "./qwenAgent.js";
import { z } from "zod";
import { EnumValues } from "../../shared/src/enums.js";
import {
  addUserToGroup as addUserToGroupStore,
  assignRoleToUser as assignRoleToUserStore,
  createUser as createUserStore,
  deleteUser as deleteUserStore,
  getGroups as getGroupsStore,
  getOrgUnits as getOrgUnitsStore,
  getPermissions as getPermissionsStore,
  getUsers as getUsersStore,
  updateUser as updateUserStore,
  listI18nEntries
} from "./store.js";
import { getUserPermissionsByUserId } from "./store.js";
import {
  getFunders,
  getFunderById,
  createFunder,
  updateFunder,
  deleteFunder
} from "./funders-store.js";

export const getUsers = new FunctionTool({
  name: "list_users",
  description: "列出所有用户",
  parameters: z.object({}),
  execute: async () => {
    const users = await getUsersStore();
    console.log("[getUsers] 从数据库获取到的用户数据:", JSON.stringify(users, null, 2));
    return users;
  }
});

export const createUser = new FunctionTool({
  name: "create_user",
  description: "创建用户，可选用户组、状态",
  parameters: z.object({
    username: z.string(),
    password: z.string(),
    displayName: z.string(),
    groupIds: z.array(z.string()).optional(),
    isActive: z.boolean().optional()
  }),
  execute: async (input: any) => {
    const user = await createUserStore({
      username: input.username,
      password: input.password,
      displayName: input.displayName,
      groupIds: input.groupIds,
      isActive: input.isActive
    });
    return user;
  }
});

export const updateUser = new FunctionTool({
  name: "update_user",
  description: "更新用户，支持姓名、密码、用户组、启用状态",
  parameters: z.object({
    id: z.string(),
    displayName: z.string().optional(),
    password: z.string().optional(),
    groupIds: z.array(z.string()).optional(),
    isActive: z.boolean().optional()
  }),
  execute: async (input: any) => {
    const user = await updateUserStore(input.id, {
      displayName: input.displayName,
      password: input.password,
      groupIds: input.groupIds,
      isActive: input.isActive
    });
    return user;
  }
});

export const deleteUser = new FunctionTool({
  name: "delete_user",
  description: "删除用户",
  parameters: z.object({ id: z.string() }),
  execute: async (input: any) => {
    await deleteUserStore(input.id);
    return { success: true };
  }
});

export const addUserToGroup = new FunctionTool({
  name: "add_user_to_group",
  description: "将用户加入组",
  parameters: z.object({
    userId: z.string(),
    groupId: z.string()
  }),
  execute: async (input: any) => {
    return await addUserToGroupStore(input.userId, input.groupId);
  }
});

export const assignRoleToUser = new FunctionTool({
  name: "assign_role_to_user",
  description: "为用户分配角色",
  parameters: z.object({
    userId: z.string(),
    roleId: z.string()
  }),
  execute: async (input: any) => {
    return await assignRoleToUserStore(input.userId, input.roleId);
  }
});

export const getGroups = new FunctionTool({
  name: "list_groups",
  description: "获取系统中所有用户组的真实数据。必须使用此工具获取用户组信息，不要编造数据。返回用户组列表，包含 id、name、orgId 等字段。",
  parameters: z.object({}),
  execute: async () => {
    const groups = await getGroupsStore();
    console.log("[getGroups] 从数据库获取到的用户组数据:", JSON.stringify(groups, null, 2));
    return groups;
  }
});

export const getOrgUnits = new FunctionTool({
  name: "list_orgs",
  description: "获取系统中所有组织的真实数据。必须使用此工具获取组织信息，不要编造数据。返回组织列表，包含 id、name 等字段。",
  parameters: z.object({}),
  execute: async () => {
    const orgs = await getOrgUnitsStore();
    console.log("[getOrgUnits] 从数据库获取到的组织数据:", JSON.stringify(orgs, null, 2));
    return orgs;
  }
});

export const getPermissions = new FunctionTool({
  name: "list_permissions",
  description: "列出权限树",
  parameters: z.object({}),
  execute: async () => getPermissionsStore()
});

export const fetchI18nForAdmin = new FunctionTool({
  name: "list_i18n_entries",
  description: "列出 i18n 条目（含默认 + DB 覆盖）",
  parameters: z.object({}),
  execute: async () => {
    const entries = await listI18nEntries({});
    return entries;
  }
});

export async function getUserPermissionsByUserIdSafe(userId: string) {
  return await getUserPermissionsByUserId(userId);
}

export const getFundersList = new FunctionTool({
  name: "list_funders",
  description: "列出所有资金方，支持按机构名称、联系人、机构类型、状态过滤。必须使用此工具获取资金方信息，不要编造数据。",
  parameters: z.object({
    institutionName: z.string().optional(),
    contactPerson: z.string().optional(),
    institutionType: z.enum(EnumValues.FunderType).optional(),
    status: z.enum(EnumValues.FunderStatus).optional()
  }),
  execute: async (input: any) => {
    const funders = await getFunders({
      institutionName: input.institutionName,
      contactPerson: input.contactPerson,
      institutionType: input.institutionType,
      status: input.status
    });
    console.log("[getFundersList] 从数据库获取到的资金方数据:", JSON.stringify(funders, null, 2));
    return funders;
  }
});

export const getFunderDetail = new FunctionTool({
  name: "get_funder",
  description: "根据ID获取资金方详细信息。必须使用此工具获取资金方信息，不要编造数据。",
  parameters: z.object({
    id: z.string()
  }),
  execute: async (input: any) => {
    const funder = await getFunderById(input.id);
    if (!funder) {
      return { error: "资金方不存在" };
    }
    return funder;
  }
});

export const createFunderTool = new FunctionTool({
  name: "create_funder",
  description: `创建资金方。机构全称、机构类型、统一社会信用代码为必填字段。
机构类型可选值：${EnumValues.FunderType.join(", ")}`,
  parameters: z.object({
    institutionName: z.string(),
    institutionType: z.enum(EnumValues.FunderType),
    unifiedSocialCreditCode: z.string(),
    businessLicenseUrl: z.string().optional(),
    financialLicenseUrl: z.string().optional(),
    accountOpeningPermitUrl: z.string().optional(),
    contactPerson: z.string().optional(),
    contactPhone: z.string().optional(),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    accountName: z.string().optional()
  }),
  execute: async (input: any) => {
    const funder = await createFunder(input);
    return funder;
  }
});

export const updateFunderTool = new FunctionTool({
  name: "update_funder",
  description: "更新资金方信息。所有字段都是可选的，只更新提供的字段。",
  parameters: z.object({
    id: z.string(),
    institutionName: z.string().optional(),
    institutionType: z.enum(EnumValues.FunderType).optional(),
    unifiedSocialCreditCode: z.string().optional(),
    businessLicenseUrl: z.string().optional(),
    financialLicenseUrl: z.string().optional(),
    accountOpeningPermitUrl: z.string().optional(),
    contactPerson: z.string().optional(),
    contactPhone: z.string().optional(),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    accountName: z.string().optional(),
    status: z.enum(EnumValues.FunderStatus).optional()
  }),
  execute: async (input: any) => {
    const { id, ...updates } = input;
    const funder = await updateFunder(id, updates);
    return funder;
  }
});

export const deleteFunderTool = new FunctionTool({
  name: "delete_funder",
  description: "删除资金方（逻辑删除）。",
  parameters: z.object({
    id: z.string()
  }),
  execute: async (input: any) => {
    await deleteFunder(input.id);
    return { success: true };
  }
});

