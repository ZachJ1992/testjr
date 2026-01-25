# 测试 Agent 任务书

## 一、Agent 职责

你是「资金定向支付」功能的专职测试 Agent，负责：

1. **功能验证** - 验证各模块 API 是否按预期工作
2. **流程测试** - 验证端到端业务流程的正确性
3. **边界测试** - 测试异常情况和边界条件
4. **数据验证** - 验证数据库状态变化是否正确
5. **问题报告** - 发现问题时记录详细信息并反馈

---

## 二、系统背景

### 2.1 业务场景

这是一个**物流金融系统**，核心业务是：

```
资金方（银行/金融机构）
    ↓ 提供资金
平台（登途云物流）
    ↓ 定向支付
融资方（物流公司）的司机
```

**定向支付**的意思是：
- 资金方把钱借给融资方（物流公司）
- 但钱不直接给物流公司，而是由平台**定向支付**给司机
- 支付的是运单相关费用：运费、油卡、ETC、工资等
- 这样资金方更安全，确保钱用在了实际业务上

### 2.2 核心流程

```
┌─────────────────────────────────────────────────────────────┐
│                    资金定向支付流程                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 签约阶段                                                 │
│     资金方 + 融资方 + 平台 签订「定向支付合同」                  │
│     ├─ 约定授信额度（如 100 万）                              │
│     ├─ 约定年化利率（如 12%）                                 │
│     ├─ 约定可支付的费用类别（运费/油卡/ETC等）                  │
│     └─ 约定审批规则（金额阈值）                                │
│                                                             │
│  2. 支付阶段                                                 │
│     运单产生 → 需要支付司机费用                                │
│     ├─ 创建支付申请                                          │
│     ├─ 根据金额判断是否需要审批                                │
│     │   ├─ 小额（<1万）：免审批                               │
│     │   ├─ 中额（1-5万）：仅平台审批                           │
│     │   └─ 大额（>5万）：平台+资金方双重审批                    │
│     ├─ 审批通过后执行支付                                     │
│     └─ 扣减合同额度，开始计息                                  │
│                                                             │
│  3. 收款方式                                                 │
│     ├─ 付款码：生成码推送到 TMS，司机扫码取款                   │
│     ├─ 虚拟账户：充值到司机的虚拟账户                          │
│     ├─ 银行转账：直接打到司机银行卡                            │
│     ├─ 油卡充值：充值到指定油卡                                │
│     └─ ETC充值：充值到 ETC 账户                               │
│                                                             │
│  4. 结算阶段                                                 │
│     按结算周期（如每月25号）生成结算单                          │
│     ├─ 汇总本期所有支付                                       │
│     ├─ 计算利息（按日计息，从支付时刻起算）                      │
│     ├─ 融资方还款                                            │
│     └─ 还款后恢复合同额度                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 关键业务规则

| 规则 | 说明 |
|------|------|
| 双重审批 | 大额支付需要平台和资金方两级审批 |
| Admin 特权 | admin 用户可跳过所有审批 |
| 智能跳过 | 低于阈值的支付自动跳过审批 |
| 额度控制 | 支付金额不能超过合同可用额度 |
| 失败回滚 | 支付失败时自动恢复已扣减的额度 |
| 按日计息 | 从支付成功时刻开始，不满一天按一天算 |
| 计息基数 | 默认 360 天（可配置 365） |

---

## 三、测试环境

### 3.1 启动服务

```bash
# 进入项目目录
cd /Users/zac/Desktop/projects/jinrong/testjr-main-9b793b5608664745eeffdc2c70e618be1ac850b4

# 确保数据库运行
docker start testjr-mysql

# 启动后端（观察是否有表创建日志）
DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root DB_PASSWORD=root123 DB_NAME=testjr npm run dev:backend
```

**后端启动成功标志：**
```
=== 创建资金定向支付数据库表 ===
1. 创建 directed_pay_contracts 表...
   ✓ directed_pay_contracts 表创建完成
