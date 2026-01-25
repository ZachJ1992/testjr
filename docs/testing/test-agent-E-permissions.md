# 测试 Agent E - 数据权限与系统管理

## 测试目标
测试多租户数据隔离和权限控制：
- 组织创建与用户关联
- 融资方用户只能看自己的数据
- 资金方用户看相关合同数据
- 平台用户看全部数据

## 环境信息
- 后端地址：http://localhost:3001
- 前端地址：http://localhost:5173
- 管理员账号：admin / admin123

## 前置条件
需要先运行 Agent A/B/D 创建基础数据（资金方、融资方、合同、支付申请）

## 测试步骤

### 1. 使用管理员登录获取 Token
```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}' | jq -r '.token')

echo "Admin Token: $ADMIN_TOKEN"
```

### 2. 获取现有组织列表
```bash
curl http://localhost:3001/api/orgs \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 记录融资方和资金方的组织ID
# 融资方组织: type = "financier"
# 资金方组织: type = "funder"
```

### 3. 在融资方组织下创建用户
```bash
# 获取融资方组织ID（type=financier）
FINANCIER_ORG_ID="<FINANCIER_ORG_ID>"

curl -X POST http://localhost:3001/api/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "financier_test",
    "password": "test123456",
    "name": "融资方测试用户",
    "email": "financier@test.com",
    "orgId": "'$FINANCIER_ORG_ID'",
    "roles": ["user"]
  }'

# 验证：用户创建成功
```

### 4. 在资金方组织下创建用户
```bash
# 获取资金方组织ID（type=funder）
FUNDER_ORG_ID="<FUNDER_ORG_ID>"

curl -X POST http://localhost:3001/api/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "funder_test",
    "password": "test123456",
    "name": "资金方测试用户",
    "email": "funder@test.com",
    "orgId": "'$FUNDER_ORG_ID'",
    "roles": ["user"]
  }'

# 验证：用户创建成功
```

### 5. 使用融资方用户登录
```bash
FINANCIER_TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "financier_test", "password": "test123456"}' | jq -r '.token')

echo "Financier Token: $FINANCIER_TOKEN"
```

### 6. 融资方用户查看支付申请
```bash
curl http://localhost:3001/api/directed-pay/requests \
  -H "Authorization: Bearer $FINANCIER_TOKEN"

# 验证：
# - 只能看到自己组织相关的支付申请
# - 看不到其他融资方的申请
```

### 7. 融资方用户查看支付统计
```bash
curl http://localhost:3001/api/directed-pay/stats/requests \
  -H "Authorization: Bearer $FINANCIER_TOKEN"

# 验证：统计数据只包含自己组织的
```

### 8. 使用资金方用户登录
```bash
FUNDER_TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "funder_test", "password": "test123456"}' | jq -r '.token')

echo "Funder Token: $FUNDER_TOKEN"
```

### 9. 资金方用户查看支付申请
```bash
curl http://localhost:3001/api/directed-pay/requests \
  -H "Authorization: Bearer $FUNDER_TOKEN"

# 验证：
# - 只能看到与自己有合同关系的支付申请
# - 看不到其他资金方合同下的申请
```

### 10. 资金方用户查看待审批
```bash
curl http://localhost:3001/api/directed-pay/requests/pending-approvals \
  -H "Authorization: Bearer $FUNDER_TOKEN"

# 验证：只能看到需要自己审批的申请
```

### 11. 对比测试：管理员看全部数据
```bash
# 管理员看支付申请
curl http://localhost:3001/api/directed-pay/requests \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# 验证：能看到所有申请

# 管理员看统计
curl http://localhost:3001/api/directed-pay/stats/requests \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# 验证：统计包含所有数据
```

### 12. 测试权限控制：融资方用户尝试审批
```bash
# 获取一个需要审批的申请ID
REQUEST_ID="<REQUEST_ID>"

# 融资方用户尝试平台审批（应该失败）
curl -X POST http://localhost:3001/api/directed-pay/requests/$REQUEST_ID/platform-approve \
  -H "Authorization: Bearer $FINANCIER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"remark": "测试越权"}'

# 验证：返回权限不足错误
```

### 13. 测试组织管理
```bash
# 查看组织详情
curl http://localhost:3001/api/orgs/$FINANCIER_ORG_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 验证：
# - type = "financier"
# - relatedEntityId 指向融资方ID
# - 关联的用户列表正确
```

### 14. 测试用户列表
```bash
curl http://localhost:3001/api/users \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 验证：能看到所有用户及其组织归属
```

### 15. 测试权限列表
```bash
curl http://localhost:3001/api/permissions \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 验证：包含定向支付相关权限
# - create_directed_payment
# - approve_directed_payment_platform
# - approve_directed_payment_funder
```

## 验收标准

| 测试项 | 预期结果 | 实际结果 |
|--------|----------|----------|
| 组织列表查询 | 包含funder/financier类型 | |
| 融资方用户创建 | 关联正确组织 | |
| 资金方用户创建 | 关联正确组织 | |
| 融资方数据隔离 | 只看自己组织数据 | |
| 资金方数据隔离 | 只看相关合同数据 | |
| 管理员全局视图 | 看到所有数据 | |
| 越权操作拦截 | 返回权限错误 | |

## 测试报告格式
```
【测试 Agent E - 数据权限与系统管理】
测试时间：YYYY-MM-DD HH:mm
测试结果：✅ 通过 / ❌ 失败

详细结果：
1. 融资方组织用户创建：✅/❌
   - 用户: financier_test
   - 组织: xxx
2. 资金方组织用户创建：✅/❌
   - 用户: funder_test
   - 组织: xxx
3. 融资方数据隔离测试：✅/❌
   - 只能看到 N 条自己的申请
4. 资金方数据隔离测试：✅/❌
   - 只能看到 M 条相关申请
5. 管理员全局视图：✅/❌
   - 能看到全部 X 条申请
6. 越权操作测试：✅/❌
   - 正确拦截越权审批

问题记录：
- （如有问题记录在此）
```
