import mysql from "mysql2/promise";
import dotenv from "dotenv";

// 确保环境变量加载
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST ||
        "rm-2ze1goenjfq338302.mysql.rds.aliyuncs.com",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "cmm_test",
  password: process.env.DB_PASSWORD || "2atxp8k0T7Os",
  database: process.env.DB_NAME || "testjr",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10
});
