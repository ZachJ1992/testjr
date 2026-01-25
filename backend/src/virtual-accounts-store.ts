import { randomUUID } from "crypto";
import { pool } from "./db.js";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

// 类型定义
export type AccountOwnerType = "driver" | "financier" | "platform";
export type AccountStatus = "active" | "frozen" | "closed";
export type TransactionType = "credit" | "debit" | "freeze" | "unfreeze" | "withdraw";

export interface VirtualAccount {
  id: string;
  accountNumber: string;
  ownerType: AccountOwnerType;
  ownerId: string;
  ownerName: string;
  balance: number;
  frozenAmount: number;
  totalIncome: number;
  totalExpense: number;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VirtualAccountTransaction {
  id: string;
  transactionNumber: string;
  accountId: string;
  txnType: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  relatedType?: string;
  relatedId?: string;
  remark?: string;
  createdAt: string;
}

type VirtualAccountRow = RowDataPacket & {
  id: string;
  account_number: string;
  owner_type: string;
  owner_id: string;
  owner_name: string;
  balance: string;
  frozen_amount: string;
  total_income: string;
  total_expense: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type VirtualAccountTransactionRow = RowDataPacket & {
  id: string;
  transaction_number: string;
  account_id: string;
  txn_type: string;
  amount: string;
  balance_before: string;
  balance_after: string;
  related_type: string | null;
  related_id: string | null;
  remark: string | null;
  created_at: Date;
};

// 生成账户号
function generateAccountNumber(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VA${timestamp}${random}`;
}

// 生成流水号
function generateTransactionNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TXN${date}${random}`;
}

// 转换数据库行到虚拟账户对象
function rowToVirtualAccount(row: VirtualAccountRow): VirtualAccount {
  return {
    id: row.id,
    accountNumber: row.account_number,
    ownerType: row.owner_type as AccountOwnerType,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    balance: parseFloat(row.balance),
    frozenAmount: parseFloat(row.frozen_amount),
    totalIncome: parseFloat(row.total_income),
    totalExpense: parseFloat(row.total_expense),
    status: row.status as AccountStatus,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

// 转换数据库行到交易对象
function rowToTransaction(row: VirtualAccountTransactionRow): VirtualAccountTransaction {
  return {
    id: row.id,
    transactionNumber: row.transaction_number,
    accountId: row.account_id,
    txnType: row.txn_type as TransactionType,
    amount: parseFloat(row.amount),
    balanceBefore: parseFloat(row.balance_before),
    balanceAfter: parseFloat(row.balance_after),
    relatedType: row.related_type ?? undefined,
    relatedId: row.related_id ?? undefined,
    remark: row.remark ?? undefined,
    createdAt: row.created_at.toISOString()
  };
}

// 创建虚拟账户
export async function createVirtualAccount(input: {
  ownerType: AccountOwnerType;
  ownerId: string;
  ownerName: string;
}): Promise<VirtualAccount> {
  // 检查是否已存在
  const existing = await getVirtualAccountByOwner(input.ownerType, input.ownerId);
  if (existing) {
    throw new Error("该用户已有虚拟账户");
  }

  const id = randomUUID();
  const accountNumber = generateAccountNumber();

  await pool.query(
    `INSERT INTO virtual_accounts (id, account_number, owner_type, owner_id, owner_name, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [id, accountNumber, input.ownerType, input.ownerId, input.ownerName]
  );

  const account = await getVirtualAccountById(id);
  if (!account) throw new Error("创建虚拟账户失败");
  return account;
}

// 根据ID获取账户
export async function getVirtualAccountById(id: string): Promise<VirtualAccount | undefined> {
  const [rows] = await pool.query<VirtualAccountRow[]>(
    `SELECT * FROM virtual_accounts WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (rows.length === 0) return undefined;
  return rowToVirtualAccount(rows[0]);
}

// 根据所有者获取账户
export async function getVirtualAccountByOwner(
  ownerType: AccountOwnerType,
  ownerId: string
): Promise<VirtualAccount | undefined> {
  const [rows] = await pool.query<VirtualAccountRow[]>(
    `SELECT * FROM virtual_accounts WHERE owner_type = ? AND owner_id = ? AND deleted_at IS NULL`,
    [ownerType, ownerId]
  );
  if (rows.length === 0) return undefined;
  return rowToVirtualAccount(rows[0]);
}

// 获取账户列表
export async function getVirtualAccounts(filters?: {
  ownerType?: AccountOwnerType;
  status?: AccountStatus;
  keyword?: string;
}): Promise<VirtualAccount[]> {
  let sql = `SELECT * FROM virtual_accounts WHERE deleted_at IS NULL`;
  const params: any[] = [];

  if (filters?.ownerType) {
    sql += ` AND owner_type = ?`;
    params.push(filters.ownerType);
  }
  if (filters?.status) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }
  if (filters?.keyword) {
    sql += ` AND (owner_name LIKE ? OR account_number LIKE ?)`;
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
  }

  sql += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<VirtualAccountRow[]>(sql, params);
  return rows.map(rowToVirtualAccount);
}

// 入账（充值/收款）
export async function creditAccount(
  accountId: string,
  amount: number,
  relatedType?: string,
  relatedId?: string,
  remark?: string
): Promise<VirtualAccountTransaction> {
  if (amount <= 0) throw new Error("入账金额必须大于0");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 锁定账户记录
    const [accountRows] = await connection.query<VirtualAccountRow[]>(
      `SELECT * FROM virtual_accounts WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [accountId]
    );
    if (accountRows.length === 0) {
      throw new Error("账户不存在");
    }
    const account = accountRows[0];

    if (account.status !== 'active') {
      throw new Error("账户状态不允许入账");
    }

    const balanceBefore = parseFloat(account.balance);
    const balanceAfter = balanceBefore + amount;
    const totalIncome = parseFloat(account.total_income) + amount;

    // 2. 更新余额
    await connection.query(
      `UPDATE virtual_accounts SET balance = ?, total_income = ?, updated_at = NOW() WHERE id = ?`,
      [balanceAfter, totalIncome, accountId]
    );

    // 3. 记录流水
    const txnId = randomUUID();
    const txnNumber = generateTransactionNumber();
    await connection.query(
      `INSERT INTO virtual_account_transactions 
       (id, transaction_number, account_id, txn_type, amount, balance_before, balance_after, related_type, related_id, remark)
       VALUES (?, ?, ?, 'credit', ?, ?, ?, ?, ?, ?)`,
      [txnId, txnNumber, accountId, amount, balanceBefore, balanceAfter, relatedType ?? null, relatedId ?? null, remark ?? null]
    );

    await connection.commit();

    const [txnRows] = await pool.query<VirtualAccountTransactionRow[]>(
      `SELECT * FROM virtual_account_transactions WHERE id = ?`,
      [txnId]
    );
    return rowToTransaction(txnRows[0]);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// 出账（扣款/消费）
export async function debitAccount(
  accountId: string,
  amount: number,
  relatedType?: string,
  relatedId?: string,
  remark?: string
): Promise<VirtualAccountTransaction> {
  if (amount <= 0) throw new Error("出账金额必须大于0");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 锁定账户记录
    const [accountRows] = await connection.query<VirtualAccountRow[]>(
      `SELECT * FROM virtual_accounts WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [accountId]
    );
    if (accountRows.length === 0) {
      throw new Error("账户不存在");
    }
    const account = accountRows[0];

    if (account.status !== 'active') {
      throw new Error("账户状态不允许出账");
    }

    const balanceBefore = parseFloat(account.balance);
    const frozenAmount = parseFloat(account.frozen_amount);
    const availableBalance = balanceBefore - frozenAmount;

    // 2. 检查余额是否充足
    if (availableBalance < amount) {
      throw new Error(`可用余额不足，当前可用: ${availableBalance}，需要: ${amount}`);
    }

    const balanceAfter = balanceBefore - amount;
    const totalExpense = parseFloat(account.total_expense) + amount;

    // 3. 更新余额
    await connection.query(
      `UPDATE virtual_accounts SET balance = ?, total_expense = ?, updated_at = NOW() WHERE id = ?`,
      [balanceAfter, totalExpense, accountId]
    );

    // 4. 记录流水
    const txnId = randomUUID();
    const txnNumber = generateTransactionNumber();
    await connection.query(
      `INSERT INTO virtual_account_transactions 
       (id, transaction_number, account_id, txn_type, amount, balance_before, balance_after, related_type, related_id, remark)
       VALUES (?, ?, ?, 'debit', ?, ?, ?, ?, ?, ?)`,
      [txnId, txnNumber, accountId, amount, balanceBefore, balanceAfter, relatedType ?? null, relatedId ?? null, remark ?? null]
    );

    await connection.commit();

    const [txnRows] = await pool.query<VirtualAccountTransactionRow[]>(
      `SELECT * FROM virtual_account_transactions WHERE id = ?`,
      [txnId]
    );
    return rowToTransaction(txnRows[0]);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// 冻结资金
export async function freezeAmount(
  accountId: string,
  amount: number,
  relatedType?: string,
  relatedId?: string,
  remark?: string
): Promise<VirtualAccountTransaction> {
  if (amount <= 0) throw new Error("冻结金额必须大于0");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 锁定账户记录
    const [accountRows] = await connection.query<VirtualAccountRow[]>(
      `SELECT * FROM virtual_accounts WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [accountId]
    );
    if (accountRows.length === 0) {
      throw new Error("账户不存在");
    }
    const account = accountRows[0];

    const balance = parseFloat(account.balance);
    const frozenAmount = parseFloat(account.frozen_amount);
    const availableBalance = balance - frozenAmount;

    // 2. 检查可用余额是否充足
    if (availableBalance < amount) {
      throw new Error(`可用余额不足，当前可用: ${availableBalance}，需要冻结: ${amount}`);
    }

    const newFrozenAmount = frozenAmount + amount;

    // 3. 更新冻结金额
    await connection.query(
      `UPDATE virtual_accounts SET frozen_amount = ?, updated_at = NOW() WHERE id = ?`,
      [newFrozenAmount, accountId]
    );

    // 4. 记录流水
    const txnId = randomUUID();
    const txnNumber = generateTransactionNumber();
    await connection.query(
      `INSERT INTO virtual_account_transactions 
       (id, transaction_number, account_id, txn_type, amount, balance_before, balance_after, related_type, related_id, remark)
       VALUES (?, ?, ?, 'freeze', ?, ?, ?, ?, ?, ?)`,
      [txnId, txnNumber, accountId, amount, balance, balance, relatedType ?? null, relatedId ?? null, remark ?? null]
    );

    await connection.commit();

    const [txnRows] = await pool.query<VirtualAccountTransactionRow[]>(
      `SELECT * FROM virtual_account_transactions WHERE id = ?`,
      [txnId]
    );
    return rowToTransaction(txnRows[0]);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// 解冻资金
export async function unfreezeAmount(
  accountId: string,
  amount: number,
  relatedType?: string,
  relatedId?: string,
  remark?: string
): Promise<VirtualAccountTransaction> {
  if (amount <= 0) throw new Error("解冻金额必须大于0");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 锁定账户记录
    const [accountRows] = await connection.query<VirtualAccountRow[]>(
      `SELECT * FROM virtual_accounts WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [accountId]
    );
    if (accountRows.length === 0) {
      throw new Error("账户不存在");
    }
    const account = accountRows[0];

    const balance = parseFloat(account.balance);
    const frozenAmount = parseFloat(account.frozen_amount);

    // 2. 检查冻结金额是否充足
    if (frozenAmount < amount) {
      throw new Error(`冻结金额不足，当前冻结: ${frozenAmount}，需要解冻: ${amount}`);
    }

    const newFrozenAmount = frozenAmount - amount;

    // 3. 更新冻结金额
    await connection.query(
      `UPDATE virtual_accounts SET frozen_amount = ?, updated_at = NOW() WHERE id = ?`,
      [newFrozenAmount, accountId]
    );

    // 4. 记录流水
    const txnId = randomUUID();
    const txnNumber = generateTransactionNumber();
    await connection.query(
      `INSERT INTO virtual_account_transactions 
       (id, transaction_number, account_id, txn_type, amount, balance_before, balance_after, related_type, related_id, remark)
       VALUES (?, ?, ?, 'unfreeze', ?, ?, ?, ?, ?, ?)`,
      [txnId, txnNumber, accountId, amount, balance, balance, relatedType ?? null, relatedId ?? null, remark ?? null]
    );

    await connection.commit();

    const [txnRows] = await pool.query<VirtualAccountTransactionRow[]>(
      `SELECT * FROM virtual_account_transactions WHERE id = ?`,
      [txnId]
    );
    return rowToTransaction(txnRows[0]);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// 获取账户流水
export async function getAccountTransactions(
  accountId: string,
  filters?: {
    txnType?: TransactionType;
    startDate?: string;
    endDate?: string;
  }
): Promise<VirtualAccountTransaction[]> {
  let sql = `SELECT * FROM virtual_account_transactions WHERE account_id = ?`;
  const params: any[] = [accountId];

  if (filters?.txnType) {
    sql += ` AND txn_type = ?`;
    params.push(filters.txnType);
  }
  if (filters?.startDate) {
    sql += ` AND created_at >= ?`;
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    sql += ` AND created_at <= ?`;
    params.push(filters.endDate + ' 23:59:59');
  }

  sql += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<VirtualAccountTransactionRow[]>(sql, params);
  return rows.map(rowToTransaction);
}

// 更新账户状态
export async function updateAccountStatus(
  accountId: string,
  status: AccountStatus
): Promise<VirtualAccount> {
  await pool.query(
    `UPDATE virtual_accounts SET status = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [status, accountId]
  );
  const account = await getVirtualAccountById(accountId);
  if (!account) throw new Error("账户不存在");
  return account;
}
