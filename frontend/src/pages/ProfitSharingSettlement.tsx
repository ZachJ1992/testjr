import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  getErrorMessage,
  fetchCommissionContracts,
  fetchPlatformRevenueList,
  fetchReconBatches,
  fetchReconStats,
  createReconBatch,
  cancelReconBatch,
  fetchBatchRevenueRecords,
  markReconReconciled,
  generateReconSettlement,
  fetchLocalPartners,
  fetchAreas,
  type Area,
  type CommissionContract,
  type RevenueRecord,
  type ReconBatch as ReconBatchType,
  type ReconStats,
  type LocalPartner,
} from "../api";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Modal,
  Popconfirm,
  Result,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileAddOutlined,
  FileTextOutlined,
  RollbackOutlined,
  SendOutlined,
  BankOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import * as XLSX from "xlsx";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const BATCH_STATUS_MAP: Record<string, { label: string; color: string }> = {
  reconciling: { label: "对账中", color: "processing" },
  reconciled: { label: "对账完成", color: "warning" },
  settlement_generated: { label: "已生成结算单", color: "cyan" },
  paid_offline: { label: "已付款", color: "blue" },
  accounted: { label: "已入账", color: "success" },
  cancelled: { label: "已取消", color: "default" },
};

function splitDisplayNames(value?: string): string[] {
  if (!value) return [];
  const list = value
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

function ProfitSharingSettlementPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();

  const [contracts, setContracts] = useState<CommissionContract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [localPartners, setLocalPartners] = useState<LocalPartner[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [selectedLocalPartnerId, setSelectedLocalPartnerId] = useState<string>("");
  const [selectedFinancierName, setSelectedFinancierName] = useState<string>("");
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(1, "year"),
    dayjs(),
  ]);

  const [revenueRecords, setRevenueRecords] = useState<RevenueRecord[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [selectedRevenueKeys, setSelectedRevenueKeys] = useState<React.Key[]>([]);

  const [batches, setBatches] = useState<ReconBatchType[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [stats, setStats] = useState<ReconStats>({ totalRevenue: 0, pendingAmount: 0, accountedAmount: 0 });

  const [activeTab, setActiveTab] = useState<"revenue" | "batches">("revenue");
  const [featureDisabled, setFeatureDisabled] = useState(false);

  // 对账单详情弹窗
  const [detailBatch, setDetailBatch] = useState<ReconBatchType | null>(null);
  const [detailRecords, setDetailRecords] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadContracts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchCommissionContracts(token);
      setContracts(res.contracts.filter(c => c.status !== "disabled"));
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  const loadLocalPartners = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchLocalPartners(token, { status: "active" });
      setLocalPartners(res.localPartners);
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  const loadAreas = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchAreas(token, { status: "active" });
      setAreas(res.areas);
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  const loadRevenue = useCallback(async () => {
    if (!token) return;
    setRevenueLoading(true);
    try {
      const res = await fetchPlatformRevenueList(token, {
        startDate: dateRange[0].format("YYYY-MM-DD"),
        endDate: dateRange[1].format("YYYY-MM-DD"),
        sourceType: "waybill_commission",
        useWaybillDate: true,
        financierName: selectedFinancierName || undefined,
        areaId: selectedAreaId || undefined,
        commissionContractId: selectedContractId || undefined,
        localPartnerId: selectedLocalPartnerId || undefined,
        pageSize: 50000,
      });
      setRevenueRecords(res.records);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setRevenueLoading(false);
    }
  }, [token, dateRange, selectedContractId, selectedAreaId, selectedLocalPartnerId, selectedFinancierName]);

  const loadBatches = useCallback(async () => {
    if (!token) return;
    setBatchLoading(true);
    try {
      const res = await fetchReconBatches(token, {
        contractId: selectedContractId || undefined,
        areaId: selectedAreaId || undefined,
      });
      setBatches(res.batches.filter(b => b.status !== "cancelled"));
    } catch (err) {
      console.error(err);
    } finally {
      setBatchLoading(false);
    }
  }, [token, selectedContractId, selectedAreaId]);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const s = await fetchReconStats(token);
      setStats(s);
    } catch (err: any) {
      if (err?.message?.includes("403") || err?.message?.includes("尚未启用")) {
        setFeatureDisabled(true);
      }
      console.error(err);
    }
  }, [token]);

  useEffect(() => {
    void loadContracts();
    void loadAreas();
    void loadLocalPartners();
    void loadStats();
  }, [loadContracts, loadAreas, loadLocalPartners, loadStats]);

  useEffect(() => {
    if (activeTab === "revenue") void loadRevenue();
    else void loadBatches();
  }, [activeTab, loadRevenue, loadBatches]);

  const formatAmount = (n: number) =>
    `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const renderCompactNames = useCallback((
    value?: string,
    color: "cyan" | "blue" = "cyan",
    maxWidth: number = 180
  ) => {
    const names = splitDisplayNames(value);
    if (names.length === 0) return "-";
    if (names.length === 1) {
      return (
        <Tooltip title={names[0]}>
          <Tag
            color={color}
            style={{
              marginInlineEnd: 0,
              maxWidth,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "inline-block",
              lineHeight: "18px",
              fontSize: 12,
              paddingInline: 6,
            }}
          >
            {names[0]}
          </Tag>
        </Tooltip>
      );
    }
    const restCount = names.length - 1;
    return (
      <Space size={2} wrap={false}>
        <Tooltip title={names.join("、")}>
          <Tag
            color={color}
            style={{
              marginInlineEnd: 0,
              maxWidth,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "inline-block",
              lineHeight: "18px",
              fontSize: 12,
              paddingInline: 6,
            }}
          >
            {names[0]}
          </Tag>
        </Tooltip>
        <Tooltip title={names.slice(1).join("、")}>
          <Text type="secondary" style={{ fontSize: 12 }}>{`+${restCount}`}</Text>
        </Tooltip>
      </Space>
    );
  }, []);

  // 生成对账单（不自动导出，导出移到对账单tab）
  const handleCreateBatch = async () => {
    if (!token) return;
    if (selectedRevenueKeys.length === 0) {
      message.warning("请先勾选收益记录");
      return;
    }

    // 校验所选收益记录必须属于同一合同
    const selectedRecords = revenueRecords.filter(r => selectedRevenueKeys.includes(r.id));
    const contractIds = new Set(selectedRecords.map(r => r.commissionContractId).filter(Boolean));
    if (contractIds.size > 1) {
      message.error("只能对同一合同下的收益生成对账单，当前选中了不同合同的记录");
      return;
    }

    const batchContractId = [...contractIds][0] || selectedContractId || contracts[0]?.id || "";
    const contractObj = contracts.find(c => c.id === batchContractId);
    const firstRecord = selectedRecords[0];
    const financierName = contractObj?.customerName || firstRecord?.financierName || "";
    const financierId = contractObj?.financierId || firstRecord?.financierId || "";

    Modal.confirm({
      title: "生成对账单",
      content: `将 ${selectedRevenueKeys.length} 条收益记录生成对账单？生成后可在「对账单」页签中查看、下载和管理。`,
      okText: "确认生成",
      cancelText: "取消",
      onOk: async () => {
        try {
          const res = await createReconBatch(token, {
            contractId: batchContractId,
            financierId: financierId,
            financierName: financierName,
            periodStart: dateRange[0].format("YYYY-MM-DD"),
            periodEnd: dateRange[1].format("YYYY-MM-DD"),
            revenueRecordIds: selectedRevenueKeys as string[],
          });

          message.success(`对账单 ${res.batch.batchNumber} 已生成，请前往「对账单」页签查看`);
          setSelectedRevenueKeys([]);
          void loadRevenue();
          void loadStats();
          setActiveTab("batches");
          void loadBatches();
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      },
    });
  };

  // 取消对账单（退回）
  const handleCancelBatch = async (batch: ReconBatchType) => {
    if (!token) return;
    try {
      await cancelReconBatch(token, batch.id);
      message.success(`对账单 ${batch.batchNumber} 已取消，收益记录已退回`);
      void loadBatches();
      void loadStats();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // 标记对账完成
  const handleMarkReconciled = async (batch: ReconBatchType) => {
    if (!token) return;
    try {
      await markReconReconciled(token, batch.id);
      message.success("已标记对账完成");
      void loadBatches();
      void loadStats();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // 生成结算单
  const handleGenerateSettlement = async (batch: ReconBatchType) => {
    if (!token) return;
    try {
      await generateReconSettlement(token, batch.id);
      message.success("结算单已生成，后续付款流程请前往结算中心处理");
      void loadBatches();
      void loadStats();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // 查看对账单详情
  const handleViewBatchDetail = async (batch: ReconBatchType) => {
    if (!token) return;
    setDetailBatch(batch);
    setDetailLoading(true);
    try {
      const res = await fetchBatchRevenueRecords(token, batch.id);
      setDetailRecords(res.records);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setDetailLoading(false);
    }
  };

  // 下载对账单明细Excel
  const handleDownloadBatchExcel = async (batch: ReconBatchType) => {
    if (!token) return;
    try {
      const res = await fetchBatchRevenueRecords(token, batch.id);
      const records = res.records;
      const data = records.map((r: any, i: number) => ({
        序号: i + 1,
        合作方: r.financier_name || r.financierName || "",
        落地合作方: r.local_partner_name || r.localPartnerName || r.sub_financier || r.subFinancier || "",
        线路: r.route_name || r.routeName || "",
        日期: r.revenue_date || r.revenueDate || "",
        关联单号: r.contract_number || r.contractNumber || "",
        运费金额: r.principal_amount ?? r.principalAmount ?? 0,
        服务费: r.amount ?? 0,
        车牌号: r.vehicle_plate || r.vehiclePlate || "",
        司机: r.driver_name || r.driverName || "",
      }));
      const totalFreight = data.reduce((s, r) => s + (Number(r.运费金额) || 0), 0);
      const totalService = data.reduce((s, r) => s + (Number(r.服务费) || 0), 0);
      data.push({
        序号: "" as any,
        合作方: "",
        落地合作方: "",
        线路: "",
        日期: "",
        关联单号: "合计",
        运费金额: totalFreight,
        服务费: totalService,
        车牌号: "",
        司机: "",
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "对账明细");
      XLSX.writeFile(wb, `对账明细_${batch.batchNumber}.xlsx`);
      message.success("Excel 导出成功");
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // 收益表格列
  const revenueColumns = [
    { title: "日期", dataIndex: "revenueDate", key: "date", width: 110 },
    { title: "区域", dataIndex: "areaName", key: "areaName", width: 120, render: (v: string) => v || <Tag>无区域</Tag> },
    { title: "合作方", dataIndex: "financierName", key: "financierName", width: 120 },
    { title: "落地合作方", key: "localPartner", width: 130,
      render: (_: any, r: RevenueRecord) => {
        const name = r.localPartnerName || r.subFinancier;
        return name ? <Tag color="cyan">{name}</Tag> : "-";
      }},
    { title: "线路", key: "route", width: 120,
      render: (_: any, r: RevenueRecord) => r.routeName ? <Tag color="blue">{r.routeName}</Tag> : "-" },
    { title: "关联单号", dataIndex: "contractNumber", key: "contractNumber", width: 160 },
    { title: "运费金额", dataIndex: "principalAmount", key: "principalAmount", width: 110, align: "right" as const,
      render: (v: number) => v != null ? formatAmount(v) : "-" },
    { title: "服务费", dataIndex: "amount", key: "amount", width: 110, align: "right" as const,
      render: (v: number) => <Text strong style={{ color: "#52c41a" }}>{formatAmount(v)}</Text> },
    { title: "车牌号", dataIndex: "vehiclePlate", key: "vehiclePlate", width: 100 },
    { title: "司机", dataIndex: "driverName", key: "driverName", width: 80 },
    { title: "状态", dataIndex: "status", key: "status", width: 80,
      render: (s: string) => {
        const map: Record<string, { text: string; color: string }> = {
          pending: { text: "待对账", color: "default" },
          confirmed: { text: "待对账", color: "default" },
          reconciling: { text: "对账中", color: "processing" },
          reconciled: { text: "已对账", color: "cyan" },
          settled: { text: "已结算", color: "success" },
          accounted: { text: "已入账", color: "green" },
        };
        const cfg = map[s] || { text: s, color: "default" };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      } },
  ];

  // 对账单表格列
  const batchColumns = [
    { title: "对账单号", dataIndex: "batchNumber", key: "batchNumber", width: 220, ellipsis: true,
      render: (v: string, r: ReconBatchType) => (
        <Tooltip title={v}>
          <Button
            type="link"
            size="small"
            style={{
              padding: 0,
              maxWidth: "100%",
              display: "inline-flex",
              alignItems: "center",
              overflow: "hidden",
            }}
            onClick={() => handleViewBatchDetail(r)}
          >
            <FileTextOutlined style={{ marginRight: 4, flex: "0 0 auto" }} />
            <span
              style={{
                display: "inline-block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%",
              }}
            >
              {v}
            </span>
          </Button>
        </Tooltip>
      )},
    { title: "合作方", dataIndex: "financierName", key: "financierName", width: 88, ellipsis: true },
    { title: "区域", dataIndex: "areaName", key: "areaName", width: 120,
      render: (v: string) => v ? renderCompactNames(v, "blue", 96) : <Tag style={{ marginInlineEnd: 0, paddingInline: 6, fontSize: 12 }}>无区域</Tag> },
    { title: "落地合作方", dataIndex: "localPartnerName", key: "localPartnerName", width: 170,
      render: (v: string) => renderCompactNames(v, "cyan", 138) },
    { title: "对账周期", key: "period", width: 190,
      render: (_: any, r: ReconBatchType) => `${r.periodStart} ~ ${r.periodEnd}` },
    { title: "记录数", dataIndex: "itemCount", key: "itemCount", width: 70, align: "center" as const },
    { title: "合计金额", dataIndex: "totalAmount", key: "totalAmount", width: 110, align: "right" as const,
      render: (v: number) => <Text strong style={{ color: "#1890ff" }}>{formatAmount(v)}</Text> },
    { title: "状态", dataIndex: "status", key: "status", width: 100,
      render: (s: string) => {
        const cfg = BATCH_STATUS_MAP[s] || { label: s, color: "default" };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      }},
    { title: "操作", key: "actions", width: 250,
      render: (_: any, r: ReconBatchType) => {
        const actions: React.ReactNode[] = [];

        actions.push(
          <Tooltip title="查看详情" key="view">
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewBatchDetail(r)}>详情</Button>
          </Tooltip>
        );

        actions.push(
          <Tooltip title="下载对账明细" key="download">
            <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadBatchExcel(r)}>下载</Button>
          </Tooltip>
        );

        if (r.status === "reconciling") {
          actions.push(
            <Button key="reconciled" type="primary" size="small" onClick={() => handleMarkReconciled(r)}>
              确认对账
            </Button>
          );
        } else if (r.status === "reconciled") {
          actions.push(
            <Button key="settlement" type="primary" size="small" onClick={() => handleGenerateSettlement(r)}>
              生成结算单
            </Button>
          );
        } else if (r.status === "settlement_generated" || r.status === "paid_offline" || r.status === "accounted") {
          const cfg = BATCH_STATUS_MAP[r.status];
          actions.push(<Tag key="done" color={cfg.color}>{cfg.label}</Tag>);
        }

        if (r.status === "reconciling" || r.status === "reconciled") {
          actions.push(
            <Popconfirm
              key="cancel"
              title="取消对账"
              description="取消后收益记录将退回到待对账状态，确认取消？"
              onConfirm={() => handleCancelBatch(r)}
              okText="确认取消"
              cancelText="返回"
            >
              <Button size="small" danger icon={<RollbackOutlined />}>取消</Button>
            </Popconfirm>
          );
        }

        return <Space size={4} wrap>{actions}</Space>;
      }},
  ];

  // 选中金额合计
  const selectedStats = useMemo(() => {
    const selected = revenueRecords.filter(r => selectedRevenueKeys.includes(r.id));
    return {
      totalAmount: selected.reduce((sum, r) => sum + (r.amount || 0), 0),
      totalFreight: selected.reduce((sum, r) => sum + (r.principalAmount || 0), 0),
    };
  }, [revenueRecords, selectedRevenueKeys]);
  const selectedTotal = selectedStats.totalAmount;
  const selectableRevenueKeys = useMemo(
    () =>
      revenueRecords
        .filter((r) => r.status === "confirmed" || r.status === "pending")
        .map((r) => r.id),
    [revenueRecords]
  );
  const handleApplyFilters = useCallback(() => {
    setSelectedRevenueKeys([]);
    if (activeTab === "revenue") {
      void loadRevenue();
    } else {
      void loadBatches();
    }
  }, [activeTab, loadRevenue, loadBatches]);

  if (!user?.permissions?.includes("manage_settlements") && !user?.permissions?.includes("manage_contracts")) {
    return (
      <Result status="403" title="无权限" subTitle="需要 manage_settlements 或 manage_contracts 权限" />
    );
  }

  if (featureDisabled) {
    return (
      <Result
        status="info"
        title="功能尚未启用"
        subTitle="抽成对账 v2 功能当前未启用，请联系管理员配置 ENABLE_COMMISSION_RECON_V2 环境变量"
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>业务抽成结算</Title>
          <Text type="secondary">选择收益 → 生成对账单 → 确认对账 → 生成结算单 → 结算中心处理付款</Text>
        </Col>
      </Row>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>总收入</div>
                <div style={{ fontSize: 24, fontWeight: "bold", color: "#1890ff" }}>{formatAmount(stats.totalRevenue)}</div>
                <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4 }}>运单平台抽成累计</div>
              </div>
              <DollarOutlined style={{ fontSize: 32, color: "#1890ff", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>待入账</div>
                <div style={{ fontSize: 24, fontWeight: "bold", color: "#faad14" }}>{formatAmount(stats.pendingAmount)}</div>
                <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4 }}>含待对账+对账中</div>
              </div>
              <ClockCircleOutlined style={{ fontSize: 32, color: "#faad14", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>已入账</div>
                <div style={{ fontSize: 24, fontWeight: "bold", color: "#52c41a" }}>{formatAmount(stats.accountedAmount)}</div>
                <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4 }}>已完成对账入账</div>
              </div>
              <CheckCircleOutlined style={{ fontSize: 32, color: "#52c41a", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* 筛选栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            style={{ width: 140 }}
            placeholder="合作方"
            allowClear
            value={selectedFinancierName || undefined}
            onChange={(v) => { setSelectedFinancierName(v || ""); setSelectedRevenueKeys([]); }}
            options={[
              { value: "融满", label: "融满" },
              { value: "金罗", label: "金罗" },
            ]}
          />
          <Select
            style={{ width: 200 }}
            placeholder="筛选合同"
            allowClear
            value={selectedContractId || undefined}
            onChange={(v) => { setSelectedContractId(v || ""); setSelectedRevenueKeys([]); }}
            options={contracts.map(c => ({ value: c.id, label: c.contractName || c.customerName }))}
          />
          <Select
            style={{ width: 180 }}
            placeholder="筛选区域"
            allowClear
            value={selectedAreaId || undefined}
            onChange={(v) => { setSelectedAreaId(v || ""); setSelectedRevenueKeys([]); }}
            options={areas.map(a => ({ value: a.id, label: a.name }))}
          />
          <Select
            style={{ width: 180 }}
            placeholder="筛选落地合作方"
            allowClear
            value={selectedLocalPartnerId || undefined}
            onChange={(v) => { setSelectedLocalPartnerId(v || ""); setSelectedRevenueKeys([]); }}
            options={localPartners.map(lp => ({ value: lp.id, label: lp.name }))}
          />
          <RangePicker
            value={dateRange}
            onChange={(vals) => { if (vals?.[0] && vals?.[1]) setDateRange([vals[0], vals[1]]); }}
            format="YYYY-MM-DD"
          />
          <Button type="primary" onClick={handleApplyFilters} loading={activeTab === "revenue" ? revenueLoading : batchLoading}>
            筛选
          </Button>
          <Button.Group>
            <Button type={activeTab === "revenue" ? "primary" : "default"} onClick={() => setActiveTab("revenue")}>
              收益明细
            </Button>
            <Button type={activeTab === "batches" ? "primary" : "default"} onClick={() => setActiveTab("batches")}>
              对账单
            </Button>
          </Button.Group>
        </Space>
      </Card>

      {activeTab === "revenue" ? (
        <Card
          title={<Space><SendOutlined />收益记录（勾选后生成对账单）</Space>}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
            <Space wrap>
              <Button onClick={() => setSelectedRevenueKeys(selectableRevenueKeys)} disabled={selectableRevenueKeys.length === 0}>
                全选可对账（{selectableRevenueKeys.length}）
              </Button>
              <Button onClick={() => setSelectedRevenueKeys([])} disabled={selectedRevenueKeys.length === 0}>
                清空已选
              </Button>
              <Button
                type="primary"
                icon={<FileAddOutlined />}
                onClick={handleCreateBatch}
                disabled={selectedRevenueKeys.length === 0}
              >
                生成对账单 ({selectedRevenueKeys.length})
              </Button>
            </Space>
            {selectedRevenueKeys.length > 0 && (
              <Text type="secondary">
                已选 {selectedRevenueKeys.length} 条，总运费 <Text strong>{formatAmount(selectedStats.totalFreight)}</Text>，合计 <Text strong style={{ color: "#1890ff" }}>{formatAmount(selectedTotal)}</Text>
              </Text>
            )}
          </div>
          <Table
            rowSelection={{
              preserveSelectedRowKeys: true,
              selectedRowKeys: selectedRevenueKeys,
              onChange: (keys) => setSelectedRevenueKeys(keys),
              getCheckboxProps: (record: RevenueRecord) => ({
                disabled: !(record.status === "confirmed" || record.status === "pending"),
              }),
              selections: [
                {
                  key: "select-all-filtered",
                  text: `全选可对账（${selectableRevenueKeys.length} 条）`,
                  onSelect: () => setSelectedRevenueKeys(selectableRevenueKeys),
                },
                {
                  key: "clear-all-selected",
                  text: "清空已选",
                  onSelect: () => setSelectedRevenueKeys([]),
                },
              ],
            }}
            columns={revenueColumns}
            dataSource={revenueRecords}
            loading={revenueLoading}
            rowKey="id"
            scroll={{ x: 1350 }}
            size="small"
            pagination={{ showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100', '200', '500'], showTotal: (t) => `共 ${t} 条` }}
          />
        </Card>
      ) : (
        <Card title={<Space><BankOutlined />对账单</Space>}>
          <Table
            columns={batchColumns}
            dataSource={batches}
            loading={batchLoading}
            rowKey="id"
            scroll={{ x: 1320 }}
            size="small"
            tableLayout="fixed"
            pagination={{ showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          />
        </Card>
      )}

      {/* 对账单详情弹窗 */}
      <Modal
        title={`对账单详情 - ${detailBatch?.batchNumber || ""}`}
        open={!!detailBatch}
        onCancel={() => { setDetailBatch(null); setDetailRecords([]); }}
        footer={null}
        width={900}
      >
        {detailBatch && (
          <div>
            <Row gutter={[16, 8]} style={{ background: "#f5f5f5", padding: 12, borderRadius: 6, marginBottom: 16 }}>
              <Col span={8}><Text type="secondary">合作方：</Text><Text strong>{detailBatch.financierName}</Text></Col>
              <Col span={8}><Text type="secondary">记录数：</Text><Text strong>{detailBatch.itemCount}</Text></Col>
              <Col span={8}><Text type="secondary">合计金额：</Text><Text strong style={{ color: "#1890ff" }}>{formatAmount(detailBatch.totalAmount)}</Text></Col>
              <Col span={8}><Text type="secondary">周期：</Text><Text>{detailBatch.periodStart} ~ {detailBatch.periodEnd}</Text></Col>
              <Col span={8}><Text type="secondary">状态：</Text><Tag color={BATCH_STATUS_MAP[detailBatch.status]?.color || "default"}>{BATCH_STATUS_MAP[detailBatch.status]?.label || detailBatch.status}</Tag></Col>
            </Row>
            <Table
              columns={[
                { title: "日期", dataIndex: "revenue_date", key: "date", width: 100, render: (v: string) => v || "-" },
                { title: "合作方", dataIndex: "financier_name", key: "financier", width: 100 },
                { title: "落地合作方", key: "lp", width: 120, render: (_: any, r: any) => {
                  const name = r.local_partner_name || r.sub_financier;
                  return name ? <Tag color="cyan">{name}</Tag> : "-";
                }},
                { title: "线路", key: "route", width: 100, render: (_: any, r: any) => r.route_name ? <Tag color="blue">{r.route_name}</Tag> : "-" },
                { title: "关联单号", dataIndex: "contract_number", key: "no", width: 140 },
                { title: "运费金额", dataIndex: "principal_amount", key: "principal", width: 100, align: "right" as const, render: (v: number) => v != null ? formatAmount(v) : "-" },
                { title: "服务费", dataIndex: "amount", key: "amount", width: 100, align: "right" as const, render: (v: number) => <Text strong style={{ color: "#52c41a" }}>{formatAmount(v)}</Text> },
                { title: "车牌号", dataIndex: "vehicle_plate", key: "plate", width: 90 },
                { title: "司机", dataIndex: "driver_name", key: "driver", width: 80 },
              ]}
              dataSource={detailRecords}
              loading={detailLoading}
              rowKey="id"
              scroll={{ x: 900 }}
              size="small"
              pagination={false}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

export default ProfitSharingSettlementPage;
