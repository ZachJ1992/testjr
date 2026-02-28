/**
 * 爬虫调度器 - 定时执行同步任务
 * 
 * 功能：
 * 1. 定时检查需要执行的同步任务
 * 2. 文件锁机制防止并发执行
 * 3. 优雅关闭处理
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getCrawlerConfigs, updateCrawlerConfig } from './crawler-store.js';
import { syncWithPuppeteer, cleanupOldTempDirectories } from './puppeteer-crawler.js';
import type { CrawlerConfig } from './crawler-types.js';

// 锁文件路径
const LOCK_FILE = '/tmp/crawler-scheduler.lock';

// 默认检查间隔（毫秒）- 每10分钟检查一次
const DEFAULT_CHECK_INTERVAL = 10 * 60 * 1000;

// 调度器状态
const state = {
  isRunning: false,
  isShuttingDown: false,
  checkInterval: DEFAULT_CHECK_INTERVAL,
  intervalId: null as NodeJS.Timeout | null,
};

/**
 * 获取锁信息
 */
function getLockInfo(): { pid: number; timestamp: number } | null {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const content = fs.readFileSync(LOCK_FILE, 'utf-8');
      const [pid, timestamp] = content.split(':').map(Number);
      return { pid, timestamp };
    }
  } catch (e) {
    // 忽略读取错误
  }
  return null;
}

/**
 * 检查锁是否过期（超过30分钟）
 */
function isLockExpired(lockInfo: { pid: number; timestamp: number }): boolean {
  const now = Date.now();
  const lockAge = now - lockInfo.timestamp;
  return lockAge > 30 * 60 * 1000; // 30分钟
}

/**
 * 清理过期的锁
 */
function cleanupExpiredLock(): boolean {
  const lockInfo = getLockInfo();
  if (lockInfo && isLockExpired(lockInfo)) {
    try {
      fs.unlinkSync(LOCK_FILE);
      console.log(`[Scheduler] 清理过期锁文件（PID: ${lockInfo.pid}，${Math.floor((Date.now() - lockInfo.timestamp) / 1000)}秒前）`);
      return true;
    } catch (e) {
      // 忽略
    }
  }
  return false;
}

/**
 * 获取全局锁
 */
function acquireLock(): boolean {
  try {
    // 先清理过期的锁
    cleanupExpiredLock();
    
    const lockInfo = getLockInfo();
    if (lockInfo) {
      const lockAge = Math.floor((Date.now() - lockInfo.timestamp) / 1000);
      console.log(`[Scheduler] 锁被占用（PID: ${lockInfo.pid}，${lockAge}秒前），跳过执行`);
      return false;
    }
    
    // 创建锁文件
    fs.writeFileSync(LOCK_FILE, `${process.pid}:${Date.now()}`);
    return true;
  } catch (e: any) {
    console.log(`[Scheduler] 获取锁失败: ${e.message}`);
    return false;
  }
}

/**
 * 释放锁
 */
function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (e) {
    // 忽略
  }
}

/**
 * 检查配置是否需要同步
 */
function shouldSync(config: CrawlerConfig): boolean {
  if (!config.enabled) return false;
  
  const now = new Date();
  const lastSync = config.lastSyncTime ? new Date(config.lastSyncTime) : null;
  
  if (!lastSync) {
    // 从未同步过，需要同步
    return true;
  }
  
  // 检查是否超过同步间隔（默认6小时）
  const syncIntervalMs = (config.syncInterval || 360) * 60 * 1000;
  const timeSinceLastSync = now.getTime() - lastSync.getTime();
  
  return timeSinceLastSync >= syncIntervalMs;
}

/**
 * 执行同步任务
 */
