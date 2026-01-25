# 运单导入功能测试计划

## 测试目标

验证运单数据导入功能的正确性，包括：
1. 权限控制
2. 数据隔离
3. CSV解析
4. 字段校验

---

## 测试环境准备

### 1. 启动服务

```bash
# 后端
cd /path/to/project
DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root DB_PASSWORD=root123 DB_NAME=testjr npm run dev:backend

# 前端
npm run dev:frontend
```

### 2. 准备测试数据

#### 2.1 创建测试融资方（如不存在）

```bash
# 创建融资方 A：金罗物流
POST /api/financiers
{
  "enterpriseName": "金罗物流",
  "unifiedSocialCreditCode": "91110000MA00ABCD01",
  "legalRepresentative": "张三",
  "businessAddress": "北京市朝阳区",
  "operatingScale": "large",
  "initialCreditAmount": 1000000
}

# 创建融资方 B：测试物流
POST /api/financiers
{
  "enterpriseName": "测试物流",
  "unifiedSocialCreditCode": "91110000MA00ABCD02",
  "legalRepresentative": "李四",
  "businessAddress": "上海市浦东新区",
  "operatingScale": "medium",
  "initialCreditAmount": 500000
}
```

#### 2.2 创建测试资金方（如不存在）

```bash
# 创建资金方：登途银行
POST /api/funders
{
  "institutionName": "登途银行",
  "institutionType": "bank",
  "legalRepresentative": "王五",
  "businessAddress": "深圳市南山区",
  "status": "active"
}
```

#### 2.3 创建定向支付合同（建立资金方与融资方A的关系）

```bash
# 登途银行 与 金罗物流 签订定向支付合同
POST /api/directed-pay/contracts
{
  "funderId": "<登途银行ID>",
  "financierId": "<金罗物流ID>",
  "creditLimit": 500000,
  "annualInterestRate": 0.12,
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "settlementCycle": "monthly",
  "settlementDay": 25
}

# 激活合同
POST /api/directed-pay/contracts/<合同ID>/approve
```

#### 2.4 创建测试用户

```bash
# 金罗物流员工
POST /api/users
{
  "username": "jinluo_user",
  "password": "test123",
  "displayName": "金罗员工",
  "orgId": "<金罗物流组织ID>",
  "groupIds": ["<有导入权限的用户组>"]
}

# 测试物流员工
POST /api/users
{
  "username": "test_logistics_user",
  "password": "test123",
  "displayName": "测试物流员工",
  "orgId": "<测试物流组织ID>",
  "groupIds": ["<有导入权限的用户组>"]
}

# 登途银行员工
POST /api/funders
{
  "username": "dengtu_user",
  "password": "test123",
  "displayName": "登途银行员工",
  "orgId": "<登途银行组织ID>",
  "groupIds": ["<有查看权限的用户组>"]
}
```

#### 2.5 准备CSV测试文件

创建文件 `test-waybills.csv`：

```csv
批次号,主驾司机,车牌号,发站,到站,发车时间,客户名称,应收运输费合计,应付运输费合计,任务毛利,批次备注
WB-TEST-001,张司机,京A12345,北京,上海,2026-01-15,金罗物流,10000,8000,2000,测试运单1
WB-TEST-002,李司机,京B67890,北京,广州,2026-01-15,金罗物流,15000,12000,3000,测试运单2
WB-TEST-003,王司机,沪A11111,上海,深圳,2026-01-15,金罗物流,8000,6500,1500,测试运单3
```

创建文件 `test-waybills-invalid.csv`（用于测试校验）：

```csv
批次号,主驾司机,车牌号,发站,到站,发车时间,客户名称,应收运输费合计,应付运输费合计,任务毛利,批次备注
,张司机,京A12345,北京,上海,2026-01-15,金罗物流,10000,8000,2000,批次号为空
WB-TEST-004,李司机,京B67890,北京,广州,2026-01-15,金罗物流,abc,8000,2000,金额非数字
WB-TEST-005,王司机,沪A11111,上海,深圳,invalid-date,金罗物流,8000,6500,1500,日期格式错误
```

---

## 测试用例

### 测试1：融资方员工上传

**目的**：验证融资方员工可以上传，且数据自动关联到该融资方

**步骤**：
1. 使用 `jinluo_user` 账号登录
2. 进入"运单数据"页面
3. 点击"导入运单"按钮
4. 上传 `test-waybills.csv`
5. 观察导入结果

