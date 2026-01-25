# 资金定向支付 - 测试计划

## 一、测试环境准备

### 1.1 服务启动

```bash
# 1. 启动数据库
docker start testjr-mysql

# 2. 启动后端（观察表创建日志）
cd /Users/zac/Desktop/projects/jinrong/testjr-main-9b793b5608664745eeffdc2c70e618be1ac850b4
DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root DB_PASSWORD=root123 DB_NAME=testjr npm run dev:backend

# 3. 启动前端
npm run dev:frontend
```

### 1.2 测试账号

| 角色 | 用户名 | 密码 | 用途 |
|------|--------|------|------|
| 管理员 | admin | admin123 | 全权限测试 |
| 平台审批员 | platform_approver | (需创建) | 平台审批测试 |
| 资金方审批员 | funder_approver | (需创建) | 资金方审批测试 |
| 普通用户 | normal_user | (需创建) | 权限限制测试 |

### 1.3 测试数据准备

确保系统中有：
- 至少 1 个资金方
- 至少 1 个融资方
- 至少 1 条运单数据

---

## 二、API 接口测试

### 2.1 合同管理接口

#### 测试用例 1：创建定向支付合同

**请求：**
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "funderId": "<资金方ID>",
    "financierId": "<融资方ID>",
    "creditLimit": 1000000,
    "annualInterestRate": 0.12,
    "interestCalcBase": 360,
    "startDate": "2026-01-01",
    "endDate": "2026-12-31",
    "settlementCycle": "monthly",
    "settlementDay": 25,
    "gracePeriodDays": 3,
    "remark": "测试合同"
  }'
```

**预期结果：**
- 返回 200，包含合同信息
- `contractNumber` 格式为 `DPC<日期><随机码>`
- `status` 为 `draft`
- `availableAmount` 等于 `creditLimit`

**检查点：**
- [ ] 合同创建成功
- [ ] 合同编号格式正确
- [ ] 初始状态为草稿
- [ ] 可用额度等于授信额度

---

#### 测试用例 2：获取合同列表

**请求：**
```bash
curl http://localhost:3001/api/directed-pay/contracts \
  -H "Authorization: Bearer <token>"
```

**预期结果：**
- 返回合同列表数组
- 包含资金方名称和融资方名称

---

#### 测试用例 3：审批合同（激活）

**请求：**
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts/<合同ID>/approve \
  -H "Authorization: Bearer <token>"
```

**预期结果：**
- `status` 变为 `active`

---

#### 测试用例 4：暂停/恢复合同

**请求：**
```bash
# 暂停
curl -X POST http://localhost:3001/api/directed-pay/contracts/<合同ID>/suspend \
  -H "Authorization: Bearer <token>"

# 恢复
curl -X POST http://localhost:3001/api/directed-pay/contracts/<合同ID>/resume \
  -H "Authorization: Bearer <token>"
```

**预期结果：**
- 暂停后 `status` 为 `suspended`
- 恢复后 `status` 为 `active`

---

### 2.2 支付类别配置接口

#### 测试用例 5：获取类别模板

**请求：**
```bash
curl http://localhost:3001/api/directed-pay/category-templates \
  -H "Authorization: Bearer <token>"
```

**预期结果：**
- 返回 8 个预设类别（运费、油卡、ETC、工资、保险、维修、路桥费、其他）

---

#### 测试用例 6：为合同添加支付类别

**请求：**
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts/<合同ID>/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "categoryCode": "FREIGHT",
    "categoryName": "运费",
    "serviceRate": 0.003,
    "minAmount": 100,
    "maxAmount": 100000,
    "dailyLimit": 500000,
    "requirePlatformApproval": true,
    "requireFunderApproval": true,
    "platformApprovalThreshold": 10000,
    "funderApprovalThreshold": 50000,
    "autoPaymentEnabled": false
  }'
