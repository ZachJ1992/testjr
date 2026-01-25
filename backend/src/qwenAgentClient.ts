import { FunctionTool, convertToolToDashScope } from "./qwenAgent.js";

// 简单的会话管理（内存实现）
class InMemorySession {
  private sessions: Map<string, any[]> = new Map();

  getSession(sessionId: string): any[] {
    return this.sessions.get(sessionId) || [];
  }

  setSession(sessionId: string, messages: any[]): void {
    this.sessions.set(sessionId, messages);
  }

  addMessage(sessionId: string, message: any): void {
    const messages = this.getSession(sessionId);
    messages.push(message);
    this.sessions.set(sessionId, messages);
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

export { InMemorySession };

interface DashScopeMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{
    type: "text" | "image" | "tool_call" | "tool_response";
    text?: string;
    tool_call_id?: string;
    name?: string;
    arguments?: string;
  }>;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface DashScopeToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface DashScopeResponse {
  output: {
    choices: Array<{
      message: DashScopeMessage;
      finish_reason?: string;
    }>;
    usage?: {
      total_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
    };
  };
}

export class QwenAgent {
  private apiKey: string;
  private model: string;
  private tools: FunctionTool[];
  private instruction: string;
  private baseUrl: string = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

  constructor(config: {
    apiKey: string;
    model?: string;
    tools?: FunctionTool[];
    instruction?: string;
  }) {
    this.apiKey = config.apiKey;
    this.model = config.model || "qwen-plus";
    this.tools = config.tools || [];
    this.instruction = config.instruction || "";
  }

  async chat(messages: DashScopeMessage[]): Promise<any> {
    const tools = this.tools.map(convertToolToDashScope);
    
    // 构建消息列表，包含 system message
    const allMessages: any[] = [];
    if (this.instruction) {
      allMessages.push({
        role: "system",
        content: this.instruction
      });
    }
    
    // 转换消息格式为 OpenAI 格式
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        allMessages.push({
          role: msg.role,
          content: msg.content
        });
      } else if (Array.isArray(msg.content)) {
        allMessages.push({
          role: msg.role,
          content: msg.content.map(item => {
            if (item.type === "text") return { type: "text", text: item.text };
            if (item.type === "tool_response") {
              return {
                type: "tool_result",
                tool_call_id: item.tool_call_id,
                content: item.text || ""
              };
            }
            return item;
          })
        });
      }
      
      // 如果有 tool_calls，添加进去
      if (msg.tool_calls) {
        allMessages[allMessages.length - 1].tool_calls = msg.tool_calls;
      }
    }

    // OpenAI 格式的请求
    const payload: any = {
      model: this.model,
      messages: allMessages,
      temperature: 0.7,
      max_tokens: 2000
    };

    if (tools.length > 0) {
      payload.tools = tools;
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  // 处理工具调用
  async executeToolCall(toolCall: DashScopeToolCall, tools: FunctionTool[]): Promise<any> {
    const tool = tools.find(t => t.name === toolCall.function.name);
    if (!tool) {
      throw new Error(`Tool not found: ${toolCall.function.name}`);
    }

    let args: any;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      args = {};
    }

    // 使用 zod 验证参数
    const validatedArgs = tool.parameters.parse(args);
    return await tool.execute(validatedArgs);
  }

  // 流式聊天（支持 SSE）
  async *chatStream(messages: DashScopeMessage[]): AsyncGenerator<any, void, unknown> {
    const tools = this.tools.map(convertToolToDashScope);
    
    // 构建消息列表，包含 system message
    const allMessages: any[] = [];
    if (this.instruction) {
      allMessages.push({
        role: "system",
        content: this.instruction
      });
    }
    
    // 转换消息格式为 OpenAI 格式
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        allMessages.push({
          role: msg.role,
          content: msg.content
        });
      } else if (Array.isArray(msg.content)) {
        allMessages.push({
          role: msg.role,
          content: msg.content.map(item => {
            if (item.type === "text") return { type: "text", text: item.text };
            if (item.type === "tool_response") {
              return {
                type: "tool_result",
                tool_call_id: item.tool_call_id,
                content: item.text || ""
              };
            }
            return item;
          })
        });
      }
      
      // 如果有 tool_calls，添加进去
      if (msg.tool_calls) {
        allMessages[allMessages.length - 1].tool_calls = msg.tool_calls;
      }
    }