...
API server listening at http://localhost:3001
```

### 3.2 获取登录 Token

```bash
# 登录获取 Token
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

返回：
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "...", "username": "admin", ... }
}
```

**保存这个 token，后续所有请求都要带上。**

### 3.3 获取测试前置数据

```bash
# 获取资金方列表（需要 funderId）
curl http://localhost:3001/api/funders \
  -H "Authorization: Bearer <token>"

# 获取融资方列表（需要 financierId）
curl http://localhost:3001/api/financiers \
  -H "Authorization: Bearer <token>"
```

**如果没有数据，需要先创建资金方和融资方。**

---

## 四、测试任务

### 任务 1：数据库表验证

**目标**：验证所有定向支付相关的表已正确创建

**操作**：
```bash
# 连接数据库
docker exec -it testjr-mysql mysql -uroot -proot123 testjr

# 检查表
SHOW TABLES LIKE 'directed%';
SHOW TABLES LIKE 'payment%';
SHOW TABLES LIKE 'virtual%';
```

**预期结果**：应该看到以下 8 张表
- `directed_pay_contracts`
- `directed_pay_settlements`
- `directed_pay_settlement_items`
- `directed_payment_requests`
- `payment_category_configs`
- `payment_codes`
- `virtual_accounts`
- `virtual_account_transactions`

**检查清单**：
- [ ] 8 张表全部存在
- [ ] 表结构正确（可用 `DESC 表名;` 检查）

---

### 任务 2：合同创建与激活

**目标**：验证合同的完整生命周期

**步骤**：

**Step 1: 创建合同**
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "funderId": "<替换为实际资金方ID>",
    "financierId": "<替换为实际融资方ID>",
    "creditLimit": 1000000,
    "annualInterestRate": 0.12,
    "interestCalcBase": 360,
    "startDate": "2026-01-01",
    "endDate": "2026-12-31",
    "settlementCycle": "monthly",
    "settlementDay": 25,
    "gracePeriodDays": 3,
    "remark": "测试合同-001"
  }'
```

**验证点**：
- [ ] 返回 200
- [ ] `contractNumber` 格式为 `DPC<日期><随机码>`
- [ ] `status` = `draft`
- [ ] `availableAmount` = `creditLimit` = 1000000
- [ ] `usedAmount` = 0

**Step 2: 审批合同（激活）**
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts/<合同ID>/approve \
  -H "Authorization: Bearer <token>"
```

**验证点**：
- [ ] `status` 变为 `active`

**Step 3: 暂停合同**
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts/<合同ID>/suspend \
  -H "Authorization: Bearer <token>"
```

**验证点**：
- [ ] `status` 变为 `suspended`

**Step 4: 恢复合同**
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts/<合同ID>/resume \
  -H "Authorization: Bearer <token>"
```

**验证点**：
- [ ] `status` 变为 `active`

---

### 任务 3：支付类别配置

**目标**：验证支付类别的配置功能

**Step 1: 获取类别模板**
```bash
curl http://localhost:3001/api/directed-pay/category-templates \
  -H "Authorization: Bearer <token>"
```

**验证点**：
- [ ] 返回 8 个预设类别

**Step 2: 为合同添加运费类别**
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

**验证点**：
- [ ] 类别创建成功
- [ ] 审批阈值配置正确

**Step 3: 添加油卡类别（用于小额免审批测试）**
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts/<合同ID>/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "categoryCode": "OIL_CARD",
    "categoryName": "油卡",
    "serviceRate": 0,
    "requirePlatformApproval": false,
    "requireFunderApproval": false,
    "autoPaymentEnabled": false
  }'
```

**验证点**：
- [ ] 类别创建成功
- [ ] 审批都为 false

---

### 任务 4：支付申请审批流程（核心测试）

**目标**：验证不同金额的审批流程

#### 场景 A：小额免审批（5000 元）

