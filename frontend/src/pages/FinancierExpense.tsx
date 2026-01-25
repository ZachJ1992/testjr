import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Row, Col, Statistic, Table, Select, DatePicker, Button, Space, Tag, Empty, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import dayjs, { Dayjs } from 'dayjs';
import {
  fetchFinancierExpenseStats,
  fetchFinancierExpenseList,
  fetchFinancierExpenseTrend,
  fetchFinancierExpenseComposition,
  fetchFinancierFunderRanking,
  getFinancierExpenseExportUrl,
  getToken,
  RevenueStats,
  RevenueRecord,
  RevenueTrendPoint,
  RevenueComposition,
  RevenueRankItem,
  RevenueSourceType,
  RevenueStatus,
} from '../api';
import { useAuth } from '../auth';

const { RangePicker } = DatePicker;

type TimeRange = 'today' | 'week' | 'month' | 'year' | 'custom';

// 支出类型映射（融资方视角，包含所有四种类型）
const SOURCE_TYPE_MAP: Record<string, string> = {
  financing_interest: '融资利息',
  directed_pay_interest: '定向支付利息',
  brokerage_commission: '撮合抽成',
  commission_fee: '抽成费用',
};

// 状态映射（融资方视角用"待支付/已支付"）
const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待支付', color: 'orange' },
  confirmed: { text: '已支付', color: 'green' },
  settled: { text: '已结算', color: 'blue' },
};

