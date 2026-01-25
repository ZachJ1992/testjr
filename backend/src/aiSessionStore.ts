import { randomUUID } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { pool } from "./db.js";

export interface AISession {
  id: string;
  userId: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIMessage {
  id: string;
  sessionId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: any;
  toolResults?: any;
  sequenceNumber: number;
  createdAt: Date;
}

// MySQL 会话管理器
export class MySQLSession {
  // 获取会话的消息列表
  async getSession(sessionId: string): Promise<any[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, role, content, tool_calls, tool_results, sequence_number, created_at
       FROM ai_messages
       WHERE session_id = ?
       ORDER BY sequence_number ASC`,
      [sessionId]
    );

    return rows.map(row => ({
      id: row.id,
      role: row.role,
      content: row.content,
      tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      tool_results: row.tool_results ? JSON.parse(row.tool_results) : undefined,
      createdAt: row.created_at
    }));
  }

  // 设置会话的消息列表（批量替换）
  async setSession(sessionId: string, messages: any[]): Promise<void> {
    // 先删除旧消息
    await pool.query(
      `DELETE FROM ai_messages WHERE session_id = ?`,
      [sessionId]
    );

    // 插入新消息
    if (messages.length > 0) {
      const values = messages.map((msg, index) => [
        randomUUID(),
        sessionId,
        msg.role,
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
        msg.tool_results ? JSON.stringify(msg.tool_results) : null,
        index
      ]);

      await pool.query(
        `INSERT INTO ai_messages (id, session_id, role, content, tool_calls, tool_results, sequence_number)
         VALUES ?`,
        [values]
      );
    }
  }

  // 添加单条消息到会话
  async addMessage(sessionId: string, message: any): Promise<void> {
    // 获取当前最大序号
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT MAX(sequence_number) as max_seq FROM ai_messages WHERE session_id = ?`,
      [sessionId]
    );
    const maxSeq = rows[0]?.max_seq ?? -1;

    await pool.query(
      `INSERT INTO ai_messages (id, session_id, role, content, tool_calls, tool_results, sequence_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        sessionId,
        message.role,
        typeof message.content === "string" ? message.content : JSON.stringify(message.content),
        message.tool_calls ? JSON.stringify(message.tool_calls) : null,
        message.tool_results ? JSON.stringify(message.tool_results) : null,
        maxSeq + 1
      ]
    );

    // 更新会话的 updated_at
    await pool.query(
      `UPDATE ai_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [sessionId]
    );
  }

  // 清除会话的所有消息
  async clearSession(sessionId: string): Promise<void> {
    await pool.query(
      `DELETE FROM ai_messages WHERE session_id = ?`,
      [sessionId]
    );
  }

  // 创建新会话
  async createSession(userId: string, title?: string): Promise<string> {
    const sessionId = randomUUID();
    await pool.query(
      `INSERT INTO ai_sessions (id, user_id, title) VALUES (?, ?, ?)`,
      [sessionId, userId, title || null]
    );
    return sessionId;
  }

  // 获取或创建会话
  async getOrCreateSession(userId: string, sessionId?: string, title?: string): Promise<string> {
    if (sessionId) {
      // 检查会话是否存在
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM ai_sessions WHERE id = ? AND user_id = ?`,
        [sessionId, userId]
      );
      if (rows.length > 0) {
        // 如果提供了标题且会话没有标题，则更新标题
        if (title && !rows[0].title) {
          await pool.query(
            `UPDATE ai_sessions SET title = ? WHERE id = ?`,
            [title, sessionId]
          );
        }
        return sessionId;
      }
    }
    // 创建新会话
    return await this.createSession(userId, title);
  }

  // 更新会话标题
  async updateSessionTitle(sessionId: string, userId: string, title: string): Promise<void> {
    await pool.query(
      `UPDATE ai_sessions SET title = ? WHERE id = ? AND user_id = ?`,
      [title, sessionId, userId]
    );
  }

  // 获取用户的所有会话
  async getUserSessions(userId: string): Promise<AISession[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, title, created_at, updated_at
       FROM ai_sessions
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
      [userId]
    );

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      title: row.title || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  // 删除会话（逻辑删除）
  async deleteSession(sessionId: string, userId: string): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE ai_sessions SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [sessionId, userId]
    );
    return result.affectedRows > 0;
  }
}

