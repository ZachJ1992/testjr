import { deleteI18nEntry, fetchI18nEntries, getErrorMessage, upsertI18nEntry } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  Button,
  Card,
  Input,
  Modal,
  Result,
  Space,
  Table,
  Form,
  Typography,
  message
} from "antd";
import { useEffect, useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import { defaultTranslations } from "@shared/i18n-config";
import type { FilterDropdownProps } from "antd/es/table/interface";
import type { Key } from "react";

type Entry = {
  id: string;
  lang: string;
  key: string;
  value: string; // user-configured value (DB)
  defaultValue?: string;
  scopeType: string;
  scopeId?: string;
  page?: string;
};

function I18nAdminPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [form] = Form.useForm<{
    lang: string;
    key: string;
    value: string;
    scopeType: string;
    scopeId?: string;
    page?: string;
  }>();

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchI18nEntries(token);
      setEntries(res.entries);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const mergedEntries = (() => {
    const map = new Map<string, Entry>();
    // seed with defaults
    Object.entries(defaultTranslations).forEach(([lang, kv]) => {
      Object.entries(kv).forEach(([key, val]) => {
        map.set(`${lang}:${key}`, {
          id: "", // no DB id
          lang,
          key,
          value: "",
          defaultValue: val,
          scopeType: "global"
        });
      });
    });
    // overlay db entries
    entries.forEach((e) => {
      const key = `${e.lang}:${e.key}`;
      const existing = map.get(key);
      if (existing) {
        map.set(key, { ...existing, ...e, defaultValue: existing.defaultValue });
      } else {
        map.set(key, { ...e, defaultValue: "" });
      }
    });
    return Array.from(map.values());
  })();

  const handleDelete = (id: string) => {
    setConfirmId(id);
  };

  const openEdit = (record: Entry) => {
    setEditing(record);
    form.setFieldsValue({
      lang: record.lang,
      key: record.key,
      value: record.value || record.defaultValue || "",
      scopeType: record.scopeType || "global",
      scopeId: record.scopeId,
      page: record.page
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!token || !editing) return;
    const values = await form.validateFields();
    try {
      await upsertI18nEntry(token, {
        lang: values.lang,
        key: values.key,
        value: values.value,
        scopeType: values.scopeType,
        scopeId: values.scopeId,
        page: values.page
      });
      message.success(t("common.saved", "已保存"));
      setEditOpen(false);
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const textFilter = (
    placeholder: string,
    dataIndex: keyof Entry
  ): {
    filterDropdown: (props: FilterDropdownProps) => React.ReactNode;
    filterIcon: (filtered: boolean) => React.ReactNode;
    onFilter: (value: Key | boolean, record: Entry) => boolean;
  } => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }}>
        <Input
          placeholder={placeholder}
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
            搜索
          </Button>
          <Button
            size="small"
            onClick={() => {
              clearFilters?.();
              confirm();
            }}
          >
            重置
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => (
      <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />
    ),
    onFilter: (value, record) => {
      const target = String(record[dataIndex] ?? "").toLowerCase();
      const input = String(value ?? "").toLowerCase();
      return target.includes(input);
    }
  });

  if (!user?.permissions?.includes("manage_permissions")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("i18n.no_access", "需要 manage_permissions 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <Card>
        <Table<Entry>
          rowKey={(record) => record.id || `${record.lang}:${record.key}`}
          dataSource={mergedEntries}
          loading={loading}
          size="small"
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: t("i18n.lang", "语言"),
              dataIndex: "lang",
              width: 90,
              filters: [
                { text: "zh-CN", value: "zh-CN" },
                { text: "en-US", value: "en-US" }
              ],
              onFilter: (value, record) => record.lang === value,
              sorter: (a, b) => a.lang.localeCompare(b.lang)
            },
            {
              title: t("i18n.key", "键"),
              dataIndex: "key",
              sorter: (a, b) => a.key.localeCompare(b.key),
              filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
                <div style={{ padding: 8 }}>
                  <Input
                    placeholder={t("i18n.key", "键")}
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
                      搜索
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        clearFilters?.();
                        confirm();
                      }}
                    >
                      重置
                    </Button>
                  </Space>
                </div>
              ),
              filterIcon: (filtered) => (
                <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />
              ),
              onFilter: (value, record) =>
                record.key.toLowerCase().includes((value as string).toLowerCase())
            },
            {
              title: t("i18n.default_value", "默认值"),
              dataIndex: "defaultValue",
              sorter: (a, b) => (a.defaultValue || "").localeCompare(b.defaultValue || ""),
              ...textFilter(t("i18n.default_value", "默认值"), "defaultValue")
            },
            {
              title: t("i18n.user_value", "用户值"),
              dataIndex: "value",
              sorter: (a, b) => a.value.localeCompare(b.value),
              ...textFilter(t("i18n.user_value", "用户值"), "value")
            },
            {
              title: t("common.actions", "操作"),
              width: 140,
              render: (_, record) => (
                <Space>
                  <Button type="link" onClick={() => openEdit(record)}>
                    {t("common.edit", "编辑")}
                  </Button>
                  {record.id ? (
                    <Button danger type="link" onClick={() => handleDelete(record.id)}>
                      {t("common.delete", "删除")}
                    </Button>
                  ) : (
                    <span style={{ color: "#999" }}>-</span>
                  )}
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Modal
        open={!!confirmId}
        title={t("common.confirm_delete", "确认删除？")}
        onCancel={() => setConfirmId(null)}
        onOk={async () => {
          if (confirmId) {
            try {
              await deleteI18nEntry(token!, confirmId);
              message.success(t("common.deleted", "已删除"));
              await refresh();
            } catch (err) {
              message.error(getErrorMessage(err));
            }
          }
          setConfirmId(null);
        }}
        destroyOnHidden
      />
      <Modal
        open={editOpen}
        title={t("i18n.edit", "编辑文案")}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        destroyOnHidden
      >
        <Form layout="vertical" form={form}>
          <Form.Item label="Lang" name="lang">
            <Input disabled />
          </Form.Item>
          <Form.Item label="Key" name="key">
            <Input disabled />
          </Form.Item>
          <Form.Item label="Scope" name="scopeType">
            <Input disabled />
          </Form.Item>
          {editing?.scopeId ? (
            <Form.Item label="Scope Id" name="scopeId">
              <Input disabled />
            </Form.Item>
          ) : null}
          {editing?.page ? (
            <Form.Item label="Page" name="page">
              <Input disabled />
            </Form.Item>
          ) : null}
          <Form.Item label="Default Value">
            <Typography.Text>
              {editing?.defaultValue ?? t("common.none", "暂无")}
            </Typography.Text>
          </Form.Item>
          <Form.Item
            label="User Value"
            name="value"
            rules={[{ required: true, message: t("users.password_required", "请输入") }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default I18nAdminPage;

