# 测试 Agent D - 定向支付合同业务线（核心测试）

## 测试目标
测试定向支付合同的完整生命周期：
创建合同 → 配置支付类别 → 激活 → 从运单发起支付 → 审批流程 → 执行支付 → 利息计算 → 结算

## 环境信息
- 后端地址：http://localhost:3001
- 前端地址：http://localhost:5173
- 登录账号：admin / admin123

## 测试步骤

### 1. 登录获取 Token
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}' | jq -r '.token')

echo "Token: $TOKEN"
```

### 2. 创建资金方
```bash
FUNDER=$(curl -s -X POST http://localhost:3001/api/funders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试银行-定向支付",
    "type": "bank",
    "contactName": "钱经理",
    "contactPhone": "13800000099",
    "status": "active"
  }')

FUNDER_ID=$(echo $FUNDER | jq -r '.id')
echo "资金方ID: $FUNDER_ID"
```

### 3. 创建融资方
```bash
FINANCIER=$(curl -s -X POST http://localhost:3001/api/financiers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试物流-定向支付",
    "scale": "large",
    "contactName": "孙总",
    "contactPhone": "13900000099",
    "status": "active"
  }')

FINANCIER_ID=$(echo $FINANCIER | jq -r '.id')
echo "融资方ID: $FINANCIER_ID"
```

### 4. 创建定向支付合同
```bash
CONTRACT=$(curl -s -X POST http://localhost:3001/api/directed-pay/contracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "funderId": "'$FUNDER_ID'",
    "financierId": "'$FINANCIER_ID'",
    "creditLimit": 500000,
    "annualInterestRate": 10,
    "interestBasis": 360,
    "startDate": "2026-01-01",
    "endDate": "2026-12-31"
  }')

CONTRACT_ID=$(echo $CONTRACT | jq -r '.id')
CONTRACT_NUMBER=$(echo $CONTRACT | jq -r '.contractNumber')
echo "合同ID: $CONTRACT_ID"
echo "合同编号: $CONTRACT_NUMBER"
```

### 5. 配置支付类别

#### 5.1 运费类别（需双重审批）
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts/$CONTRACT_ID/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryCode": "FREIGHT",
    "categoryName": "运费",
    "paymentRatio": 100,
    "minAmount": 100,
    "maxAmount": 50000,
    "dailyLimit": 100000,
    "unlockStatus": "signed",
    "requirePlatformApproval": true,
    "requireFunderApproval": true,
    "platformApprovalThreshold": 10000,
    "funderApprovalThreshold": 30000
  }'
```

#### 5.2 油卡类别（仅平台审批，支付比例80%）
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts/$CONTRACT_ID/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryCode": "OIL_CARD",
    "categoryName": "油卡",
    "paymentRatio": 80,
    "minAmount": 50,
    "maxAmount": 5000,
    "unlockStatus": "dispatched",
    "requirePlatformApproval": true,
    "requireFunderApproval": false,
    "platformApprovalThreshold": 2000
  }'
```

#### 5.3 ETC类别（免审批）
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts/$CONTRACT_ID/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryCode": "ETC",
    "categoryName": "ETC",
    "paymentRatio": 100,
    "minAmount": 10,
    "maxAmount": 1000,
    "unlockStatus": "in_transit",
    "requirePlatformApproval": false,
    "requireFunderApproval": false
  }'
```

### 6. 激活合同
```bash
curl -X POST http://localhost:3001/api/directed-pay/contracts/$CONTRACT_ID/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# 验证合同状态变为 active
curl http://localhost:3001/api/directed-pay/contracts/$CONTRACT_ID \
  -H "Authorization: Bearer $TOKEN"
```

