// dotenv 必须最先加载，确保环境变量在其他模块导入前生效
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 立即加载 .env 文件
dotenv.config();

// 其他导入
import cors from "cors";
import express from "express";
import apiRouter from "./routes.js";
import { initData } from "./store.js";
import { createAiRouter } from "./aiAgent.js";
import { runMultiTenantMigration } from "./migrations/multi-tenant.js";
import { createOrgsForExistingEntities } from "./migrations/create-orgs-for-existing-entities.js";
import { createDirectedPaymentTables } from "./migrations/directed-payment-tables.js";
import { runRenameServiceRateToPaymentRatio } from "./migrations/rename-service-rate-to-payment-ratio.js";
import { runAddUnlockStatusMigration } from "./migrations/add-unlock-status.js";
import { createCrawlerTables } from "./migrations/crawler-tables.js";
import { createRevenueTables } from "./migrations/revenue-tables.js";
import { runWaybillsExtendColumnsMigration } from "./migrations/waybills-extend-columns.js";
import { createContractLoanTables } from "./migrations/contract-loan-tables.js";
import revenueRoutes from "./revenue-routes.js";
import contractLoanRoutes from "./contract-loan-routes.js";
import { startRevenueScheduler } from "./revenue-scheduler.js";
import { startScheduler, handleShutdownSignals } from "./crawler/crawler-scheduler.js";
import { startSettlementScheduler } from "./settlement-scheduler.js";
import { cleanupOldTempDirectories } from "./crawler/puppeteer-crawler.js";
process.env.DASHSCOPE_API_KEY = "sk-8018da38bc0240e082217fffc2fe4fd2";
// 注意：请将 DASHSCOPE_API_KEY 设置到 .env 文件中
if (process.env.DASHSCOPE_API_KEY) {
  console.log("DASHSCOPE_API_KEY is configured");
} else {
  console.log("⚠ DASHSCOPE_API_KEY is not set, AI agent will not work");
}

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));  // 增加请求体大小限制，支持大文件导入
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// 静态文件服务，用于访问上传的文件
app.use("/api/uploads", express.static("backend/uploads"));
app.use("/api", apiRouter);
app.use("/api", revenueRoutes);
app.use("/api", contractLoanRoutes);
app.use("/api", createAiRouter());

// 提供前端静态文件（生产环境）
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(__dirname, "../../frontend/dist");
  app.use(express.static(frontendDist));
  // SPA 路由回退到 index.html
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(frontendDist, "index.html"));
    }
  });
}

initData()
  .then(() => runMultiTenantMigration())
  .then(() => createOrgsForExistingEntities())
  .then(() => createDirectedPaymentTables())
  .then(() => runRenameServiceRateToPaymentRatio())
  .then(() => runAddUnlockStatusMigration())
  .then(() => createCrawlerTables())
  .then(() => createRevenueTables())
  .then(() => runWaybillsExtendColumnsMigration())
  .then(() => createContractLoanTables())
  .then(() => {
    // 清理旧的临时目录
    cleanupOldTempDirectories();
    
    // 启动收益计算定时任务
    startRevenueScheduler();
    
    // 启动结算调度器
    startSettlementScheduler();
    
    // 启动爬虫调度器
    startScheduler();
    
    // 处理关闭信号
    handleShutdownSignals();
    
    app.listen(port, () => {
      console.log(`API server listening at http://localhost:${port}`);
      console.log(
        `Default admin: username "admin" / password "${
          process.env.DEFAULT_ADMIN_PASSWORD || "admin123"
        }"`
      );
    });
  })
  .catch((err: unknown) => {
    console.error("Failed to initialize data", err);
    process.exit(1);
  });
