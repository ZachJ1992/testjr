import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Result,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message
} from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  OperationLogItem,
  fetchOperationLogs,
  fetchOrgs,
  fetchUsers,
  getErrorMessage
} from "../api";
import { OrgUnit, SafeUser } from "../types";

const { Title, Text } = Typography;

const ACTION_LABELS: Record<string, { label: string; color?: string }> = {
  "role.create": { label: "创建角色", color: "green" },
  "role.update": { label: "更新角色", color: "blue" },
  "role.delete": { label: "删除角色", color: "red" },
  "tenant.enable": { label: "启用主体", color: "green" },
  "tenant.disable": { label: "停用主体", color: "red" },
  "user.grant_boundary.update": { label: "更新授权上限", color: "purple" }
};

function describeAction(action: string) {
  return ACTION_LABELS[action] ?? { label: action };
}

function snapshotPreview(value: unknown): string {
  if (value === undefined || value === null) return "-";
  try {
    const text =
      typeof value === "string" ? value : JSON.stringify(value);
    if (!text) return "-";
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  } catch {
    return String(value);
  }
}

function OperationLogsPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();

  const isPlatformUser = !!user?.orgContext?.isPlatformUser;

  const [items, setItems] = useState<OperationLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [orgs, setOrgs] = useState<OrgUnit[]>([]);
  const [users, setUsers] = useState<SafeUser[]>([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选条件
  const [tenantFilter, setTenantFilter] = useState<string | undefined>();
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const [operatorNameFilter, setOperatorNameFilter] = useState<string>("");
  const [sensitiveFilter, setSensitiveFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(null);

  const userMap = useMemo(() => {
    const m = new Map<string, SafeUser>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const orgMap = useMemo(() => {
    const m = new Map<string, OrgUnit>();
    orgs.forEach((o) => m.set(o.id, o));
    return m;
  }, [orgs]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const matchedUserId = operatorNameFilter
        ? users.find(
            (u) =>
              u.username
                .toLowerCase()
                .includes(operatorNameFilter.toLowerCase()) ||
              (u.displayName || "")
                .toLowerCase()
                .includes(operatorNameFilter.toLowerCase())
          )?.id
        : undefined;

      const startDate = dateFilter
        ? dateFilter.startOf("day").format("YYYY-MM-DD HH:mm:ss")
        : undefined;
      const endDate = dateFilter
        ? dateFilter.endOf("day").format("YYYY-MM-DD HH:mm:ss")
        : undefined;

      const res = await fetchOperationLogs(token, {
        tenantId: isPlatformUser ? tenantFilter : undefined,
        action: actionFilter,
        operatorUserId: operatorNameFilter ? matchedUserId : undefined,
        isSensitive:
          sensitiveFilter === "all"
            ? undefined
            : sensitiveFilter === "true",
        startDate,
        endDate,
        page,
        pageSize
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [
    token,
    isPlatformUser,
    tenantFilter,
    actionFilter,
    operatorNameFilter,
    sensitiveFilter,
    dateFilter,
    page,
    pageSize,
    users
  ]);

  useEffect(() => {
    if (!token) return;
    void Promise.all([
      fetchOrgs(token).then((r) => setOrgs(r.orgs || [])).catch(() => {}),
      fetchUsers(token).then((r) => setUsers(r.users || [])).catch(() => {})
    ]);
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!user?.permissions?.includes("view_operation_logs")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("operation_logs.no_access", "需要 view_operation_logs 权限")}
      />
    );
  }

  const orgOptions = orgs.map((o) => ({
    label: o.name,
    value: o.id
  }));

  const actionOptions = Object.entries(ACTION_LABELS).map(([code, cfg]) => ({
    label: `${cfg.label} (${code})`,
    value: code
  }));

  const columns = [
    {
      title: t("operation_logs.operation_time", "操作时间"),
      key: "createdAt",
      width: 180,
      render: (_: any, r: OperationLogItem) =>
        dayjs(r.createdAt).format("YYYY-MM-DD HH:mm:ss")
    },
    {
      title: t("operation_logs.operator", "操作人"),
      key: "operator",
      width: 200,
      render: (_: any, r: OperationLogItem) => {
        const u = r.operatorUserId ? userMap.get(r.operatorUserId) : undefined;
        return (
          <div>
            <div>{u?.displayName || u?.username || r.operatorUserId || "-"}</div>
            {u?.username && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {u.username}
              </Text>
            )}
          </div>
        );
      }
    },
    {
      title: t("operation_logs.tenant", "所属主体"),
      key: "tenant",
      width: 200,
      render: (_: any, r: OperationLogItem) => {
        const o = r.operatorTenantId
          ? orgMap.get(r.operatorTenantId)
          : undefined;
        return o?.name || r.operatorTenantId || "-";
      }
    },
    {
      title: t("operation_logs.action", "操作"),
      key: "action",
      width: 200,
      render: (_: any, r: OperationLogItem) => {
        const cfg = describeAction(r.action);
        return (
          <Space>
            <Tag color={cfg.color || "default"}>{cfg.label}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.action}
            </Text>
          </Space>
        );
      }
    },
    {
      title: t("operation_logs.target", "对象"),
      key: "target",
      width: 220,
      render: (_: any, r: OperationLogItem) =>
        r.targetType ? `${r.targetType}#${r.targetId || "-"}` : "-"
    },
    {
      title: t("operation_logs.before", "变更前"),
      key: "before",
      width: 220,
      render: (_: any, r: OperationLogItem) => (
        <Tooltip
          title={
            r.beforeSnapshot
              ? JSON.stringify(r.beforeSnapshot, null, 2)
              : ""
          }
        >
          <span>{snapshotPreview(r.beforeSnapshot)}</span>
        </Tooltip>
      )
    },
    {
      title: t("operation_logs.after", "变更后"),
      key: "after",
      width: 220,
      render: (_: any, r: OperationLogItem) => (
        <Tooltip
          title={
            r.afterSnapshot ? JSON.stringify(r.afterSnapshot, null, 2) : ""
          }
        >
          <span>{snapshotPreview(r.afterSnapshot)}</span>
        </Tooltip>
      )
    },
    {
      title: t("operation_logs.sensitive", "敏感"),
      key: "isSensitive",
      width: 80,
      render: (_: any, r: OperationLogItem) =>
        r.isSensitive ? (
          <Tag color="red">敏感</Tag>
        ) : (
          <Tag>普通</Tag>
        )
    },
    {
      title: "IP/UA",
      key: "ipua",
      width: 220,
      render: (_: any, r: OperationLogItem) => (
        <div>
          <div>{r.ip || "-"}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.ua || "-"}
          </Text>
        </div>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t("operation_logs.title", "系统操作日志")}
          </Title>
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {t(
              "operation_logs.subtitle",
              "敏感操作与重要变更的全流程审计追溯"
            )}
          </Text>
        </Col>
        <Col>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setPage(1);
              void refresh();
            }}
          >
            {t("common.refresh", "刷新")}
          </Button>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          {isPlatformUser && (
            <Col span={5}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                {t("operation_logs.tenant", "所属主体")}
              </Text>
              <Select
                allowClear
                style={{ width: "100%" }}
                value={tenantFilter}
                onChange={(v) => {
                  setPage(1);
                  setTenantFilter(v);
                }}
                options={orgOptions}
                placeholder={t(
                  "operation_logs.tenant_placeholder",
                  "选择主体"
                )}
                showSearch
                optionFilterProp="label"
              />
            </Col>
          )}
          <Col span={5}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("operation_logs.action", "操作")}
            </Text>
            <Select
              allowClear
              style={{ width: "100%" }}
              value={actionFilter}
              onChange={(v) => {
                setPage(1);
                setActionFilter(v);
              }}
              options={actionOptions}
              placeholder={t(
                "operation_logs.action_placeholder",
                "选择操作类型"
              )}
              showSearch
              optionFilterProp="label"
            />
          </Col>
          <Col span={4}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("operation_logs.sensitive", "敏感")}
            </Text>
            <Select
              style={{ width: "100%" }}
              value={sensitiveFilter}
              onChange={(v) => {
                setPage(1);
                setSensitiveFilter(v);
              }}
              options={[
                { label: t("operation_logs.all", "全部"), value: "all" },
                { label: t("operation_logs.only_sensitive", "仅敏感"), value: "true" },
                { label: t("operation_logs.only_normal", "仅普通"), value: "false" }
              ]}
            />
          </Col>
          <Col span={4}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("operation_logs.operator_name", "操作员")}
            </Text>
            <Input
              placeholder={t(
                "operation_logs.operator_name_placeholder",
                "用户名/姓名"
              )}
              value={operatorNameFilter}
              onChange={(e) => {
                setPage(1);
                setOperatorNameFilter(e.target.value);
              }}
              prefix={<SearchOutlined />}
              allowClear
            />
          </Col>
          <Col span={5}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("operation_logs.date", "日期")}
            </Text>
            <DatePicker
              style={{ width: "100%" }}
              value={dateFilter}
              onChange={(d) => {
                setPage(1);
                setDateFilter(d);
              }}
              format="YYYY-MM-DD"
              placeholder={t("operation_logs.date_placeholder", "选择日期")}
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={items}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1600 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showTotal: (n) =>
              t("operation_logs.total_records", "共 {total} 条记录").replace(
                "{total}",
                String(n)
              )
          }}
        />
      </Card>
    </div>
  );
}

export default OperationLogsPage;