**预期结果**：
- ✅ 显示"成功导入 3 条运单"
- ✅ 导入的运单在列表中显示
- ✅ 运单的 `customerId` 自动设置为金罗物流ID

**验证SQL**：
```sql
SELECT id, waybill_number, customer_id, customer_name 
FROM waybills 
WHERE waybill_number LIKE 'WB-TEST-%' 
ORDER BY created_at DESC;
```

---

### 测试2：融资方员工数据隔离

**目的**：验证融资方员工只能看到自己融资方的运单

**步骤**：
1. 使用 `test_logistics_user` 账号登录（测试物流员工）
2. 进入"运单数据"页面
3. 观察运单列表

**预期结果**：
- ✅ 看不到金罗物流上传的运单（WB-TEST-001/002/003）
- ✅ 只能看到测试物流的运单（如果有）

---

### 测试3：资金方员工禁止上传

**目的**：验证资金方员工不能上传运单

**步骤**：
1. 使用 `dengtu_user` 账号登录（登途银行员工）
2. 进入"运单数据"页面
3. 尝试点击"导入运单"按钮

**预期结果**：
- ✅ "导入运单"按钮隐藏或禁用
- ✅ 或者点击后显示"资金方无权上传运单数据"错误

---

### 测试4：资金方员工查看有合同关系的运单

**目的**：验证资金方员工可以看到有合同关系的融资方运单

**步骤**：
1. 使用 `dengtu_user` 账号登录（登途银行员工）
2. 进入"运单数据"页面
3. 观察运单列表

**预期结果**：
- ✅ 可以看到金罗物流的运单（因为有定向支付合同）
- ✅ 看不到测试物流的运单（因为没有合同关系）

---

### 测试5：平台用户上传需选择融资方

**目的**：验证平台用户上传时必须选择目标融资方

**步骤**：
1. 使用 `admin` 账号登录
2. 进入"运单数据"页面
3. 点击"导入运单"按钮
4. 观察弹窗内容

**预期结果**：
- ✅ 弹窗中显示"选择融资方"下拉框
- ✅ 下拉框中显示所有融资方
- ✅ 未选择融资方时，上传按钮禁用或提示错误

**步骤续**：
5. 选择"金罗物流"
6. 上传 `test-waybills.csv`

**预期结果**：
- ✅ 上传成功
- ✅ 运单关联到金罗物流

---

### 测试6：字段校验

**目的**：验证CSV字段校验正确

**步骤**：
1. 使用 `jinluo_user` 账号登录
2. 点击"导入运单"
3. 上传 `test-waybills-invalid.csv`

**预期结果**：
- ✅ 显示导入结果："成功 0 条，失败 3 条"
- ✅ 错误详情显示：
  - "行 未知: 批次号不能为空"
  - "行 WB-TEST-004: 应收运输费合计必须为数字"
  - "行 WB-TEST-005: 发车时间格式不正确"

---

### 测试7：平台用户查看所有数据

**目的**：验证平台用户可以看到所有运单

**步骤**：
1. 使用 `admin` 账号登录
2. 进入"运单数据"页面
3. 观察运单列表

**预期结果**：
- ✅ 可以看到所有融资方的运单
- ✅ 包括金罗物流和测试物流的运单

---

## 测试结果记录

| 测试编号 | 测试名称 | 预期结果 | 实际结果 | 状态 |
|---------|---------|---------|---------|------|
| 测试1 | 融资方员工上传 | 成功导入并关联 | | ⏳ |
| 测试2 | 融资方数据隔离 | 只看自己的数据 | | ⏳ |
| 测试3 | 资金方禁止上传 | 禁止或报错 | | ⏳ |
| 测试4 | 资金方查看合同关联 | 看到有合同关系的 | | ⏳ |
| 测试5 | 平台选择融资方上传 | 必须选择后上传 | | ⏳ |
| 测试6 | 字段校验 | 显示错误详情 | | ⏳ |
| 测试7 | 平台查看所有 | 看到所有数据 | | ⏳ |

---

## 清理测试数据

测试完成后，清理测试数据：

```sql
-- 删除测试运单
DELETE FROM waybills WHERE waybill_number LIKE 'WB-TEST-%';

-- 如需删除测试用户、融资方等，请谨慎操作
```

---

## 问题记录

| 问题编号 | 问题描述 | 严重程度 | 状态 |
|---------|---------|---------|------|
| | | | |

---

*测试计划版本: v1.0*
