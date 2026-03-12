import {
  fetchWaybills,
  importWaybillsApi,
  deleteWaybillApi,
  createPaymentRequestApi,
  fetchAvailableCategories,
  fetchDirectedPayContracts,
  fetchFinanciers,
  getErrorMessage,
  type AvailablePaymentCategory
} from "../api";
import type { Financier } from "../types";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Dropdown,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  Upload,
  message
} from "antd";
import {
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  FileExcelOutlined,
  SearchOutlined,
  ReloadOutlined,
  DollarOutlined,
  SettingOutlined
} from "@ant-design/icons";
import {
  PAYMENT_CATEGORY_TEMPLATES,
  RECEIVER_TYPE_OPTIONS,
  WAYBILL_STATUS_OPTIONS,
  ReceiverType,
  WaybillStatus
} from "../types";
import { useEffect, useState, useMemo, useCallback } from "react";
import type { ColumnsType } from "antd/es/table";
import { Resizable } from "react-resizable";
import "react-resizable/css/styles.css";
import dayjs from "dayjs";
import * as XLSX from "xlsx";

const { RangePicker } = DatePicker;

const ResizableTitle = (props: any) => {
  const { onResize, width, ...restProps } = props;
  if (!width || !onResize) return <th {...restProps} />;
  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          style={{
            position: 'absolute', right: -5, bottom: 0, top: 0, width: 10,
            cursor: 'col-resize', zIndex: 1,
          }}
          onClick={(e) => e.stopPropagation()}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

// 运单数据类型 - 匹配CSV字段
interface WaybillData {
  id: string;
  waybillNumber: string; // 批次号
  operator?: string; // 经办人
  driverName?: string; // 主驾司机
  coDriver?: string; // 副驾司机
  vehiclePlate?: string; // 车牌号
  monthlyCost?: number; // 月度分摊费用合计
  createdTime?: string; // 创建时间
  departureTime?: string; // 发车时间
  remark?: string; // 批次备注
  totalVolume?: number; // 总体积
  vehicleRoute?: string; // 车辆线路
  driverPieceRate?: number; // 主驾计件
  branch?: string; // 网点
  customerName?: string; // 客户名称
  returnBatchNumber?: string; // 往返批次号
  projectName?: string; // 项目名称
  batchStatus?: string; // 批次状态
  assignStatus?: string; // 批次指派状态
  dispatchStatus?: string; // 批次派单状态
  batchTag?: string; // 批次标识
  batchSource?: string; // 批次来源
  loadType?: string; // 配载类型
  batchType?: string; // 批次类型
  pointCount?: number; // 点位数
  transactionTime?: string; // 交易时间
  originDepartureTime?: string; // 始发发车时间
  destArrivalTime?: string; // 终点到达时间
  unloadWaitTime?: string; // 卸车等待时长
  // 应收费用
  receivableTotal?: number; // 应收运输费合计
  receivableTransport?: number; // 应收运输费
  receivablePointFee?: number; // 应收点位费
  receivableUpstairsFee?: number; // 应收上楼费
  receivableLoadingFee?: number; // 应收装卸费
  receivableCash?: number; // 应收现付
  receivableCollect?: number; // 应收到付
  receivableReturn?: number; // 应收回付
  receivableOther?: number; // 应收其它
  // 应付费用
  payableTotal?: number; // 应付运输费合计
  coDriverPieceRate?: number; // 副驾/装卸计件
  carpoolFee?: number; // 付拼车费
  externalVehicleFee?: number; // 外调车费
  payableCash?: number; // 应付现付
  payableCollect?: number; // 应付到付
  payableOilCard?: number; // 应付油卡
  payableReturn?: number; // 应付回付
  // 发站到站
  departurePlace?: string; // 发站
  arrivalPlace?: string; // 到站
  // 利润信息
  profit?: number; // 任务毛利
  profitRate?: number; // 任务毛利率
  etcFee?: number; // ETC过路费
  // 兼容旧字段
  waybillDate?: string; // 运单日期（发车时间）
  customerId?: string;  // 融资方ID
  status?: string;
  createdAt: string;
  updatedAt: string;
  subFinancier?: string;
  // 融资方名称（从后端 JOIN 获取）
  financierName?: string;
}

function WaybillsPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  
  const [waybills, setWaybills] = useState<WaybillData[]>([]);
  const [loading, setLoading] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);
  
  // 筛选条件
  const [filters, setFilters] = useState<{
    customerName?: string;
    vehiclePlate?: string;
    batchStatus?: string;
    batchSource?: string;
    startDate?: string;
    endDate?: string;
  }>({});
  
  // 获取数据来源选项（从现有数据中提取）
  const batchSourceOptions = useMemo(() => {
    const sources = new Set<string>();
    waybills.forEach(w => {
      if (w.batchSource) sources.add(w.batchSource);
    });
    return Array.from(sources).map(s => ({ label: s, value: s }));
  }, [waybills]);

  // 列分组可见性控制
  const columnGroups = [
    { key: 'summary', label: '金额汇总' },
    { key: 'receivable', label: '应收明细' },
    { key: 'payable', label: '应付明细' },
    { key: 'otherFees', label: '其他费用' },
    { key: 'basicInfo', label: '基础信息' },
    { key: 'sourceInfo', label: '来源信息' },
  ];
  const [visibleGroups, setVisibleGroups] = useState<string[]>(
    columnGroups.map(g => g.key) // 默认全部显示
  );
  
  // 定向支付弹窗
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedWaybill, setSelectedWaybill] = useState<WaybillData | null>(null);
  const [paymentForm] = Form.useForm();
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<AvailablePaymentCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [availableContracts, setAvailableContracts] = useState<any[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  
  // 融资方列表（平台用户导入时选择）
  const [financiers, setFinanciers] = useState<Financier[]>([]);
  const [selectedFinancierId, setSelectedFinancierId] = useState<string>();

  // 列宽拖动状态
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchWaybills(token, filters as any);
      setWaybills(res.waybills as any);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, filters]);

  // 加载融资方列表（平台用户需要）
  useEffect(() => {
    if (user?.orgContext?.isPlatformUser && token) {
      fetchFinanciers(token).then(res => setFinanciers(res.financiers)).catch(() => {});
    }
  }, [token, user]);

  // CSV解析函数
  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const rows: Record<string, string>[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index]?.trim() || '';
      });
      rows.push(row);
    }
    
    return rows;
  };

  // 字段映射：CSV列名 -> API字段名
  const CSV_FIELD_MAP: Record<string, string> = {
    '批次号': 'waybillNumber',
    '主驾司机': 'driverName',
    '副驾司机': 'coDriver',
    '车牌号': 'vehiclePlate',
    '发站': 'departurePlace',
    '到站': 'arrivalPlace',
    '发车时间': 'departureTime',
    '客户名称': 'customerName',
    '项目名称': 'projectName',
    '批次状态': 'batchStatus',
    '应收运输费合计': 'receivableTotal',
    '应付运输费合计': 'payableTotal',
    '任务毛利': 'profit',
    '任务毛利率': 'profitRate',
    'ETC过路费': 'etcFee',
    '应付油卡': 'payableOilCard',
    '批次备注': 'remark',
    '网点': 'branch',
    '车辆线路': 'vehicleRoute',
    '配载类型': 'loadType',
    '批次类型': 'batchType',
    '点位数': 'pointCount',
    '总体积': 'totalVolume',
    '批次来源': 'batchSource',
  };

  // 转换CSV行到API格式
  const mapCSVRow = (row: Record<string, string>): Record<string, any> => {
    const mapped: Record<string, any> = {};
    for (const [csvKey, apiKey] of Object.entries(CSV_FIELD_MAP)) {
      if (row[csvKey] !== undefined && row[csvKey] !== '') {
        mapped[apiKey] = row[csvKey];
      }
    }
    return mapped;
  };

  // 处理文件上传（支持分批上传大文件）
  const handleFileUpload = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    
    try {
      // 1. 读取文件内容
      const text = await file.text();
      
      // 2. 解析CSV
      const rows = parseCSV(text);
      if (rows.length === 0) {
        message.error("文件为空或格式不正确");
        return false;
      }
      
      // 3. 字段映射
      const waybills = rows.map(mapCSVRow);
      
      // 4. 分批上传（每批1000条）
      const BATCH_SIZE = 1000;
      let totalSuccess = 0;
      let totalFailed = 0;
      const allErrors: string[] = [];
      
      const totalBatches = Math.ceil(waybills.length / BATCH_SIZE);
      
      for (let i = 0; i < waybills.length; i += BATCH_SIZE) {
        const batch = waybills.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        
        message.loading({
          content: `正在导入第 ${batchNum}/${totalBatches} 批数据...`,
          key: 'import-progress'
        });
        
        try {
          const result = await importWaybillsApi(token!, {
            waybills: batch,
            customerId: selectedFinancierId
          });
          
          totalSuccess += result.success;
          totalFailed += result.failed;
          if (result.errors.length > 0) {
            allErrors.push(...result.errors);
          }
        } catch (err: any) {
          totalFailed += batch.length;
          allErrors.push(`批次 ${batchNum} 导入失败: ${getErrorMessage(err)}`);
        }
      }
      
      message.destroy('import-progress');
      
      const finalResult = {
        success: totalSuccess,
        failed: totalFailed,
        errors: allErrors.slice(0, 50)  // 最多显示50条错误
      };
      
      setImportResult(finalResult);
      
      if (totalSuccess > 0) {
        message.success(`成功导入 ${totalSuccess} 条运单`);
        void refresh();
      }
      if (totalFailed > 0) {
        message.warning(`${totalFailed} 条运单导入失败`);
      }
    } catch (err: any) {
      message.error(getErrorMessage(err));
    } finally {
      setImporting(false);
    }
    
    return false;
  };

  // 统计数据
  const stats = useMemo(() => {
    const totalCount = waybills.length;
    const totalReceivable = waybills.reduce((sum, w) => sum + (w.receivableTotal || 0), 0);
    const totalPayable = waybills.reduce((sum, w) => sum + (w.payableTotal || 0), 0);
    const totalProfit = waybills.reduce((sum, w) => sum + (w.profit || 0), 0);
    return { totalCount, totalReceivable, totalPayable, totalProfit };
  }, [waybills]);

  // 打开定向支付弹窗
  const openPaymentModal = async (record: WaybillData) => {
    setSelectedWaybill(record);
    setPaymentModalOpen(true);
    setLoadingCategories(true);
    setLoadingContracts(true);
    
    // 获取用户可见的定向支付合同列表（只获取 active 状态的）
    try {
      const contractsRes = await fetchDirectedPayContracts(token!, { status: "active" });
      const contracts = contractsRes.contracts || [];
      setAvailableContracts(contracts);
      
      // 如果运单有关联的融资方，自动选择该融资方的合同
      const matchedContract = record.customerId 
        ? contracts.find((c: any) => c.financierId === record.customerId)
        : contracts[0];
      
      if (matchedContract) {
        paymentForm.setFieldsValue({ contractId: matchedContract.id });
      }
    } catch (err) {
      message.error("获取合同列表失败");
      setAvailableContracts([]);
    } finally {
      setLoadingContracts(false);
    }
    
    // 获取可申请的费用类别
    try {
      const res = await fetchAvailableCategories(token!, record.id);
      const unlockedCategories = res.categories.filter(c => c.isUnlocked);
      setAvailableCategories(unlockedCategories);
      
      // 设置默认值
      const defaultCategory = unlockedCategories[0];
      paymentForm.setFieldsValue({
        waybillNumber: record.waybillNumber,
        driverName: record.driverName,
        paymentAmount: record.totalPayable || record.payableTotal || 0,
        categoryCode: defaultCategory?.categoryCode || "FREIGHT",
        categoryName: defaultCategory?.categoryName || "运费",
        receiverType: "payment_code"
      });
    } catch (err) {
      message.error("获取可申请费用类别失败");
      // 使用默认类别
      setAvailableCategories(PAYMENT_CATEGORY_TEMPLATES.map(c => ({
        id: "",
        contractId: "",
        categoryCode: c.code,
        categoryName: c.name,
        paymentRatio: 100,
        unlockStatus: "created",
        isUnlocked: true
      })));
      paymentForm.setFieldsValue({
        waybillNumber: record.waybillNumber,
        driverName: record.driverName,
        paymentAmount: record.totalPayable || record.payableTotal || 0,
        categoryCode: "FREIGHT",
        categoryName: "运费",
        receiverType: "payment_code"
      });
    } finally {
      setLoadingCategories(false);
    }
  };

  // 提交定向支付
  const handleSubmitPayment = async () => {
    if (!token || !selectedWaybill) return;
    try {
      const values = await paymentForm.validateFields();
      setSubmittingPayment(true);
      
      await createPaymentRequestApi(token, {
        contractId: values.contractId,
        waybillId: selectedWaybill.id,
        waybillNumber: selectedWaybill.waybillNumber,
        categoryCode: values.categoryCode,
        categoryName: values.categoryName,
        paymentAmount: Number(values.paymentAmount),
        receiverType: values.receiverType as ReceiverType,
        driverName: values.driverName,
        driverPhone: values.driverPhone,
        remark: values.remark
      });
      
      message.success("定向支付申请创建成功");
      setPaymentModalOpen(false);
      paymentForm.resetFields();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(getErrorMessage(err));
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleDelete = (record: WaybillData) => {
    if (!token) return;
    Modal.confirm({
      title: "确认删除？",
      content: `确定要删除运单 "${record.waybillNumber}" 吗？`,
      okButtonProps: { danger: true },
      okText: "确认",
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteWaybillApi(token, record.id);
          message.success("已删除");
          await refresh();
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      }
    });
  };

  // 下载模板
  const downloadTemplate = () => {
    const headers = [
      '序号', '经办人', '主驾司机', '月度分摊费用合计', '副驾司机', '车牌号', 
      '创建时间', '发车时间', '批次备注', '总体积', '车辆线路', '主驾计件', 
      '网点', '批次号', '客户名称', '往返批次号', '项目名称', '批次状态', 
      '批次指派状态', '批次派单状态', '批次标识', '批次来源', '配载类型', 
      '批次类型', '点位数', '交易时间', '始发发车时间', '终点到达时间', 
      '卸车等待时长', '应收运输费合计', '应收运输费', '应收点位费', 
      '应收上楼费', '应收装卸费', '应收现付', '应收到付', '应收回付', 
      '应收其它', '应付运输费合计', '副驾/装卸计件', '付拼车费', '外调车费', 
      '应付现付', '应付到付', '应付油卡', '应付回付', '发站', '到站', 
      '任务毛利', '任务毛利率', 'ETC过路费'
    ];
    
    const csvContent = headers.join(',');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '运单导入模板.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    if (waybills.length === 0) {
      message.warning("没有数据可导出");
      return;
    }

    const exportColumns = [
      { header: "融资方", key: (w: WaybillData) => w.financierName || w.customerName || "" },
      { header: "子融资方", key: (w: WaybillData) => w.subFinancier || "" },
      { header: "批次号", key: (w: WaybillData) => w.waybillNumber },
      { header: "批次状态", key: (w: WaybillData) => w.batchStatus || "" },
      { header: "应收合计", key: (w: WaybillData) => w.receivableTotal ?? "" },
      { header: "应付合计", key: (w: WaybillData) => w.payableTotal ?? "" },
      { header: "毛利", key: (w: WaybillData) => w.profit ?? "" },
      { header: "毛利率", key: (w: WaybillData) => w.profitRate != null ? `${(w.profitRate * 100).toFixed(0)}%` : "" },
      { header: "应收运输费", key: (w: WaybillData) => w.receivableTransport ?? "" },
      { header: "应收点位费", key: (w: WaybillData) => w.receivablePointFee ?? "" },
      { header: "应收上楼费", key: (w: WaybillData) => w.receivableUpstairsFee ?? "" },
      { header: "应收装卸费", key: (w: WaybillData) => w.receivableLoadingFee ?? "" },
      { header: "应收现付", key: (w: WaybillData) => w.receivableCash ?? "" },
      { header: "应收到付", key: (w: WaybillData) => w.receivableCollect ?? "" },
      { header: "应收回付", key: (w: WaybillData) => w.receivableReturn ?? "" },
      { header: "应收其它", key: (w: WaybillData) => w.receivableOther ?? "" },
      { header: "应付现付", key: (w: WaybillData) => w.payableCash ?? "" },
      { header: "应付到付", key: (w: WaybillData) => w.payableCollect ?? "" },
      { header: "应付油卡", key: (w: WaybillData) => w.payableOilCard ?? "" },
      { header: "应付回付", key: (w: WaybillData) => w.payableReturn ?? "" },
      { header: "拼车费", key: (w: WaybillData) => w.carpoolFee ?? "" },
      { header: "外调车费", key: (w: WaybillData) => w.externalVehicleFee ?? "" },
      { header: "ETC过路费", key: (w: WaybillData) => w.etcFee ?? "" },
      { header: "月度分摊费用", key: (w: WaybillData) => w.monthlyCost ?? "" },
      { header: "主驾计件", key: (w: WaybillData) => w.driverPieceRate ?? "" },
      { header: "副驾计件", key: (w: WaybillData) => w.coDriverPieceRate ?? "" },
      { header: "车牌号", key: (w: WaybillData) => w.vehiclePlate || "" },
      { header: "主驾司机", key: (w: WaybillData) => w.driverName || "" },
      { header: "副驾司机", key: (w: WaybillData) => w.coDriver || "" },
      { header: "发站", key: (w: WaybillData) => w.departurePlace || "" },
      { header: "到站", key: (w: WaybillData) => w.arrivalPlace || "" },
      { header: "发车时间", key: (w: WaybillData) => {
        const t = w.waybillDate || w.departureTime || w.createdTime;
        return t ? dayjs(t).format("YYYY-MM-DD HH:mm") : "";
      }},
      { header: "数据来源", key: (w: WaybillData) => w.batchSource || "" },
      { header: "项目名称", key: (w: WaybillData) => w.projectName || "" },
      { header: "客户名称", key: (w: WaybillData) => w.customerName || "" },
      { header: "网点", key: (w: WaybillData) => w.branch || "" },
      { header: "车辆线路", key: (w: WaybillData) => w.vehicleRoute || "" },
      { header: "备注", key: (w: WaybillData) => w.remark || "" },
    ];

    const headers = exportColumns.map(c => c.header);
    const rows = waybills.map(w => exportColumns.map(c => c.key(w)));

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    const colWidths = headers.map((h, i) => {
      let maxLen = h.length;
      rows.forEach(row => {
        const cellLen = String(row[i] ?? "").length;
        if (cellLen > maxLen) maxLen = cellLen;
      });
      return { wch: Math.min(Math.max(maxLen + 2, 8), 30) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "运单数据");
    XLSX.writeFile(wb, `运单数据_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`);
    message.success(`已导出 ${waybills.length} 条运单数据`);
  };

  const formatMoney = (v: number | undefined | null, showSign = false) => {
    if (v === undefined || v === null || v === 0) return "-";
    const formatted = v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return <span style={{ whiteSpace: 'nowrap' }}>{showSign && v > 0 ? '+' : ''}¥{formatted}</span>;
  };

  // 格式化利润率显示
  const formatProfitRate = (v: number | undefined | null) => {
    if (v === undefined || v === null) return "-";
    const color = v >= 0 ? "#52c41a" : "#ff4d4f";
    return <span style={{ color, whiteSpace: 'nowrap' }}>{(v * 100).toFixed(0)}%</span>;
  };

  const formatProfit = (v: number | undefined | null) => {
    if (v === undefined || v === null) return "-";
    const color = v >= 0 ? "#52c41a" : "#ff4d4f";
    const formatted = v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return <span style={{ color, fontWeight: 500, whiteSpace: 'nowrap' }}>¥{formatted}</span>;
  };

  // 表格列定义 - 使用 column group 分组，金额优先
  // 使用 useMemo 根据 visibleGroups 动态过滤列
  const columns: ColumnsType<WaybillData> = useMemo(() => {
    const fixedLeftColumns: ColumnsType<WaybillData> = [
      // ========== 固定左侧：融资方标识 + 批次号 ==========
      {
        title: "融资方",
        key: "financier",
        width: 100,
        fixed: 'left',
        render: (_: any, record: WaybillData) => {
          const displayName = record.financierName || record.customerName;
          if (!displayName) {
            return <Tag color="default" style={{ margin: 0 }}>未指定</Tag>;
          }
          return <Tag color="blue" style={{ margin: 0 }}>{displayName}</Tag>;
        }
      },
      {
        title: "子融资方",
        dataIndex: "subFinancier",
        width: 120,
        fixed: 'left',
        ellipsis: true,
        render: (v: string) => v ? <Tag color="cyan" style={{ margin: 0 }}>{v}</Tag> : '-',
      },
      {
        title: "批次号",
        dataIndex: "waybillNumber",
        width: 130,
        fixed: 'left',
        ellipsis: true,
      },
      {
        title: "状态",
        dataIndex: "batchStatus",
        width: 60,
        render: (status: string) => {
          if (!status) return "-";
          const shortStatus = status === "10" ? "待" : status === "20" ? "运" : status === "30" ? "完" : status.slice(0, 2);
          const colorMap: Record<string, string> = {
            "10": "default", "20": "blue", "30": "green",
            "已到达": "green", "已发车": "blue", "已完成": "green", "已取消": "default",
          };
          return <Tag color={colorMap[status] || "default"} style={{ margin: 0, padding: '0 4px' }}>{shortStatus}</Tag>;
        }
      },
    ];

    // 金额汇总组
    const summaryGroup = {
      key: 'summary',
      title: "金额汇总",
      children: [
        {
          title: "应收合计",
          dataIndex: "receivableTotal",
          width: 90,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "应付合计",
          dataIndex: "payableTotal",
          width: 90,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "毛利",
          dataIndex: "profit",
          width: 85,
          align: 'right' as const,
          render: (v: number) => formatProfit(v),
        },
        {
          title: "利率",
          dataIndex: "profitRate",
          width: 55,
          align: 'right' as const,
          render: (v: number) => formatProfitRate(v),
        },
      ]
    };

    // 应收明细组
    const receivableGroup = {
      key: 'receivable',
      title: "应收明细",
      children: [
        {
          title: "运输费",
          dataIndex: "receivableTransport",
          width: 80,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "点位费",
          dataIndex: "receivablePointFee",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "上楼费",
          dataIndex: "receivableUpstairsFee",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "装卸费",
          dataIndex: "receivableLoadingFee",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "现付",
          dataIndex: "receivableCash",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "到付",
          dataIndex: "receivableCollect",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "回付",
          dataIndex: "receivableReturn",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "其它",
          dataIndex: "receivableOther",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
      ]
    };

    // 应付明细组
    const payableGroup = {
      key: 'payable',
      title: "应付明细",
      children: [
        {
          title: "现付",
          dataIndex: "payableCash",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "到付",
          dataIndex: "payableCollect",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "油卡",
          dataIndex: "payableOilCard",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "回付",
          dataIndex: "payableReturn",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "拼车费",
          dataIndex: "carpoolFee",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "外调车",
          dataIndex: "externalVehicleFee",
          width: 75,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "ETC",
          dataIndex: "etcFee",
          width: 70,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
      ]
    };

    // 其他费用组
    const otherFeesGroup = {
      key: 'otherFees',
      title: "其他费用",
      children: [
        {
          title: "月度分摊",
          dataIndex: "monthlyCost",
          width: 80,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "主驾计件",
          dataIndex: "driverPieceRate",
          width: 80,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
        {
          title: "副驾计件",
          dataIndex: "coDriverPieceRate",
          width: 80,
          align: 'right' as const,
          render: (v: number) => formatMoney(v),
        },
      ]
    };
    // 基础信息组
    const basicInfoGroup = {
      key: 'basicInfo',
      title: "基础信息",
      children: [
        {
          title: "车牌",
          dataIndex: "vehiclePlate",
          width: 90,
          ellipsis: true,
          render: (v: string) => v || "-",
        },
        {
          title: "司机",
          dataIndex: "driverName",
          width: 70,
          ellipsis: true,
          render: (v: string) => v || "-",
        },
        {
          title: "发站",
          dataIndex: "departurePlace",
          width: 80,
          ellipsis: true,
          render: (v: string) => v || "-",
        },
        {
          title: "到站",
          dataIndex: "arrivalPlace",
          width: 80,
          ellipsis: true,
          render: (v: string) => v || "-",
        },
        {
          title: "发车时间",
          dataIndex: "waybillDate",
          width: 100,
          sorter: (a: WaybillData, b: WaybillData) => {
            const ta = a.waybillDate || a.departureTime || '';
            const tb = b.waybillDate || b.departureTime || '';
            return ta.localeCompare(tb);
          },
          render: (_: string, record: WaybillData) => {
            const time = record.waybillDate || record.departureTime || (record as any).createdTime;
            return time ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(time).format('YY-MM-DD')}</span> : '-';
          },
        },
      ]
    };

    // 来源信息组
    const sourceInfoGroup = {
      key: 'sourceInfo',
      title: "来源信息",
      children: [
        {
          title: "数据来源",
          dataIndex: "batchSource",
          width: 80,
          ellipsis: true,
          render: (v: string) => v ? <Tag color="cyan" style={{ margin: 0 }}>{v}</Tag> : "-",
        },
        {
          title: "项目名称",
          dataIndex: "projectName",
          width: 100,
          ellipsis: true,
          render: (v: string) => v || "-",
        },
        {
          title: "备注",
          dataIndex: "remark",
          width: 100,
          ellipsis: true,
          render: (v: string) => v || "-",
        },
      ]
    };

    // 固定右侧操作列
    const actionColumn = {
      title: "操作",
      width: 130,
      fixed: 'right' as const,
      render: (_: any, record: WaybillData) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<DollarOutlined />}
            onClick={() => openPaymentModal(record)}
          >
            申请支付
          </Button>
          <Button
            danger
            type="link"
            size="small"
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      )
    };

    // 所有可配置的列组
    const allColumnGroups = [
      { key: 'summary', column: summaryGroup },
      { key: 'receivable', column: receivableGroup },
      { key: 'payable', column: payableGroup },
      { key: 'otherFees', column: otherFeesGroup },
      { key: 'basicInfo', column: basicInfoGroup },
      { key: 'sourceInfo', column: sourceInfoGroup },
    ];

    // 根据 visibleGroups 过滤列
    const visibleColumnGroups = allColumnGroups
      .filter(g => visibleGroups.includes(g.key))
      .map(g => g.column);

    return [
      ...fixedLeftColumns,
      ...visibleColumnGroups,
      actionColumn,
    ] as ColumnsType<WaybillData>;
  }, [visibleGroups]);

  return (
    <div style={{ padding: 16 }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="运单总数"
              value={stats.totalCount}
              suffix="单"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="应收运输费合计"
              value={stats.totalReceivable}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="应付运输费合计"
              value={stats.totalPayable}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="总毛利"
              value={stats.totalProfit}
              precision={2}
              prefix="¥"
              valueStyle={{ color: stats.totalProfit >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 筛选区 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Form layout="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Form.Item label="客户名称">
            <Input
              style={{ width: 150 }}
              placeholder="客户名称"
              allowClear
              onChange={(e) => setFilters(prev => ({ ...prev, customerName: e.target.value || undefined }))}
            />
          </Form.Item>
          <Form.Item label="车牌号">
            <Input
              style={{ width: 120 }}
              placeholder="车牌号"
              allowClear
              onChange={(e) => setFilters(prev => ({ ...prev, vehiclePlate: e.target.value || undefined }))}
            />
          </Form.Item>
          <Form.Item label="批次状态">
            <Select
              style={{ width: 120 }}
              placeholder="全部"
              allowClear
              options={[
                { label: "已到达", value: "已到达" },
                { label: "已发车", value: "已发车" },
                { label: "已完成", value: "已完成" },
                { label: "已取消", value: "已取消" }
              ]}
              onChange={(value) => setFilters(prev => ({ ...prev, batchStatus: value }))}
            />
          </Form.Item>
          <Form.Item label="数据来源">
            <Select
              style={{ width: 120 }}
              placeholder="全部来源"
              allowClear
              options={batchSourceOptions}
              onChange={(value) => setFilters(prev => ({ ...prev, batchSource: value }))}
            />
          </Form.Item>
          <Form.Item label="日期范围">
            <RangePicker
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setFilters(prev => ({
                    ...prev,
                    startDate: dates[0]!.format('YYYY-MM-DD'),
                    endDate: dates[1]!.format('YYYY-MM-DD')
                  }));
                } else {
                  setFilters(prev => ({
                    ...prev,
                    startDate: undefined,
                    endDate: undefined
                  }));
                }
              }}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button icon={<SearchOutlined />} type="primary" onClick={refresh}>
                搜索
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                setFilters({});
                refresh();
              }}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* 操作按钮 - 资金方用户无法上传 */}
      <Space style={{ marginBottom: 12 }}>
        {user?.orgContext?.orgType !== "funder" && (
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => setImportModalOpen(true)}
          >
            导入运单
          </Button>
        )}
        <Button
          icon={<DownloadOutlined />}
          onClick={downloadTemplate}
        >
          下载模板
        </Button>
        <Button
          icon={<FileExcelOutlined />}
          onClick={handleExportExcel}
          disabled={waybills.length === 0}
        >
          导出Excel
        </Button>
        <Dropdown
          trigger={['click']}
          dropdownRender={() => (
            <div style={{ 
              background: '#fff', 
              borderRadius: 8, 
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              padding: '8px 0'
            }}>
              <div style={{ padding: '4px 12px', color: '#999', fontSize: 12 }}>显示列组</div>
              {columnGroups.map(group => (
                <div 
                  key={group.key} 
                  style={{ padding: '6px 12px', cursor: 'pointer' }}
                  onClick={() => {
                    setVisibleGroups(prev => 
                      prev.includes(group.key) 
                        ? prev.filter(k => k !== group.key) 
                        : [...prev, group.key]
                    );
                  }}
                >
                  <Checkbox checked={visibleGroups.includes(group.key)}>
                    {group.label}
                  </Checkbox>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
                <div 
                  style={{ padding: '6px 12px', cursor: 'pointer', color: '#1890ff' }}
                  onClick={() => setVisibleGroups(columnGroups.map(g => g.key))}
                >
                  全部显示
                </div>
              </div>
            </div>
          )}
        >
          <Button icon={<SettingOutlined />}>
            列配置
          </Button>
        </Dropdown>
      </Space>

      {/* 数据表格 - 支持列拖拽调宽 + 横向滚动 */}
      <Table<WaybillData>
        rowKey="id"
        loading={loading}
        dataSource={waybills}
        columns={columns.map((col: any, index: number) => {
          // 固定列和分组列（有children）不参与拖拽resize
          if (col.fixed || col.children) return col;
          const key = col.dataIndex || col.title || index;
          const w = columnWidths[key] || col.width;
          if (!w) return col;
          return {
            ...col,
            width: w,
            onHeaderCell: () => ({
              width: w,
              onResize: (_: any, { size }: any) => {
                setColumnWidths(prev => ({ ...prev, [key]: size.width }));
              },
            }),
          };
        })}
        components={{ header: { cell: ResizableTitle } }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        scroll={{ x: 2800 }}
        size="small"
        bordered
      />

      {/* 导入弹窗 */}
      <Modal
        open={importModalOpen}
        title={
          <Space>
            <FileExcelOutlined />
            导入运单数据
          </Space>
        }
        onCancel={() => {
          setImportModalOpen(false);
          setImportResult(null);
          setSelectedFinancierId(undefined);
        }}
        footer={null}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <Typography.Paragraph type="secondary">
            请上传 CSV 格式的运单数据文件。可以先下载模板查看格式要求。
          </Typography.Paragraph>
          <Button
            icon={<DownloadOutlined />}
            onClick={downloadTemplate}
            style={{ marginBottom: 16 }}
          >
            下载导入模板
          </Button>
        </div>

        {/* 平台用户需要选择融资方 */}
        {user?.orgContext?.isPlatformUser && (
          <Form.Item label="选择融资方" required style={{ marginBottom: 16 }}>
            <Select
              value={selectedFinancierId}
              onChange={setSelectedFinancierId}
              placeholder="请选择要导入数据的融资方"
              showSearch
              filterOption={(input, option) =>
                ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={financiers.map(f => ({
                value: f.id,
                label: f.enterpriseName
              }))}
            />
          </Form.Item>
        )}

        <Upload.Dragger
          accept=".csv"
          showUploadList={false}
          beforeUpload={handleFileUpload}
          disabled={importing || (user?.orgContext?.isPlatformUser && !selectedFinancierId)}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          </p>
          <p className="ant-upload-text">
            {importing ? "正在导入..." : "点击或拖拽文件到此区域上传"}
          </p>
          <p className="ant-upload-hint">
            {user?.orgContext?.isPlatformUser && !selectedFinancierId 
              ? "请先选择融资方" 
              : "支持 CSV 格式文件"}
          </p>
        </Upload.Dragger>

        {importResult && (
          <div style={{ marginTop: 16 }}>
            <Alert
              type={importResult.failed > 0 ? "warning" : "success"}
              message={
                <Space direction="vertical">
                  <span>
                    导入完成：成功 {importResult.success} 条，失败 {importResult.failed} 条
                  </span>
                  {importResult.errors.length > 0 && (
                    <div style={{ maxHeight: 200, overflow: 'auto' }}>
                      {importResult.errors.map((err, idx) => (
                        <div key={idx} style={{ color: '#ff4d4f' }}>{err}</div>
                      ))}
                    </div>
                  )}
                </Space>
              }
            />
          </div>
        )}
      </Modal>

      {/* 定向支付弹窗 */}
      <Modal
        open={paymentModalOpen}
        title="发起定向支付"
        onCancel={() => {
          setPaymentModalOpen(false);
          paymentForm.resetFields();
        }}
        onOk={handleSubmitPayment}
        confirmLoading={submittingPayment}
        width={500}
      >
        <Form form={paymentForm} layout="vertical" style={{ marginTop: 16 }}>
          {selectedWaybill && (
            <div style={{ marginBottom: 16, background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Typography.Text type="secondary">运单号</Typography.Text>
                  <div>{selectedWaybill.waybillNumber}</div>
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">当前状态</Typography.Text>
                  <div>
                    <Tag color={
                      {created: "default", dispatched: "processing", loading: "processing", 
                       in_transit: "blue", delivered: "cyan", signed: "green", 
                       settled: "purple", completed: "success", cancelled: "error"}
                      [(selectedWaybill as any).status] || "default"
                    }>
                      {WAYBILL_STATUS_OPTIONS.find(o => o.value === (selectedWaybill as any).status)?.label || "未知"}
                    </Tag>
                  </div>
                </Col>
              </Row>
              <Row gutter={16} style={{ marginTop: 8 }}>
                <Col span={12}>
                  <Typography.Text type="secondary">司机</Typography.Text>
                  <div>{selectedWaybill.driverName || '-'}</div>
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">车牌号</Typography.Text>
                  <div>{selectedWaybill.vehiclePlate || '-'}</div>
                </Col>
              </Row>
              <Row gutter={16} style={{ marginTop: 8 }}>
                <Col span={24}>
                  <Typography.Text type="secondary">应付运费</Typography.Text>
                  <div style={{ color: '#1890ff', fontWeight: 'bold' }}>
                    ¥{(selectedWaybill.totalPayable || selectedWaybill.payableTotal || 0).toLocaleString()}
                  </div>
                </Col>
              </Row>
            </div>
          )}
          
          <Form.Item
            name="contractId"
            label="定向支付合同"
            rules={[{ required: true, message: "请选择合同" }]}
          >
            <Select
              placeholder={loadingContracts ? "加载中..." : (availableContracts.length === 0 ? "暂无可用合同" : "请选择合同")}
              loading={loadingContracts}
              disabled={availableContracts.length === 0}
              showSearch
              filterOption={(input, option) =>
                ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={availableContracts.map((c: any) => ({
                value: c.id,
                label: `${c.contractNumber} - ${c.financierName || '未知融资方'} (额度: ¥${(c.availableAmount || 0).toLocaleString()})`
              }))}
            />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="categoryCode"
                label="费用类别"
                rules={[{ required: true, message: "请选择费用类别" }]}
              >
                <Select 
                  placeholder="请选择"
                  loading={loadingCategories}
                  options={availableCategories.map(c => ({ 
                    value: c.categoryCode, 
                    label: `${c.categoryName}${c.paymentRatio < 100 ? ` (支付比例${c.paymentRatio}%)` : ''}`
                  }))}
                  onChange={(v) => {
                    const cat = availableCategories.find(c => c.categoryCode === v);
                    if (cat) paymentForm.setFieldValue("categoryName", cat.categoryName);
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="categoryName" hidden><Input /></Form.Item>
              <Form.Item
                name="paymentAmount"
                label="支付金额"
                rules={[{ required: true }]}
              >
                <Input type="number" prefix="¥" />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item
            name="receiverType"
            label="收款方式"
            rules={[{ required: true }]}
          >
            <Select options={RECEIVER_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="driverName" label="司机姓名">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="driverPhone" label="司机电话">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default WaybillsPage;
