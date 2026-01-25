#!/bin/bash

# 检查容器内文件结构的诊断脚本

echo "=== 检查容器内文件结构 ==="
echo ""

# 检查容器是否存在
if ! docker ps -a | grep -q testapp; then
    echo "错误: 容器 testapp 不存在"
    exit 1
fi

echo "1. 检查容器状态:"
docker ps -a | grep testapp
echo ""

echo "2. 检查 /app 目录结构:"
docker exec testapp ls -la /app/ 2>/dev/null || echo "无法访问容器"
echo ""

echo "3. 检查 /app/backend 目录结构:"
docker exec testapp ls -la /app/backend/ 2>/dev/null || echo "无法访问容器"
echo ""

echo "4. 检查 dist 目录是否存在:"
docker exec testapp ls -la /app/backend/dist/ 2>/dev/null || echo "dist 目录不存在或为空"
echo ""

echo "5. 检查 index.js 是否存在:"
docker exec testapp ls -la /app/backend/dist/index.js 2>/dev/null || echo "index.js 不存在"
echo ""

echo "6. 检查前端 dist 目录:"
docker exec testapp ls -la /app/frontend/dist/ 2>/dev/null || echo "frontend/dist 目录不存在"
echo ""

echo "7. 查看容器日志（最后 20 行）:"
docker logs --tail 20 testapp 2>/dev/null || echo "无法获取日志"
echo ""

echo "=== 诊断完成 ==="
