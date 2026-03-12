/**
 * 一次性迁移：精简后端真实 API 表的测试数据
 *
 * 规则：
 * - 表内有数据：按状态分组，每种状态只保留最新 3 条，删除多余
 * - 表内无数据：按状态各生成 1 条示例
 *
 * 涉及表（仅限截图中页面）：
 * - directed_payment_requests（支付申请、待审批）
 * - settlements（融资还款结算、结算仪表板）
 * - directed_pay_settlements（定向支付结算、结算仪表板）
 */

import { pool } from "../db.js";
import { randomUUID } from "crypto";
import { RowDataPacket } from "mysql2";

function uuid(): string { return randomUUID(); }

async function tableHasData(table: string): Promise<boolean> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT 1 FROM \`${table}\` LIMIT 1`);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function trimByStatus(table: string, statusColumn: string, keepMax: number): Promise<number> {
  let totalDeleted = 0;
  const [statuses] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT \`${statusColumn}\` AS s FROM \`${table}\``
  );
  for (const row of statuses) {
    const status = row.s;
    const [excess] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM \`${table}\` WHERE \`${statusColumn}\` = ? ORDER BY created_at DESC LIMIT 999 OFFSET ?`,
      [status, 1]
    );
    if (excess.length > 0) {
      const ids = excess.map((r: any) => r.id);
      await pool.query(`DELETE FROM \`${table}\` WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
      totalDeleted += excess.length;
    }
  }
  return totalDeleted;
}

export async function trimTestData(): Promise<void> {
  console.log("[MIGRATION] 检查测试数据精简...");

  try {
    const [columns] = await pool.query<RowDataPacket[]>(
      "SHOW COLUMNS FROM contracts LIKE 'test_data_trimmed'"
    );
    if (columns.length > 0) {
      console.log("[MIGRATION] 测试数据已精简过，跳过");
      return;
    }

    // ==================== 1. directed_payment_requests ====================
    const hasPaymentReqs = await tableHasData("directed_payment_requests");
    if (hasPaymentReqs) {
      const deleted = await trimByStatus("directed_payment_requests", "status", 3);
      console.log(`[MIGRATION] directed_payment_requests: 删除 ${deleted} 条多余数据`);
    } else {
      console.log("[MIGRATION] directed_payment_requests: 无数据，生成示例...");
      // 查找可用的定向支付合同
      const [dpcs] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM directed_pay_contracts WHERE deleted_at IS NULL LIMIT 1"
      );
      const contractId = dpcs[0]?.id || null;

      const statuses = [
        { status: "pending",          platApproval: "pending",  funderApproval: "pending"  },
        { status: "platform_pending", platApproval: "pending",  funderApproval: "pending"  },
        { status: "funder_pending",   platApproval: "approved", funderApproval: "pending"  },
        { status: "approved",         platApproval: "approved", funderApproval: "approved" },
        { status: "success",          platApproval: "approved", funderApproval: "approved" },
        { status: "rejected",         platApproval: "rejected", funderApproval: "pending"  },
        { status: "failed",           platApproval: "approved", funderApproval: "approved" },
        { status: "cancelled",        platApproval: "pending",  funderApproval: "pending"  },
      ];
      for (let i = 0; i < statuses.length; i++) {
        const s = statuses[i];
        await pool.query(
          `INSERT INTO directed_payment_requests
           (id, request_number, contract_id, category_code, category_name,
            payment_amount, service_fee, receiver_type, receiver_name, receiver_account, receiver_bank,
            driver_name, driver_phone, status, platform_approval_status, funder_approval_status,
            created_at, updated_at)
           VALUES (?,?,?,?,?, ?,?,'bank_transfer',?,?,?, ?,?,?,?,?, NOW(), NOW())`,
          [
            uuid(), `DPR2026030${i + 1}0001`, contractId, "FREIGHT", "运费",
            15000 + i * 5000, 300 + i * 100,
            `司机${i + 1}`, `6228****${String(1000 + i).padStart(4, "0")}`, "中国银行",
            `司机${i + 1}`, `1380000${String(1000 + i).padStart(4, "0")}`,
            s.status, s.platApproval, s.funderApproval,
          ]
        );
      }
      console.log(`[MIGRATION] directed_payment_requests: 生成 ${statuses.length} 条`);
    }

    // ==================== 2. settlements ====================
    const hasSettlements = await tableHasData("settlements");
    if (hasSettlements) {
      const deleted = await trimByStatus("settlements", "status", 3);
      console.log(`[MIGRATION] settlements: 删除 ${deleted} 条多余数据`);
    } else {
      console.log("[MIGRATION] settlements: 无数据，生成示例...");
      const [fcs] = await pool.query<RowDataPacket[]>(
        "SELECT id, logistics_provider_name FROM contracts WHERE type = 'financing' LIMIT 1"
      );
      const [fins] = await pool.query<RowDataPacket[]>(
        "SELECT id, enterprise_name FROM financiers WHERE deleted_at IS NULL LIMIT 1"
      );
      const contractId = fcs[0]?.id || uuid();
      const customerId = fins[0]?.id || uuid();
      const customerName = fins[0]?.enterprise_name || "测试融资方";

      const seeds = [
        { type: "financing_repayment", status: "pending",   repType: "principal", principal: 500000, interest: 0,     totalDue: 500000, dueDate: "2026-03-15" },
        { type: "financing_repayment", status: "confirmed", repType: "interest",  principal: 0,      interest: 32000, totalDue: 32000,  dueDate: "2026-02-15" },
        { type: "financing_repayment", status: "settled",   repType: "principal", principal: 300000, interest: 18000, totalDue: 318000, dueDate: "2026-01-15" },
        { type: "financing_repayment", status: "overdue",   repType: "interest",  principal: 0,      interest: 45000, totalDue: 45000,  dueDate: "2026-02-10" },
      ];
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        await pool.query(
          `INSERT INTO settlements
           (id, settlement_number, type, contract_id, contract_type, customer_id, customer_name,
            period_start, period_end, repayment_type, principal, interest, total_due,
            status, due_date, settled_date, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?, NOW(), NOW())`,
          [
            uuid(), `STLFR2026${String(i + 1).padStart(4, "0")}`, s.type,
            contractId, "financing", customerId, customerName,
            "2026-02-01", "2026-02-28", s.repType, s.principal, s.interest, s.totalDue,
            s.status, s.dueDate, s.status === "settled" ? "2026-01-12" : null,
          ]
        );
      }
      console.log(`[MIGRATION] settlements: 生成 ${seeds.length} 条`);
    }

    // ==================== 3. directed_pay_settlements ====================
    const hasDpSettlements = await tableHasData("directed_pay_settlements");
    if (hasDpSettlements) {
      const deleted = await trimByStatus("directed_pay_settlements", "status", 3);
      console.log(`[MIGRATION] directed_pay_settlements: 删除 ${deleted} 条多余数据`);
    } else {
      console.log("[MIGRATION] directed_pay_settlements: 无数据，生成示例...");
      const [dpcs] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM directed_pay_contracts WHERE deleted_at IS NULL LIMIT 1"
      );
      const dpContractId = dpcs[0]?.id || uuid();

      const seeds = [
        { status: "pending",      principal: 85000,  interest: 2500, service: 1700, dueDate: "2026-03-15", paidAmount: 0 },
        { status: "confirmed",    principal: 120000, interest: 3800, service: 2400, dueDate: "2026-03-10", paidAmount: 0 },
        { status: "partial_paid", principal: 95000,  interest: 2800, service: 1900, dueDate: "2026-02-28", paidAmount: 50000 },
        { status: "paid",         principal: 150000, interest: 4500, service: 3000, dueDate: "2026-02-15", paidAmount: 157500 },
        { status: "overdue",      principal: 78000,  interest: 2200, service: 1560, dueDate: "2026-02-01", paidAmount: 0 },
      ];
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        const total = s.principal + s.interest + s.service;
        await pool.query(
          `INSERT INTO directed_pay_settlements
           (id, settlement_number, contract_id, period_start, period_end,
            payment_count, principal_amount, interest_amount, service_amount, total_amount,
            due_date, actual_paid_amount, paid_at, status, created_at, updated_at)
           VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, NOW(), NOW())`,
          [
            uuid(), `DPS2026${String(i + 1).padStart(4, "0")}`, dpContractId,
            "2026-02-01", "2026-02-28",
            3 + i, s.principal, s.interest, s.service, total,
            s.dueDate, s.paidAmount, s.status === "paid" ? "2026-02-13 16:30:00" : null, s.status,
          ]
        );
      }
      console.log(`[MIGRATION] directed_pay_settlements: 生成 ${seeds.length} 条`);
    }

    // ==================== 4. 标记完成 ====================
    await pool.query(`
      ALTER TABLE contracts
      ADD COLUMN test_data_trimmed TINYINT(1) DEFAULT 1
      COMMENT '测试数据精简标记 v1'
    `);

    console.log("[MIGRATION] 测试数据精简完成");
  } catch (error: any) {
    console.error("[MIGRATION] 测试数据精简失败:", error.message);
    throw error;
  }
}