```

**预期结果：**
- 返回创建的类别配置
- 服务费率、审批阈值等配置正确

---

### 2.3 支付申请接口（核心流程）

#### 测试用例 7：创建支付申请（需要双重审批）

**前置条件：**
- 合同状态为 `active`
- 支付金额 >= 资金方审批阈值

**请求：**
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "contractId": "<合同ID>",
    "categoryCode": "FREIGHT",
    "categoryName": "运费",
    "paymentAmount": 80000,
    "receiverType": "payment_code",
    "driverId": "<司机ID>",
    "driverName": "张三",
    "driverPhone": "13800138000",
    "remark": "运费支付测试"
  }'
```

**预期结果：**
- `status` 为 `platform_pending`
- `platformApprovalStatus` 为 `pending`
- `funderApprovalStatus` 为 `pending`

**检查点：**
- [ ] 申请创建成功
- [ ] 状态为待平台审批
- [ ] 申请编号格式正确 `DPR<日期><随机码>`

---

#### 测试用例 8：创建支付申请（仅需平台审批）

**前置条件：**
- 支付金额 >= 平台审批阈值
- 支付金额 < 资金方审批阈值

**请求：** (金额 30000，介于两个阈值之间)
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "contractId": "<合同ID>",
    "categoryCode": "FREIGHT",
    "categoryName": "运费",
    "paymentAmount": 30000,
    "receiverType": "bank_transfer",
    "receiverName": "张三",
    "receiverAccount": "6222021234567890123",
    "receiverBank": "工商银行"
  }'
```

**预期结果：**
- `status` 为 `platform_pending`
- 平台审批通过后，`status` 直接变为 `approved`（跳过资金方审批）

---

#### 测试用例 9：创建支付申请（无需审批）

**前置条件：**
- 支付金额 < 所有审批阈值

**请求：** (金额 5000，低于所有阈值)
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "contractId": "<合同ID>",
    "categoryCode": "OIL_CARD",
    "categoryName": "油卡",
    "paymentAmount": 5000,
    "receiverType": "oil_card"
  }'
```

**预期结果：**
- `status` 直接为 `approved`
- 两个审批状态都为 `approved`

---

#### 测试用例 10：Admin 用户跳过审批

**前置条件：**
- 使用 admin 账号登录

**请求：** (任意金额)
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "contractId": "<合同ID>",
    "categoryCode": "FREIGHT",
    "categoryName": "运费",
    "paymentAmount": 999999,
    "receiverType": "payment_code"
  }'
```

**预期结果：**
- 无论金额多大，`status` 直接为 `approved`

---

### 2.4 审批流程接口

#### 测试用例 11：平台审批通过

**请求：**
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests/<申请ID>/platform-approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"remark": "平台审批通过"}'
```

**预期结果（需要资金方审批）：**
- `status` 变为 `funder_pending`
- `platformApprovalStatus` 变为 `approved`
- `platformApprovedAt` 有值

**预期结果（不需要资金方审批）：**
- `status` 变为 `approved`

---

#### 测试用例 12：平台审批拒绝

**请求：**
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests/<申请ID>/platform-reject \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"remark": "资料不完整"}'
```

**预期结果：**
- `status` 变为 `rejected`
- `platformApprovalStatus` 变为 `rejected`
- `platformApprovalRemark` 有内容

---

#### 测试用例 13：资金方审批通过

**请求：**
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests/<申请ID>/funder-approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"remark": "资金方审批通过"}'
```

**预期结果：**
- `status` 变为 `approved`
- `funderApprovalStatus` 变为 `approved`

---

#### 测试用例 14：资金方审批拒绝

**请求：**
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests/<申请ID>/funder-reject \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"remark": "风控不通过"}'
```

**预期结果：**
- `status` 变为 `rejected`
- `funderApprovalStatus` 变为 `rejected`

---

### 2.5 支付执行接口

#### 测试用例 15：执行支付（付款码方式）

**前置条件：**
- 支付申请状态为 `approved`
- `receiverType` 为 `payment_code`

**请求：**
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests/<申请ID>/execute \
  -H "Authorization: Bearer <token>"
```