```bash
curl -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "contractId": "<合同ID>",
    "categoryCode": "OIL_CARD",
    "categoryName": "油卡",
    "paymentAmount": 5000,
    "receiverType": "oil_card",
    "driverName": "测试司机-小额",
    "remark": "小额免审批测试"
  }'
```

**验证点**：
- [ ] `status` 直接为 `approved`（跳过审批）
- [ ] `platformApprovalStatus` = `approved`
- [ ] `funderApprovalStatus` = `approved`

#### 场景 B：中额仅平台审批（30000 元）

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
    "receiverBank": "工商银行",
    "remark": "中额平台审批测试"
  }'
```

**验证点**：
- [ ] `status` = `platform_pending`
- [ ] `platformApprovalStatus` = `pending`

**平台审批通过**：
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests/<申请ID>/platform-approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"remark": "测试通过"}'
```

**验证点**：
- [ ] `status` 变为 `approved`（跳过资金方审批，因为金额 < 50000）
- [ ] `platformApprovalStatus` = `approved`
- [ ] `funderApprovalStatus` = `approved`

#### 场景 C：大额双重审批（80000 元）

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
    "driverId": "test-driver-001",
    "driverName": "李四",
    "driverPhone": "13800138000",
    "remark": "大额双重审批测试"
  }'
```

**验证点**：
- [ ] `status` = `platform_pending`

**平台审批通过**：
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests/<申请ID>/platform-approve \
  -H "Authorization: Bearer <token>"
```

**验证点**：
- [ ] `status` 变为 `funder_pending`（需要资金方审批）
- [ ] `platformApprovalStatus` = `approved`
- [ ] `funderApprovalStatus` = `pending`

**资金方审批通过**：
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests/<申请ID>/funder-approve \
  -H "Authorization: Bearer <token>"
```

**验证点**：
- [ ] `status` 变为 `approved`
- [ ] `funderApprovalStatus` = `approved`

---

### 任务 5：支付执行

**目标**：验证支付执行和额度扣减

**前置条件**：使用任务 4 中已审批通过的申请

**执行支付**：
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests/<申请ID>/execute \
  -H "Authorization: Bearer <token>"
```

**验证点**：
- [ ] `status` 变为 `success`
- [ ] `executionStatus` = `success`
- [ ] `executionTransactionId` 有值
- [ ] `interestStartTime` 有值（计息开始时间）

**验证合同额度变化**：
```bash
curl http://localhost:3001/api/directed-pay/contracts/<合同ID> \
  -H "Authorization: Bearer <token>"
```

**验证点**：
- [ ] `usedAmount` 增加了支付金额
- [ ] `availableAmount` 减少了支付金额
- [ ] `usedAmount` + `availableAmount` = `creditLimit`

---

### 任务 6：支付失败回滚

**目标**：验证支付失败时额度回滚

**Step 1: 记录当前合同额度**

**Step 2: 创建一个超大金额申请（使用 Admin 跳过审批）**
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "contractId": "<合同ID>",
    "categoryCode": "FREIGHT",
    "categoryName": "运费",
    "paymentAmount": 9999999999,
    "receiverType": "bank_transfer",
    "remark": "超额测试-应该失败"
  }'
```

**Step 3: 执行支付**
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests/<申请ID>/execute \
  -H "Authorization: Bearer <token>"
```

**验证点**：
- [ ] 返回错误信息
- [ ] `status` 变为 `failed`
- [ ] `executionFailureReason` 有内容

**Step 4: 验证合同额度未变化**

**验证点**：
- [ ] `usedAmount` 和 `availableAmount` 与 Step 1 相同

---

### 任务 7：审批拒绝流程

**目标**：验证拒绝流程

**创建新申请**：
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "contractId": "<合同ID>",
    "categoryCode": "FREIGHT",
    "categoryName": "运费",
    "paymentAmount": 20000,
    "receiverType": "bank_transfer",
    "remark": "拒绝测试"
  }'
