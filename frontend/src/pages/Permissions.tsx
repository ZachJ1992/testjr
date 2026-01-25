import {
  createPermissionApi,
  deletePermissionApi,
  fetchPermissions,
  getErrorMessage,
  updatePermissionApi
} from "../api";
import { PermissionNode } from "../types";
import { useAuth } from "../auth";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Tree,
  TreeSelect,
  Result,
  message
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";

type Mode = "create" | "edit";

type PermissionTreeNode = {
  key: string;
  value: string;
  title: string;
  code: string;
  raw: PermissionNode;
  children?: PermissionTreeNode[];
};

function flattenTree(nodes: PermissionNode[]): PermissionNode[] {
  const list: PermissionNode[] = [];
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.shift()!;
    list.push(node);
    if (node.children?.length) {
      stack.push(...node.children);
    }
  }
  return list;
}

function PermissionsPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [treeData, setTreeData] = useState<PermissionNode[]>([]);
  const [selected, setSelected] = useState<PermissionNode | undefined>();
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [form] = Form.useForm<{
    code: string;
    name: string;
    description?: string;
    parentId?: string;
  }>();

  const uiTreeData = useMemo<PermissionTreeNode[]>(() => {
    const walk = (nodes: PermissionNode[]): PermissionTreeNode[] =>
      nodes.map((n) => ({
        key: n.id,
        value: n.id,
        title: n.name,
        code: n.code,
        raw: n,
        children: n.children ? walk(n.children) : undefined
      }));
    return walk(treeData);
  }, [treeData]);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchPermissions(token);
      setTreeData(res.permissions);
      if (selected) {
        const updated = flattenTree(res.permissions).find(
          (n) => n.id === selected.id
        );
        setSelected(updated);
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

  const openCreate = (parentId?: string) => {
    setMode("create");
    form.resetFields();
    form.setFieldsValue({ parentId });
    setModalOpen(true);
  };

  const openEdit = () => {
    if (!selected) {
      message.warning(t("permissions.select_permission", "请选择权限"));
      return;
    }
    setMode("edit");
    form.setFieldsValue({
      code: selected.code,
      name: selected.name,
      description: selected.description,
      parentId: selected.parentId
    });
    setModalOpen(true);
  };

  const handleDelete = () => {
    if (!selected || !token) {
      message.warning(t("permissions.select_permission", "请选择权限"));
      return;
    }
    Modal.confirm({
      title: t("permissions.confirm_delete", "确认删除该权限？"),
      content: t("permissions.delete_content", "若被角色使用或存在子权限将无法删除。"),
      okText: t("permissions.delete", "删除"),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deletePermissionApi(token, selected.id);
          message.success(t("permissions.deleted", "删除成功"));
          setSelected(undefined);
          await refresh();
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      }
    });
  };

  const handleSubmit = async () => {
    if (!token) return;
    const values = await form.validateFields();
    try {
      if (mode === "create") {
        await createPermissionApi(token, values);
        message.success(t("permissions.created", "创建成功"));
      } else if (selected) {
        await updatePermissionApi(token, selected.id, values);
        message.success(t("permissions.updated", "更新成功"));
      }
      setModalOpen(false);
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  if (!user?.permissions?.includes("manage_permissions")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("permissions.no_access", "仅管理员可访问权限管理")}
      />
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => openCreate(undefined)}>
          {t("permissions.add_root", "新增根权限")}
        </Button>
        <Button onClick={() => openCreate(selected?.id)} disabled={!selected}>
          {t("permissions.add_child", "在所选下新增")}
        </Button>
        <Button onClick={openEdit} disabled={!selected}>
          {t("common.edit", "编辑")}
        </Button>
        <Button danger onClick={handleDelete} disabled={!selected}>
          {t("common.delete", "删除")}
        </Button>
      </Space>

      <Card loading={loading}>
        <Tree
          treeData={uiTreeData}
          defaultExpandAll
          selectedKeys={selected ? [selected.id] : []}
          onSelect={(keys, info) => {
            const node = info.selectedNodes[0] as PermissionTreeNode | undefined;
            setSelected(node?.raw);
          }}
          titleRender={(node) => (
            <Space>
              <span>{(node as PermissionTreeNode).title}</span>
              <span style={{ color: "#6b7280", fontSize: 12 }}>
                ({(node as PermissionTreeNode).code})
              </span>
            </Space>
          )}
        />
      </Card>

      <Modal
        open={modalOpen}
        title={mode === "create" ? t("permissions.add", "新增权限") : t("permissions.edit", "编辑权限")}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={handleSubmit}
        destroyOnHidden
      >
        <Form
          layout="vertical"
          form={form}
          initialValues={{ code: "", name: "", description: "" }}
        >
          <Form.Item
            name="code"
            label={t("permissions.code", "权限代码")}
            rules={[{ required: true, message: t("permissions.code_required", "请输入代码") }]}
          >
            <Input placeholder="manage_xxx" />
          </Form.Item>
          <Form.Item
            name="name"
            label={t("permissions.name", "权限名称")}
            rules={[{ required: true, message: t("permissions.name_required", "请输入名称") }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t("common.description", "描述")}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="parentId" label={t("permissions.parent", "父级权限")}>
            <TreeSelect
              allowClear
              treeData={uiTreeData}
              placeholder="不选择则为根权限"
              treeDefaultExpandAll
              disabled={mode === "edit" && selected?.id === undefined}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default PermissionsPage;