**预期结果：**
- `status` 变为 `success`
- `executionStatus` 为 `success`
- `executionTransactionId` 为付款码（格式 `DPY<日期><随机码>`）
- `interestStartTime` 有值（计息开始时间）
- 合同 `usedAmount` 增加，`availableAmount` 减少

**检查点：**
- [ ] 支付状态更新正确
- [ ] 合同额度扣减正确
- [ ] 计息时间记录正确
- [ ] 付款码生成成功
- [ ] TMS 同步状态正确

---

#### 测试用例 16：执行支付（额度不足）

**前置条件：**
- 支付金额 > 合同可用额度

**预期结果：**
- 返回错误：`扣减额度失败：额度不足或合同状态异常`
- `status` 变为 `failed`
- `executionFailureReason` 有错误信息
- 合同额度不变（回滚成功）

---

#### 测试用例 17：执行支付（虚拟账户方式）

**前置条件：**
- `receiverType` 为 `virtual_account`

**预期结果：**
- `executionTransactionId` 格式为 `VA<时间戳><随机码>`
- 其他同测试用例 15

---

### 2.6 统计接口

#### 测试用例 18：合同统计

**请求：**
```bash
curl http://localhost:3001/api/directed-pay/contracts/stats \
  -H "Authorization: Bearer <token>"
```

**预期结果：**
```json
{
  "totalCount": 1,
  "activeCount": 1,
  "suspendedCount": 0,
  "expiredCount": 0,
  "totalCreditLimit": 1000000,
  "totalUsedAmount": 80000,
  "totalAvailableAmount": 920000
}
```

---

#### 测试用例 19：支付申请统计

**请求：**
```bash
curl http://localhost:3001/api/directed-pay/stats/requests \
  -H "Authorization: Bearer <token>"
```

**预期结果：**
```json
{
  "total": 3,
  "pendingApproval": 0,
  "processing": 0,
  "success": 2,
  "failed": 1,
  "totalPaidAmount": 110000
}
```

---

## 三、业务场景端到端测试

### 场景 1：完整支付流程（双重审批）

```
步骤 1: 创建定向支付合同
步骤 2: 审批合同（激活）
步骤 3: 为合同添加运费支付类别
步骤 4: 创建 10 万元支付申请
步骤 5: 验证状态为 platform_pending
步骤 6: 平台审批通过
步骤 7: 验证状态变为 funder_pending
步骤 8: 资金方审批通过
步骤 9: 验证状态变为 approved
步骤 10: 执行支付
步骤 11: 验证状态变为 success
步骤 12: 验证合同额度扣减正确
步骤 13: 验证付款码已生成
```

**检查清单：**
- [ ] 合同创建成功
- [ ] 合同激活成功
- [ ] 类别配置成功
- [ ] 申请创建，初始状态正确
- [ ] 平台审批流程正确
- [ ] 资金方审批流程正确
- [ ] 支付执行成功
- [ ] 额度变化正确
- [ ] 付款码/虚拟账户处理正确

---

### 场景 2：审批拒绝流程

```
步骤 1: 创建支付申请
步骤 2: 平台审批拒绝
步骤 3: 验证状态变为 rejected
步骤 4: 验证合同额度不变
```

---

### 场景 3：支付失败回滚

```
步骤 1: 将合同可用额度调整为很低
步骤 2: 创建超过可用额度的支付申请（admin跳过审批）
步骤 3: 执行支付
步骤 4: 验证失败
步骤 5: 验证合同额度未变化（回滚成功）
```

---

### 场景 4：小额支付免审批

```
步骤 1: 配置类别的审批阈值（平台 10000，资金方 50000）
步骤 2: 创建 5000 元支付申请
步骤 3: 验证状态直接为 approved
步骤 4: 执行支付
步骤 5: 验证支付成功
```

