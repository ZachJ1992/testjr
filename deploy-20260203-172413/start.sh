#!/bin/bash

# 登途云 - 物流金融服务平台 启动脚本
# 使用方法: ./start.sh

set -e

echo "=== 登途云平台启动脚本 ==="

# 检查环境
if ! command -v node &> /dev/null; then
    echo "错误: 未安装 Node.js，请先安装 Node.js 22.x"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "错误: Node.js 版本过低，需要 20.x 或更高版本"
    exit 1
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "警告: 未找到 .env 配置文件"
    echo "请复制 .env.example 为 .env 并修改数据库配置"
    exit 1
fi

# 安装后端依赖
echo "正在安装后端依赖..."
cd backend
npm install --production
cd ..

# 启动后端服务
echo "正在启动后端服务..."
cd backend
npx tsx src/index.ts &
BACKEND_PID=$!
cd ..

echo "后端服务已启动 (PID: $BACKEND_PID)"

# 启动前端静态服务（可选，如果有nginx则不需要）
echo ""
echo "=== 启动完成 ==="
echo "后端 API: http://localhost:3001"
echo ""
echo "前端文件位于 ./frontend 目录"
echo "您可以使用 nginx 或其他 Web 服务器来托管前端"
echo ""
echo "示例 nginx 配置:"
echo "  server {"
echo "    listen 80;"
echo "    root /path/to/deploy/frontend;"
echo "    location /api { proxy_pass http://localhost:3001; }"
echo "  }"
echo ""
echo "按 Ctrl+C 停止服务"

wait $BACKEND_PID
