import OpenAI from "openai";
import { z } from "zod";
import { FunctionTool } from "./qwenAgent.js";
import { MySQLSession } from "./aiSessionStore.js";

// 将 Zod 类型转换为 JSON Schema
function zodTypeToJsonSchema(zodType: any): any {
  if (zodType instanceof z.ZodString) {
    return { type: "string" };
  }
  if (zodType instanceof z.ZodNumber) {
    return { type: "number" };
  }
  if (zodType instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }
  if (zodType instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodTypeToJsonSchema(zodType._def.type)
    };
  }
  if (zodType instanceof z.ZodObject) {
    const shape = zodType._def.shape();
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodTypeToJsonSchema(value);
      if (!(value as any).isOptional?.()) {
        required.push(key);
      }
    }
    return {
      type: "object",
      properties,
      ...(required.length > 0 && { required })
    };
  }
  if (zodType instanceof z.ZodOptional) {
    return zodTypeToJsonSchema(zodType._def.innerType);
  }
  return { type: "string" };
}

// 将 FunctionTool 转换为 OpenAI 工具格式
function convertToolToOpenAI(tool: FunctionTool): OpenAI.Chat.Completions.ChatCompletionTool {
  const schema = tool.parameters as any;
  const shape = schema._def?.shape?.() || {};
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as any;
    properties[key] = zodTypeToJsonSchema(zodType);
    if (!zodType.isOptional?.()) {
      required.push(key);
    }
  }

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        ...(required.length > 0 && { required })
      }
    }
  };
}

export class OpenAIAgent {
  private client: OpenAI;
  private model: string;
  private tools: FunctionTool[];
  private instruction: string;

