# 测试 Agent B - 撮合业务合同业务线

## 测试目标
测试撮合业务合同的完整生命周期：创建 → 激活 → 运单关联 → 分润结算

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
```

### 2. 获取已有融资方（或创建新的）
```bash
# 获取融资方列表
curl http://localhost:3001/api/financiers \
  -H "Authorization: Bearer <TOKEN>"

# 如果没有，创建一个
curl -X POST http://localhost:3001/api/financiers \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试物流-撮合线",
    "scale": "large",
    "contactName": "王总",
    "contactPhone": "13900000002",
    "status": "active"
  }'
```

### 3. 创建撮合业务合同
```bash
curl -X POST http://localhost:3001/api/brokerage-contracts \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "financierId": "<FINANCIER_ID>",
    "profitSharingRatio": 5,
    "settlementCycle": "monthly",
    "settlementTriggerDay": 20,
    "startDate": "2026-01-01",
    "endDate": "2026-12-31",
    "commissionItems": [
      {
        "field": "freight",
        "fieldName": "运费",
        "mode": "percentage",
        "value": 5
      },
      {
        "field": "profit",
        "fieldName": "利润",
        "mode": "percentage",
        "value": 10
      }
    ]
  }'

# 记录返回的合同 ID
```

### 4. 查看撮合业务合同列表
```bash
curl http://localhost:3001/api/brokerage-contracts \
  -H "Authorization: Bearer <TOKEN>"

# 验证：
# - 合同出现在列表中
# - 合同编号格式正确（BC开头）
# - 分成比例显示正确
```

### 5. 查看合同详情
```bash
curl http://localhost:3001/api/brokerage-contracts/<CONTRACT_ID> \
  -H "Authorization: Bearer <TOKEN>"

# 验证：
# - profitSharingRatio = 5
# - commissionItems 包含2项配置
```

### 6. 创建测试运单
```bash
curl -X POST http://localhost:3001/api/waybills \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "waybillNumber": "WB-BROK-001",
    "customerId": "<FINANCIER_ID>",
    "customerName": "测试物流-撮合线",
    "businessMode": "standard",
    "vehiclePlate": "京A12345",
    "driverName": "测试司机B",
    "driverPhone": "13700000001",
    "departurePlace": "北京",
    "arrivalPlace": "上海",
    "goodsName": "测试货物",
    "waybillDate": "2026-01-15",
    "freightAmount": 10000,
    "oilCardAmount": 500,
    "etcAmount": 200
  }'
```

### 7. 查看运单列表
```bash
curl http://localhost:3001/api/waybills \
  -H "Authorization: Bearer <TOKEN>"

# 验证：运单创建成功
```

### 8. 查看业务分润结算
```bash
# 查看所有结算单（包含分润类型）
curl http://localhost:3001/api/settlements \
  -H "Authorization: Bearer <TOKEN>"

# 或查看结算统计
curl http://localhost:3001/api/settlements/stats \
  -H "Authorization: Bearer <TOKEN>"

# 验证：结算接口正常
```

## 验收标准

| 测试项 | 预期结果 | 实际结果 |
|--------|----------|----------|
| 撮合合同创建 | 成功，编号BC开头 | |
| 抽成配置保存 | 两项抽成配置正确 | |
| 合同列表查询 | 显示新创建的合同 | |
| 运单创建 | 成功关联融资方 | |
| 分润结算查询 | 接口正常返回 | |

## 测试报告格式
```
【测试 Agent B - 撮合业务合同】
测试时间：YYYY-MM-DD HH:mm
测试结果：✅ 通过 / ❌ 失败

详细结果：
1. 融资方准备：✅/❌ 
   - ID: xxx
2. 撮合合同创建：✅/❌
   - ID: xxx
   - 编号: BCxxx
3. 抽成配置：✅/❌
   - 运费抽成: 5%
   - 利润抽成: 10%
4. 运单创建：✅/❌
5. 结算查询：✅/❌

问题记录：
- （如有问题记录在此）
```
