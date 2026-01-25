# 测试 Agent A - 三方融资合同业务线

## 测试目标
测试三方融资合同的完整生命周期：创建 → 激活 → 还款结算

## 环境信息
- 后端地址：http://localhost:3001
- 前端地址：http://localhost:5173
- 登录账号：admin / admin123

## 测试步骤

### 1. 登录获取 Token
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# 保存返回的 token，后续请求使用
```

### 2. 创建资金方
```bash
curl -X POST http://localhost:3001/api/funders \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "institutionName": "测试银行-融资线",
    "institutionType": "bank",
    "unifiedSocialCreditCode": "91110000MA00AAAA01",
    "contactPerson": "张经理",
    "contactPhone": "13800000001",
    "status": "active"
  }'

# 记录返回的 funder.id
```

### 3. 创建融资方
```bash
curl -X POST http://localhost:3001/api/financiers \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "enterpriseName": "测试物流-融资线",
    "unifiedSocialCreditCode": "91110000MA00BBBB01",
    "legalRepresentative": "李总",
    "businessAddress": "北京市朝阳区",
    "operatingScale": "medium",
    "initialCreditAmount": 1000000,
    "status": "active"
  }'

# 记录返回的 financier.id
```

### 4. 创建三方融资合同
```bash
# 注意：使用 /contracts/financing 端点
curl -X POST http://localhost:3001/api/contracts/financing \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "funderId": "<FUNDER_ID>",
    "financierId": "<FINANCIER_ID>",
    "creditLimit": 1000000,
    "annualInterestRate": 0.08,
    "interestCalculationMode": "daily",
    "settlementCycle": "monthly",
    "settlementTriggerDay": 25,
    "startDate": "2026-01-01",
    "endDate": "2026-12-31",
    "gracePeriodDays": 3
  }'

# 记录返回的 contract.id
```

### 5. 查看合同列表
```bash
curl http://localhost:3001/api/contracts?type=financing \
  -H "Authorization: Bearer <TOKEN>"

# 验证：
# - 合同出现在列表中
# - 状态为 active
# - 合同编号格式正确（FC开头）
```

### 6. 查看合同详情
```bash
curl http://localhost:3001/api/contracts/<CONTRACT_ID> \
  -H "Authorization: Bearer <TOKEN>"

# 验证：
# - creditLimit = 1000000
# - usedAmount = 0
# - annualInterestRate = 0.08
```

### 7. 查看结算列表
```bash
# 查看所有结算单
curl http://localhost:3001/api/settlements \
  -H "Authorization: Bearer <TOKEN>"

# 或查看结算统计
curl http://localhost:3001/api/settlements/stats \
  -H "Authorization: Bearer <TOKEN>"

# 验证：结算接口可正常获取
```

## 验收标准

| 测试项 | 预期结果 | 实际结果 |
|--------|----------|----------|
| 资金方创建 | 成功，自动创建组织 | |
| 融资方创建 | 成功，自动创建组织 | |
| 合同创建 | 成功，编号FC开头 | |
| 合同列表查询 | 显示新创建的合同 | |
| 合同详情查询 | 额度信息正确 | |
| 结算查询 | 接口正常返回 | |

## 测试报告格式
```
【测试 Agent A - 三方融资合同】
测试时间：YYYY-MM-DD HH:mm
测试结果：✅ 通过 / ❌ 失败

详细结果：
1. 资金方创建：✅/❌ 
   - ID: xxx
2. 融资方创建：✅/❌
   - ID: xxx
3. 合同创建：✅/❌
   - ID: xxx
   - 编号: FCxxx
4. 合同查询：✅/❌
5. 结算查询：✅/❌

问题记录：
- （如有问题记录在此）
```