  constructor(config: {
    apiKey: string;
    model?: string;
    tools?: FunctionTool[];
    instruction?: string;
    baseURL?: string;
  }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
    });
    this.model = config.model || "qwen-plus";
    this.tools = config.tools || [];
    this.instruction = config.instruction || "";
  }

  // 检查工具是否为创建/修改类操作
  private isModifyOperation(toolName: string): boolean {
    const modifyKeywords = ['create', 'update', 'delete', 'add', 'remove', 'modify', 'edit'];
    return modifyKeywords.some(keyword => toolName.toLowerCase().includes(keyword));
  }

  // 检查参数是否明确（对于创建/修改操作）
  private checkParametersComplete(tool: FunctionTool, args: any): { isComplete: boolean; missingFields?: string[]; emptyFields?: string[] } {
    const schema = tool.parameters as z.ZodObject<any>;
    const shape = schema._def.shape?.() || {};
    const missingFields: string[] = [];
    const emptyFields: string[] = [];

    for (const [key, zodType] of Object.entries(shape)) {
      const fieldZodType = zodType as z.ZodTypeAny;
      // 检查是否为可选类型：ZodOptional 或 ZodDefault
      const isOptional = fieldZodType._def?.typeName === 'ZodOptional' || 
                        fieldZodType._def?.typeName === 'ZodDefault' ||
                        (fieldZodType as any).isOptional?.() === true;
      
      // 对于必需字段，检查是否存在且不为空
      if (!isOptional) {
        if (!(key in args) || args[key] === undefined || args[key] === null || args[key] === '') {
          missingFields.push(key);
        }
      }
      
      // 对于所有字段（包括可选字段），如果提供了但为空字符串或null，也标记为需要确认（但空字符串对于可选字段是可以接受的）
      // 这里只检查null，因为空字符串对于某些字段可能是有效值
      if (key in args && args[key] === null) {
        emptyFields.push(key);
      }
    }

    return {
      isComplete: missingFields.length === 0 && emptyFields.length === 0,
      missingFields: missingFields.length > 0 ? missingFields : undefined,
      emptyFields: emptyFields.length > 0 ? emptyFields : undefined
    };
  }

  // 执行工具调用
  async executeToolCall(toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall, tools: FunctionTool[]): Promise<any> {
    const toolName = toolCall.function.name;
    console.log(`[OpenAIAgent.executeToolCall] 开始执行工具: ${toolName}`);
    console.log(`[OpenAIAgent.executeToolCall] 可用工具列表:`, tools.map(t => t.name));
    
    const tool = tools.find(t => t.name === toolName);
    
    if (!tool) {
      console.error(`[OpenAIAgent.executeToolCall] 工具未找到: ${toolName}`);
      throw new Error(`Tool ${toolName} not found`);
    }

    let args: any;
    try {
      args = JSON.parse(toolCall.function.arguments);
      console.log(`[OpenAIAgent.executeToolCall] 解析的参数:`, args);
    } catch (err) {
      console.warn(`[OpenAIAgent.executeToolCall] 参数解析失败，使用空对象:`, err);
      args = {};
    }

    // 对于创建/修改类操作，检查参数是否明确
    if (this.isModifyOperation(toolName)) {
      const paramCheck = this.checkParametersComplete(tool, args);
      if (!paramCheck.isComplete) {
        console.log(`[OpenAIAgent.executeToolCall] 参数不完整，需要询问用户`);
        const missingMsg = paramCheck.missingFields ? `缺少必需参数: ${paramCheck.missingFields.join(', ')}` : '';
        const emptyMsg = paramCheck.emptyFields ? `参数为空需要确认: ${paramCheck.emptyFields.join(', ')}` : '';
        const message = [missingMsg, emptyMsg].filter(Boolean).join('; ');
        return {
          error: "参数不明确",
          message: `无法执行${toolName}操作，${message}。请询问用户获取明确的参数值后再调用工具。`,
          missingFields: paramCheck.missingFields,
          emptyFields: paramCheck.emptyFields,
          requiresUserInput: true
        };
      }
    }

    // 使用 zod schema 验证参数
    let validatedArgs: any;
    try {
      validatedArgs = tool.parameters.parse(args);
      console.log(`[OpenAIAgent.executeToolCall] 验证后的参数:`, validatedArgs);
    } catch (err: any) {
      // 如果验证失败，对于创建/修改操作返回错误信息，让AI询问用户
      if (this.isModifyOperation(toolName)) {
        console.log(`[OpenAIAgent.executeToolCall] 参数验证失败，需要询问用户`);
        return {
          error: "参数验证失败",
          message: `参数验证失败: ${err.message || '参数格式不正确'}。请询问用户获取正确的参数值后再调用工具。`,
          requiresUserInput: true
        };
      }
      // 对于查询操作，直接抛出错误
      throw err;
    }
    
    console.log(`[OpenAIAgent.executeToolCall] 调用工具执行函数...`);
    const result = await tool.execute(validatedArgs);
    console.log(`[OpenAIAgent.executeToolCall] 工具执行完成，结果类型:`, typeof result, "结果长度:", typeof result === "string" ? result.length : JSON.stringify(result).length);
    return result;
  }
}

// Runner 类，处理流式响应和工具调用
export class OpenAIRunner {
  private agent: OpenAIAgent;
  private session: MySQLSession;
  private tools: FunctionTool[];

  constructor(config: {
    agent: OpenAIAgent;
    session: MySQLSession;
    tools: FunctionTool[];
  }) {
    this.agent = config.agent;
    this.session = config.session;
    this.tools = config.tools;
  }