### 7. 创建测试运单
```bash
# 已签收运单（可申请运费）
WAYBILL1=$(curl -s -X POST http://localhost:3001/api/waybills \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "waybillNumber": "WB-DP-001",
    "customerId": "'$FINANCIER_ID'",
    "customerName": "测试物流-定向支付",
    "businessMode": "standard",
    "vehiclePlate": "京A00001",
    "driverName": "张三",
    "driverPhone": "13700001111",
    "departurePlace": "北京",
    "arrivalPlace": "上海",
    "goodsName": "电子产品",
    "waybillDate": "2026-01-15",
    "freightAmount": 25000,
    "oilCardAmount": 3000,
    "etcAmount": 500
  }')
WAYBILL1_ID=$(echo $WAYBILL1 | jq -r '.id')
echo "运单1 ID: $WAYBILL1_ID"

# 运输中运单（可申请ETC）
WAYBILL2=$(curl -s -X POST http://localhost:3001/api/waybills \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "waybillNumber": "WB-DP-002",
    "customerId": "'$FINANCIER_ID'",
    "customerName": "测试物流-定向支付",
    "businessMode": "standard",
    "vehiclePlate": "京A00002",
    "driverName": "李四",
    "driverPhone": "13700002222",
    "departurePlace": "广州",
    "arrivalPlace": "深圳",
    "goodsName": "日用品",
    "waybillDate": "2026-01-15",
    "freightAmount": 15000,
    "oilCardAmount": 2000,
    "etcAmount": 300
  }')
WAYBILL2_ID=$(echo $WAYBILL2 | jq -r '.id')
echo "运单2 ID: $WAYBILL2_ID"

# 已派单运单（可申请油卡）
WAYBILL3=$(curl -s -X POST http://localhost:3001/api/waybills \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "waybillNumber": "WB-DP-003",
    "customerId": "'$FINANCIER_ID'",
    "customerName": "测试物流-定向支付",
    "businessMode": "standard",
    "vehiclePlate": "京A00003",
    "driverName": "王五",
    "driverPhone": "13700003333",
    "departurePlace": "成都",
    "arrivalPlace": "重庆",
    "goodsName": "食品",
    "waybillDate": "2026-01-15",
    "freightAmount": 8000,
    "oilCardAmount": 1500,
    "etcAmount": 200
  }')
WAYBILL3_ID=$(echo $WAYBILL3 | jq -r '.id')
echo "运单3 ID: $WAYBILL3_ID"
```

### 8. 查看运单可申请的费用类别
```bash
# 已签收运单 - 应该能看到所有类别
curl http://localhost:3001/api/directed-pay/waybills/$WAYBILL1_ID/available-categories \
  -H "Authorization: Bearer $TOKEN"
# 验证：运费、油卡、ETC 都已解锁

# 运输中运单 - 应该只能看到 ETC
curl http://localhost:3001/api/directed-pay/waybills/$WAYBILL2_ID/available-categories \
  -H "Authorization: Bearer $TOKEN"
# 验证：ETC 已解锁，运费、油卡 未解锁

# 已派单运单 - 应该只能看到 油卡
curl http://localhost:3001/api/directed-pay/waybills/$WAYBILL3_ID/available-categories \
  -H "Authorization: Bearer $TOKEN"
# 验证：油卡 已解锁，运费、ETC 未解锁
```

### 9. 测试小额免审批支付（ETC）
```bash
# 创建支付申请
REQUEST1=$(curl -s -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "'$CONTRACT_ID'",
    "waybillId": "'$WAYBILL2_ID'",
    "waybillNumber": "WB-DP-002",
    "categoryCode": "ETC",
    "categoryName": "ETC",
    "paymentAmount": 300,
    "receiverType": "driver",
    "driverId": "driver001",
    "driverName": "李四",
    "driverPhone": "13700002222"
  }')
REQUEST1_ID=$(echo $REQUEST1 | jq -r '.id')
REQUEST1_STATUS=$(echo $REQUEST1 | jq -r '.status')
echo "申请1 ID: $REQUEST1_ID, 状态: $REQUEST1_STATUS"
# 验证：状态应该是 approved（免审批）

# 执行支付
curl -X POST http://localhost:3001/api/directed-pay/requests/$REQUEST1_ID/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel": "platform_direct"}'
# 验证：支付成功
```

