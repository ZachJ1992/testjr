import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Row, Col, Statistic, Table, Select, DatePicker, Button, Space, Tag, message, Empty, Spin, Progress, Typography } from 'antd';
import { DownloadOutlined, FileTextOutlined, TeamOutlined, UserOutlined, RiseOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

const { Text } = Typography;
import * as echarts from 'echarts';
import dayjs, { Dayjs } from 'dayjs';
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
};

const PlatformRevenue: React.FC = () => {
  const { token } = useAuth();
  
  // 状态
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month' | 'year'>('day');
  
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
      const res = await fetchPlatformRevenueList(token, {
        ...dateRange,
        ...filters,
      });
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
    if (!trendChartRef.current || trend.length === 0) return;
    
    if (!trendChartInstance.current) {
      trendChartInstance.current = echarts.init(trendChartRef.current);
    }
    
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
    });

    const handleResize = () => trendChartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [trend]);

  // 初始化饼图
  useEffect(() => {
    if (!compositionChartRef.current || composition.length === 0) return;
    
    if (!compositionChartInstance.current) {
      compositionChartInstance.current = echarts.init(compositionChartRef.current);
    }
    
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
    });

    const handleResize = () => compositionChartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [composition]);

  // 销毁图表
  useEffect(() => {
    return () => {
      trendChartInstance.current?.dispose();
      compositionChartInstance.current?.dispose();
    };
  }, []);

  // 导出
  const handleExport = () => {
    if (!token) return;
    const url = getPlatformRevenueExportUrl(token, { ...dateRange, ...filters });
    window.open(url, '_blank');
  };

  // 表格列定义
  const columns = [
    { title: '日期', dataIndex: 'revenueDate', key: 'revenueDate', width: 100 },
    { 
      title: '收益类型', 
      dataIndex: 'sourceType', 
      key: 'sourceType',
      width: 120,
      render: (type: string) => SOURCE_TYPE_MAP[type] || type,
    },
    { title: '合同编号', dataIndex: 'contractNumber', key: 'contractNumber', width: 150 },
    { title: '资金方', dataIndex: 'funderName', key: 'funderName', width: 120 },
    { title: '融资方', dataIndex: 'financierName', key: 'financierName', width: 120 },
    { 
      title: '金额', 
      dataIndex: 'amount', 
      key: 'amount',
      width: 120,
      align: 'right' as const,
      render: (amount: number) => (
        <span style={{ color: '#1890ff', fontWeight: 500 }}>
          ¥{amount?.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) || '0.00'}
        </span>
      ),
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
  ];

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
              <Button type={timeRange === 'year' ? 'primary' : 'default'} onClick={() => setTimeRange('year')}>本年</Button>
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
            { title: '在投总额', value: stats?.totalInvestment || 0, accent: '#13c2c2' },
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
                      <span style={{ fontSize: 12, color: '#999', marginLeft: 4 }}>融资方</span>
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
              {trend.length > 0 ? (
                <div ref={trendChartRef} style={{ height: 300 }} />
              ) : (
                <Empty description="暂无趋势数据" style={{ height: 300, paddingTop: 100 }} />
              )}
            </Card>
          </Col>
          <Col span={10}>
            <Card title="收益构成">
              {composition.length > 0 ? (
                <div ref={compositionChartRef} style={{ height: 300 }} />
              ) : (
                <Empty description="暂无构成数据" style={{ height: 300, paddingTop: 100 }} />
              )}
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
            <Card title="TOP5 融资方贡献">
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
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              导出 CSV
            </Button>
          }
        >
          {/* 筛选器 - 移除状态筛选 */}
          <Space style={{ marginBottom: 16 }}>
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
          </Space>

          <Table
            columns={columns}
            dataSource={records}
            rowKey="id"
            loading={tableLoading}
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
