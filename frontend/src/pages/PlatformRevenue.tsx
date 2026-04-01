import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, Row, Col, Statistic, Table, Select, DatePicker, Button, Space, Tag, message, Empty, Spin, Progress, Typography, Modal } from 'antd';
import { DownloadOutlined, FileTextOutlined, TeamOutlined, UserOutlined, RiseOutlined, ArrowUpOutlined, ArrowDownOutlined, FileExcelOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';

const { Text } = Typography;
import * as echarts from 'echarts';
import dayjs, { Dayjs } from 'dayjs';

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
import { useAuth } from '../auth';
import {
  fetchPlatformRevenueStats,
  fetchPlatformRevenueList,
  fetchPlatformRevenueTrend,
  fetchPlatformRevenueComposition,
  fetchPlatformRevenueFunderRanking,
  fetchPlatformRevenueFinancierRanking,
  getPlatformRevenueExportUrl,
  RevenueStats,
  RevenueRecord,
  RevenueTrendPoint,
  RevenueComposition,
  RevenueRankItem,
  RevenueSourceType,
  getErrorMessage,
  fetchLocalPartners,
} from '../api';

const { RangePicker } = DatePicker;

// 时间范围快捷选项
type TimeRange = 'today' | 'week' | 'month' | 'year' | 'custom';

// 收益类型映射
const SOURCE_TYPE_MAP: Record<string, string> = {
  financing_interest: '融资利息',
  directed_pay_interest: '定向支付利息',
  brokerage_commission: '撮合抽成',
  commission_fee: '抽成费用',
  waybill_commission: '运单抽成',
};

const PlatformRevenue: React.FC = () => {
  const { token } = useAuth();
  
  // 状态
  const [timeRange, setTimeRange] = useState<TimeRange>('year');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month' | 'year'>('month');
  
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [composition, setComposition] = useState<RevenueComposition[]>([]);
  const [funderRanking, setFunderRanking] = useState<RevenueRankItem[]>([]);
  const [financierRanking, setFinancierRanking] = useState<RevenueRankItem[]>([]);
  const [records, setRecords] = useState<RevenueRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  
  // 筛选条件
  const [filters, setFilters] = useState({
    sourceType: undefined as RevenueSourceType | undefined,
    funderId: undefined as string | undefined,
    financierId: undefined as string | undefined,
    subFinancier: undefined as string | undefined,
    detailStartDate: undefined as string | undefined,
    detailEndDate: undefined as string | undefined,
    page: 1,
    pageSize: 10,
  });

  // 图表引用
  const trendChartRef = useRef<HTMLDivElement>(null);
  const compositionChartRef = useRef<HTMLDivElement>(null);
  const trendChartInstance = useRef<echarts.ECharts | null>(null);
  const compositionChartInstance = useRef<echarts.ECharts | null>(null);

  // 计算日期范围
  const dateRange = useMemo(() => {
    const today = dayjs();
    switch (timeRange) {
      case 'today':
        return { startDate: today.format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
      case 'week':
        return { startDate: today.startOf('week').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
      case 'month':
        return { startDate: today.startOf('month').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
      case 'year':
        return { startDate: today.subtract(1, 'year').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
      case 'custom':
        if (customRange) {
          return { startDate: customRange[0].format('YYYY-MM-DD'), endDate: customRange[1].format('YYYY-MM-DD') };
        }
        return { startDate: today.startOf('month').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
      default:
        return { startDate: today.startOf('month').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
    }
  }, [timeRange, customRange]);

  // 加载统计数据
  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [statsRes, trendRes, compositionRes, funderRes, financierRes] = await Promise.all([
        fetchPlatformRevenueStats(token, dateRange),
        fetchPlatformRevenueTrend(token, { ...dateRange, groupBy }),
        fetchPlatformRevenueComposition(token, dateRange),
        fetchPlatformRevenueFunderRanking(token, { ...dateRange, limit: 5 }),
        fetchPlatformRevenueFinancierRanking(token, { ...dateRange, limit: 5 }),
      ]);
      
      setStats(statsRes);
      setTrend(trendRes.trend || []);
      setComposition(compositionRes.composition || []);
      setFunderRanking(funderRes.ranking || []);
      setFinancierRanking(financierRes.ranking || []);
    } catch (error) {
      message.error('加载收益数据失败: ' + getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  // 加载明细列表
  const loadRecords = async () => {
    if (!token) return;
    setTableLoading(true);
    try {
      const listFilters: any = {
        startDate: filters.detailStartDate || dateRange.startDate,
        endDate: filters.detailEndDate || dateRange.endDate,
        sourceType: filters.sourceType,
        funderId: filters.funderId,
        financierId: filters.financierId,
        subFinancier: filters.subFinancier,
        page: filters.page,
        pageSize: filters.pageSize,
      };
      const res = await fetchPlatformRevenueList(token, listFilters);
      setRecords(res.records || []);
      setTotal(res.total || 0);
    } catch (error) {
      message.error('加载收益明细失败: ' + getErrorMessage(error));
    } finally {
      setTableLoading(false);
    }
  };

  // 数据加载
  useEffect(() => {
    loadData();
  }, [dateRange, groupBy, token]);

  useEffect(() => {
    loadRecords();
  }, [dateRange, filters, token]);

  // 初始化趋势图 - 只显示总收益
  useEffect(() => {
    if (!trendChartRef.current) return;
    
    // 获取或创建实例
    let chart = echarts.getInstanceByDom(trendChartRef.current);
    if (!chart) {
      chart = echarts.init(trendChartRef.current);
    }
    trendChartInstance.current = chart;
    
    // 数据为空时清除图表
    if (trend.length === 0) {
      chart.clear();
      return;
    }
    
    // 延迟执行以确保容器已可见（从 display:none 变为 display:block）
    const timer = setTimeout(() => {
      if (!trendChartInstance.current) return;
      
      // 确保尺寸正确
      trendChartInstance.current.resize();
    
      // 使用 notMerge: true 强制完全刷新图表
      trendChartInstance.current.setOption({
        tooltip: { 
          trigger: 'axis',
          formatter: (params: any) => {
            const date = params[0]?.axisValue || '';
            let result = `${date}<br/>`;
            params.forEach((p: any) => {
              result += `${p.marker} ${p.seriesName}: ¥${p.value?.toLocaleString() || 0}<br/>`;
            });
            return result;
          }
        },
        legend: { data: ['收益金额'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: { type: 'category', data: trend.map(t => t.date), boundaryGap: false },
        yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `¥${(v / 1000).toFixed(0)}k` } },
        series: [
          { 
            name: '收益金额', 
            type: 'line', 
            data: trend.map(t => t.amount), 
            smooth: true, 
            areaStyle: { opacity: 0.3 },
            itemStyle: { color: '#1890ff' },
          },
        ],
      }, { notMerge: true });
    }, 50);

    const handleResize = () => trendChartInstance.current?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [trend]);

  // 初始化饼图
  useEffect(() => {
    if (!compositionChartRef.current) return;
    
    // 获取或创建实例
    let chart = echarts.getInstanceByDom(compositionChartRef.current);
    if (!chart) {
      chart = echarts.init(compositionChartRef.current);
    }
    compositionChartInstance.current = chart;
    
    // 数据为空时清除图表
    if (composition.length === 0) {
      chart.clear();
      return;
    }
  
    // 延迟执行以确保容器已可见
    const timer = setTimeout(() => {
      if (!compositionChartInstance.current) return;
      
      compositionChartInstance.current.resize();
      
      // 使用 notMerge: true 强制完全刷新图表
      compositionChartInstance.current.setOption({
        tooltip: { 
          trigger: 'item', 
          formatter: (params: any) => `${params.name}: ¥${params.value?.toLocaleString() || 0} (${params.percent}%)`
        },
        legend: { bottom: 0, type: 'scroll' },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 14, fontWeight: 'bold' }
          },
          data: composition.map(c => ({ 
            name: c.sourceName || SOURCE_TYPE_MAP[c.sourceType] || c.sourceType, 
            value: c.amount 
          })),
        }],
        color: ['#1890ff', '#52c41a', '#faad14', '#f5222d'],
      }, { notMerge: true });
    }, 50);

    const handleResize = () => compositionChartInstance.current?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [composition]);

  // 销毁图表
  useEffect(() => {
    return () => {
      trendChartInstance.current?.dispose();
      compositionChartInstance.current?.dispose();
    };
  }, []);

  // 导出状态
  const [exporting, setExporting] = useState(false);

  const exportColumns = [
    { header: '序号', key: (_: any, i: number) => i + 1 },
    { header: '落地合作方', key: (r: any) => r.localPartnerName || r.subFinancier || '' },
    { header: '日期', key: (r: any) => r.revenueDate || '' },
    { header: '关联单号', key: (r: any) => r.contractNumber || '' },
    { header: '运费金额', key: (r: any) => r.principalAmount ?? '' },
    { header: '服务费', key: (r: any) => r.amount ?? '' },
    { header: '合作方', key: (r: any) => r.financierName || '' },
    { header: '收益类型', key: (r: any) => SOURCE_TYPE_MAP[r.sourceType] || r.sourceType || '' },
    { header: '服务费率', key: (r: any) => {
      if (r.sourceType !== 'waybill_commission') return '';
      if (r.rate && r.rate > 0) { const p = r.rate * 100; return Number.isInteger(p) ? `${p}%` : `${p.toFixed(1)}%`; }
      return '固定200元';
    }},
    { header: '车牌号', key: (r: any) => r.vehiclePlate || '' },
    { header: '司机', key: (r: any) => r.driverName || '' },
    { header: '资金方', key: (r: any) => r.funderName || '' },
    { header: '备注', key: (r: any) => r.remark || '' },
  ];

  const doExportExcel = (data: RevenueRecord[], filename: string) => {
    const headers = exportColumns.map(c => c.header);
    const rows = data.map((r, i) => exportColumns.map(c => c.key(r, i)));
    const totalFreight = data.reduce((s, r) => s + (Number((r as any).principalAmount) || 0), 0);
    const totalFee = data.reduce((s, r) => s + (Number((r as any).amount) || 0), 0);
    const freightIdx = headers.indexOf('运费金额');
    const feeIdx = headers.indexOf('服务费');
    const totalRow = headers.map((_, i) => {
      if (i === 0) return '合计';
      if (i === freightIdx) return totalFreight;
      if (i === feeIdx) return totalFee;
      return '';
    });
    rows.push(totalRow);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h, i) => {
      let maxLen = h.length;
      rows.forEach(row => { const len = String(row[i] ?? '').length; if (len > maxLen) maxLen = len; });
      return { wch: Math.min(Math.max(maxLen + 2, 8), 30) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '收益明细');
    XLSX.writeFile(wb, filename);
  };

  const handleExport = () => {
    if (!token) return;
    const hasFilter = filters.sourceType || filters.subFinancier || filters.detailStartDate;
    Modal.confirm({
      title: '导出收益明细',
      icon: <FileExcelOutlined style={{ color: '#52c41a' }} />,
      content: hasFilter
        ? `当前筛选条件下共 ${total} 条记录，您希望导出哪些数据？`
        : `当前共 ${total} 条记录，确认导出？`,
      okText: hasFilter ? '导出筛选结果' : '确认导出',
      cancelText: hasFilter ? '全量导出' : '取消',
      cancelButtonProps: hasFilter ? { type: 'default' } : undefined,
      onOk: async () => {
        setExporting(true);
        try {
          const listFilters: any = {
            startDate: filters.detailStartDate || dateRange.startDate,
            endDate: filters.detailEndDate || dateRange.endDate,
            sourceType: filters.sourceType,
            subFinancier: filters.subFinancier,
            page: 1,
            pageSize: 9999,
          };
          const res = await fetchPlatformRevenueList(token, listFilters);
          doExportExcel(res.records || [], `收益明细_筛选_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
          message.success(`已导出 ${(res.records || []).length} 条记录`);
        } catch (e) {
          message.error('导出失败: ' + getErrorMessage(e));
        } finally {
          setExporting(false);
        }
      },
      onCancel: hasFilter ? async () => {
        setExporting(true);
        try {
          const res = await fetchPlatformRevenueList(token, {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            page: 1,
            pageSize: 9999,
          });
          doExportExcel(res.records || [], `收益明细_全量_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
          message.success(`已导出 ${(res.records || []).length} 条记录`);
        } catch (e) {
          message.error('导出失败: ' + getErrorMessage(e));
        } finally {
          setExporting(false);
        }
      } : undefined,
    });
  };

  // 列宽拖动状态
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const handleResize = useCallback((key: string) => (_: any, { size }: any) => {
    setColumnWidths(prev => ({ ...prev, [key]: size.width }));
  }, []);

  // 从合同落地合作方加载选项
  const [lpOptions, setLpOptions] = useState<{ label: string; value: string }[]>([]);
  useEffect(() => {
    if (!token) return;
    fetchLocalPartners(token, { status: 'active' }).then(res => {
      const opts = (res.localPartners || []).map((lp: any) => ({ label: lp.name, value: lp.name }));
      setLpOptions(opts);
    }).catch(() => {});
  }, [token]);

  const subFinancierOptions = lpOptions;

  // 表格列定义
  const baseColumns = [
    { title: '合作方', dataIndex: 'financierName', key: 'financierName', width: 80, render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '-'}</span> },
    {
      title: '落地合作方',
      key: 'localPartner',
      width: 150,
      render: (_: any, r: any) => {
        const name = r.localPartnerName || r.subFinancier;
        return name ? <Tag color="cyan" style={{ margin: 0 }}>{name}</Tag> : '-';
      },
    },
    { title: '日期', dataIndex: 'revenueDate', key: 'revenueDate', width: 110, render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span> },
    { 
      title: '收益类型', 
      dataIndex: 'sourceType', 
      key: 'sourceType',
      width: 100,
      render: (type: string) => <span style={{ whiteSpace: 'nowrap' }}>{SOURCE_TYPE_MAP[type] || type}</span>,
    },
    { 
      title: '关联单号',
      key: 'refNumber',
      width: 200,
      render: (_: any, record: any) => <span style={{ whiteSpace: 'nowrap' }}>{record.contractNumber || '-'}</span>,
    },
    {
      title: '车牌号',
      dataIndex: 'vehiclePlate',
      key: 'vehiclePlate',
      width: 100,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '-'}</span>,
    },
    {
      title: '司机',
      dataIndex: 'driverName',
      key: 'driverName',
      width: 80,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '-'}</span>,
    },
    {
      title: '运费金额',
      dataIndex: 'principalAmount',
      key: 'principalAmount',
      width: 120,
      align: 'right' as const,
      render: (v: number, record: any) => {
        if (record.sourceType !== 'waybill_commission' || !v) return '-';
        return <span style={{ whiteSpace: 'nowrap' }}>¥{v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>;
      },
    },
    {
      title: '服务费率',
      key: 'rule',
      width: 90,
      render: (_: any, record: any) => {
        if (record.sourceType !== 'waybill_commission') return '-';
        if (record.rate && record.rate > 0) {
          const percent = record.rate * 100;
          return <span style={{ whiteSpace: 'nowrap' }}>{Number.isInteger(percent) ? `${percent.toFixed(0)}%` : `${percent.toFixed(1)}%`}</span>;
        }
        return <span style={{ whiteSpace: 'nowrap' }}>固定200元</span>;
      },
    },
    { 
      title: '服务费', 
      dataIndex: 'amount', 
      key: 'amount',
      width: 110,
      align: 'right' as const,
      render: (amount: number) => (
        <span style={{ color: '#52c41a', fontWeight: 500, whiteSpace: 'nowrap' }}>
          ¥{amount?.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) || '0.00'}
        </span>
      ),
    },
    { title: '资金方', dataIndex: 'funderName', key: 'funderName', width: 100, render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '-'}</span> },
    {
      title: '结算状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const map: Record<string, { text: string; color: string }> = {
          pending: { text: '待对账', color: 'default' },
          confirmed: { text: '待对账', color: 'default' },
          reconciling: { text: '对账中', color: 'warning' },
          reconciled: { text: '已对账', color: 'cyan' },
          settled: { text: '已结算', color: 'success' },
          accounted: { text: '已入账', color: 'green' },
        };
        const cfg = map[status] || { text: status || '-', color: 'default' };
        return <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.text}</Tag>;
      },
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true },
  ];

  const columns = baseColumns.map(col => ({
    ...col,
    align: (col as any).align || ('center' as const),
    width: columnWidths[col.key] || col.width,
    onHeaderCell: (column: any) => ({
      width: column.width,
      onResize: handleResize(col.key),
    }),
  }));

  return (
    <Spin spinning={loading}>
      <div style={{ padding: 24 }}>
        {/* 标题和时间选择器 */}
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <h2 style={{ margin: 0 }}>平台收益看板</h2>
          </Col>
          <Col>
            <Space>
              <Button type={timeRange === 'today' ? 'primary' : 'default'} onClick={() => setTimeRange('today')}>今日</Button>
              <Button type={timeRange === 'week' ? 'primary' : 'default'} onClick={() => setTimeRange('week')}>本周</Button>
              <Button type={timeRange === 'month' ? 'primary' : 'default'} onClick={() => setTimeRange('month')}>本月</Button>
              <Button type={timeRange === 'year' ? 'primary' : 'default'} onClick={() => setTimeRange('year')}>近一年</Button>
              <RangePicker
                value={customRange}
                onChange={(dates) => {
                  setCustomRange(dates as [Dayjs, Dayjs]);
                  if (dates) setTimeRange('custom');
                }}
              />
            </Space>
          </Col>
        </Row>

        {/* 第一排：收益核心指标 - 5个卡片 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {[
            { title: '累计总收益', value: stats?.totalRevenue || 0, accent: '#1890ff' },
            { title: '本期收益', value: stats?.periodRevenue || 0, accent: '#52c41a', showGrowth: true },
            { title: '日均收益', value: stats?.dailyAverage || (stats?.periodRevenue ? stats.periodRevenue / 30 : 0), accent: '#faad14' },
            { title: '预估收益(30天)', value: stats?.estimatedRevenue || 0, accent: '#722ed1' },
            { title: '已结算收益', value: stats?.settledRevenue || 0, accent: '#13c2c2' },
            { title: '待结算收益', value: stats?.unsettledRevenue || 0, accent: '#eb2f96' },
          ].map((item, index) => (
            <Col key={index} flex="1 1 0" style={{ minWidth: 180 }}>
              <Card 
                size="small" 
                style={{ 
                  height: '100%',
                  borderTop: `3px solid ${item.accent}`,
                  borderRadius: '2px 2px 6px 6px',
                }}
                styles={{ body: { padding: '20px' } }}
              >
                <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 12 }}>{item.title}</div>
                <div style={{ fontSize: 28, fontWeight: 600, color: '#1f1f1f', lineHeight: 1.2, letterSpacing: '-0.5px' }}>
                  <span style={{ fontSize: 18, fontWeight: 400, marginRight: 2 }}>¥</span>
                  {(item.value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                {item.showGrowth && stats?.growthRate !== undefined && (
                  <div style={{ 
                    marginTop: 10, 
                    fontSize: 12, 
                    color: stats.growthRate >= 0 ? '#52c41a' : '#ff4d4f',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    {stats.growthRate >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    环比 {Math.abs(stats.growthRate || 0).toFixed(1)}%
                  </div>
                )}
              </Card>
            </Col>
          ))}
        </Row>

        {/* 第二排：业务增长指标 - 3个卡片，低调简洁风格 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Card size="small" style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FileTextOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                  <div>
                    <div style={{ fontSize: 12, color: '#999' }}>有效合同</div>
                    <div style={{ fontSize: 20, fontWeight: 500 }}>{stats?.activeContracts || 0} <span style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>份</span></div>
                  </div>
                </div>
                {(stats?.newContractsPeriod || 0) > 0 && (
                  <Tag color="green" style={{ margin: 0 }}>+{stats?.newContractsPeriod} 本期</Tag>
                )}
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <TeamOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                  <div>
                    <div style={{ fontSize: 12, color: '#999' }}>合作伙伴</div>
                    <div style={{ fontSize: 20, fontWeight: 500 }}>
                      <span style={{ color: '#1890ff' }}>{stats?.activeFunders || 0}</span>
                      <span style={{ fontSize: 12, color: '#999', margin: '0 4px' }}>资金方</span>
                      <span style={{ color: '#722ed1' }}>{stats?.activeFinanciers || 0}</span>
                      <span style={{ fontSize: 12, color: '#999', marginLeft: 4 }}>合作方</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <RiseOutlined style={{ fontSize: 20, color: '#faad14' }} />
                  <div>
                    <div style={{ fontSize: 12, color: '#999' }}>运营数据</div>
                    <div style={{ fontSize: 20, fontWeight: 500 }}>
                      {stats?.periodWaybills || 0} <span style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>运单</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* 图表区域 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={14}>
            <Card 
              title="收益趋势" 
              extra={
                <Select value={groupBy} onChange={setGroupBy} style={{ width: 100 }}>
                  <Select.Option value="day">按日</Select.Option>
                  <Select.Option value="week">按周</Select.Option>
                  <Select.Option value="month">按月</Select.Option>
                  <Select.Option value="year">按年</Select.Option>
                </Select>
              }
            >
              <div style={{ height: 300, position: 'relative' }}>
                <div ref={trendChartRef} style={{ height: '100%', display: trend.length > 0 ? 'block' : 'none' }} />
                {trend.length === 0 && <Empty description="暂无趋势数据" style={{ paddingTop: 100 }} />}
              </div>
            </Card>
          </Col>
          <Col span={10}>
            <Card title="收益构成">
              <div style={{ height: 300, position: 'relative' }}>
                <div ref={compositionChartRef} style={{ height: '100%', display: composition.length > 0 ? 'block' : 'none' }} />
                {composition.length === 0 && <Empty description="暂无构成数据" style={{ paddingTop: 100 }} />}
              </div>
            </Card>
          </Col>
        </Row>

        {/* 排行榜 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={12}>
            <Card title="TOP5 资金方收益">
              {funderRanking.length === 0 ? (
                <Empty description="暂无数据" />
              ) : (
                funderRanking.map((item, index) => (
                  <div key={item.id} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    padding: '8px 0', 
                    borderBottom: index < funderRanking.length - 1 ? '1px solid #f0f0f0' : 'none'
                  }}>
                    <span>
                      <span style={{ 
                        display: 'inline-block', 
                        width: 20, 
                        height: 20, 
                        lineHeight: '20px',
                        textAlign: 'center',
                        borderRadius: '50%',
                        backgroundColor: index < 3 ? ['#f5222d', '#fa8c16', '#fadb14'][index] : '#d9d9d9',
                        color: index < 2 ? '#fff' : '#666',
                        marginRight: 8,
                        fontSize: 12,
                      }}>
                        {index + 1}
                      </span>
                      {item.name}
                    </span>
                    <span style={{ color: '#1890ff' }}>¥{item.amount?.toLocaleString() || 0}</span>
                  </div>
                ))
              )}
            </Card>
          </Col>
          <Col span={12}>
            <Card title="TOP5 合作方贡献">
              {financierRanking.length === 0 ? (
                <Empty description="暂无数据" />
              ) : (
                financierRanking.map((item, index) => (
                  <div key={item.id} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    padding: '8px 0', 
                    borderBottom: index < financierRanking.length - 1 ? '1px solid #f0f0f0' : 'none'
                  }}>
                    <span>
                      <span style={{ 
                        display: 'inline-block', 
                        width: 20, 
                        height: 20, 
                        lineHeight: '20px',
                        textAlign: 'center',
                        borderRadius: '50%',
                        backgroundColor: index < 3 ? ['#f5222d', '#fa8c16', '#fadb14'][index] : '#d9d9d9',
                        color: index < 2 ? '#fff' : '#666',
                        marginRight: 8,
                        fontSize: 12,
                      }}>
                        {index + 1}
                      </span>
                      {item.name}
                    </span>
                    <span style={{ color: '#52c41a' }}>¥{item.amount?.toLocaleString() || 0}</span>
                  </div>
                ))
              )}
            </Card>
          </Col>
        </Row>

        {/* 明细表格 */}
        <Card 
          title="收益明细" 
          extra={
            <Button icon={<FileExcelOutlined />} onClick={handleExport} loading={exporting}>
              导出Excel
            </Button>
          }
        >
          {/* 筛选器 */}
          <Space style={{ marginBottom: 16 }} wrap>
            <Select
              placeholder="收益类型"
              allowClear
              style={{ width: 150 }}
              value={filters.sourceType}
              onChange={(v) => setFilters({ ...filters, sourceType: v, page: 1 })}
            >
              {Object.entries(SOURCE_TYPE_MAP).map(([key, label]) => (
                <Select.Option key={key} value={key}>{label}</Select.Option>
              ))}
            </Select>
            <Select
              placeholder="落地合作方"
              allowClear
              showSearch
              style={{ width: 200 }}
              value={(filters as any).subFinancier}
              onChange={(v) => setFilters({ ...filters, subFinancier: v, page: 1 } as any)}
              options={subFinancierOptions}
            />
            <RangePicker
              placeholder={['开始日期', '结束日期']}
              value={(filters as any).detailStartDate && (filters as any).detailEndDate
                ? [dayjs((filters as any).detailStartDate), dayjs((filters as any).detailEndDate)]
                : null}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setFilters({ ...filters, detailStartDate: dates[0].format('YYYY-MM-DD'), detailEndDate: dates[1].format('YYYY-MM-DD'), page: 1 } as any);
                } else {
                  const { detailStartDate, detailEndDate, ...rest } = filters as any;
                  setFilters({ ...rest, page: 1 });
                }
              }}
            />
          </Space>

          <Table
            columns={columns}
            dataSource={records}
            rowKey="id"
            loading={tableLoading}
            scroll={{ x: 1200 }}
            components={{ header: { cell: ResizableTitle } }}
            bordered
            size="middle"
            pagination={{
              current: filters.page,
              pageSize: filters.pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (page, pageSize) => setFilters({ ...filters, page, pageSize }),
            }}
          />
        </Card>
      </div>
    </Spin>
  );
};

export default PlatformRevenue;
