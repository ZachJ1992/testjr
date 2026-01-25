import {
  addUserToGroupApi,
  createGroupApi,
  fetchGroups,
  fetchPermissions,
  fetchUsers,
  getErrorMessage,
  removeUserFromGroupApi,
  updateGroupApi
} from "../api";
import { useAuth } from "../auth";
import { PermissionNode, SafeUser, UserGroupDetail } from "../types";
import {
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Tag,
  TreeSelect,
  Typography,
  message
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import { useI18n } from "../i18n";
import DataTable from "../components/DataTable";

type FormValues = {
  name: string;
  description?: string;
  permissionCodes?: string[];
  userIds?: string[];
};

function buildTreeOptions(nodes: PermissionNode[]): any[] {
  return nodes.map((n) => ({
    value: n.code,
    title: `${n.name} (${n.code})`,
    children: n.children ? buildTreeOptions(n.children) : undefined
  }));
}

function GroupsPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [groups, setGroups] = useState<UserGroupDetail[]>([]);
  const [permissions, setPermissions] = useState<PermissionNode[]>([]);
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<UserGroupDetail | null>(null);
  const [form] = Form.useForm<FormValues>();

  const permOptions = useMemo(() => buildTreeOptions(permissions), [permissions]);
  const userOptions = useMemo(
    () => users.map((u) => ({ label: u.displayName || u.username, value: u.id })),
    [users]
  );

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [gRes, pRes, uRes] = await Promise.all([
        fetchGroups(token),
        fetchPermissions(token),
        fetchUsers(token)
      ]);
      setGroups(gRes.groups);
      setPermissions(pRes.permissions);
      setUsers(uRes.users);
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
    setDrawerOpen(true);
  };

  const openEdit = (record: UserGroupDetail) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      permissionCodes: record.permissions,
      userIds: record.userIds
    });
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    if (!token) return;
    const values = await form.validateFields();
    try {
      let groupId = editing?.id;
      if (editing) {
        await updateGroupApi(token, editing.id, {
          name: values.name,
          description: values.description,
          permissionCodes: values.permissionCodes
        });
      } else {
        const res = await createGroupApi(token, {
          name: values.name,
          description: values.description,
          permissionCodes: values.permissionCodes
        });
        groupId = res.group.id;
      }

      // sync users
      if (groupId && values.userIds) {
        const targetUserIds = new Set(values.userIds);
        const currentUserIds = new Set(
          groups.find((g) => g.id === groupId)?.userIds || []
        );
        const toAdd = Array.from(targetUserIds).filter(
          (id) => !currentUserIds.has(id)
        );
        const toRemove = Array.from(currentUserIds).filter(
          (id) => !targetUserIds.has(id)
        );
        await Promise.all([
          ...toAdd.map((uid) => addUserToGroupApi(token, groupId!, uid)),
          ...toRemove.map((uid) => removeUserFromGroupApi(token, groupId!, uid))
        ]);
      }

      message.success(editing ? t("users.group_updated", "已更新用户组") : t("users.group_created", "已创建用户组"));
      setDrawerOpen(false);
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  if (!user?.permissions?.includes("manage_groups")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("groups.no_access", "需要 manage_groups 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={openCreate}>
          {t("groups.add", "新增用户组")}
        </Button>
      </Space>
      <DataTable<UserGroupDetail>
        rowKey="id"
        loading={loading}
        data={groups}
        pagination={{ pageSize: 10 }}
        columns={[
            {
              title: t("common.name", "名称"),
              dataIndex: "name",
              sorter: (a, b) => a.name.localeCompare(b.name),
              filterConfig: {
                type: "input",
                placeholder: t("common.name", "名称")
              }
            },
            {
              title: t("common.description", "描述"),
              dataIndex: "description",
              sorter: (a, b) => (a.description || "").localeCompare(b.description || ""),
              filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
                <div style={{ padding: 8 }}>
                  <Input
                    placeholder={t("common.description", "描述")}
                    value={selectedKeys[0]}
                    onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                    onPressEnter={() => confirm()}
                    style={{ width: 180, marginBottom: 8, display: "block" }}
                  />
                  <Space>
                    <Button
                      type="primary"
                      size="small"
                      icon={<SearchOutlined />}
                      onClick={() => confirm()}
                    >
                      {t("common.actions", "操作")}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        clearFilters?.();
                        confirm();
                      }}
                    >
                      {t("common.delete", "删除")}
                    </Button>
                  </Space>
                </div>
              ),
              filterIcon: (filtered) => (
                <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />
              ),
              onFilter: (value, record) =>
                (record.description || "")
                  .toLowerCase()
                  .includes((value as string).toLowerCase())
            },
            {
              title: t("groups.perm_count", "权限数"),
              dataIndex: "permissions",
              render: (v: string[]) => v?.length ?? 0,
              sorter: (a, b) => (a.permissions?.length || 0) - (b.permissions?.length || 0),
              width: 100
            },
            {
              title: t("groups.user_count", "成员数"),
              dataIndex: "userIds",
              render: (v: string[]) => v?.length ?? 0,
              sorter: (a, b) => (a.userIds?.length || 0) - (b.userIds?.length || 0),
              width: 100
            },
            {
              title: t("common.actions", "操作"),
              width: 140,
              render: (_, record) => (
                <Button type="link" onClick={() => openEdit(record)}>
                  {t("common.edit", "编辑")}
                </Button>
              )
            }
        ]}
        expandable={{
          expandedRowRender: (record: UserGroupDetail) => (
            <Space direction="vertical" style={{ width: "100%" }}>
              <div>
                <Typography.Text strong>
                  {t("groups.permissions", "权限")}：
                </Typography.Text>
                <Space wrap>
                  {record.permissions.length ? (
                    record.permissions.map((p: string) => (
                      <Tag key={p} color="blue">
                        {p}
                      </Tag>
                    ))
                  ) : (
                    <Typography.Text type="secondary">
                      {t("common.none", "暂无")}
                    </Typography.Text>
                  )}
                </Space>
              </div>
              <div>
                <Typography.Text strong>
                  {t("groups.members", "成员")}：
                </Typography.Text>
                <Space wrap>
                  {record.userIds.length ? (
                    record.userIds.map((uid: string) => {
                      const u = users.find((x) => x.id === uid);
                      return (
                        <Tag key={uid} color="green">
                          {u?.displayName || u?.username || uid}
                        </Tag>
                      );
                    })
                  ) : (
                    <Typography.Text type="secondary">
                      {t("common.none", "暂无")}
                    </Typography.Text>
                  )}
                </Space>
              </div>
            </Space>
          )
        }}
      />

      <Drawer
        open={drawerOpen}
        width={420}
        title={editing ? t("groups.edit", "编辑用户组") : t("groups.add", "新增用户组")}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>
              保存
            </Button>
          </Space>
        }
      >
        <Form layout="vertical" form={form}>
          <Form.Item
            name="name"
            label={t("common.name", "名称")}
            rules={[{ required: true, message: t("common.name_required", "请输入名称") }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t("common.description", "描述")}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="permissionCodes" label={t("groups.permissions", "权限")}>
            <TreeSelect
              treeData={permOptions}
              treeCheckable
              showCheckedStrategy={TreeSelect.SHOW_CHILD}
              placeholder={t("groups.permissions_placeholder", "选择权限")}
              allowClear
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="userIds" label={t("groups.members", "成员")}>
            <Select
              mode="multiple"
              options={userOptions}
              placeholder={t("groups.members_placeholder", "选择成员")}
              allowClear
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

export default GroupsPage;