async function executeSyncTask(config: CrawlerConfig): Promise<void> {
  console.log(`[Scheduler] 开始执行同步任务: ${config.name}`);
  
  try {
    // 执行同步（增加到150页以覆盖6个月数据）
    const result = await syncWithPuppeteer(config.id, 150);
    
    if (state.isShuttingDown) {
      console.log(`[Scheduler] 进程正在关闭，任务中断: ${config.name}`);
      return;
    }
    
    if (result.success) {
      console.log(`[Scheduler] 同步任务完成: ${config.name}，新增 ${result.newCount} 条，更新 ${result.updatedCount || 0} 条，跳过 ${result.skippedCount} 条`);
    } else {
      console.log(`[Scheduler] 同步任务失败: ${config.name}，错误: ${result.errors.join(', ')}`);
    }
  } catch (error: any) {
    console.error(`[Scheduler] 同步任务异常: ${config.name}，${error.message}`);
  }
}

/**
 * 检查并执行任务
 */
async function checkAndExecuteTasks(): Promise<void> {
  if (state.isShuttingDown) {
    console.log('[Scheduler] 进程正在关闭，跳过检查');
    return;
  }
  
  console.log(`[Scheduler] 检查同步任务... (${new Date().toISOString()})`);
  
  // 获取全局锁
  if (!acquireLock()) {
    console.log('[Scheduler] 无法获取全局锁，跳过本次执行');
    return;
  }
  
  try {
    const configs = await getCrawlerConfigs();
    const tasksToRun: CrawlerConfig[] = [];
    
    for (const config of configs) {
      if (shouldSync(config)) {
        const lastSync = config.lastSyncTime ? new Date(config.lastSyncTime) : null;
        const minutesSinceLastSync = lastSync 
          ? Math.floor((Date.now() - lastSync.getTime()) / 60000) 
          : Infinity;
        console.log(`[Scheduler] 配置 ${config.name} 距上次同步已过 ${minutesSinceLastSync.toFixed(1)} 分钟，需要执行`);
        tasksToRun.push(config);
      }
    }
    
    if (tasksToRun.length === 0) {
      console.log('[Scheduler] 没有需要执行的任务');
      return;
    }
    
    console.log(`[Scheduler] 发现 ${tasksToRun.length} 个需要执行的任务`);
    
    // 依次执行任务
    for (const config of tasksToRun) {
      if (state.isShuttingDown) break;
      await executeSyncTask(config);
    }
    
  } finally {
    // 释放锁
    releaseLock();
  }
}

/**
 * 启动调度器
 */
export function startScheduler(intervalMs: number = DEFAULT_CHECK_INTERVAL): void {
  if (state.isRunning) {
    console.log('[Scheduler] 调度器已经在运行');
    return;
  }
  
  state.isRunning = true;
  state.checkInterval = intervalMs;
  state.isShuttingDown = false;
  
  console.log(`[Scheduler] 启动调度器，检查间隔: ${intervalMs / 1000} 秒`);
  
  // 清理旧的临时目录
  cleanupOldTempDirectories();
  
  // 延迟5秒后首次检查
  setTimeout(() => {
    if (!state.isShuttingDown) {
      checkAndExecuteTasks();
    }
  }, 5000);
  
  // 定时检查
  state.intervalId = setInterval(() => {
    if (!state.isShuttingDown) {
      checkAndExecuteTasks();
    }
  }, intervalMs);
  
  console.log('[Scheduler] 调度器已启动');
}

/**
 * 停止调度器
 */
export function stopScheduler(): void {
  state.isShuttingDown = true;
  
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  
  state.isRunning = false;
  
  // 释放锁
  releaseLock();
  
  console.log('[Scheduler] 调度器已停止');
}

/**
 * 处理关闭信号
 */
export function handleShutdownSignals(): void {
  const shutdown = () => {
    console.log('[Scheduler] 收到关闭信号，正在优雅关闭...');
    stopScheduler();
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * 清理旧的临时用户数据目录
 */
export function cleanupOldTempUserDataDirs(): void {
  cleanupOldTempDirectories();
}