### 10. 测试中额平台审批支付（油卡，测试支付比例）
```bash
# 创建支付申请（原始金额1500，支付比例80%，最多支付1200）
REQUEST2=$(curl -s -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "'$CONTRACT_ID'",
    "waybillId": "'$WAYBILL3_ID'",
    "waybillNumber": "WB-DP-003",
    "categoryCode": "OIL_CARD",
    "categoryName": "油卡",
    "originalAmount": 1500,
    "paymentAmount": 1500,
    "receiverType": "driver",
    "driverId": "driver003",
    "driverName": "王五",
    "driverPhone": "13700003333"
  }')
REQUEST2_ID=$(echo $REQUEST2 | jq -r '.id')
REQUEST2_STATUS=$(echo $REQUEST2 | jq -r '.status')
REQUEST2_AMOUNT=$(echo $REQUEST2 | jq -r '.paymentAmount')
echo "申请2 ID: $REQUEST2_ID, 状态: $REQUEST2_STATUS, 实际金额: $REQUEST2_AMOUNT"
# 验证：状态应该是 platform_pending，实际金额应该是 1200（被比例限制）

# 平台审批
curl -X POST http://localhost:3001/api/directed-pay/requests/$REQUEST2_ID/platform-approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"remark": "测试平台审批通过"}'

# 验证状态变为 approved（不需要资金方审批）
curl http://localhost:3001/api/directed-pay/requests/$REQUEST2_ID \
  -H "Authorization: Bearer $TOKEN"

# 执行支付
curl -X POST http://localhost:3001/api/directed-pay/requests/$REQUEST2_ID/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel": "oil_card"}'
```

### 11. 测试大额双重审批支付（运费）
```bash
# 创建支付申请
REQUEST3=$(curl -s -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "'$CONTRACT_ID'",
    "waybillId": "'$WAYBILL1_ID'",
    "waybillNumber": "WB-DP-001",
    "categoryCode": "FREIGHT",
    "categoryName": "运费",
    "paymentAmount": 40000,
    "receiverType": "driver",
    "driverId": "driver001",
    "driverName": "张三",
    "driverPhone": "13700001111"
  }')
REQUEST3_ID=$(echo $REQUEST3 | jq -r '.id')
REQUEST3_STATUS=$(echo $REQUEST3 | jq -r '.status')
echo "申请3 ID: $REQUEST3_ID, 状态: $REQUEST3_STATUS"
# 验证：状态应该是 platform_pending

# 平台审批
curl -X POST http://localhost:3001/api/directed-pay/requests/$REQUEST3_ID/platform-approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"remark": "大额运费申请，平台审批通过"}'

# 查看状态 - 应该变为 funder_pending
curl http://localhost:3001/api/directed-pay/requests/$REQUEST3_ID \
  -H "Authorization: Bearer $TOKEN"

# 资金方审批
curl -X POST http://localhost:3001/api/directed-pay/requests/$REQUEST3_ID/funder-approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"remark": "资金方审批通过"}'

# 查看状态 - 应该变为 approved
curl http://localhost:3001/api/directed-pay/requests/$REQUEST3_ID \
  -H "Authorization: Bearer $TOKEN"

# 执行支付
curl -X POST http://localhost:3001/api/directed-pay/requests/$REQUEST3_ID/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel": "bank_transfer"}'
```

### 12. 测试审批拒绝
```bash
# 创建新的支付申请
REQUEST4=$(curl -s -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "'$CONTRACT_ID'",
    "waybillId": "'$WAYBILL1_ID'",
    "waybillNumber": "WB-DP-001",
    "categoryCode": "FREIGHT",
    "categoryName": "运费",
    "paymentAmount": 5000,
    "receiverType": "driver",
    "driverId": "driver001",
    "driverName": "张三",
    "driverPhone": "13700001111"
  }')
REQUEST4_ID=$(echo $REQUEST4 | jq -r '.id')

# 平台拒绝
curl -X POST http://localhost:3001/api/directed-pay/requests/$REQUEST4_ID/platform-reject \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"remark": "测试拒绝功能"}'

# 验证状态变为 rejected
curl http://localhost:3001/api/directed-pay/requests/$REQUEST4_ID \
  -H "Authorization: Bearer $TOKEN"
```