---

## 四、利息计算测试

### 测试用例 20：利息计算准确性

**测试数据：**
- 本金: 100,000 元
- 年化利率: 12%（0.12）
- 计息基数: 360 天
- 支付时间: 2026-01-01 10:00:00
- 结算时间: 2026-01-15 10:00:00

**预期结果：**
- 天数: 14 天
- 日利率: 0.12 / 360 = 0.000333...
- 利息: 100,000 × 0.000333... × 14 = 466.67 元

**验证代码：**
```typescript
import { calculateInterest } from './directed-payment-core';

const result = calculateInterest(
  100000,
  0.12,
  new Date('2026-01-01T10:00:00'),
  new Date('2026-01-15T10:00:00'),
  360
);

console.log(result);
// { days: 14, interest: 466.67 }
```

---

### 测试用例 21：不满一天按一天计息

**测试数据：**
- 本金: 10,000 元
- 年化利率: 12%
- 支付时间: 2026-01-01 23:59:00
- 结算时间: 2026-01-02 00:01:00（仅过了 2 分钟）

**预期结果：**
- 天数: 1 天（不满一天按一天）
- 利息: 10,000 × 0.12 / 360 × 1 = 3.33 元

---

## 五、边界条件测试

### 5.1 合同相关

| 测试项 | 输入 | 预期结果 |
|--------|------|----------|
| 合同已过期 | 执行支付 | 报错：合同状态异常 |
| 合同已暂停 | 执行支付 | 报错：合同状态异常 |
| 合同已终止 | 执行支付 | 报错：合同状态异常 |
| 授信额度为 0 | 创建申请 | 报错：额度不足 |
| 重复合同编号 | 创建合同 | 数据库唯一约束报错 |

### 5.2 支付申请相关

| 测试项 | 输入 | 预期结果 |
|--------|------|----------|
| 已取消申请执行支付 | status=cancelled | 报错：申请状态不正确 |
| 已拒绝申请执行支付 | status=rejected | 报错：申请未审批通过 |
| 重复执行支付 | status=success | 报错：申请状态不正确 |
| 非法状态审批 | status=approved 时审批 | 报错：申请状态不正确 |

### 5.3 金额边界

| 测试项 | 输入 | 预期结果 |
|--------|------|----------|
| 支付金额为 0 | paymentAmount=0 | 应拒绝或警告 |
| 支付金额为负数 | paymentAmount=-100 | 应拒绝 |
| 超大金额 | paymentAmount=999999999999 | 精度检查 |
| 小数点精度 | paymentAmount=123.456789 | 保留 2 位小数 |

---

## 六、测试数据清理

```sql
-- 清理测试数据（按顺序）
DELETE FROM directed_pay_settlement_items;
DELETE FROM directed_pay_settlements;
DELETE FROM payment_codes;
DELETE FROM directed_payment_requests;
DELETE FROM payment_category_configs;
DELETE FROM directed_pay_contracts;
DELETE FROM virtual_account_transactions;
DELETE FROM virtual_accounts;
```

---

## 七、自动化测试脚本

可以创建一个测试脚本来自动执行以上测试用例：

```bash
# 运行测试
npm run test:directed-payment
```

测试脚本位置建议：`backend/tests/directed-payment.test.ts`

---

## 八、测试报告模板

| 模块 | 测试用例数 | 通过 | 失败 | 阻塞 | 通过率 |
|------|-----------|------|------|------|--------|
| 合同管理 | 4 | | | | |
| 支付类别 | 2 | | | | |
| 支付申请 | 8 | | | | |
| 审批流程 | 4 | | | | |
| 支付执行 | 3 | | | | |
| 统计接口 | 2 | | | | |
| 利息计算 | 2 | | | | |
| **合计** | **25** | | | | |

---

*测试计划版本: v1.0*
*创建日期: 2026-01-14*