```

**平台拒绝**：
```bash
curl -X POST http://localhost:3001/api/directed-pay/requests/<申请ID>/platform-reject \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"remark": "资料不完整，请补充"}'
```

**验证点**：
- [ ] `status` = `rejected`
- [ ] `platformApprovalStatus` = `rejected`
- [ ] `platformApprovalRemark` = "资料不完整，请补充"

---

### 任务 8：统计接口验证

**目标**：验证统计数据准确性

**合同统计**：
```bash
curl http://localhost:3001/api/directed-pay/contracts/stats \
  -H "Authorization: Bearer <token>"
```

**验证点**：
- [ ] `totalCount` 与实际合同数一致
- [ ] `totalUsedAmount` 与所有成功支付金额之和一致

**支付申请统计**：
```bash
curl http://localhost:3001/api/directed-pay/stats/requests \
  -H "Authorization: Bearer <token>"
```

**验证点**：
- [ ] 各状态数量与实际一致
- [ ] `totalPaidAmount` 与所有成功支付金额之和一致

---

## 五、测试报告格式

完成测试后，请按以下格式提交报告：

```markdown
# 资金定向支付功能测试报告

## 测试概况
- 测试时间：YYYY-MM-DD HH:MM
- 测试环境：本地开发环境
- 测试人员：Testing Agent

## 测试结果汇总

| 任务 | 测试项数 | 通过 | 失败 | 阻塞 |
|------|---------|------|------|------|
| 任务1: 数据库表验证 | 2 | | | |
| 任务2: 合同创建与激活 | 4 | | | |
| 任务3: 支付类别配置 | 3 | | | |
| 任务4: 审批流程 | 8 | | | |
| 任务5: 支付执行 | 4 | | | |
| 任务6: 失败回滚 | 3 | | | |
| 任务7: 审批拒绝 | 2 | | | |
| 任务8: 统计接口 | 2 | | | |
| **合计** | **28** | | | |

## 发现的问题

### 问题 1：[问题标题]
- **严重级别**：高/中/低
- **重现步骤**：
  1. ...
  2. ...
- **预期结果**：...
- **实际结果**：...
- **相关日志**：
  ```
  ...
  ```

## 测试通过的截图/日志

[粘贴关键测试通过的响应]

## 建议

[如有改进建议请列出]
```

---

## 六、常见问题排查

### Q1: 后端启动报错 "Cannot find module"

**解决**：确保在项目根目录运行，且已执行 `npm install`

### Q2: 数据库连接失败

**解决**：
```bash
# 检查 Docker 容器状态
docker ps -a | grep mysql

# 如果没运行，启动它
docker start testjr-mysql
```

### Q3: API 返回 401 Unauthorized

**解决**：Token 可能过期，重新登录获取新 Token

### Q4: 创建合同报错 "外键约束失败"

**解决**：确保 `funderId` 和 `financierId` 是真实存在的 ID

### Q5: 找不到资金方/融资方

**解决**：先通过前端创建，或使用以下 API：
```bash
# 创建资金方
curl -X POST http://localhost:3001/api/funders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "institutionName": "测试银行",
    "institutionType": "bank",
    "unifiedSocialCreditCode": "91110000MA00000000"
  }'

# 创建融资方
curl -X POST http://localhost:3001/api/financiers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "enterpriseName": "测试物流公司",
    "unifiedSocialCreditCode": "91110000MA11111111",
    "legalRepresentative": "张三",
    "businessAddress": "北京市",
    "operatingScale": "medium"
  }'
```

---

## 七、测试数据清理

测试完成后，如需清理数据：

```sql
-- 连接数据库
docker exec -it testjr-mysql mysql -uroot -proot123 testjr

-- 按顺序删除（注意外键依赖）
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

*任务书版本: v1.0*
*创建日期: 2026-01-14*