    // OpenAI 格式的请求（流式）
    const payload: any = {
      model: this.model,
      messages: allMessages,
      temperature: 0.7,
      max_tokens: 2000,
      stream: true
    };

    if (tools.length > 0) {
      payload.tools = tools;
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error("Response body is not readable");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch (e) {
            // 忽略解析错误，继续处理下一个chunk
          }
        }
      }
    }

    // 处理剩余的buffer
    if (buffer.trim()) {
      try {
        if (buffer.startsWith("data: ")) {
          const data = buffer.slice(6).trim();
          if (data && data !== "[DONE]") {
            const parsed = JSON.parse(data);
            yield parsed;
          }
        }
      } catch (e) {
        // 忽略最后的解析错误
      }
    }
  }
}

// Runner 类，类似于 @google/adk 的 Runner
export class QwenRunner {
  private agent: QwenAgent;
  private session: any; // 支持 InMemorySession 或 MySQLSession
  private tools: FunctionTool[];

  constructor(config: {
    agent: QwenAgent;
    session: any;
    tools: FunctionTool[];
  }) {
    this.agent = config.agent;
    this.session = config.session;
    this.tools = config.tools;
  }

  async *runAsync(config: {
    userId: string;
    sessionId: string;
    newMessage: { role: string; parts?: Array<{ text?: string }>; content?: string };
  }): AsyncGenerator<any, void, unknown> {
    const { userId, sessionId, newMessage } = config;
    
    // 构建用户消息
    const userContent = newMessage.parts?.[0]?.text || newMessage.content || "";
    const userMessage: DashScopeMessage = {
      role: "user",
      content: userContent
    };

    // 获取会话历史（排除system消息）
    // MySQLSession 的 getSession 是异步的
    let historyData: any[] = [];
    try {
      // 尝试异步调用（MySQLSession）
      const result = await this.session.getSession(sessionId);
      historyData = Array.isArray(result) ? result : [];
    } catch (err) {
      // 如果 getSession 不是 Promise（InMemorySession），会失败，尝试同步调用
      try {
        historyData = this.session.getSession(sessionId);
        if (!Array.isArray(historyData)) {
          historyData = [];
        }
      } catch (syncErr) {
        console.error("获取会话历史失败:", syncErr);
        historyData = [];
      }
    }
    const history = historyData.filter((msg: any) => msg.role !== "system");
    const messages: DashScopeMessage[] = [...history, userMessage];

    let currentToolCalls: DashScopeToolCall[] = [];
    let accumulatedContent = "";
    let hasFinished = false;
    let hasToolCalls = false; // 标记是否有工具调用

    // 发送请求并处理响应
    for await (const chunk of this.agent.chatStream(messages)) {
      // OpenAI 格式：chunk.choices[0].delta 或 chunk.choices[0].message
      const choices = chunk.choices || [];
      if (choices.length === 0) {
        continue;
      }

      const choice = choices[0];
      // 流式响应使用 delta，非流式使用 message
      const delta = choice.delta || {};
      const message = choice.message || delta;
      
      // 检查是否完成
      if (choice.finish_reason) {
        hasFinished = choice.finish_reason === "stop" || choice.finish_reason === "tool_calls";
      }

      // 处理工具调用（OpenAI 格式中，tool_calls 可能在 delta 中）
      const toolCalls = message.tool_calls || [];
      if (toolCalls.length > 0) {
        hasToolCalls = true;
        for (const toolCall of toolCalls) {
          console.log(toolCall);
          // 发送工具调用开始事件
          yield {
            toolCalls: [{
              name: toolCall.function?.name || toolCall.function_name || "unknown",
              function: {
                name: toolCall.function?.name || toolCall.function_name || "unknown",
                arguments: toolCall.function?.arguments || toolCall.arguments || "{}"
              }
            }]
          };

          const toolCallObj: DashScopeToolCall = {
            id: toolCall.id || `call_${Date.now()}`,
            type: "function",
            function: {
              name: toolCall.function?.name || toolCall.function_name || "unknown",
              arguments: toolCall.function?.arguments || toolCall.arguments || "{}"
            }
          };
          currentToolCalls.push(toolCallObj);

          // 执行工具
          try {
            const toolResult = await this.agent.executeToolCall(toolCallObj, this.tools);
            yield {
              toolResults: [{
                name: toolCallObj.function.name,
                result: toolResult
              }]
            };

            // 添加工具响应到消息历史（OpenAI 格式）
            messages.push({
              role: "tool",
              content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
              tool_call_id: toolCallObj.id
            } as any);
          } catch (error: any) {
            yield {
              toolResults: [{
                name: toolCallObj.function.name,
                result: { error: error.message }
              }]
            };
          }
        }
      }

      // 处理文本内容（增量输出）
      if (message.content) {
        let content = "";
        if (typeof message.content === "string") {
          content = message.content;
          // 对于增量输出，直接追加
          accumulatedContent += content;
          if (content) {
            yield {
              parts: [{ text: content }],
              content: content,
              text: content
            };
          }
        } else if (Array.isArray(message.content)) {
          content = message.content
            .filter((item: any) => item.type === "text")
            .map((item: any) => item.text || "")
            .join("");
          if (content) {
            accumulatedContent += content;
            yield {
              parts: [{ text: content }],
              content: content,
              text: content
            };
          }
        }
      }
    }

    // 如果有工具调用，需要再次调用API获取最终结果
    if (hasToolCalls && currentToolCalls.length > 0 && !hasFinished) {
      // 继续处理工具调用后的响应
      const toolResults = messages.filter((msg: any) => msg.role === "tool");
      if (toolResults.length > 0) {
        // 再次调用获取最终响应
        const finalMessages = [...messages];
        let finalAccumulatedContent = "";
        // 重置 accumulatedContent，因为工具调用后的响应是新的内容
        accumulatedContent = "";
        for await (const chunk of this.agent.chatStream(finalMessages)) {
          const choices = chunk.choices || [];
          if (choices.length === 0) continue;
          
          const choice = choices[0];
          const delta = choice.delta || {};
          const message = choice.message || delta;
          
          if (message.content) {
            let content = "";
            if (typeof message.content === "string") {
              content = message.content;
              finalAccumulatedContent += content;
              accumulatedContent += content; // 同时更新 accumulatedContent
              if (content) {
                yield {
                  parts: [{ text: content }],
                  content: content,
                  text: content
                };
              }
            }
          }
          
          if (choice.finish_reason === "stop") {
            break;
          }
        }
      }
    }

    // 更新会话历史（保存assistant的消息）
    // 注意：用户消息已经在 aiAgent.ts 中保存了，这里只保存 assistant 消息
    if (accumulatedContent) {
      try {
        // MySQLSession 的 addMessage 是异步的，直接调用
        await this.session.addMessage(sessionId, {
          role: "assistant",
          content: accumulatedContent
        } as DashScopeMessage);
      } catch (err) {
        console.error("保存 assistant 消息失败:", err);
        // 如果 MySQLSession 调用失败，记录错误但继续执行
      }
    }
  }
}

// 辅助函数：检查是否是最终响应（OpenAI 格式）
export function isFinalResponse(event: any): boolean {
  return event.choices?.[0]?.finish_reason === "stop" || event.output?.choices?.[0]?.finish_reason === "stop";
}

// 辅助函数：提取文本内容（OpenAI 格式）
export function stringifyContent(event: any): string {
  if (event.content) {
    return String(event.content);
  }
  if (event.parts && Array.isArray(event.parts)) {
    return event.parts.map((p: any) => p.text || "").join("");
  }
  // OpenAI 格式
  const choice = event.choices?.[0];
  if (choice) {
    const message = choice.message || choice.delta || {};
    if (message.content) {
      return typeof message.content === "string" ? message.content : String(message.content);
    }
  }
  // 兼容旧格式
  if (event.output?.choices?.[0]?.message?.content) {
    return String(event.output.choices[0].message.content);
  }
  return "";
}

