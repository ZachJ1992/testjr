import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, Row, Col, Table, Select, DatePicker, Button, Space, Tag, Tooltip, message, Empty, Spin, Typography, Modal } from 'antd';
import { FileTextOutlined, ArrowUpOutlined, ArrowDownOutlined, FileExcelOutlined, DollarOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
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
  fetchPlatformOperationTrend,
  fetchPlatformRevenueComposition,
  fetchPlatformRevenueFunderRanking,
  fetchPlatformRevenueFinancierRanking,
  fetchWaybillOverview,
  fetchCommissionContractStats,
  RevenueStats,
  RevenueRecord,
  RevenueTrendPoint,
  OperationTrendPoint,
  RevenueComposition,
  RevenueRankItem,
  RevenueSourceType,
  getErrorMessage,
  fetchLocalPartners,
  fetchAreas,
} from '../api';

const { RangePicker } = DatePicker;

// 时间范围快捷选项
type TimeRange = 'today' | 'week' | 'month' | 'year' | 'custom';
type DashboardView = 'revenue' | 'operation';
type OperationMetricKey = 'waybillCount' | 'totalWeight' | 'activeRoutes';

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
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [dashboardView, setDashboardView] = useState<DashboardView>('revenue');
  
  const [globalStats, setGlobalStats] = useState<RevenueStats | null>(null);
  const [periodStats, setPeriodStats] = useState<RevenueStats | null>(null);
  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [operationTrend, setOperationTrend] = useState<OperationTrendPoint[]>([]);
  const [composition, setComposition] = useState<RevenueComposition[]>([]);
  const [funderRanking, setFunderRanking] = useState<RevenueRankItem[]>([]);
  const [financierRanking, setFinancierRanking] = useState<RevenueRankItem[]>([]);
  const [records, setRecords] = useState<RevenueRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [globalBrokerageTotal, setGlobalBrokerageTotal] = useState(0);
  const [contractLocalPartnerCount, setContractLocalPartnerCount] = useState(0);
  const [contractRouteCount, setContractRouteCount] = useState(0);
  const [globalWaybillCount, setGlobalWaybillCount] = useState(0);
  
  // 筛选条件
  const [filters, setFilters] = useState({
    sourceType: undefined as RevenueSourceType | undefined,
    funderId: undefined as string | undefined,
    financierId: undefined as string | undefined,
    subFinancier: undefined as string | undefined,
    areaId: undefined as string | undefined,
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
  const operationChartRefs = useRef<Record<OperationMetricKey, HTMLDivElement | null>>({
    waybillCount: null,
    totalWeight: null,
    activeRoutes: null,
  });
  const operationChartInstances = useRef<Record<OperationMetricKey, echarts.ECharts | null>>({
    waybillCount: null,
    totalWeight: null,
    activeRoutes: null,
  });

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

  const roundedGlobalBrokerageTotal = Math.round(globalBrokerageTotal || 0);
  const operationMetricCards = useMemo(
    () => [
      {
        key: 'waybillCount' as const,
        title: '运单数量',
        chartTitle: '运单数量趋势',
        value: periodStats?.periodWaybills || 0,
        accent: '#1890ff',
        suffix: '单',
        precision: 0,
      },
      {
        key: 'totalWeight' as const,
        title: '总吨位',
        chartTitle: '总吨位趋势',
        value: periodStats?.periodTotalWeight || 0,
        accent: '#52c41a',
        suffix: '吨',
        precision: 2,
      },
      {
        key: 'activeRoutes' as const,
        title: '活跃线路数量',
        chartTitle: '活跃线路数量趋势',
        value: periodStats?.periodActiveRoutes || 0,
        accent: '#722ed1',
        suffix: '条',
        precision: 0,
      },
    ],
    [periodStats]
  );

  const getOperationMetricValue = useCallback((point: OperationTrendPoint, key: OperationMetricKey): number => {
    if (key === 'waybillCount') return Number(point.waybillCount || 0);
    if (key === 'totalWeight') return Number(point.totalWeight || 0);
    return Number(point.activeRoutes || 0);
  }, []);

  // 加载统计数据
  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [globalStatsRes, periodStatsRes, waybillOverviewRes, commissionStatsRes, trendRes, operationTrendRes, compositionRes, funderRes, financierRes] = await Promise.all([
        fetchPlatformRevenueStats(token),
        fetchPlatformRevenueStats(token, dateRange),
        fetchWaybillOverview(token),
        fetchCommissionContractStats(token).catch(() => ({
          totalCount: 0,
          activeCount: 0,
          totalConfigCount: 0,
          avgRatio: 0,
          localPartnerCount: 0,
          routeCount: 0,
        })),
        fetchPlatformRevenueTrend(token, { ...dateRange, groupBy }),
        fetchPlatformOperationTrend(token, { ...dateRange, groupBy }),
        fetchPlatformRevenueComposition(token, dateRange),
        fetchPlatformRevenueFunderRanking(token, { ...dateRange, limit: 5 }),
        fetchPlatformRevenueFinancierRanking(token, { ...dateRange, limit: 5 }),
      ]);
      
      setGlobalStats(globalStatsRes);
      setPeriodStats(periodStatsRes);
      setGlobalBrokerageTotal(waybillOverviewRes.totalReceivable || 0);
      setGlobalWaybillCount(waybillOverviewRes.waybillCount || 0);
      setContractLocalPartnerCount(commissionStatsRes.localPartnerCount || 0);
      setContractRouteCount(commissionStatsRes.routeCount || 0);
      setTrend(trendRes.trend || []);
      setOperationTrend(operationTrendRes.trend || []);
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
        areaId: (filters as any).areaId,
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
    if (dashboardView !== 'revenue') return;
    loadRecords();
  }, [dateRange, filters, token, dashboardView]);

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

  // 初始化运营维度趋势图（纵向三张）
  useEffect(() => {
    if (dashboardView !== 'operation') return;

    const timers: number[] = [];

    operationMetricCards.forEach((metric) => {
      const chartDom = operationChartRefs.current[metric.key];
      if (!chartDom) return;

      let chart = echarts.getInstanceByDom(chartDom);
      if (!chart) {
        chart = echarts.init(chartDom);
      }
      operationChartInstances.current[metric.key] = chart;

      if (operationTrend.length === 0) {
        chart.clear();
        return;
      }

      const timer = window.setTimeout(() => {
        const instance = operationChartInstances.current[metric.key];
        if (!instance) return;

        instance.resize();
        instance.setOption({
          tooltip: {
            trigger: 'axis',
            formatter: (params: any) => {
              const date = params[0]?.axisValue || '';
              const rawValue = Number(params[0]?.value || 0);
              const formattedValue = metric.precision === 0
                ? Math.round(rawValue).toLocaleString('zh-CN')
                : rawValue.toLocaleString('zh-CN', {
                  minimumFractionDigits: metric.precision,
                  maximumFractionDigits: metric.precision,
                });
              return `${date}<br/>${params[0]?.marker || ''} ${metric.title}: ${formattedValue}${metric.suffix}`;
            },
          },
          legend: { data: [metric.title], bottom: 0 },
          grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
          xAxis: { type: 'category', data: operationTrend.map((item) => item.date), boundaryGap: false },
          yAxis: {
            type: 'value',
            axisLabel: {
              formatter: (value: number) => {
                if (metric.precision === 0) return Math.round(value).toLocaleString('zh-CN');
                return value.toLocaleString('zh-CN', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: metric.precision,
                });
              },
            },
          },
          series: [
            {
              name: metric.title,
              type: 'line',
              data: operationTrend.map((item) => getOperationMetricValue(item, metric.key)),
              smooth: true,
              areaStyle: { opacity: 0.3 },
              lineStyle: { color: metric.accent, width: 2 },
              itemStyle: { color: metric.accent },
            },
          ],
        }, { notMerge: true });
      }, 50);

      timers.push(timer);
    });

    const handleResize = () => {
      (Object.values(operationChartInstances.current) as Array<echarts.ECharts | null>).forEach((instance) => {
        instance?.resize();
      });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('resize', handleResize);
    };
  }, [dashboardView, operationMetricCards, operationTrend, getOperationMetricValue]);

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
      (Object.values(operationChartInstances.current) as Array<echarts.ECharts | null>).forEach((instance) => {
        instance?.dispose();
      });
    };
  }, []);

  // 导出状态
  const [exporting, setExporting] = useState(false);

  const exportColumns = [
    { header: '序号', key: (_: any, i: number) => i + 1 },
    { header: '区域', key: (r: any) => r.areaName || '无区域' },
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
    const hasFilter = filters.sourceType || filters.subFinancier || (filters as any).areaId || filters.detailStartDate;
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
            areaId: (filters as any).areaId,
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
  const [areaOptions, setAreaOptions] = useState<{ label: string; value: string }[]>([]);
  useEffect(() => {
    if (!token) return;
    fetchLocalPartners(token, { status: 'active' }).then(res => {
      const opts = (res.localPartners || []).map((lp: any) => ({ label: lp.name, value: lp.name }));
      setLpOptions(opts);
    }).catch(() => {});
    fetchAreas(token, { status: 'active' }).then(res => {
      const opts = (res.areas || []).map((a: any) => ({ label: a.name, value: a.id }));
      setAreaOptions(opts);
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
    {
      title: '区域',
      key: 'areaName',
      width: 110,
      render: (_: any, r: any) => <Tag style={{ margin: 0 }}>{r.areaName || '无区域'}</Tag>,
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
        {/* 标题 */}
        <Row align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <h2 style={{ margin: 0 }}>平台收益看板</h2>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {[
            { title: '累计总收益', value: globalStats?.totalRevenue || 0, accent: '#1890ff', icon: <DollarOutlined style={{ color: '#1890ff' }} /> },
            { title: '已结算收益', value: globalStats?.settledRevenue || 0, accent: '#13c2c2', icon: <CheckCircleOutlined style={{ color: '#13c2c2' }} /> },
            { title: '待结算收益', value: globalStats?.unsettledRevenue || 0, accent: '#eb2f96', icon: <ClockCircleOutlined style={{ color: '#eb2f96' }} /> },
          ].map((item, index) => (
            <Col key={index} flex="1 1 0" style={{ minWidth: 185 }}>
              <Card
                size="small"
                style={{
                  height: '100%',
                  borderTop: `3px solid ${item.accent}`,
                  borderRadius: '2px 2px 6px 6px',
                }}
                styles={{ body: { padding: '16px 16px 14px' } }}
              >
                <Space size={8} style={{ marginBottom: 8 }}>
                  {item.icon}
                  <Text type="secondary">{item.title}</Text>
                </Space>
                <div style={{ fontSize: 26, fontWeight: 600, color: '#1f1f1f', lineHeight: 1.15 }}>
                  {item.suffix ? (
                    <>
                      {(item.value || 0).toLocaleString('zh-CN')}
                      <span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c', marginLeft: 4 }}>{item.suffix}</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 17, fontWeight: 400, marginRight: 2 }}>¥</span>
                      {(item.value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </>
                  )}
                </div>
              </Card>
            </Col>
          ))}
          <Col flex="1 1 0" style={{ minWidth: 185 }}>
            <Card
              size="small"
              style={{
                height: '100%',
                borderTop: '3px solid #faad14',
                borderRadius: '2px 2px 6px 6px',
              }}
              styles={{ body: { padding: '16px 16px 14px' } }}
            >
              <Space size={8} style={{ marginBottom: 8 }}>
                <FileTextOutlined style={{ color: '#faad14' }} />
                <Text type="secondary">平台撮合业务合计</Text>
              </Space>
              <Tooltip title={`¥${roundedGlobalBrokerageTotal.toLocaleString('zh-CN')}`}>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    color: '#1f1f1f',
                    lineHeight: 1.15,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 2,
                    overflow: 'hidden',
                  }}
                >
                  <span style={{ fontSize: 17, fontWeight: 400, flex: '0 0 auto' }}>¥</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {roundedGlobalBrokerageTotal.toLocaleString('zh-CN')}
                  </span>
                </div>
              </Tooltip>
            </Card>
          </Col>
          <Col flex="1 1 0" style={{ minWidth: 185 }}>
            <Card
              size="small"
              style={{
                height: '100%',
                borderTop: '3px solid #52c41a',
                borderRadius: '2px 2px 6px 6px',
              }}
              styles={{ body: { padding: '16px 16px 14px' } }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>
                  有效合同 <span style={{ color: '#1f1f1f', fontWeight: 500 }}>{(globalStats?.activeContracts || 0).toLocaleString('zh-CN')}</span> 份
                </div>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>
                  资金方 <span style={{ color: '#1f1f1f', fontWeight: 500 }}>{(globalStats?.activeFunders || 0).toLocaleString('zh-CN')}</span> 家
                </div>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>
                  合作方 <span style={{ color: '#1f1f1f', fontWeight: 500 }}>{(globalStats?.activeFinanciers || 0).toLocaleString('zh-CN')}</span> 家
                </div>
              </div>
            </Card>
          </Col>
          <Col flex="1 1 0" style={{ minWidth: 185 }}>
            <Card
              size="small"
              style={{
                height: '100%',
                borderTop: '3px solid #d9d9d9',
                borderRadius: '2px 2px 6px 6px',
              }}
              styles={{ body: { padding: '16px 16px 14px', minHeight: 96 } }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>
                  落地合作方数量 <span style={{ color: '#1f1f1f', fontWeight: 500 }}>{contractLocalPartnerCount.toLocaleString('zh-CN')}</span> 家
                </div>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>
                  线路数量 <span style={{ color: '#1f1f1f', fontWeight: 500 }}>{contractRouteCount.toLocaleString('zh-CN')}</span> 条
                </div>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>
                  运单数量 <span style={{ color: '#1f1f1f', fontWeight: 500 }}>{globalWaybillCount.toLocaleString('zh-CN')}</span> 单
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        <Card size="small" style={{ marginBottom: 16, border: '1px solid #f0f0f0' }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Space size={12} wrap>
                <Button.Group>
                  <Button type={dashboardView === 'revenue' ? 'primary' : 'default'} onClick={() => setDashboardView('revenue')}>
                    收益视图
                  </Button>
                  <Button type={dashboardView === 'operation' ? 'primary' : 'default'} onClick={() => setDashboardView('operation')}>
                    运营维度
                  </Button>
                </Button.Group>
                <Text strong>区间分析（{dateRange.startDate} ~ {dateRange.endDate}）</Text>
              </Space>
            </Col>
            <Col>
              <Space wrap>
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
        </Card>

        {dashboardView === 'revenue' ? (
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {[
              { title: '本期收益', value: periodStats?.periodRevenue || 0, accent: '#52c41a', showGrowth: true },
              { title: '日均收益', value: periodStats?.dailyAverage || 0, accent: '#faad14' },
              { title: '预估收益(30天)', value: periodStats?.estimatedRevenue || 0, accent: '#722ed1' },
              { title: '区间运单数', value: periodStats?.periodWaybills || 0, accent: '#1890ff', suffix: '单' },
            ].map((item, index) => (
              <Col key={index} span={6}>
                <Card
                  size="small"
                  style={{
                    height: '100%',
                    borderTop: `3px solid ${item.accent}`,
                    borderRadius: '2px 2px 6px 6px',
                  }}
                  styles={{ body: { padding: '16px 16px 14px' } }}
                >
                  <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 10 }}>{item.title}</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: '#1f1f1f' }}>
                    {item.suffix ? (
                      <>
                        {(item.value || 0).toLocaleString('zh-CN')}
                        <span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c', marginLeft: 4 }}>{item.suffix}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 16, fontWeight: 400, marginRight: 2 }}>¥</span>
                        {(item.value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </>
                    )}
                  </div>
                  {item.showGrowth && periodStats?.growthRate !== undefined && (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        color: (periodStats.growthRate || 0) >= 0 ? '#52c41a' : '#ff4d4f',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {(periodStats.growthRate || 0) >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                      环比 {Math.abs(periodStats.growthRate || 0).toFixed(1)}%
                    </div>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {operationMetricCards.map((item) => (
              <Col key={item.key} span={8}>
                <Card
                  size="small"
                  style={{
                    height: '100%',
                    borderTop: `3px solid ${item.accent}`,
                    borderRadius: '2px 2px 6px 6px',
                  }}
                  styles={{ body: { padding: '16px 16px 14px' } }}
                >
                  <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 10 }}>{item.title}</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: '#1f1f1f' }}>
                    {(item.value || 0).toLocaleString('zh-CN', { minimumFractionDigits: item.precision, maximumFractionDigits: item.precision })}
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c', marginLeft: 4 }}>{item.suffix}</span>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}

        {dashboardView === 'revenue' ? (
          <>
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
                  placeholder="区域"
                  allowClear
                  style={{ width: 180 }}
                  value={(filters as any).areaId}
                  onChange={(v) => setFilters({ ...filters, areaId: v, page: 1 } as any)}
                  options={areaOptions}
                />
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
          </>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%', marginBottom: 24 }}>
            {operationMetricCards.map((item, index) => (
              <Card
                key={item.key}
                title={item.chartTitle}
                extra={
                  index === 0 ? (
                    <Select value={groupBy} onChange={setGroupBy} style={{ width: 100 }}>
                      <Select.Option value="day">按日</Select.Option>
                      <Select.Option value="week">按周</Select.Option>
                      <Select.Option value="month">按月</Select.Option>
                      <Select.Option value="year">按年</Select.Option>
                    </Select>
                  ) : undefined
                }
              >
                <div style={{ fontSize: 24, fontWeight: 600, color: '#1f1f1f', marginBottom: 12 }}>
                  {(item.value || 0).toLocaleString('zh-CN', {
                    minimumFractionDigits: item.precision,
                    maximumFractionDigits: item.precision,
                  })}
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c', marginLeft: 4 }}>{item.suffix}</span>
                </div>
                <div style={{ height: 280, position: 'relative' }}>
                  <div
                    ref={(node) => {
                      operationChartRefs.current[item.key] = node;
                    }}
                    style={{ height: '100%', display: operationTrend.length > 0 ? 'block' : 'none' }}
                  />
                  {operationTrend.length === 0 && <Empty description="暂无趋势数据" style={{ paddingTop: 90 }} />}
                </div>
              </Card>
            ))}
          </Space>
        )}
      </div>
    </Spin>
  );
};

export default PlatformRevenue;
