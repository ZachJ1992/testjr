# 多阶段构建 Dockerfile
# 使用 Docker Hub 官方镜像（通过镜像加速器加速）
# 阶段1: 构建前端
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# 复制前端相关文件
COPY frontend/package.json frontend/package-lock.json* ./frontend/
COPY shared/package.json ./shared/
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# 安装前端依赖
WORKDIR /app/frontend
RUN npm ci

# 复制前端源代码
COPY frontend/ ./
COPY shared/ ../shared/

# 构建前端
RUN npm run build

# 阶段2: 构建后端
FROM node:20-alpine AS backend-builder

WORKDIR /app

# 复制后端相关文件
COPY backend/package.json backend/package-lock.json* ./backend/
COPY shared/package.json ./shared/
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# 安装后端依赖
WORKDIR /app/backend
RUN npm ci

# 复制后端源代码
COPY backend/tsconfig.json ./
COPY backend/src/ ./src/
COPY shared/ ../shared/

# 构建后端
RUN npm run build

# 修复构建产物路径：TypeScript 保留了目录结构，需要将文件移动到正确位置
RUN if [ -d "/app/backend/dist/backend/src" ]; then \
        echo "检测到嵌套目录结构，正在修复..." && \
        mv /app/backend/dist/backend/src/* /app/backend/dist/ && \
        rm -rf /app/backend/dist/backend && \
        rm -rf /app/backend/dist/shared || true; \
    fi

# 验证构建产物是否存在
RUN test -f /app/backend/dist/index.js || (echo "Error: index.js not found in /app/backend/dist/" && find /app/backend/dist -name "*.js" && exit 1)

# 阶段3: 运行环境
FROM node:20-alpine

WORKDIR /app

# 安装生产依赖（需要 package-lock.json 才能使用 npm ci）
COPY backend/package.json backend/package-lock.json* ./backend/
COPY package.json package-lock.json* ./
WORKDIR /app/backend
RUN npm ci --omit=dev

# 复制构建产物（确保从正确的源路径复制）
# 注意：当前工作目录是 /app/backend，所以 ./dist 会复制到 /app/backend/dist
# 使用绝对路径确保复制正确
COPY --from=backend-builder /app/backend/dist /app/backend/dist
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# 复制 shared 目录（后端代码需要引用 shared 模块）
COPY --from=backend-builder /app/shared /app/shared

# 创建上传目录
RUN mkdir -p /app/backend/uploads

# 验证文件是否存在（使用绝对路径）
RUN ls -la /app/backend/dist/ && \
    test -f /app/backend/dist/index.js || (echo "ERROR: index.js not found in dist" && exit 1)

# 暴露端口
EXPOSE 3001

# 启动应用
WORKDIR /app/backend
CMD ["node", "dist/index.js"]
