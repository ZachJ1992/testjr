import { Card, Space, Table, Input, Select } from "antd";
import type { ColumnsType, TablePaginationConfig, TableProps, ColumnType } from "antd/es/table";
import type { FilterValue, SorterResult } from "antd/es/table/interface";
import { ReactNode, useMemo, useState, useEffect, useRef } from "react";
import { SearchOutlined, ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import { matchText } from "../utils/pinyinMatch";

export type FilterType = "input" | "select";

export interface ColumnFilterConfig {
  type: FilterType;
  placeholder?: string;
  options?: Array<{ label: string; value: any }>;
  onBackendSearch?: (value: any, columnKey: string) => void;
}

export interface EnhancedColumnType<RecordType> extends ColumnType<RecordType> {
  filterConfig?: ColumnFilterConfig;
}

export interface DataTableProps<RecordType extends object> {
  title?: ReactNode;
  extra?: ReactNode;
  toolbar?: ReactNode;
  columns: EnhancedColumnType<RecordType>[];
  data?: RecordType[];
  dataSource?: RecordType[]; // 兼容 Ant Design 的命名
  loading?: boolean;
  rowKey: TableProps<RecordType>["rowKey"];
  pagination?: TablePaginationConfig | false;
  onChange?: (
    pagination: TablePaginationConfig,
    filters: Record<string, FilterValue | null>,
    sorter: SorterResult<RecordType> | SorterResult<RecordType>[]
  ) => void;
  size?: TableProps<RecordType>["size"];
  scroll?: TableProps<RecordType>["scroll"];
  expandable?: TableProps<RecordType>["expandable"];
  rowSelection?: TableProps<RecordType>["rowSelection"];
  onBackendSearch?: (filters: Record<string, any>) => void;
}

export function DataTable<RecordType extends object>({
  title,
  extra,
  toolbar,
  columns,
  data,
  dataSource,
  loading,
  rowKey,
  pagination = { pageSize: 10 },
  onChange,
  size = "small",
  scroll,
  expandable,
  rowSelection,
  onBackendSearch
}: DataTableProps<RecordType>) {
  // 支持 data 或 dataSource（兼容 Ant Design 命名），确保始终是数组
  const inputData = data ?? dataSource;
  const safeData = Array.isArray(inputData) ? inputData : [];
  
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [frontendFilteredData, setFrontendFilteredData] = useState<RecordType[]>(safeData);
  const searchTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const backendSearchTriggered = useRef<Record<string, boolean>>({});

  // 当data变化时，更新前端过滤后的数据
  useEffect(() => {
    const inputData = data ?? dataSource;
    setFrontendFilteredData(Array.isArray(inputData) ? inputData : []);
  }, [data, dataSource]);

  // 前端实时搜索（输入类筛选实时前端过滤，选择类筛选前端过滤或后端处理）
  useEffect(() => {
    const inputFilters: Record<string, any> = {};
    const selectFilters: Record<string, any> = {};
    
    Object.keys(filterValues).forEach(key => {
      const column = columns.find(col => {
        const colKey = (col as any).key;
        const colDataIndex = (col as any).dataIndex;
        return colKey === key || colDataIndex === key;
      });
      const filterConfig = (column as EnhancedColumnType<RecordType>)?.filterConfig;
      
      // 只处理未触发后端搜索的筛选
      if (!backendSearchTriggered.current[key]) {
        if (filterConfig?.type === "input") {
          // 输入类筛选
          if (filterValues[key] !== undefined && filterValues[key] !== null && filterValues[key] !== "") {
            inputFilters[key] = filterValues[key];
          }
        } else if (filterConfig?.type === "select") {
          // 选择类筛选（多选）
          const value = filterValues[key];
          if (value !== undefined && value !== null && (Array.isArray(value) ? value.length > 0 : value !== "")) {
            selectFilters[key] = value;
          }
        }
      }
    });

    // 前端实时过滤
    let filtered = [...safeData];
    
    // 处理输入类筛选（支持拼音、首字母和普通文本搜索）
    Object.keys(inputFilters).forEach(key => {
      const value = inputFilters[key];
      if (value && typeof value === "string") {
        const searchValue = value.toLowerCase();
        filtered = filtered.filter(record => {
          const column = columns.find(col => {
            const colKey = (col as any).key;
            const colDataIndex = (col as any).dataIndex;
            return colKey === key || colDataIndex === key;
          });
          const colDataIndex = (column as any)?.dataIndex;
          const fieldValue = colDataIndex
            ? (record as any)[colDataIndex]
            : (record as any)[key];
          
          if (fieldValue === undefined || fieldValue === null) return false;
          
          const strValue = String(fieldValue);
          
          // 使用拼音匹配工具（支持普通文本、拼音和拼音首字母）
          return matchText(strValue, value);
        });
      }
    });
    
    // 处理选择类筛选（多选）
    Object.keys(selectFilters).forEach(key => {
      const values = selectFilters[key];
      if (Array.isArray(values) && values.length > 0) {
        filtered = filtered.filter(record => {
          const column = columns.find(col => {
            const colKey = (col as any).key;
            const colDataIndex = (col as any).dataIndex;
            return colKey === key || colDataIndex === key;
          });
          const colDataIndex = (column as any)?.dataIndex;
          const fieldValue = colDataIndex
            ? (record as any)[colDataIndex]
            : (record as any)[key];
          
          return values.includes(fieldValue);
        });
      }
    });

    setFrontendFilteredData(filtered);
  }, [filterValues, safeData, columns]);

  // 处理筛选值变化
  const handleFilterChange = (columnKey: string, value: any, isInput: boolean = false) => {
    setFilterValues(prev => ({
      ...prev,
      [columnKey]: value
    }));

    const column = columns.find(col => {
      const colKey = (col as any).key;
      const colDataIndex = (col as any).dataIndex;
      return colKey === columnKey || colDataIndex === columnKey;
    });
    
    const filterConfig = (column as EnhancedColumnType<RecordType>)?.filterConfig;
    
    if (isInput && filterConfig?.type === "input") {
      // 输入类：清除之前的定时器
      if (searchTimeoutRef.current[columnKey]) {
        clearTimeout(searchTimeoutRef.current[columnKey]);
      }
      // 标记为前端搜索
      backendSearchTriggered.current[columnKey] = false;
    } else if (!isInput && filterConfig?.type === "select") {
      // 选择类：如果配置了后端搜索回调，则触发后端搜索；否则进行前端过滤
      const updatedFilters = {
        ...filterValues,
        [columnKey]: value
      };
      if (filterConfig?.onBackendSearch) {
        backendSearchTriggered.current[columnKey] = true;
        filterConfig.onBackendSearch(value, columnKey);
      } else if (onBackendSearch) {
        backendSearchTriggered.current[columnKey] = true;
        onBackendSearch(updatedFilters);
      } else {
        // 没有后端搜索回调，进行前端过滤
        backendSearchTriggered.current[columnKey] = false;
      }
    }
  };

  // 处理输入类搜索的回车事件
  const handleInputKeyDown = (e: React.KeyboardEvent, columnKey: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const column = columns.find(col => {
        const colKey = (col as any).key;
        const colDataIndex = (col as any).dataIndex;
        return colKey === columnKey || colDataIndex === columnKey;
      });
      const filterConfig = (column as EnhancedColumnType<RecordType>)?.filterConfig;
      // 使用最新的输入值（通过e.target.value获取，因为filterValues可能还没更新）
      const inputElement = e.target as HTMLInputElement;
      const value = inputElement.value;
      
      // 更新filterValues
      setFilterValues(prev => ({
        ...prev,
        [columnKey]: value
      }));
      
      // 触发后端搜索
      backendSearchTriggered.current[columnKey] = true;
      if (filterConfig?.onBackendSearch) {
        filterConfig.onBackendSearch(value, columnKey);
      } else if (onBackendSearch) {
        onBackendSearch({
          ...filterValues,
          [columnKey]: value
        });
      }
    }
  };

  // 处理输入类搜索的变化（实时前端搜索）
  const handleInputChange = (columnKey: string, value: string) => {
    handleFilterChange(columnKey, value, true);
  };

  // 处理选择类搜索的变化（立即后端搜索）
  const handleSelectChange = (columnKey: string, value: any) => {
    handleFilterChange(columnKey, value, false);
  };

  // 增强columns，添加filterDropdown（保留但隐藏，因为我们直接在title中显示）
  const enhancedColumns = useMemo(() => {
    return columns.map(col => {
      const columnKey = ((col as any).key as string) || ((col as any).dataIndex as string);
      if (!columnKey || !(col as EnhancedColumnType<RecordType>).filterConfig) {
        return col;
      }

      const filterConfig = (col as EnhancedColumnType<RecordType>).filterConfig!;
      const currentValue = filterValues[columnKey];

      return {
        ...col,
        filterDropdown: () => null, // 不使用filterDropdown，我们在title中直接显示
        filterIcon: () => null, // 隐藏默认的筛选图标
        onFilter: undefined // 移除默认的onFilter，因为我们自己处理过滤逻辑
      };
    });
  }, [columns, filterValues, onBackendSearch]);

  // 渲染带筛选器的表头
  const renderColumnsWithFilters = (): ColumnsType<RecordType> => {
    return enhancedColumns.map(col => {
      const columnKey = ((col as any).key as string) || ((col as any).dataIndex as string);
      const filterConfig = (col as EnhancedColumnType<RecordType>).filterConfig;
      
      if (!filterConfig || !columnKey) {
        const origTitle = (col as any).title;
        return {
          ...col,
          title: typeof origTitle === "function" ? origTitle : () => (
            <div style={{ textAlign: "center", whiteSpace: "nowrap", fontWeight: 600, fontSize: 13, color: "#262626" }}>
              {origTitle}
            </div>
          ),
        } as ColumnType<RecordType>;
      }

      const originalTitle = (col as any).title;
      
      // 如果有排序功能，需要自定义title以避免整个表头触发排序
      const hasSorter = (col as any).sorter !== undefined;
      
      return {
        ...col,
        title: () => {
          const currentValue = filterValues[columnKey];
          const titleContent = typeof originalTitle === "function" ? originalTitle() : originalTitle;
          
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, alignItems: "center" }}>
              <div style={{ 
                fontWeight: 600,
                fontSize: 13,
                color: "#262626",
                lineHeight: "22px",
                whiteSpace: "nowrap",
                textAlign: "center",
              }}>
                {titleContent}
              </div>
              <div 
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                style={{ minWidth: 0 }}
              >
                {filterConfig.type === "input" ? (
                  <Input
                    size="small"
                    placeholder={filterConfig.placeholder || "搜索"}
                    value={currentValue}
                    onChange={(e) => handleInputChange(columnKey, e.target.value)}
                    onKeyDown={(e) => handleInputKeyDown(e, columnKey)}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    prefix={<SearchOutlined style={{ color: "#d9d9d9", fontSize: 11 }} />}
                    allowClear
                    style={{ 
                      width: "100%",
                      fontSize: 12,
                      height: 24,
                      borderRadius: 4,
                    }}
                  />
                ) : filterConfig.type === "select" ? (
                  <Select
                    size="small"
                    placeholder={filterConfig.placeholder || "筛选"}
                    value={currentValue !== undefined && currentValue !== null && currentValue !== "" ? currentValue : undefined}
                    onChange={(value) => handleSelectChange(columnKey, value ?? "")}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    options={filterConfig.options || []}
                    allowClear
                    style={{ 
                      width: "100%",
                      fontSize: 12,
                    }}
                    popupMatchSelectWidth={false}
                  />
                ) : null}
              </div>
            </div>
          );
        },
        // 阻止表头默认的点击排序行为，只有点击排序图标时才触发排序
        onHeaderCell: hasSorter ? () => ({
          onClick: (e: React.MouseEvent) => {
            // 检查点击目标是否是排序图标或其子元素
            const target = e.target as HTMLElement;
            const sorterIcon = target.closest('.ant-table-column-sorter');
            if (!sorterIcon && !target.closest('.ant-table-column-sorters')) {
              // 不是点击排序图标区域，阻止排序
              e.stopPropagation();
              e.preventDefault();
              return false;
            }
            // 是点击排序图标，允许默认行为继续
            return true;
          },
          onMouseDown: (e: React.MouseEvent) => {
            // 同样在 mousedown 事件中阻止非排序图标的点击
            const target = e.target as HTMLElement;
            const sorterIcon = target.closest('.ant-table-column-sorter');
            if (!sorterIcon && !target.closest('.ant-table-column-sorters')) {
              e.stopPropagation();
              e.preventDefault();
            }
          }
        }) : undefined
      } as ColumnType<RecordType>;
    });
  };

  return (
    <Card title={title} extra={extra}>
      {toolbar ? <Space style={{ marginBottom: 12 }}>{toolbar}</Space> : null}
      <Table<RecordType>
        rowKey={rowKey}
        loading={loading}
        columns={renderColumnsWithFilters()}
        dataSource={frontendFilteredData}
        pagination={pagination}
        onChange={onChange}
        size={size}
        scroll={scroll}
        expandable={expandable}
        rowSelection={rowSelection}
      />
    </Card>
  );
}

export default DataTable;