  async *runAsync(config: {
    userId: string;
    sessionId: string;
    newMessage: { role: string; content: string };
  }): AsyncGenerator<any, void, unknown> {
    console.log(`[OpenAIRunner.runAsync] 开始运行，userId: ${config.userId}, sessionId: ${config.sessionId}`);
    console.log(`[OpenAIRunner.runAsync] 新消息:`, config.newMessage);
    console.log(`[OpenAIRunner.runAsync] 可用工具数量: ${this.tools.length}`, this.tools.map(t => t.name));
    
    // 获取历史消息
    const historyMessages = await this.session.getSession(config.sessionId);
    console.log(`[OpenAIRunner.runAsync] 历史消息数量: ${historyMessages.length}`);
    
    // 转换为 OpenAI 格式
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    
    // 添加 system message
    if (this.agent["instruction"]) {
      messages.push({
        role: "system",
        content: this.agent["instruction"]
      });
      console.log(`[OpenAIRunner.runAsync] 添加了 system message`);
    }

    // 转换历史消息
    for (const msg of historyMessages) {
      if (msg.role === "tool") {
        messages.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.tool_call_id
        } as any);
      } else if (msg.role === "assistant" && msg.tool_calls) {
        messages.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.tool_calls
        } as any);
      } else {
        messages.push({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content
        });
      }
    }

    // 添加新消息
    messages.push({
      role: config.newMessage.role as "user",
      content: config.newMessage.content
    });

    // 准备工具
    const tools = this.tools.map(tool => convertToolToOpenAI(tool));
    console.log(`[OpenAIRunner.runAsync] 转换后的 OpenAI 工具数量: ${tools.length}`);

    let accumulatedContent = "";
    let currentToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

    console.log(`[OpenAIRunner.runAsync] 准备调用 OpenAI API，消息数量: ${messages.length}`);
    // 流式调用
    const stream = await this.agent["client"].chat.completions.create({
      model: this.agent["model"],
      messages: messages as any,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "required" : undefined, // 强制要求使用工具
      stream: true,
      temperature: 0.3 // 降低温度，减少编造数据的可能性
    });
    console.log(`[OpenAIRunner.runAsync] OpenAI API 调用成功，开始接收流式响应`);

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      // 处理工具调用
      if (delta.tool_calls) {
        console.log(`[OpenAIRunner] 收到工具调用 delta，数量: ${delta.tool_calls.length}`);
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index || 0;
          if (!currentToolCalls[index]) {
            currentToolCalls[index] = {
              id: toolCallDelta.id || `call_${Date.now()}_${index}`,
              type: "function",
              function: {
                name: toolCallDelta.function?.name || "",
                arguments: toolCallDelta.function?.arguments || ""
              }
            };
          } else {
            currentToolCalls[index].function.name += toolCallDelta.function?.name || "";
            currentToolCalls[index].function.arguments += toolCallDelta.function?.arguments || "";
          }
        }
      }

      // 处理文本内容
      if (delta.content) {
        accumulatedContent += delta.content;
        console.log(`[OpenAIRunner] 收到文本内容 delta，累计长度: ${accumulatedContent.length}`);
        yield {
          text: delta.content,
          content: delta.content
        };
      }
      
      // 记录 finish_reason
      if (choice.finish_reason) {
        console.log(`[OpenAIRunner] finish_reason: ${choice.finish_reason}`);
      }

      // 检查是否完成
      if (choice.finish_reason === "tool_calls" && currentToolCalls.length > 0) {
        console.log(`[OpenAIRunner] 检测到工具调用请求，数量: ${currentToolCalls.length}`);
        console.log(`[OpenAIRunner] 工具调用列表:`, currentToolCalls.map(tc => tc.function.name));
        
        // **重要**: 在添加 tool 消息之前，必须先添加包含 tool_calls 的 assistant 消息
        // OpenAI API 要求 tool 消息必须紧接在包含 tool_calls 的 assistant 消息之后
        messages.push({
          role: "assistant",
          content: accumulatedContent || null,
          tool_calls: currentToolCalls
        } as any);
        console.log(`[OpenAIRunner] 已添加包含 tool_calls 的 assistant 消息`);
        
        // 发送工具调用事件
        for (const toolCall of currentToolCalls) {
          console.log(`[OpenAIRunner] 准备执行工具: ${toolCall.function.name}, ID: ${toolCall.id}`);
          yield {
            toolCalls: [{
              name: toolCall.function.name,
              function: {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments
              }
            }]
          };

          // 执行工具
          try {
            console.log(`[OpenAIRunner] 执行工具调用: ${toolCall.function.name}`);
            const toolResult = await this.agent.executeToolCall(toolCall, this.tools);
            console.log(`[OpenAIRunner] 工具执行结果 (${toolCall.function.name}):`, 
              typeof toolResult === "string" ? toolResult.substring(0, 200) : JSON.stringify(toolResult).substring(0, 500));
            
            // 检查是否是参数不明确的错误，需要询问用户
            if (toolResult && typeof toolResult === 'object' && (toolResult as any).requiresUserInput) {
              // 参数不明确，返回错误信息让AI询问用户
              yield {
                toolResults: [{
                  name: toolCall.function.name,
                  result: toolResult
                }]
              };
              
              // 添加工具响应到消息历史
              const toolResponseContent = JSON.stringify(toolResult);
              console.log(`[OpenAIRunner] 参数不明确，添加到消息历史，让AI询问用户`);
              messages.push({
                role: "tool",
                content: toolResponseContent,
                tool_call_id: toolCall.id
              } as any);
              
              // 不继续执行其他工具，直接进入后续流程让AI询问用户
              continue;
            }
            
            yield {
              toolResults: [{
                name: toolCall.function.name,
                result: toolResult
              }]
            };

            // 添加工具响应到消息历史（现在可以安全添加，因为前面已经有了 assistant 消息）
            const toolResponseContent = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
            console.log(`[OpenAIRunner] 添加到消息历史的工具响应长度:`, toolResponseContent.length);
            messages.push({
              role: "tool",
              content: toolResponseContent,
              tool_call_id: toolCall.id
            } as any);
          } catch (error: any) {
            yield {
              toolResults: [{
                name: toolCall.function.name,
                result: { error: error.message }
              }]
            };
            
            // 即使工具执行失败，也添加到消息历史
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: error.message }),
              tool_call_id: toolCall.id
            } as any);
          }
        }

        // 重新调用以获取最终响应
        currentToolCalls = [];
        accumulatedContent = "";

        // 调试：打印将要发送给模型的消息
        console.log(`[OpenAIRunner] 重新调用模型，消息数量: ${messages.length}`);
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && typeof lastMessage.content === "string") {
          console.log(`[OpenAIRunner] 最后一条 tool 消息内容预览:`, lastMessage.content.substring(0, 200));
        } else {
          console.log(`[OpenAIRunner] 最后一条消息内容类型:`, typeof lastMessage?.content);
        }

        console.log(`[OpenAIRunner] 开始 follow-up API 调用...`);
        // follow-up 调用时，强制不使用工具，只返回文本响应
        const followUpStream = await this.agent["client"].chat.completions.create({
          model: this.agent["model"],
          messages: messages as any,
          tools: undefined, // follow-up 时不使用工具
          tool_choice: undefined, // follow-up 时不使用工具
          stream: true,
          temperature: 0.3
        });
        console.log(`[OpenAIRunner] follow-up API 调用成功，开始接收流式响应`);

        for await (const followUpChunk of followUpStream) {
          const followUpChoice = followUpChunk.choices[0];
          if (!followUpChoice) {
            console.log(`[OpenAIRunner] follow-up chunk 没有 choice，跳过`);
            continue;
          }

          const followUpDelta = followUpChoice.delta;
          console.log(`[OpenAIRunner] follow-up delta:`, {
            hasContent: !!followUpDelta.content,
            hasToolCalls: !!followUpDelta.tool_calls,
            finishReason: followUpChoice.finish_reason
          });
          
          if (followUpDelta.content) {
            accumulatedContent += followUpDelta.content;
            console.log(`[OpenAIRunner] follow-up 文本内容: "${followUpDelta.content}", 累计长度: ${accumulatedContent.length}`);
            yield {
              text: followUpDelta.content,
              content: followUpDelta.content
            };
          }

          // 处理后续的工具调用
          if (followUpDelta.tool_calls) {
            for (const toolCallDelta of followUpDelta.tool_calls) {
              const index = toolCallDelta.index || 0;
              if (!currentToolCalls[index]) {
                currentToolCalls[index] = {
                  id: toolCallDelta.id || `call_${Date.now()}_${index}`,
                  type: "function",
                  function: {
                    name: toolCallDelta.function?.name || "",
                    arguments: toolCallDelta.function?.arguments || ""
                  }
                };
              } else {
                currentToolCalls[index].function.name += toolCallDelta.function?.name || "";
                currentToolCalls[index].function.arguments += toolCallDelta.function?.arguments || "";
              }
            }
          }

          if (followUpChoice.finish_reason === "stop") {
            console.log(`[OpenAIRunner] follow-up 完成，累计内容长度: ${accumulatedContent.length}`);
            break;
          } else if (followUpChoice.finish_reason === "tool_calls" && currentToolCalls.length > 0) {
            console.log(`[OpenAIRunner] follow-up 需要继续工具调用，数量: ${currentToolCalls.length}`);
            
            // 添加包含 tool_calls 的 assistant 消息
            messages.push({
              role: "assistant",
              content: accumulatedContent || null,
              tool_calls: currentToolCalls
            } as any);
            
            // 执行工具调用
            for (const toolCall of currentToolCalls) {
              console.log(`[OpenAIRunner] follow-up 准备执行工具: ${toolCall.function.name}, ID: ${toolCall.id}`);
              yield {
                toolCalls: [{
                  name: toolCall.function.name,
                  function: {
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments
                  }
                }]
              };

              try {
                console.log(`[OpenAIRunner] follow-up 执行工具调用: ${toolCall.function.name}`);
                const toolResult = await this.agent.executeToolCall(toolCall, this.tools);
                console.log(`[OpenAIRunner] follow-up 工具执行结果 (${toolCall.function.name}):`, 
                  typeof toolResult === "string" ? toolResult.substring(0, 200) : JSON.stringify(toolResult).substring(0, 500));
                
                yield {
                  toolResults: [{
                    name: toolCall.function.name,
                    result: toolResult
                  }]
                };

                const toolResponseContent = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
                messages.push({
                  role: "tool",
                  content: toolResponseContent,
                  tool_call_id: toolCall.id
                } as any);
              } catch (error: any) {
                yield {
                  toolResults: [{
                    name: toolCall.function.name,
                    result: { error: error.message }
                  }]
                };
                messages.push({
                  role: "tool",
                  content: JSON.stringify({ error: error.message }),
                  tool_call_id: toolCall.id
                } as any);
              }
            }

            // 重置并继续循环处理（实际上应该再次调用 API）
            currentToolCalls = [];
            accumulatedContent = "";
            
            // 再次调用 API 获取最终响应
            const nextFollowUpStream = await this.agent["client"].chat.completions.create({
              model: this.agent["model"],
              messages: messages as any,
              tools: tools.length > 0 ? tools : undefined,
              tool_choice: tools.length > 0 ? "none" : undefined, // 这次不允许工具调用，只返回文本
              stream: true,
              temperature: 0.3
            });
            
            console.log(`[OpenAIRunner] follow-up 第二次 API 调用，开始接收流式响应`);
            for await (const nextChunk of nextFollowUpStream) {
              const nextChoice = nextChunk.choices[0];
              if (!nextChoice) continue;

              const nextDelta = nextChoice.delta;
              if (nextDelta.content) {
                accumulatedContent += nextDelta.content;
                console.log(`[OpenAIRunner] follow-up 第二次响应文本: "${nextDelta.content}"`);
                yield {
                  text: nextDelta.content,
                  content: nextDelta.content
                };
              }

              if (nextChoice.finish_reason === "stop") {
                break;
              }
            }
            break;
          }
        }
        console.log(`[OpenAIRunner] follow-up stream 处理完成`);
      }
    }

    // 保存 assistant 消息到数据库
    if (accumulatedContent || currentToolCalls.length > 0) {
      await this.session.addMessage(config.sessionId, {
        role: "assistant",
        content: accumulatedContent || null,
        tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined
      } as any);
    }
  }
}

