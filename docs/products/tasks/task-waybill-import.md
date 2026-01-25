# 运单数据导入功能 - 开发任务

## 任务概述

实现完整的运单数据CSV导入功能，支持多租户数据隔离。

---

## 背景信息

### 现有代码位置

- **前端页面**: `frontend/src/pages/Waybills.tsx`
- **后端API**: `backend/src/routes.ts` (`/api/waybills/import`)
- **数据存储**: `backend/src/waybills-store.ts`

### 现有状态

- 前端已有导入弹窗UI框架，但实际导入功能未实现（点击后提示使用脚本）
- 后端已有 `/api/waybills/import` API，但需要改进

---

## 数据隔离规则

### 上传权限

| 用户角色 | 上传权限 | 说明 |
|---------|---------|------|
| 融资方员工 | ✅ 允许 | 自动关联到该融资方 |
| 资金方员工 | ❌ 禁止 | 返回403错误 |
| 平台用户 | ✅ 允许 | 需选择目标融资方 |

### 查看权限

| 用户角色 | 查看范围 |
|---------|---------|
| 融资方员工 | 只能看到自己融资方的运单 |
| 资金方员工 | 看到与自己有**定向支付合同**关系的融资方运单 |
| 平台用户 | 可以看到所有运单 |

### 资金方查看逻辑伪代码

```javascript
// 1. 获取资金方有合同关系的融资方ID列表
const contracts = await getDirectedPayContracts({ funderId: currentFunderId });
const financierIds = contracts.map(c => c.financierId);

// 2. 查询这些融资方的运单
const waybills = await getWaybills({ customerIdIn: financierIds });
```

---

## 任务清单

### 任务1：后端 - 导入API权限控制

**文件**: `backend/src/routes.ts`

**修改 `/api/waybills/import` 路由**：

```typescript
router.post(
  "/waybills/import",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgContext = req.orgContext;
    
    // 1. 权限检查
    if (orgContext && !orgContext.isPlatformUser) {
      if (orgContext.orgType === "funder") {
        // 资金方不允许上传
        return res.status(403).json({ error: "资金方无权上传运单数据" });
      }
    }
    
    // 2. 确定 customerId
    let customerId: string | undefined;
    
    if (orgContext?.isPlatformUser) {
      // 平台用户：从请求体获取，必填
      customerId = req.body.customerId;
      if (!customerId) {
        return res.status(400).json({ error: "平台用户上传时必须指定融资方" });
      }
    } else if (orgContext?.orgType === "financier") {
      // 融资方用户：自动使用关联的融资方ID
      customerId = orgContext.relatedEntityId;
    }
    
    // 3. 调用导入函数，传入 customerId
    const { waybills } = req.body;
    const result = await importWaybills(waybills, customerId);
    res.json(result);
  }
);
```

---

### 任务2：后端 - 运单查询增加资金方过滤

**文件**: `backend/src/routes.ts`

**修改 `/api/waybills` GET 路由**：

当前代码已支持融资方过滤，需要增加资金方过滤逻辑：

```typescript
router.get(
  "/waybills",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgContext = req.orgContext;
    let customerId: string | undefined;
    let customerIds: string[] | undefined;  // 新增：支持多个融资方
    
    if (orgContext && !orgContext.isPlatformUser) {
      if (orgContext.orgType === "financier") {
        // 融资方：只看自己的
        customerId = orgContext.relatedEntityId;
      } else if (orgContext.orgType === "funder") {
        // 资金方：查询有合同关系的融资方运单
        const contracts = await getDirectedPayContractsByFunder(orgContext.relatedEntityId);
        customerIds = contracts.map(c => c.financierId);
        if (customerIds.length === 0) {
          // 没有合同关系，返回空
          return res.json({ waybills: [] });
        }
      }
    }
    
    const waybills = await getWaybills({
      ...filters,
      customerId,
      customerIds  // 新增参数
    });
    res.json({ waybills });
  }
);
```

**文件**: `backend/src/waybills-store.ts`

**修改 `getWaybills` 函数**，支持 `customerIds` 数组参数：

```typescript
export async function getWaybills(filters?: {
  // ... 现有参数
  customerId?: string;
  customerIds?: string[];  // 新增
}): Promise<Waybill[]> {
  // ...
  
  // 单个融资方过滤
  if (filters?.customerId) {
    query += ` AND customer_id = ?`;
    params.push(filters.customerId);
  }
  
  // 多个融资方过滤（资金方用）
  if (filters?.customerIds && filters.customerIds.length > 0) {
    const placeholders = filters.customerIds.map(() => '?').join(',');
    query += ` AND customer_id IN (${placeholders})`;
    params.push(...filters.customerIds);
  }
  
  // ...
}
```

---

### 任务3：后端 - 添加辅助函数

**文件**: `backend/src/directed-pay-contracts-store.ts` 或 `directed-payment-routes.ts`

添加根据资金方查询合同的函数：

