import { z } from "zod";

// FunctionTool 类实现
export class FunctionTool {
  public readonly name: string;
  public readonly description: string;
  public readonly parameters: z.ZodType<any>;
  public readonly execute: (input: any) => Promise<any>;

  constructor(config: {
    name: string;
    description: string;
    parameters: z.ZodType<any>;
    execute: (input: any) => Promise<any>;
  }) {
    this.name = config.name;
    this.description = config.description;
    this.parameters = config.parameters;
    this.execute = config.execute;
  }
}

// 将 FunctionTool 转换为 DashScope 的工具定义格式
export function convertToolToDashScope(tool: FunctionTool): any {
  // 从 zod schema 提取 JSON schema
  const schema = tool.parameters as z.ZodObject<any>;
  const shape = schema._def.shape();
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    properties[key] = zodTypeToJsonSchema(zodType);
    // 检查是否是可选类型
    if (!zodType.isOptional()) {
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
        required: required.length > 0 ? required : undefined
      }
    }
  };
}

// 将 Zod 类型转换为 JSON Schema
function zodTypeToJsonSchema(zodType: z.ZodTypeAny): any {
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
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodTypeToJsonSchema(value as z.ZodTypeAny);
    }
    return {
      type: "object",
      properties
    };
  }
  if (zodType instanceof z.ZodOptional) {
    return zodTypeToJsonSchema(zodType._def.innerType);
  }
  if (zodType instanceof z.ZodDefault) {
    return zodTypeToJsonSchema(zodType._def.innerType);
  }
  // 默认返回 any
  return {};
}

// 简单的会话管理（内存实现）
export class InMemorySession {
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

