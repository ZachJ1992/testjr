import express, { type Request, type Response } from "express";
import { z } from "zod";
import { OpenAIAgent, OpenAIRunner } from "./openaiAgent.js";
import { MySQLSession } from "./aiSessionStore.js";
import {
  addUserToGroup,
  assignRoleToUser,
  createUser,
  deleteUser,
  getGroups,
  getOrgUnits,
  getPermissions,
  getUsers,
  updateUser,
  fetchI18nForAdmin,
  getFundersList,
  getFunderDetail,
  createFunderTool,
  updateFunderTool,
  deleteFunderTool
} from "./aiTools.js";
import { authenticate, AuthenticatedRequest } from "./auth.js";
import { handleError } from "./errorHandler.js";

const router = express.Router();

const inputSchema = z.object({
  input: z.string(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string()
      })
    )
    .optional(),
  permissions: z.array(z.string()),
  userId: z.string().optional()
});

// 发送SSE事件
function sendSSE(res: Response, type: string, data: any) {
  try {
    // 在序列化前先安全处理数据
    const safeData = safeSerialize(data);
    const jsonData = JSON.stringify(safeData);
    res.write(`event: ${type}\n`);
    res.write(`data: ${jsonData}\n\n`);
  } catch (err) {
    // 如果序列化失败，发送安全的错误消息
    const safeData = {
      error: typeof data === "object" && data?.error 
        ? safeErrorToString(data.error) 
        : "序列化数据时出错"
    };
    try {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(safeData)}\n\n`);
    } catch (finalErr) {
      // 最后的保险措施
      res.write(`event: ${type}\n`);
      res.write(`data: {"error":"数据序列化失败"}\n\n`);
    }
  }
}

// 安全地将错误转换为字符串
function safeErrorToString(err: unknown): string {
  if (err instanceof Error) {
    return err.message || err.toString();
  }
  if (typeof err === "string") {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// 安全地序列化对象，处理循环引用和不可序列化的值
function safeSerialize(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  // 基本类型直接返回
  if (typeof obj !== "object") {
    return obj;
  }
  
  // 如果是Error对象，转换为字符串
  if (obj instanceof Error) {
    return obj.message || obj.toString();
  }
  
  // 如果是Date对象，转换为ISO字符串
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  
  // 如果是数组，递归处理每个元素
  if (Array.isArray(obj)) {
    return obj.map(item => safeSerialize(item));
  }
  
  // 如果是普通对象，尝试序列化
  try {
    // 先尝试JSON序列化测试，看是否有循环引用
    JSON.stringify(obj);
    return obj;
  } catch (err) {
    // 如果有序列化错误，尝试提取可序列化的属性
    const result: Record<string, any> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        try {
          const value = obj[key];
          // 跳过函数和undefined
          if (typeof value !== "function" && value !== undefined) {
            result[key] = safeSerialize(value);
          }
        } catch {
          // 如果某个属性无法序列化，跳过它
          result[key] = "[无法序列化]";
        }
      }
    }
    return result;
  }
}

export function createAiRouter() {
  // AI agent 接口需要鉴权，支持SSE流式返回
  router.post("/ai/agent", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    // 检查是否使用SSE流式返回（通过查询参数控制）
    const useStream = req.query.stream === "true" || req.body?.stream === true;

    try {
      // 检查 API Key 是否配置（从环境变量读取）
      const dashscopeApiKey = process.env.DASHSCOPE_API_KEY;
      if (!dashscopeApiKey) {
        if (useStream) {
          res.writeHead(500, { "Content-Type": "text/event-stream" });
          sendSSE(res, "error", { error: "DASHSCOPE_API_KEY not configured" });
          res.end();
        } else {
          res.status(500).json({ error: "DASHSCOPE_API_KEY not configured. Please set it in .env file or environment variables." });
        }
        return;
      }

      const parsed = inputSchema.parse(req.body ?? {});
      const { input, history = [], permissions } = parsed;

      // 使用当前用户的权限
      const userPermissions = req.currentPermissions || [];
      
      const tools = [];

      const has = (p: string) => userPermissions.includes(p) || permissions.includes(p);

      if (has("manage_users")) {
        tools.push(
          addUserToGroup,
          assignRoleToUser,
          createUser,
          deleteUser,
          updateUser,
          getUsers
        );
      }
      if (has("manage_groups")) {
        tools.push(getGroups);
      }
      if (has("view_orgs") || has("manage_orgs")) {
        tools.push(getOrgUnits);
      }
      if (has("manage_permissions")) {
        tools.push(getPermissions, fetchI18nForAdmin);
      }
      if (has("manage_funders")) {
        tools.push(
          getFundersList,
          getFunderDetail,
          createFunderTool,
          updateFunderTool,
          deleteFunderTool
        );
      }

      // 如果没有可用工具，返回提示
      if (tools.length === 0) {
        if (useStream) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          });
          sendSSE(res, "text", { content: "您当前没有可用的管理权限，无法使用 AI 助手功能。" });
          sendSSE(res, "done", {});
          res.end();
        } else {
          res.json({
            output: "您当前没有可用的管理权限，无法使用 AI 助手功能。",
            raw: null
          });
        }
        return;
      }

      const agent = new OpenAIAgent({
        apiKey: dashscopeApiKey,
        model: process.env.QWEN_MODEL || "qwen-plus",
        tools,
        instruction:
          "你是后台管理助手。**重要：你必须使用提供的工具来获取真实数据，绝对不允许编造、猜测或使用示例数据。**\n\n"+
          "工作流程："+
          "1. **分析用户问题**：确定需要哪些信息"+
          "2. **调用工具**：使用 "+tools.map(item => item.name).join('、')+" 等工具获取真实数据"+
          "3. **查看工具返回结果**：工具返回的数据是唯一可信的数据源"+
          "4. **基于真实数据回答**：只能使用工具返回的实际数据，并对密码，id等类字段数据进行脱敏处理来构建答案\n\n"+
          "**创建/修改操作规则**："+
          "- **参数必须明确**：在执行创建、修改、删除等操作前，必须确保所有必需参数都已明确"+
          "- **参数不明确时询问用户**：如果工具返回包含 `requiresUserInput: true` 或 `error: \"参数不明确\"` 的结果，说明参数不完整或不确定，你必须询问用户获取明确的参数值"+
          "- **不要猜测参数**：如果用户没有提供明确的参数值，绝对不要猜测或使用默认值，必须询问用户"+
          "- **确认后再执行**：只有在获取到用户明确的参数后，才能再次调用工具执行操作\n\n"+
          "**严格规则**："+
          "- **禁止编造数据**：如果不知道数据，必须调用工具获取"+
          "- **禁止使用示例**：不要使用任何示例数据、训练数据或假设数据"+
          "- **必须调用工具**：对于查询用户、组织、组等操作，必须先调用相应的工具"+
          "- **数据来源唯一**：只有工具返回的数据才是真实数据"+
          "- **如实报告**：如果工具返回空数据，如实告诉用户，不要编造",
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
      });

      // 使用 Runner 来运行 agent
      const userId = req.currentUser?.id || parsed.userId || "anonymous";
      
      // 使用 MySQL 会话存储
      const sessionService = new MySQLSession();
      // 从请求中获取 sessionId，如果没有则创建新会话
      const requestedSessionId = req.body?.sessionId as string | undefined;
      // 如果创建新会话，使用用户输入的第一个问题作为标题（截断10个字）
      const sessionTitle = requestedSessionId ? undefined : (input.length > 10 ? input.substring(0, 10) + "..." : input);
      const sessionId = await sessionService.getOrCreateSession(userId, requestedSessionId, sessionTitle);
      
      // 如果会话已存在但没有标题，且这是第一条消息，则更新标题
      if (requestedSessionId) {
        const sessions = await sessionService.getUserSessions(userId);
        const currentSession = sessions.find(s => s.id === sessionId);
        if (currentSession && !currentSession.title) {
          const title = input.length > 10 ? input.substring(0, 10) + "..." : input;
          await sessionService.updateSessionTitle(sessionId, userId, title);
        }
      }
      
      const runner = new OpenAIRunner({
        agent,
        session: sessionService,
        tools
      });

      // 如果使用流式返回，设置SSE响应头
      if (useStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        });

        // 发送会话信息
        sendSSE(res, "session", { sessionId, userId });
        
        // 保存用户消息到数据库
        await sessionService.addMessage(sessionId, {
          role: "user",
          content: input
        });

        try {
          let eventCount = 0;
          let hasTextEvent = false;
          
          for await (const event of runner.runAsync({
            userId,
            sessionId,
            newMessage: {
              role: "user",
              content: input
            }
          })) {
            eventCount++;
            const eventAny = event as any;
            const eventKeys = Object.keys(eventAny);
            console.log(`[aiAgent] 收到事件 #${eventCount}:`, eventKeys);
            
            // 处理工具调用
            if (eventAny.toolCalls && Array.isArray(eventAny.toolCalls)) {
              console.log(`[aiAgent] 工具调用事件数量: ${eventAny.toolCalls.length}`);
              for (const toolCall of eventAny.toolCalls) {
                const toolName = toolCall.name || toolCall.function?.name || toolCall.toolName || "unknown";
                sendSSE(res, "tool_call_start", { toolName });
              }
            }

            // 处理工具结果
            if (eventAny.toolResults && Array.isArray(eventAny.toolResults)) {
              for (const toolResult of eventAny.toolResults) {
                const toolName = toolResult.name || toolResult.toolName || "unknown";
                // 安全序列化工具结果
                const safeResult = safeSerialize(toolResult.result || toolResult.output);
                sendSSE(res, "tool_call_end", { 
                  toolName,
                  result: safeResult
                });
              }
            }

            // 处理文本内容 - 优先检查事件中的文本字段
            let textContent = "";
            
            // 按优先级提取文本内容（适配 OpenAI 格式）
            if (eventAny.text) {
              textContent = String(eventAny.text);
            } else if (eventAny.content) {
              textContent = String(eventAny.content);
            } else if (eventAny.parts && Array.isArray(eventAny.parts)) {
              // 从parts中提取文本
              for (const part of eventAny.parts) {
                if (part.text) {
                  textContent += part.text;
                }
              }
            } else if (eventAny.message?.parts) {
              // 从message.parts中提取
              for (const part of eventAny.message.parts) {
                if (part.text) {
                  textContent += part.text;
                }
              }
            } else if (eventAny.choices?.[0]) {
              // OpenAI 格式：从 choices[0].delta 或 choices[0].message 提取
              const choice = eventAny.choices[0];
              const delta = choice.delta || {};
              const message = choice.message || delta;
              if (message.content) {
                textContent = typeof message.content === "string" ? message.content : String(message.content);
              }
            }

            // 如果有文本内容，发送
            if (textContent) {
              hasTextEvent = true;
              console.log(`[aiAgent] 发送文本事件，内容长度: ${textContent.length}, 内容预览: "${textContent.substring(0, 50)}"`);
              // 如果是流式文本，逐块发送
              sendSSE(res, "text", { content: textContent });
            } else {
              console.log(`[aiAgent] 事件没有文本内容，事件类型:`, eventKeys.join(", "));
            }
          }

          console.log(`[aiAgent] 事件流结束，总事件数: ${eventCount}, 是否有文本事件: ${hasTextEvent}`);
          
          // 发送完成事件
          sendSSE(res, "done", {});
          res.end();
        } catch (streamErr) {
          console.error(`[aiAgent] 流式处理错误:`, streamErr);
          sendSSE(res, "error", { error: safeErrorToString(streamErr) });
          res.end();
        }
      } else {
        // 非流式返回（保持向后兼容）
        const events: any[] = [];
        let finalOutput = "";
        
        for await (const event of runner.runAsync({
          userId,
          sessionId,
          newMessage: {
            role: "user",
            content: input
          }
        })) {
          events.push(event);
          // 提取文本内容
          const eventAny = event as any;
          if (eventAny.content) {
            finalOutput += eventAny.content;
          } else if (eventAny.text) {
            finalOutput += eventAny.text;
          }
        }

        res.json({
          output: finalOutput || "已完成",
          raw: events.length > 0 ? events[events.length - 1] : null
        });
      }
    } catch (err) {
      if (useStream) {
        sendSSE(res, "error", { error: safeErrorToString(err) });
        res.end();
      } else {
        // 使用统一的错误处理
        handleError(res, req, 400, err);
      }
    }
  });

  // 获取用户的会话列表
  router.get("/ai/sessions", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.currentUser?.id || "anonymous";
      const sessionService = new MySQLSession();
      const sessions = await sessionService.getUserSessions(userId);
      res.json({ sessions });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  });

  // 删除会话
  router.delete("/ai/sessions/:sessionId", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const userId = req.currentUser?.id || "anonymous";
      const sessionService = new MySQLSession();
      const success = await sessionService.deleteSession(sessionId, userId);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Session not found" });
      }
    } catch (err) {
      handleError(res, req, 500, err);
    }
  });

  // 获取会话的消息列表
  router.get("/ai/sessions/:sessionId/messages", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const userId = req.currentUser?.id || "anonymous";
      const sessionService = new MySQLSession();
      const sessions = await sessionService.getUserSessions(userId);
      const session = sessions.find(s => s.id === sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      const messages = await sessionService.getSession(sessionId);
      res.json({ messages });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  });

  return router;
}

