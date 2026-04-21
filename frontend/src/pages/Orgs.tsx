import {
  RoleDetail,
  createOrgApi,
  createUserApi,
  deleteOrgApi,
  disableTenantApi,
  enableTenantApi,
  fetchOrgs,
  fetchRoles,
  fetchUsers,
  fetchGroups,
  getErrorMessage,
  updateOrgApi,
  updateUserApi,
  deleteUserApi
} from "../api";
import { useAuth } from "../auth";
import { OrgUnit, SafeUser, UserGroupDetail, OrgType } from "../types";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Result,
  Row,
  Space,
  Switch,
  Tag,
  Tree,
  Select,
  message
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import { useI18n } from "../i18n";
import DataTable from "../components/DataTable";

// 组织类型颜色和标签映射
const getOrgTypeConfig = (type?: OrgType) => {
  switch (type) {
    case "funder":
      return { color: "blue", label: "资金方" };
    case "financier":
      return { color: "green", label: "融资方" };
    case "platform":
    default:
      return { color: "purple", label: "平台" };
  }
};

interface OrgFormValues {
  name: string;
  parentId?: string | null;
  isActive?: boolean;
}

interface UserFormValues {
  username: string;
  displayName: string;
  password?: string;
  groupIds?: string[];
  roleIds?: string[];
  isActive?: boolean;
}

