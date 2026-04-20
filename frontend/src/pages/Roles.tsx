import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Result,
  Space,
  Table,
  Tag,
  Tree,
  message
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { useAuth } from "../auth";
import {
  RoleDetail,
  createRoleApi,
  deleteRoleApi,
  fetchPermissions,
  fetchRoles,
  getErrorMessage,
  updateRoleApi
} from "../api";
import { PermissionNode } from "../types";

type Mode = "create" | "edit";

interface PermTreeNode {
  key: string;
  title: string;
  children?: PermTreeNode[];
}

function buildPermTree(nodes: PermissionNode[]): PermTreeNode[] {
  return nodes.map((n) => ({
    key: n.code,
    title: `${n.name}（${n.code}）`,
    children: n.children?.length ? buildPermTree(n.children) : undefined
  }));
}

function flattenCodes(nodes: PermissionNode[]): string[] {
  const out: string[] = [];
  const walk = (list: PermissionNode[]) => {
    list.forEach((n) => {
      out.push(n.code);
      if (n.children?.length) walk(n.children);
    });
  };
  walk(nodes);
  return out;
}

function RolesPage() {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const [roles, setRoles] = useState<RoleDetail[]>([]);
  const [permissions, setPermissions] = useState<PermissionNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editing, setEditing] = useState<RoleDetail | null>(null);
  const [form] = Form.useForm<{
    name: string;
    description?: string;
    permissions: string[];
  }>();

  const canManage = user?.permissions?.includes("manage_roles");

  const allPermissionCodes = useMemo(() => flattenCodes(permissions), [permissions]);
  const treeData = useMemo(() => buildPermTree(permissions), [permissions]);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        fetchRoles(token),
        fetchPermissions(token).catch(() => ({ permissions: [] as PermissionNode[] }))
      ]);
      setRoles(r.roles || []);
      setPermissions((p as { permissions: PermissionNode[] }).permissions || []);
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
    setMode("create");
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ permissions: [] });
    setModalOpen(true);
  };

  const openEdit = (record: RoleDetail) => {
    setMode("edit");
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      permissions: record.permissions
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!token) return;
    const values = await form.validateFields();
    try {
      if (mode === "create") {
        await createRoleApi(token, {
          name: values.name,
          description: values.description,
          permissions: values.permissions ?? []
        });
        message.success(t("common.created", "已创建"));
      } else if (editing) {
        await updateRoleApi(token, editing.id, {
          name: values.name,
          description: values.description,
          permissions: values.permissions ?? []
        });
        message.success(t("common.updated", "已更新"));
      }
      setModalOpen(false);
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleDelete = (record: RoleDetail) => {
    if (!token) return;
    Modal.confirm({
      title: t("common.confirm_delete", "确认删除？"),
      content: t(
        "roles.delete_confirm_content",
        `确定要删除角色 "${record.name}" 吗？此操作不可恢复。`
      ),
      okButtonProps: { danger: true },
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        try {
          await deleteRoleApi(token, record.id);
          message.success(t("common.deleted", "已删除"));
          await refresh();
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      }
    });
  };

  if (!canManage) {
    return (
      <Result
        status="403"
        title="403"
        subTitle={t("roles.no_permission", "需要 manage_roles 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={t("menu.roles", "角色管理")}
        extra={
          <Button type="primary" onClick={openCreate}>
            {t("roles.create", "新建角色")}
          </Button>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={roles}
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: t("common.name", "名称"),
              dataIndex: "name",
              key: "name"
            },
            {
              title: t("roles.description", "描述"),
              dataIndex: "description",
              key: "description"
            },
            {
              title: t("roles.permission_count", "权限数"),
              key: "permCount",
              width: 120,
              render: (_: any, r: RoleDetail) => (
                <Tag color={r.permissions.length > 0 ? "blue" : "default"}>
                  {r.permissions.length}
                </Tag>
              )
            },
            {
              title: t("common.actions", "操作"),
              key: "actions",
              width: 200,
              render: (_: any, r: RoleDetail) => (
                <Space size="small">
                  <Button size="small" onClick={() => openEdit(r)}>
                    {t("common.edit", "编辑")}
                  </Button>
                  <Button size="small" danger onClick={() => handleDelete(r)}>
                    {t("common.delete", "删除")}
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Modal
        title={
          mode === "create"
            ? t("roles.create", "新建角色")
            : t("roles.edit", "编辑角色")
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText={t("common.save", "保存")}
        cancelText={t("common.cancel", "取消")}
        destroyOnClose
        width={720}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label={t("common.name", "名称")}
            rules={[{ required: true, message: t("roles.name_required", "请输入角色名") }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label={t("roles.description", "描述")}>
            <Input.TextArea rows={2} maxLength={255} />
          </Form.Item>
          <Form.Item
            name="permissions"
            label={t("roles.permissions", "权限")}
            valuePropName="checkedKeys"
            getValueFromEvent={(checked: any) => {
              const keys: string[] = Array.isArray(checked)
                ? checked
                : checked?.checked || [];
              return keys.filter((k) => allPermissionCodes.includes(k));
            }}
          >
            <Tree
              checkable
              defaultExpandAll
              treeData={treeData}
              height={400}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default RolesPage;
