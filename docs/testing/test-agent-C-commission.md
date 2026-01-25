# 测试 Agent C - 抽成合同业务线

## 测试目标
测试抽成合同的完整生命周期：创建 → 配置抽成对象 → 激活

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
    "name": "测试物流-抽成线",
    "scale": "small",
    "contactName": "赵总",
    "contactPhone": "13900000003",
    "status": "active"
  }'
```

### 3. 创建抽成合同
```bash
curl -X POST http://localhost:3001/api/commission-contracts \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "financierId": "<FINANCIER_ID>",
    "name": "测试抽成合同",
    "startDate": "2026-01-01",
    "endDate": "2026-12-31",
    "settlementCycle": "monthly",
    "commissionConfig": [
      {
        "targetField": "etc_fee",
        "targetFieldName": "ETC费用",
        "mode": "percentage",
        "value": 3
      },
      {
        "targetField": "insurance_fee",
        "targetFieldName": "保险费",
        "mode": "fixed",
        "value": 50
      }
    ]
  }'

# 记录返回的合同 ID
```

### 4. 查看抽成合同列表
```bash
curl http://localhost:3001/api/commission-contracts \
  -H "Authorization: Bearer <TOKEN>"

# 验证：
# - 合同出现在列表中
# - 合同编号格式正确
# - 状态显示正确
```

### 5. 查看合同详情
```bash
curl http://localhost:3001/api/commission-contracts/<CONTRACT_ID> \
  -H "Authorization: Bearer <TOKEN>"

# 验证：
# - 名称正确
# - commissionConfig 包含2项配置
```

### 6. 更新抽成合同
```bash
curl -X PUT http://localhost:3001/api/commission-contracts/<CONTRACT_ID> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试抽成合同-已更新",
    "commissionConfig": [
      {
        "targetField": "etc_fee",
        "targetFieldName": "ETC费用",
        "mode": "percentage",
        "value": 5
      },
      {
        "targetField": "insurance_fee",
        "targetFieldName": "保险费",
        "mode": "fixed",
        "value": 100
      },
      {
        "targetField": "toll_fee",
        "targetFieldName": "路桥费",
        "mode": "percentage",
        "value": 2
      }
    ]
  }'

# 验证：更新成功
```

### 7. 再次查看合同详情确认更新
```bash
curl http://localhost:3001/api/commission-contracts/<CONTRACT_ID> \
  -H "Authorization: Bearer <TOKEN>"

# 验证：
# - 名称已更新
# - 抽成配置已变为3项
```

### 8. 获取合同统计
```bash
curl http://localhost:3001/api/commission-contracts/stats \
  -H "Authorization: Bearer <TOKEN>"

# 验证：统计数据正确
```

## 验收标准

| 测试项 | 预期结果 | 实际结果 |
|--------|----------|----------|
| 抽成合同创建 | 成功 | |
| 抽成配置保存 | 两项配置正确 | |
| 合同列表查询 | 显示新创建的合同 | |
| 合同更新 | 名称和配置均更新 | |
| 统计查询 | 接口正常返回 | |

## 测试报告格式
```
【测试 Agent C - 抽成合同】
测试时间：YYYY-MM-DD HH:mm
测试结果：✅ 通过 / ❌ 失败

详细结果：
1. 融资方准备：✅/❌ 
   - ID: xxx
2. 抽成合同创建：✅/❌
   - ID: xxx
3. 抽成配置：✅/❌
   - ETC费用: 3% → 5%
   - 保险费: 50元 → 100元
   - 路桥费: (新增) 2%
4. 合同更新：✅/❌
5. 统计查询：✅/❌

问题记录：
- （如有问题记录在此）
```