function buildTree(orgs: OrgUnit[]) {
  const map = new Map<string, any>();
  orgs.forEach((o) => {
    const typeConfig = getOrgTypeConfig(o.type);
    map.set(o.id, {
      key: o.id,
      title: (
        <Space>
          <span>{o.name}</span>
          <Tag color={typeConfig.color}>{typeConfig.label}</Tag>
          {!o.isActive && <Tag color="red">停用</Tag>}
        </Space>
      ),
      parentId: o.parentId,
      isActive: o.isActive,
      type: o.type
    });
  });
  const roots: any[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId);
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function OrgsPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [orgs, setOrgs] = useState<OrgUnit[]>([]);
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [groups, setGroups] = useState<UserGroupDetail[]>([]);
  const [roles, setRoles] = useState<RoleDetail[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
  const [editingOrg, setEditingOrg] = useState<OrgUnit | null>(null);
  const [orgForm] = Form.useForm<OrgFormValues>();
  const [userForm] = Form.useForm<UserFormValues>();

  const treeData = useMemo(() => buildTree(orgs), [orgs]);
  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);
  const filteredUsers = useMemo(
    () => users.filter((u) => u.orgId === selectedOrgId),
    [users, selectedOrgId]
  );
  const groupOptions = useMemo(
    () => groups.map((g) => ({ label: g.name, value: g.id })),
    [groups]
  );
  const roleOptions = useMemo(
    () =>
      roles.map((r) => ({
        label: `${r.name}${r.permissions?.length ? `（${r.permissions.length} 个权限）` : ""}`,
        value: r.id
      })),
    [roles]
  );

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [orgRes, userRes, groupRes, roleRes] = await Promise.all([
        fetchOrgs(token),
        fetchUsers(token),
        fetchGroups(token),
        fetchRoles(token).catch(() => ({ roles: [] as RoleDetail[] }))
      ]);
      setOrgs(orgRes.orgs);
      setUsers(userRes.users);
      setGroups(groupRes.groups);
      setRoles((roleRes as { roles: RoleDetail[] }).roles || []);
      if (!selectedOrgId && orgRes.orgs.length) {
        setSelectedOrgId(orgRes.orgs[0].id);
      }
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const openCreateOrg = (parentId?: string) => {
    setEditingOrg(null);
    orgForm.resetFields();
    orgForm.setFieldsValue({ parentId: parentId ?? null, isActive: true });
    setOrgModalOpen(true);
  };

  const openEditOrg = () => {
    if (!selectedOrg) {
      message.warning(t("orgs.select_org_prompt", "请先选择组织"));
      return;
    }
    setEditingOrg(selectedOrg);
    orgForm.setFieldsValue({
      name: selectedOrg.name,
      parentId: selectedOrg.parentId ?? null,
      isActive: selectedOrg.isActive !== false
    });
    setOrgModalOpen(true);
  };

  const handleSaveOrg = async () => {
    if (!token) return;
    const values = await orgForm.validateFields();
    try {
      if (editingOrg) {
        await updateOrgApi(token, editingOrg.id, {
          name: values.name,
          parentId: values.parentId,
          isActive: values.isActive
        });
      } else {
        await createOrgApi(token, {
          name: values.name,
          parentId: values.parentId || undefined,
          isActive: values.isActive
        });
      }
      message.success(t("orgs.saved", "保存成功"));
      setOrgModalOpen(false);
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleDeleteOrg = async () => {
    if (!token || !selectedOrgId) return;
    Modal.confirm({
      title: t("orgs.confirm_delete", "确认删除该组织？"),
      content: t("orgs.delete_content", "需确保无子组织和成员。"),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteOrgApi(token, selectedOrgId);
          message.success(t("orgs.deleted", "已删除"));
          setSelectedOrgId(undefined);
          await refresh();
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      }
    });
  };

  const handleToggleTenant = async () => {
    if (!token || !selectedOrg) return;
    const willDisable = selectedOrg.isActive !== false;
    Modal.confirm({
      title: willDisable
        ? t("orgs.confirm_disable_tenant", "确认停用该主体？")
        : t("orgs.confirm_enable_tenant", "确认启用该主体？"),
      content: willDisable
        ? t(
            "orgs.disable_tenant_hint",
            "停用后该主体下的用户仍可登录，但所有写操作会被后端统一拦截。"
          )
        : t("orgs.enable_tenant_hint", "启用后该主体恢复正常写操作。"),
      okButtonProps: willDisable ? { danger: true } : undefined,
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        try {
          if (willDisable) {
            await disableTenantApi(token, selectedOrg.id);
            message.success(t("orgs.tenant_disabled", "已停用主体"));
          } else {
            await enableTenantApi(token, selectedOrg.id);
            message.success(t("orgs.tenant_enabled", "已启用主体"));
          }
          await refresh();
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      }
    });
  };

  const openUserModal = () => {
    if (!selectedOrgId) {
      message.warning(t("orgs.select_org_prompt", "请选择组织"));
      return;
    }
    userForm.resetFields();
    userForm.setFieldsValue({ isActive: true, groupIds: [], roleIds: [] });
    setEditingUser(null);
    setUserModalOpen(true);
  };

  const openEditUser = (record: SafeUser) => {
    setEditingUser(record);
    userForm.setFieldsValue({
      username: record.username,
      displayName: record.displayName,
      groupIds: record.groupIds,
      roleIds: record.roleIds,
      isActive: record.isActive !== false
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!token || !selectedOrgId) return;
    const values = await userForm.validateFields();
    try {
      if (editingUser) {
        await updateUserApi(token, editingUser.id, {
          displayName: values.displayName,
          password: values.password || undefined,
          groupIds: values.groupIds,
          roleIds: values.roleIds,
          isActive: values.isActive
        });
      } else {
        if (!values.password) {
          message.error(t("users.password_required", "请输入密码"));
          return;
        }
        await createUserApi(token, {
          username: values.username,
          password: values.password,
          displayName: values.displayName,
          orgId: selectedOrgId,
          groupIds: values.groupIds,
          roleIds: values.roleIds,
          isActive: values.isActive
        });
      }
      message.success("已保存");
      setUserModalOpen(false);
      setEditingUser(null);
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleToggleUser = async (record: SafeUser, next: boolean) => {
    if (!token) return;
    try {
      await updateUserApi(token, record.id, { isActive: next });
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleDeleteUser = (record: SafeUser) => {
    if (!token) return;
    Modal.confirm({
      title: t("common.confirm_delete", "确认删除？"),
      content: t("users.delete_confirm_content", "确定要删除用户 \"{name}\" 吗？此操作不可恢复。").replace("{name}", record.displayName || record.username),
      okButtonProps: { danger: true },
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        try {
          await deleteUserApi(token, record.id);
          message.success(t("common.deleted", "已删除"));
          await refresh();
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      }
    });
  };

  if (!user?.permissions?.includes("manage_orgs")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("orgs.no_access", "需要 manage_orgs 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={16}>
        <Col xs={24} md={8} lg={6}>
          <Card
            title={t("orgs.title", "组织架构")}
            extra={
              <Space>
                <Button size="small" onClick={() => openCreateOrg()}>
                  {t("orgs.add_root", "新增根组织")}
                </Button>
                <Button
                  size="small"
                  onClick={() => openCreateOrg(selectedOrgId)}
                  disabled={!selectedOrgId}
                >
                  {t("orgs.add_child", "新增子组织")}
                </Button>
              </Space>
            }
          >
            <Tree
              treeData={treeData}
              selectedKeys={selectedOrgId ? [selectedOrgId] : []}
              onSelect={(keys) => setSelectedOrgId(keys[0] as string)}
              defaultExpandAll
            />
          </Card>
        </Col>
        <Col xs={24} md={16} lg={18}>
          <Space style={{ marginBottom: 12 }}>
            <Button type="primary" onClick={openEditOrg} disabled={!selectedOrgId}>
              {t("orgs.edit", "编辑组织")}
            </Button>
            <Button
              onClick={handleToggleTenant}
              disabled={!selectedOrg}
              danger={selectedOrg?.isActive !== false}
            >
              {selectedOrg?.isActive === false
                ? t("orgs.enable_tenant", "启用主体")
                : t("orgs.disable_tenant", "停用主体")}
            </Button>
            <Button danger onClick={handleDeleteOrg} disabled={!selectedOrgId}>
              {t("orgs.delete", "删除组织")}
            </Button>
            <Button onClick={openUserModal} disabled={!selectedOrgId}>
              {t("orgs.add_user", "新增员工")}
            </Button>
          </Space>
          <Card loading={loading}>
            {selectedOrg ? (
              <Space direction="vertical" style={{ width: "100%" }}>
                <div>
                  <Space>
                    <span style={{ fontSize: 18, fontWeight: 600 }}>
                      {selectedOrg.name}
                    </span>
                    <Tag color={getOrgTypeConfig(selectedOrg.type).color}>
                      {getOrgTypeConfig(selectedOrg.type).label}
                    </Tag>
                    {!selectedOrg.isActive && <Tag color="red">停用</Tag>}
                  </Space>
                </div>
                <div>
                  <DataTable<SafeUser>
                    rowKey="id"
                    data={filteredUsers}
                    pagination={{ pageSize: 8 }}
                    columns={[
                      {
                        title: t("users.username", "用户名"),
                        dataIndex: "username",
                        sorter: (a, b) => a.username.localeCompare(b.username),
                        filterConfig: {
                          type: "input",
                          placeholder: t("users.username", "用户名")
                        }
                      },
                      {
                        title: t("users.displayName", "姓名"),
                        dataIndex: "displayName",
                        sorter: (a, b) =>
                          (a.displayName || "").localeCompare(b.displayName || ""),
                        filterConfig: {
                          type: "input",
                          placeholder: t("users.displayName", "姓名")
                        }
                      },
                      {
                        title: t("users.roles", "角色数"),
                        dataIndex: "roleIds",
                        render: (v: string[]) => v?.length ?? 0,
                        sorter: (a, b) => (a.roleIds?.length || 0) - (b.roleIds?.length || 0),
                        width: 90
                      },
                      {
                        title: t("users.groups", "用户组数"),
                        dataIndex: "groupIds",
                        render: (v: string[]) => v?.length ?? 0,
                        sorter: (a, b) => (a.groupIds?.length || 0) - (b.groupIds?.length || 0),
                        width: 90
                      },
                      {
                        title: t("users.status", "状态"),
                        dataIndex: "isActive",
                        render: (v: boolean | undefined) => (
                          <Tag color={v === false ? "red" : "green"}>
                            {v === false
                              ? t("users.inactive", "停用")
                              : t("users.active", "启用")}
                          </Tag>
                        ),
                        filterConfig: {
                          type: "select",
                          placeholder: t("users.status", "状态"),
                          options: [
                            { label: t("users.active", "启用"), value: true },
                            { label: t("users.inactive", "停用"), value: false }
                          ]
                        },
                        width: 100
                      },
                      {
                        title: t("common.actions", "操作"),
                        width: 240,
                        render: (_, record) => (
                          <Space>
                            <Button type="link" onClick={() => openEditUser(record)}>
                              {t("common.edit", "编辑")}
                            </Button>
                            <Button
                              type="link"
                              onClick={() => handleToggleUser(record, record.isActive === false)}
                            >
                              {record.isActive === false
                                ? t("users.enable", "启用")
                                : t("users.disable", "停用")}
                            </Button>
                            <Button danger type="link" onClick={() => handleDeleteUser(record)}>
                              {t("common.delete", "删除")}
                            </Button>
                          </Space>
                        )
                      }
                    ]}
                  />
                </div>
              </Space>
            ) : (
              <Result title={t("orgs.select_prompt", "请选择左侧组织")} />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        open={orgModalOpen}
        title={editingOrg ? t("orgs.edit", "编辑组织") : t("orgs.add", "新增组织")}
        onCancel={() => {
          setOrgModalOpen(false);
          orgForm.resetFields();
        }}
        onOk={handleSaveOrg}
        destroyOnHidden
      >
        <Form layout="vertical" form={orgForm}>
          <Form.Item
            name="name"
            label={t("orgs.name", "组织名称")}
            rules={[{ required: true, message: t("orgs.name_required", "请输入组织名称") }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="isActive" label={t("orgs.active", "启用")}>
            <Switch defaultChecked />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={userModalOpen}
        title={editingUser ? t("users.edit", "编辑用户") : t("orgs.add_user", "新增员工")}
        onCancel={() => {
          setUserModalOpen(false);
          userForm.resetFields();
        }}
        onOk={handleSaveUser}
        destroyOnHidden
      >
        <Form layout="vertical" form={userForm}>
          <Form.Item
            name="username"
            label={t("users.username", "用户名")}
            rules={[{ required: !editingUser, message: t("users.username_required", "请输入用户名") }]}
          >
            <Input disabled={!!editingUser} />
          </Form.Item>
          <Form.Item
            name="displayName"
            label={t("users.displayName", "姓名")}
            rules={[{ required: true, message: t("users.displayName_required", "请输入姓名") }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("users.password", "密码")}
            rules={
              editingUser
                ? []
                : [{ required: true, message: t("users.password_required", "请输入密码") }]
            }
          >
            <Input.Password placeholder={editingUser ? t("users.password_optional", "留空不改") : ""} />
          </Form.Item>
          <Form.Item
            name="roleIds"
            label={t("users.roles", "角色")}
            tooltip={t(
              "users.roles_hint",
              "角色是权限主载体（推荐配置）。角色 + 用户组 + 用户微调最终合并为该用户的权限集合。"
            )}
          >
            <Select
              mode="multiple"
              options={roleOptions}
              placeholder={t("users.roles_placeholder", "选择角色")}
              allowClear
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="groupIds"
            label={t("users.groups_label", "用户组")}
            tooltip={t(
              "users.groups_hint",
              "用户组用于批量授权；选了 Administrators 等于平台全权，请按需谨慎。"
            )}
          >
            <Select
              mode="multiple"
              options={groupOptions}
              placeholder={t("groups.members_placeholder", "选择用户组")}
              allowClear
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="isActive"
            label={t("users.status", "状态")}
            valuePropName="checked"
          >
            <Switch
              checkedChildren={t("users.active", "启用")}
              unCheckedChildren={t("users.inactive", "停用")}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default OrgsPage;

