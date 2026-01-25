import {
  createUserApi,
  deleteUserApi,
  fetchGroups,
  fetchOrgs,
  fetchUsers,
  getErrorMessage,
  updateUserApi
} from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { OrgUnit, SafeUser, UserGroupDetail } from "../types";
import {
  Button,
  Form,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Switch,
  Tag,
  TreeSelect,
  message
} from "antd";
import { useEffect, useMemo, useState } from "react";
import DataTable from "../components/DataTable";

type UserFormValues = {
  username: string;
  displayName: string;
  password?: string;
  orgId?: string;
  groupIds?: string[];
  isActive?: boolean;
};

function buildOrgTree(orgs: OrgUnit[]): any[] {
  const map = new Map<string, any>();
  orgs.forEach((org) => {
    map.set(org.id, {
      title: org.name,
      value: org.id,
      key: org.id,
      parentId: org.parentId,
      disabled: org.isActive === false
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

function UsersPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [groups, setGroups] = useState<UserGroupDetail[]>([]);
  const [orgs, setOrgs] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SafeUser | null>(null);
  const [form] = Form.useForm<UserFormValues>();

  const groupOptions = useMemo(
    () => groups.map((g) => ({ label: g.name, value: g.id })),
    [groups]
  );

  const orgTreeData = useMemo(() => buildOrgTree(orgs), [orgs]);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [uRes, gRes, oRes] = await Promise.all([
        fetchUsers(token),
        fetchGroups(token),
        fetchOrgs(token)
      ]);
      setUsers(uRes.users);
      setGroups(gRes.groups);
      setOrgs(oRes.orgs);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ isActive: true });
    setModalOpen(true);
  };

  const openEdit = (record: SafeUser) => {
    setEditing(record);
    form.setFieldsValue({
      username: record.username,
      displayName: record.displayName,
      orgId: record.orgId,
      groupIds: record.groupIds,
      isActive: record.isActive !== false
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!token) return;
    const values = await form.validateFields();
    try {
      if (editing) {
        await updateUserApi(token, editing.id, {
          displayName: values.displayName,
          password: values.password || undefined,
          orgId: values.orgId || null,
          groupIds: values.groupIds,
          isActive: values.isActive
        });
      } else {
        if (!values.password) {
          message.error(t("users.password_required", "请输入密码"));
          return;
        }
        await createUserApi(token, {
          username: values.username,
          displayName: values.displayName,
          password: values.password,
          orgId: values.orgId,
          groupIds: values.groupIds,
          isActive: values.isActive
        });
      }
      message.success(t("common.saved", "已保存"));
      setModalOpen(false);
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleDelete = (record: SafeUser) => {
    if (!token) return;
    Modal.confirm({
      title: t("common.confirm_delete", "确认删除？"),
      content: t("users.delete_confirm_content", `确定要删除用户 "${record.displayName || record.username}" 吗？此操作不可恢复。`),
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

  const handleToggle = async (record: SafeUser, next: boolean) => {
    if (!token) return;
    try {
      await updateUserApi(token, record.id, { isActive: next });
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  if (!user?.permissions?.includes("manage_users")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("users.no_access", "需要 manage_users 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={openCreate}>
          {t("users.add", "新增用户")}
        </Button>
      </Space>
      <DataTable<SafeUser>
        rowKey="id"
        loading={loading}
        data={users}
        pagination={{ pageSize: 10 }}
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
            title: t("users.org", "组织"),
            dataIndex: "orgId",
            render: (orgId: string | undefined) => {
              if (!orgId) return "-";
              const org = orgs.find((o) => o.id === orgId);
              return org?.name || "-";
            },
            sorter: (a, b) => {
              const orgA = orgs.find((o) => o.id === a.orgId)?.name || "";
              const orgB = orgs.find((o) => o.id === b.orgId)?.name || "";
              return orgA.localeCompare(orgB);
            },
            filterConfig: {
              type: "select",
              placeholder: t("users.org", "组织"),
              options: orgs.map(org => ({ label: org.name, value: org.id }))
            }
          },
          {
            title: t("groups.user_count", "成员数"),
            dataIndex: "groupIds",
            render: (v: string[]) => v?.length ?? 0,
            sorter: (a, b) => (a.groupIds?.length || 0) - (b.groupIds?.length || 0),
            width: 100
          },
          {
            title: t("users.status", "状态"),
            dataIndex: "isActive",
            render: (v: boolean | undefined) => (
              <Tag color={v === false ? "red" : "green"}>
                {v === false ? t("users.inactive", "停用") : t("users.active", "启用")}
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
            width: 220,
            render: (_, record) => (
              <Space>
                <Button type="link" onClick={() => openEdit(record)}>
                  {t("common.edit", "编辑")}
                </Button>
                <Button
                  type="link"
                  onClick={() => handleToggle(record, record.isActive === false)}
                >
                  {record.isActive === false
                    ? t("users.enable", "启用")
                    : t("users.disable", "停用")}
                </Button>
                <Button danger type="link" onClick={() => handleDelete(record)}>
                  {t("common.delete", "删除")}
                </Button>
              </Space>
            )
          }
        ]}
      />

      <Modal
        open={modalOpen}
        title={editing ? t("users.edit", "编辑用户") : t("users.add", "新增用户")}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={handleSave}
        destroyOnHidden
      >
        <Form layout="vertical" form={form}>
          <Form.Item
            name="username"
            label={t("users.username", "用户名")}
            rules={[{ required: !editing, message: t("users.username_required", "请输入用户名") }]}
          >
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item
            name="displayName"
            label={t("users.displayName", "姓名")}
            rules={[{ required: true, message: t("users.displayName_required", "请输入姓名") }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="orgId"
            label={t("users.org", "组织")}
            rules={[{ required: !editing, message: t("users.org_required", "请选择组织") }]}
          >
            <TreeSelect
              treeData={orgTreeData}
              placeholder={t("users.org_placeholder", "请选择组织")}
              allowClear
              showSearch
              treeDefaultExpandAll
              treeNodeFilterProp="title"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("users.password", "密码")}
            rules={
              editing
                ? []
                : [{ required: true, message: t("users.password_required", "请输入密码") }]
            }
          >
            <Input.Password placeholder={editing ? t("users.password_optional", "留空不改") : ""} />
          </Form.Item>
          <Form.Item name="groupIds" label={t("groups.members", "成员")}>
            <Select
              mode="multiple"
              options={groupOptions}
              placeholder={t("groups.members_placeholder", "选择成员")}
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
            <Switch checkedChildren={t("users.active", "启用")} unCheckedChildren={t("users.inactive", "停用")} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default UsersPage;