```typescript
export async function getDirectedPayContractsByFunder(
  funderId: string
): Promise<{ financierId: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT financier_id 
     FROM directed_pay_contracts 
     WHERE funder_id = ? AND status = 'active' AND deleted_at IS NULL`,
    [funderId]
  );
  return rows.map(row => ({ financierId: row.financier_id }));
}
```

---

### 任务4：后端 - importWaybills 函数改进

**文件**: `backend/src/waybills-store.ts`

修改 `importWaybills` 函数，接收 `customerId` 参数：

```typescript
export async function importWaybills(
  waybills: any[],
  customerId?: string  // 新增参数
): Promise<{ success: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let success = 0;
  let failed = 0;

  for (const waybill of waybills) {
    try {
      // 字段校验
      if (!waybill.waybillNumber) {
        throw new Error("批次号不能为空");
      }
      
      // 数字字段校验
      if (waybill.receivableTotal && isNaN(Number(waybill.receivableTotal))) {
        throw new Error("应收运输费合计必须为数字");
      }
      
      // 创建运单，使用传入的 customerId
      await createWaybill({
        ...waybill,
        customerId: customerId || waybill.customerId,
        customerName: waybill.customerName || ""
      });
      success++;
    } catch (err: any) {
      failed++;
      errors.push(`行 ${waybill.waybillNumber || '未知'}: ${err.message}`);
    }
  }

  return { success, failed, errors };
}
```

---

### 任务5：前端 - CSV解析与上传

**文件**: `frontend/src/pages/Waybills.tsx`

#### 5.1 安装依赖（如需要）

CSV解析可以使用原生实现，不需要额外依赖。

#### 5.2 添加CSV解析函数

```typescript
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
  '批次备注': 'remark'
};

// 转换CSV行到API格式
const mapCSVRow = (row: Record<string, string>): Record<string, any> => {
  const mapped: Record<string, any> = {};
  for (const [csvKey, apiKey] of Object.entries(CSV_FIELD_MAP)) {
    if (row[csvKey] !== undefined) {
      mapped[apiKey] = row[csvKey];
    }
  }
  return mapped;
};
```

#### 5.3 修改上传处理

```typescript
// 处理文件上传
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
    
    // 4. 调用导入API
    const result = await importWaybillsApi(token!, {
      waybills,
      customerId: selectedFinancierId  // 平台用户需要选择
    });
    
    setImportResult(result);
    
    if (result.success > 0) {
      message.success(`成功导入 ${result.success} 条运单`);
      void refresh();  // 刷新列表
    }
  } catch (err: any) {
    message.error(getErrorMessage(err));
  } finally {
    setImporting(false);
  }
  
  return false;  // 阻止默认上传行为
};
```

#### 5.4 平台用户融资方选择器

```tsx
// 状态
const [financiers, setFinanciers] = useState<Financier[]>([]);
const [selectedFinancierId, setSelectedFinancierId] = useState<string>();

// 加载融资方列表（平台用户需要）
useEffect(() => {
  if (user?.orgContext?.isPlatformUser && token) {
    fetchFinanciers(token).then(res => setFinanciers(res.financiers));
  }
}, [token, user]);

// 在导入弹窗中添加
{user?.orgContext?.isPlatformUser && (
  <Form.Item label="选择融资方" required style={{ marginBottom: 16 }}>
    <Select
      value={selectedFinancierId}
      onChange={setSelectedFinancierId}
      placeholder="请选择要导入数据的融资方"
      options={financiers.map(f => ({
        value: f.id,
        label: f.enterpriseName
      }))}
    />
  </Form.Item>
)}
```

#### 5.5 修改 Upload 组件

```tsx
<Upload.Dragger
  accept=".csv"
  showUploadList={false}
  beforeUpload={handleFileUpload}
  disabled={importing || (user?.orgContext?.isPlatformUser && !selectedFinancierId)}
>
  {/* ... */}
</Upload.Dragger>
```

---

### 任务6：后端 - 导入API修改

**文件**: `frontend/src/api.ts`

确认 `importWaybillsApi` 支持 `customerId` 参数：

```typescript
export async function importWaybillsApi(
  token: string,
  data: {
    waybills: any[];
    customerId?: string;
  }
): Promise<{ success: number; failed: number; errors: string[] }> {
  const res = await fetch(`${API_BASE}/waybills/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}
```

---

## 字段校验规则

| 字段 | 校验规则 | 错误提示 |
|-----|---------|---------|
| waybillNumber | 必填 | "批次号不能为空" |
| receivableTotal | 如有值，必须为数字 | "应收运输费合计必须为数字" |
| payableTotal | 如有值，必须为数字 | "应付运输费合计必须为数字" |
| profit | 如有值，必须为数字 | "任务毛利必须为数字" |
| departureTime | 如有值，必须为有效日期 | "发车时间格式不正确" |

---

## CSV模板格式

第一行为表头，从第二行开始为数据：

```csv
批次号,主驾司机,车牌号,发站,到站,发车时间,客户名称,应收运输费合计,应付运输费合计,任务毛利,批次备注
WB-001,张三,京A12345,北京,上海,2026-01-15,金罗物流,10000,8000,2000,测试运单
```

---

## 验收标准

1. **融资方员工**：
   - ✅ 可以上传CSV文件
   - ✅ 上传的运单自动关联到该融资方
   - ✅ 只能看到自己融资方的运单

2. **资金方员工**：
   - ✅ 上传按钮隐藏或点击提示无权限
   - ✅ 可以看到有合同关系的融资方运单
   - ✅ 看不到无合同关系的融资方运单

3. **平台用户**：
   - ✅ 可以上传CSV文件
   - ✅ 上传前需选择目标融资方
   - ✅ 可以看到所有运单

4. **导入功能**：
   - ✅ 正确解析CSV文件
   - ✅ 字段校验正确
   - ✅ 显示导入结果（成功/失败数量）
   - ✅ 显示错误详情

---

## 注意事项

1. CSV文件编码建议使用 UTF-8
2. 大文件导入可能需要分批处理（后续优化）
3. 字段映射需要与现有模板保持一致

---

*任务文档版本: v1.0*
