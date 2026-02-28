import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs/promises";

// 确保上传目录存在
const uploadDir = path.resolve(process.cwd(), "backend", "uploads");

async function ensureUploadDir() {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
}

// 初始化上传目录
ensureUploadDir().catch(console.error);

// 配置 multer
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${randomUUID()}${ext}`;
    cb(null, filename);
  }
});

// 文件过滤器
const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png"
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("只允许上传 PDF、JPG、PNG 格式的文件"));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// 生成文件访问URL
export function getFileUrl(filename: string): string {
  return `/api/uploads/${filename}`;
}

// 获取文件路径
export function getFilePath(filename: string): string {
  return path.join(uploadDir, filename);
}