const FinancierExpense: React.FC = () => {
  const { user } = useAuth();
  
  // 检查是否有权限访问（平台用户或融资方用户）
  const hasAccess = user?.orgContext?.orgType === 'platform' || 
                    user?.orgContext?.orgType === 'financier' ||
                    user?.permissions?.includes('view_financier_expense') ||
                    user?.permissions?.includes('*');
  
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [composition, setComposition] = useState<RevenueComposition[]>([]);
  const [funderRanking, setFunderRanking] = useState<RevenueRankItem[]>([]);
  const [records, setRecords] = useState<RevenueRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  
  const [filters, setFilters] = useState<{
    sourceType: RevenueSourceType | undefined;
    funderId: string | undefined;
    status: RevenueStatus | undefined;
    page: number;
    pageSize: number;
  }>({
    sourceType: undefined,
    funderId: undefined,
    status: undefined,
    page: 1,
    pageSize: 10,
  });

  // ECharts refs
  const trendChartRef = useRef<HTMLDivElement>(null);
  const compositionChartRef = useRef<HTMLDivElement>(null);
  const trendChartInstance = useRef<echarts.ECharts | null>(null);
  const compositionChartInstance = useRef<echarts.ECharts | null>(null);

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
        return { startDate: today.startOf('year').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
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
  useEffect(() => {
    if (hasAccess) {
      loadData();
    }
  }, [dateRange, groupBy, hasAccess]);

  // 加载明细数据
  useEffect(() => {
    if (hasAccess) {
      loadRecords();
    }
  }, [dateRange, filters, hasAccess]);

  // 初始化趋势图
  useEffect(() => {
    if (!hasAccess || !trendChartRef.current) return;
    
    // 初始化图表实例
    if (!trendChartInstance.current) {
      trendChartInstance.current = echarts.init(trendChartRef.current);
    }

    const handleResize = () => trendChartInstance.current?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [hasAccess]);

  // 更新趋势图数据
  useEffect(() => {
    if (!trendChartInstance.current || trend.length === 0) return;
    
    trendChartInstance.current.setOption({
      tooltip: { 
        trigger: 'axis',
        formatter: (params: any) => {
          let result = params[0]?.axisValue || '';
          params.forEach((item: any) => {
            result += `<br/>${item.marker}${item.seriesName}: ¥${item.value?.toLocaleString() || 0}`;
          });
          return result;
        }
      },
      legend: { data: ['总支出', '已支付', '待支付'] },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: trend.map(t => t.date), boundaryGap: false },
      yAxis: { 
        type: 'value', 
        axisLabel: { 
          formatter: (value: number) => `¥${value >= 10000 ? (value / 10000).toFixed(1) + '万' : value}`
        } 
      },
      series: [
        { 
          name: '总支出', 
          type: 'line', 
          data: trend.map(t => t.amount), 
          smooth: true, 
          areaStyle: { color: 'rgba(245, 34, 45, 0.1)' },
          lineStyle: { color: '#f5222d', width: 2 },
          itemStyle: { color: '#f5222d' },
        },
        { 
          name: '已支付', 
          type: 'line', 
          data: trend.map(t => t.confirmedAmount), 
          smooth: true,
          lineStyle: { color: '#52c41a', width: 2 },
          itemStyle: { color: '#52c41a' },
        },
        { 
          name: '待支付', 
          type: 'line', 
          data: trend.map(t => t.pendingAmount), 
          smooth: true,
          lineStyle: { color: '#faad14', width: 2 },
          itemStyle: { color: '#faad14' },
        },
      ],
    });
  }, [trend]);

  // 初始化饼图
  useEffect(() => {
    if (!hasAccess || !compositionChartRef.current) return;

    // 初始化图表实例
    if (!compositionChartInstance.current) {
      compositionChartInstance.current = echarts.init(compositionChartRef.current);
    }

    const handleResize = () => compositionChartInstance.current?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [hasAccess]);

  // 更新饼图数据
  useEffect(() => {
    if (!compositionChartInstance.current || composition.length === 0) return;
    
    compositionChartInstance.current.setOption({
      tooltip: { 
        trigger: 'item', 
        formatter: (params: any) => `${params.name}: ¥${params.value?.toLocaleString() || 0} (${params.percent}%)`
      },
      legend: { 
        bottom: 0, 
        type: 'scroll',
        itemWidth: 10,
        itemHeight: 10
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        label: { show: false },
        emphasis: {
          label: { show: true, fontWeight: 'bold' }
        },
        data: composition.map(c => ({ 
          name: c.sourceName || SOURCE_TYPE_MAP[c.sourceType] || c.sourceType, 
          value: c.amount 
        })),
      }],
      // 红色主题的颜色配置
      color: ['#f5222d', '#fa541c', '#faad14', '#1890ff'],
    });
  }, [composition]);

  // 清理图表实例
  useEffect(() => {
    return () => {
      trendChartInstance.current?.dispose();
      compositionChartInstance.current?.dispose();
    };
  }, []);

  const loadData = async () => {
    const token = getToken();
    if (!token) return;
    
    setLoading(true);
    try {
      const [statsRes, trendRes, compositionRes, funderRes] = await Promise.all([
        fetchFinancierExpenseStats(token, dateRange),
        fetchFinancierExpenseTrend(token, { ...dateRange, groupBy }),
        fetchFinancierExpenseComposition(token, dateRange),
        fetchFinancierFunderRanking(token, { ...dateRange, limit: 5 }),
      ]);
      
      setStats(statsRes);
      setTrend(trendRes.trend || []);
      setComposition(compositionRes.composition || []);
      setFunderRanking(funderRes.ranking || []);
    } catch (error) {
      console.error('加载支出数据失败:', error);
      message.error('加载支出数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async () => {
    const token = getToken();
    if (!token) return;
    
    setTableLoading(true);
    try {
      const res = await fetchFinancierExpenseList(token, { ...dateRange, ...filters });
      setRecords(res.records || []);
      setTotal(res.total || 0);
    } catch (error) {
      console.error('加载支出明细失败:', error);
      message.error('加载支出明细失败');
    } finally {
      setTableLoading(false);
    }
  };

  const handleExport = () => {
    const token = getToken();
    if (!token) {
      message.error('未登录');
      return;
    }
    const url = getFinancierExpenseExportUrl(token, { ...dateRange, ...filters });
    window.open(url, '_blank');
  };

  // 非融资方用户显示无权限
  if (!hasAccess) {
    return (
      <div style={{ padding: 24, textAlign: 'center', marginTop: 100 }}>
        <Empty 
          description="您没有权限访问此页面，此功能仅对融资方用户开放" 
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  const columns = [
    { 
      title: '日期', 
      dataIndex: 'revenueDate', 
      key: 'revenueDate', 
      width: 110,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    { 
      title: '支出类型', 
      dataIndex: 'sourceType', 
      key: 'sourceType',
      width: 120,
      render: (type: string) => SOURCE_TYPE_MAP[type] || type,
    },
    { 
      title: '合同编号', 
      dataIndex: 'contractNumber', 
      key: 'contractNumber',
      width: 150,
      ellipsis: true,
    },
    { 
      title: '资金方', 
      dataIndex: 'funderName', 
      key: 'funderName',
      width: 150,
      render: (name: string) => name || '-',
    },
    { 
      title: '金额', 
      dataIndex: 'amount', 
      key: 'amount',
      width: 130,
      align: 'right' as const,
      render: (amount: number) => (
        <span style={{ color: '#f5222d', fontWeight: 500 }}>
          -¥{(amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => {
        const config = STATUS_MAP[status];
        return config ? <Tag color={config.color}>{config.text}</Tag> : status;
      },
    },
  ];

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      {/* 标题和时间选择器 */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <h2 style={{ margin: 0, color: '#f5222d' }}>💸 我的支出</h2>
        </Col>
        <Col>
          <Space>
            <Button 
              type={timeRange === 'today' ? 'primary' : 'default'} 
              danger={timeRange === 'today'}
              onClick={() => setTimeRange('today')}
            >
              今日
            </Button>
            <Button 
              type={timeRange === 'week' ? 'primary' : 'default'} 
              danger={timeRange === 'week'}
              onClick={() => setTimeRange('week')}
            >
              本周
            </Button>
            <Button 
              type={timeRange === 'month' ? 'primary' : 'default'} 
              danger={timeRange === 'month'}
              onClick={() => setTimeRange('month')}
            >
              本月
            </Button>
            <Button 
              type={timeRange === 'year' ? 'primary' : 'default'} 
              danger={timeRange === 'year'}
              onClick={() => setTimeRange('year')}
            >
              本年
            </Button>
            <RangePicker
              value={customRange}
              onChange={(dates) => {
                setCustomRange(dates as [Dayjs, Dayjs]);
                if (dates) {
                  setTimeRange('custom');
                }
              }}
              placeholder={['开始日期', '结束日期']}
            />
          </Space>
        </Col>
      </Row>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title={<span>💸 累计支出</span>}
              value={stats?.totalRevenue || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#f5222d', fontSize: 28, fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title={<span>✅ 已支付</span>}
              value={stats?.confirmedRevenue || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#52c41a', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title={<span>⏳ 待支付</span>}
              value={stats?.pendingRevenue || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#faad14', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title={<span>📈 预估支出</span>}
              value={stats?.estimatedRevenue || 0}
              precision={2}
              prefix="¥"
              suffix={<span style={{ fontSize: 12, color: '#999' }}>/未来30天</span>}
              valueStyle={{ fontSize: 24 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 趋势图 */}
      <Card 
        title="支出趋势" 
        style={{ marginBottom: 24 }}
        loading={loading}
        extra={
          <Space>
            <Button 
              type={groupBy === 'day' ? 'primary' : 'default'} 
              size="small" 
              danger={groupBy === 'day'}
              onClick={() => setGroupBy('day')}
            >
              按日
            </Button>
            <Button 
              type={groupBy === 'week' ? 'primary' : 'default'} 
              size="small" 
              danger={groupBy === 'week'}
              onClick={() => setGroupBy('week')}
            >
              按周
            </Button>
            <Button 
              type={groupBy === 'month' ? 'primary' : 'default'} 
              size="small" 
              danger={groupBy === 'month'}
              onClick={() => setGroupBy('month')}
            >
              按月
            </Button>
          </Space>
        }
      >
        {trend.length > 0 ? (
          <div ref={trendChartRef} style={{ height: 300 }} />
        ) : (
          <Empty description="暂无趋势数据" style={{ padding: '60px 0' }} />
        )}
      </Card>

      {/* 构成和排行 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Card title="支出类型构成" loading={loading}>
            {composition.length > 0 ? (
              <div ref={compositionChartRef} style={{ height: 280 }} />
            ) : (
              <Empty description="暂无数据" style={{ padding: '60px 0' }} />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="合作资金方排行" loading={loading}>
            {funderRanking.length === 0 ? (
              <Empty description="暂无数据" style={{ padding: '60px 0' }} />
            ) : (
              <div style={{ padding: '8px 0' }}>
                {funderRanking.map((item, index) => (
                  <div 
                    key={item.id} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '12px 0', 
                      borderBottom: index < funderRanking.length - 1 ? '1px solid #f0f0f0' : 'none' 
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 24, 
                        height: 24, 
                        borderRadius: '50%',
                        backgroundColor: index < 3 ? ['#f5222d', '#fa8c16', '#fadb14'][index] : '#d9d9d9',
                        color: index < 2 ? '#fff' : (index === 2 ? '#333' : '#666'),
                        marginRight: 12,
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        {index + 1}
                      </span>
                      <span style={{ fontSize: 14 }}>🏦 {item.name}</span>
                    </span>
                    <span style={{ color: '#f5222d', fontWeight: 600, fontSize: 15 }}>
                      ¥{(item.amount || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 明细表格 */}
      <Card 
        title="支出明细" 
        extra={
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出 Excel
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="支出类型"
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
            placeholder="状态"
            allowClear
            style={{ width: 120 }}
            value={filters.status}
            onChange={(v) => setFilters({ ...filters, status: v, page: 1 })}
          >
            {Object.entries(STATUS_MAP).map(([key, { text }]) => (
              <Select.Option key={key} value={key}>{text}</Select.Option>
            ))}
          </Select>
        </Space>

        <Table
          columns={columns}
          dataSource={records}
          rowKey="id"
          loading={tableLoading}
          scroll={{ x: 750 }}
          pagination={{
            current: filters.page,
            pageSize: filters.pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (page, pageSize) => setFilters({ ...filters, page, pageSize }),
          }}
        />
      </Card>
    </div>
  );
};

export default FinancierExpense;