### 13. 测试超额支付失败（关键：验证额度不会错误增加）
```bash
# 获取当前合同额度
BEFORE=$(curl -s http://localhost:3001/api/directed-pay/contracts/$CONTRACT_ID \
  -H "Authorization: Bearer $TOKEN")
BEFORE_USED=$(echo $BEFORE | jq -r '.usedAmount')
BEFORE_AVAILABLE=$(echo $BEFORE | jq -r '.availableAmount')
echo "支付前 - 已用: $BEFORE_USED, 可用: $BEFORE_AVAILABLE"

# 创建超额申请
REQUEST5=$(curl -s -X POST http://localhost:3001/api/directed-pay/requests \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "'$CONTRACT_ID'",
    "waybillId": "'$WAYBILL1_ID'",
    "waybillNumber": "WB-DP-001",
    "categoryCode": "FREIGHT",
    "categoryName": "运费",
    "paymentAmount": 999999999,
    "receiverType": "driver",
    "driverId": "driver001",
    "driverName": "张三",
    "driverPhone": "13700001111"
  }')
REQUEST5_ID=$(echo $REQUEST5 | jq -r '.id')

# Admin权限会跳过审批，直接尝试执行
curl -X POST http://localhost:3001/api/directed-pay/requests/$REQUEST5_ID/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel": "bank_transfer"}'
# 预期：返回错误"可用额度不足"

# 验证额度没有错误变化
AFTER=$(curl -s http://localhost:3001/api/directed-pay/contracts/$CONTRACT_ID \
  -H "Authorization: Bearer $TOKEN")
AFTER_USED=$(echo $AFTER | jq -r '.usedAmount')
AFTER_AVAILABLE=$(echo $AFTER | jq -r '.availableAmount')
echo "支付后 - 已用: $AFTER_USED, 可用: $AFTER_AVAILABLE"
# 关键验证：AFTER_USED 应该等于 BEFORE_USED，不能增加！
```

### 14. 查看统计数据
```bash
# 合同统计
curl http://localhost:3001/api/directed-pay/stats/contracts \
  -H "Authorization: Bearer $TOKEN"

# 支付申请统计
curl http://localhost:3001/api/directed-pay/stats/requests \
  -H "Authorization: Bearer $TOKEN"
```

### 15. 查看支付申请列表
```bash
curl "http://localhost:3001/api/directed-pay/requests" \
  -H "Authorization: Bearer $TOKEN"

# 验证：能看到所有创建的申请，状态正确
```

## 验收标准

| 测试项 | 预期结果 | 实际结果 |
|--------|----------|----------|
| 定向支付合同创建 | 成功，编号DPC开头 | |
| 支付类别配置 | 3种类别配置成功 | |
| 合同激活 | 状态变为active | |
| 运单创建 | 3条运单创建成功 | |
| 费用解锁查询 | 按状态正确显示解锁 | |
| 小额免审批 | 直接approved | |
| 支付比例限制 | 1500→1200正确 | |
| 中额平台审批 | 审批流程正确 | |
| 大额双重审批 | 两级审批正确 | |
| 审批拒绝 | rejected状态 | |
| 支付执行 | 状态success | |
| 超额失败不影响额度 | 额度不变 | |
| 统计查询 | 数据准确 | |

## 测试报告格式
```
【测试 Agent D - 定向支付合同】
测试时间：YYYY-MM-DD HH:mm
测试结果：✅ 通过 / ❌ 失败

详细结果：
1. 合同创建：✅/❌
   - ID: xxx, 编号: DPCxxx
2. 支付类别配置：✅/❌
   - 运费(双审批), 油卡(平台审批,80%), ETC(免审批)
3. 运单创建：✅/❌
   - 已签收/运输中/已派单 各1条
4. 费用解锁逻辑：✅/❌
5. 小额免审批支付：✅/❌
   - 申请→approved→success
6. 支付比例限制：✅/❌
   - 原始1500→实际1200
7. 中额平台审批：✅/❌
   - pending→platform审批→approved
8. 大额双重审批：✅/❌
   - pending→platform→funder→approved
9. 审批拒绝：✅/❌
10. 超额支付失败：✅/❌
    - 错误正确，额度无误变化

问题记录：
- （如有问题记录在此）
```
