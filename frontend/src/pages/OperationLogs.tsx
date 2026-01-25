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
  Typography
} from "antd";
import {
  SearchOutlined,
  FilterOutlined
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import dayjs from "dayjs";

const { Title, Text } = Typography;

interface OperationLog {
  id: string;
  logId: string;
  operationTime: string;
  operatorName: string;
  operatorDepartment: string;
  operationModule: "contract" | "payment" | "settlement" | "system";
  operationType: "add" | "modify" | "delete" | "approve";
  operationAction: string;
  changeContent: string;
  operationIp: string;
  operationTerminal: string;
}

// Mock数据
const mockLogs: OperationLog[] = [
  {
    id: "1",
    logId: "LOG-20241219-158932",
    operationTime: "2024-12-19T15:23:45Z",
    operatorName: "李明",
    operatorDepartment: "财务部",
    operationModule: "settlement",
    operationType: "approve",
    operationAction: "审核通过分润结算单",
    changeContent: "状态: 待审核 → 已通过",
    operationIp: "192.168.1.105",
    operationTerminal: "Windows 10 / Chrome 120"
  },
  {
    id: "2",
    logId: "LOG-20241219-157821",
    operationTime: "2024-12-19T14:58:12Z",
    operatorName: "王芳",
    operatorDepartment: "风控部",
    operationModule: "contract",
    operationType: "modify",
    operationAction: "修改融资合同利率",
    changeContent: "利率: 5.0% → 5.5%",
    operationIp: "192.168.1.112",
    operationTerminal: "macOS 14 / Safari 17"
  },
  {
    id: "3",
    logId: "LOG-20241219-156234",
    operationTime: "2024-12-19T14:35:20Z",
    operatorName: "张强",
    operatorDepartment: "财务部",
    operationModule: "payment",
    operationType: "approve",
    operationAction: "审核驳回代付申请",
    changeContent: "状态: 待审核 → 已驳回",
    operationIp: "192.168.1.108",
    operationTerminal: "Windows 11 / Edge 120"
  },
  {
    id: "4",
    logId: "LOG-20241219-154567",
    operationTime: "2024-12-19T13:42:08Z",
    operatorName: "刘慧",
    operatorDepartment: "IT部",
    operationModule: "system",
    operationType: "modify",
    operationAction: "修改全局参数配置",
    changeContent: "单笔代付上限: ¥500,000 → ¥800,000",
    operationIp: "192.168.1.201",
    operationTerminal: "Windows 10 / Chrome 120"
  },
  {
    id: "5",
    logId: "LOG-20241219-153421",
    operationTime: "2024-12-19T13:15:33Z",
    operatorName: "陈涛",
    operatorDepartment: "业务部",
    operationModule: "contract",
    operationType: "add",
    operationAction: "创建融资合同",
    changeContent: "-",
    operationIp: "192.168.1.145",
    operationTerminal: "Windows 10 / Chrome 120"
  },
  {
    id: "6",
    logId: "LOG-20241219-152367",
    operationTime: "2024-12-19T12:28:45Z",
    operatorName: "李明",
    operatorDepartment: "财务部",
    operationModule: "settlement",
    operationType: "modify",
    operationAction: "更新还款结算金额",
    changeContent: "结算金额: ¥450,000.00 → ¥452,000.00",
    operationIp: "192.168.1.105",
    operationTerminal: "Windows 10 / Chrome 120"
  },
  {
    id: "7",
    logId: "LOG-20241219-151234",
    operationTime: "2024-12-19T11:50:19Z",
    operatorName: "王芳",
    operatorDepartment: "风控部",
    operationModule: "payment",
    operationType: "approve",
    operationAction: "审核通过代付申请",
    changeContent: "状态: 待审核 → 已通过",
    operationIp: "192.168.1.112",
    operationTerminal: "macOS 14 / Safari 17"
  },
  {
    id: "8",
    logId: "LOG-20241219-145678",
    operationTime: "2024-12-19T10:45:32Z",
    operatorName: "张强",
    operatorDepartment: "财务部",
    operationModule: "contract",
    operationType: "modify",
    operationAction: "修改合同额度",
    changeContent: "授信额度: ¥3,000万 → ¥5,000万",
    operationIp: "192.168.1.108",
    operationTerminal: "Windows 11 / Edge 120"
  }
];

function OperationLogsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [logs, setLogs] = useState<OperationLog[]>(mockLogs);
  const [loading, setLoading] = useState(false);
  
  // 筛选条件
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(dayjs());
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [operationTypeFilter, setOperationTypeFilter] = useState<string>("all");
  const [operatorNameFilter, setOperatorNameFilter] = useState<string>("");
  const [keywordFilter, setKeywordFilter] = useState<string>("");

  // 获取模块标签配置
  const getModuleConfig = (module: string) => {
    const configs: Record<string, { label: string; color: string }> = {
      contract: {
        label: t("operation_logs.module_contract", "合同管理"),
        color: "blue"
      },
      payment: {
        label: t("operation_logs.module_payment", "支付中心"),
        color: "purple"
      },
      settlement: {
        label: t("operation_logs.module_settlement", "结算中心"),
        color: "green"
      },
      system: {
        label: t("operation_logs.module_system", "系统管理"),
        color: "orange"
      }
    };
    return configs[module] || { label: module, color: "default" };
  };

  // 获取操作类型标签配置
  const getOperationTypeConfig = (type: string) => {
    const configs: Record<string, { label: string; color: string }> = {
      add: {
        label: t("operation_logs.type_add", "新增"),
        color: "green"
      },
      modify: {
        label: t("operation_logs.type_modify", "修改"),
        color: "blue"
      },
      delete: {
        label: t("operation_logs.type_delete", "删除"),
        color: "red"
      },
      approve: {
        label: t("operation_logs.type_approve", "审核"),
        color: "purple"
      }
    };
    return configs[type] || { label: type, color: "default" };
  };

  // 过滤数据
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // 日期过滤
      if (dateFilter) {
        const logDate = dayjs(log.operationTime);
        if (!logDate.isSame(dateFilter, "day")) {
          return false;
        }
      }
      
      // 模块过滤
      if (moduleFilter !== "all" && log.operationModule !== moduleFilter) {
        return false;
      }
      
      // 操作类型过滤
      if (operationTypeFilter !== "all" && log.operationType !== operationTypeFilter) {
        return false;
      }
      
      // 操作员姓名过滤
      if (operatorNameFilter && !log.operatorName.toLowerCase().includes(operatorNameFilter.toLowerCase())) {
        return false;
      }
      
      // 关键词搜索
      if (keywordFilter) {
        const lowerKeyword = keywordFilter.toLowerCase();
        const searchableText = [
          log.logId,
          log.operationAction,
          log.changeContent,
          log.operatorName,
          log.operatorDepartment
        ].join(" ").toLowerCase();
        if (!searchableText.includes(lowerKeyword)) {
          return false;
        }
      }
      
      return true;
    });
  }, [logs, dateFilter, moduleFilter, operationTypeFilter, operatorNameFilter, keywordFilter, t]);

  const columns = [
    {
      title: t("operation_logs.log_id", "日志ID"),
      key: "logId",
      width: 200,
      render: (_: any, record: OperationLog) => (
        <Text strong>{record.logId}</Text>
      )
    },
    {
      title: t("operation_logs.operation_time", "操作时间"),
      key: "operationTime",
      width: 180,
      render: (_: any, record: OperationLog) => (
        <Text>{dayjs(record.operationTime).format("YYYY-MM-DD HH:mm:ss")}</Text>
      )
    },
    {
      title: t("operation_logs.operator", "操作人"),
      key: "operator",
      width: 180,
      render: (_: any, record: OperationLog) => (
        <div>
          <div>{record.operatorName}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.operatorDepartment}
          </Text>
        </div>
      )
    },
    {
      title: t("operation_logs.operation_module", "操作模块"),
      key: "operationModule",
      width: 120,
      render: (_: any, record: OperationLog) => {
        const config = getModuleConfig(record.operationModule);
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: t("operation_logs.operation_type", "操作类型"),
      key: "operationType",
      width: 120,
      render: (_: any, record: OperationLog) => {
        const config = getOperationTypeConfig(record.operationType);
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: t("operation_logs.operation_action", "操作行为"),
      key: "operationAction",
      width: 200,
      render: (_: any, record: OperationLog) => (
        <Text>{record.operationAction}</Text>
      )
    },
    {
      title: t("operation_logs.change_content", "变更内容"),
      key: "changeContent",
      width: 250,
      render: (_: any, record: OperationLog) => (
        <Text type={record.changeContent === "-" ? "secondary" : undefined}>
          {record.changeContent}
        </Text>
      )
    },
    {
      title: t("operation_logs.operation_ip_terminal", "操作IP / 终端"),
      key: "operationIpTerminal",
      width: 250,
      render: (_: any, record: OperationLog) => (
        <div>
          <div>{record.operationIp}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.operationTerminal}
          </Text>
        </div>
      )
    }
  ];

  if (!user?.permissions?.includes("view_operation_logs")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("operation_logs.no_access", "需要 view_operation_logs 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t("operation_logs.title", "系统操作日志")}
          </Title>
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {t("operation_logs.subtitle", "系统操作全流程审计追溯")}
          </Text>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col span={4}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("operation_logs.date", "日期")}
            </Text>
            <DatePicker
              style={{ width: "100%" }}
              value={dateFilter}
              onChange={setDateFilter}
              format="YYYY-MM-DD"
              placeholder={t("operation_logs.date_placeholder", "选择日期")}
            />
          </Col>
          <Col span={4}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("operation_logs.module", "模块")}
            </Text>
            <Select
              style={{ width: "100%" }}
              value={moduleFilter}
              onChange={setModuleFilter}
              options={[
                { value: "all", label: t("operation_logs.all_modules", "全部模块") },
                { value: "contract", label: t("operation_logs.module_contract", "合同管理") },
                { value: "payment", label: t("operation_logs.module_payment", "支付中心") },
                { value: "settlement", label: t("operation_logs.module_settlement", "结算中心") },
                { value: "system", label: t("operation_logs.module_system", "系统管理") }
              ]}
            />
          </Col>
          <Col span={4}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("operation_logs.operation_type", "操作类型")}
            </Text>
            <Select
              style={{ width: "100%" }}
              value={operationTypeFilter}
              onChange={setOperationTypeFilter}
              options={[
                { value: "all", label: t("operation_logs.all_operations", "全部操作") },
                { value: "add", label: t("operation_logs.type_add", "新增") },
                { value: "modify", label: t("operation_logs.type_modify", "修改") },
                { value: "delete", label: t("operation_logs.type_delete", "删除") },
                { value: "approve", label: t("operation_logs.type_approve", "审核") }
              ]}
            />
          </Col>
          <Col span={4}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("operation_logs.operator_name", "操作员姓名")}
            </Text>
            <Input
              placeholder={t("operation_logs.operator_name_placeholder", "请输入操作员姓名")}
              value={operatorNameFilter}
              onChange={(e) => setOperatorNameFilter(e.target.value)}
            />
          </Col>
          <Col span={6}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("operation_logs.keyword_search", "关键词搜索")}
            </Text>
            <Input
              placeholder={t("operation_logs.keyword_placeholder", "关键词搜索...")}
              prefix={<SearchOutlined />}
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
            />
          </Col>
          <Col span={2}>
            <Button
              type="primary"
              icon={<FilterOutlined />}
              style={{ marginTop: 30 }}
              onClick={() => {
                // 筛选逻辑已经在filteredLogs中实现
              }}
            >
              {t("operation_logs.filter", "筛选")}
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredLogs}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1500 }}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) =>
              t("operation_logs.total_records", "共 {total} 条记录").replace("{total}", String(total))
          }}
        />
      </Card>
    </div>
  );
}

export default OperationLogsPage;

