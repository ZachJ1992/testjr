import { useState, useEffect, useRef } from "react";
import { Button, Drawer, Input, Space, Typography, Switch, Divider, Avatar, Modal } from "antd";
import { MessageOutlined, UserOutlined, RobotOutlined, DeleteOutlined, DownloadOutlined, PlusOutlined, ThunderboltOutlined, EyeOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { useI18n } from "../i18n";
import { API_AI, getErrorMessage, getToken, getAISessions, deleteAISession, getAISessionMessages, type AISession, type AIMessage } from "../api";
import { useAuth } from "../auth";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ toolName: string; status: "pending" | "success"; result?: any }>;
  sequence: number; // 序号，用于排序
}

interface StreamingMessage {
  content: string;
  toolCalls?: Array<{ toolName: string; status: "pending" | "success"; result?: any }>;
}

// 检测内容是否包含HTML标签（排除markdown代码块）
function isHTMLContent(content: string): boolean {
  const trimmedContent = content.trim();
  if (!trimmedContent) return false;
  
  // 排除markdown代码块格式
  if (trimmedContent.startsWith("```") || trimmedContent.includes("```")) {
    return false;
  }
  
  // 检查是否包含HTML标签
  const htmlTagPattern = /<\/?[a-z][a-z0-9]*[\s>]/i;
  return htmlTagPattern.test(trimmedContent);
}

// HTML 直接渲染组件（用于直接HTML内容）
function HTMLRenderer({ html }: { html: string }) {
  return (
    <div style={{ width: "100%", border: "1px solid #d9d9d9", borderRadius: 4, overflow: "hidden" }}>
      <iframe
        srcDoc={html}
        style={{
          width: "100%",
          height: "600px",
          border: "none",
          display: "block"
        }}
        sandbox="allow-scripts allow-same-origin allow-forms"
        title="HTML Content"
      />
    </div>
  );
}

// HTML 预览组件（用于markdown代码块中的HTML）
function HTMLPreview({ code, language }: { code: string; language?: string }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  // 检测是否是 HTML 代码
  const isHTML = (() => {
    // 如果明确指定了语言为 html
    if (language === "html" || language === "htm") {
      return true;
    }
    
    // 检查代码内容是否包含HTML标签
    const trimmedCode = code.trim();
    if (!trimmedCode) return false;
    
    // 检查是否包含HTML标签
    const htmlTagPattern = /<\/?[a-z][a-z0-9]*[\s>]/i;
    return htmlTagPattern.test(trimmedCode);
  })();

  if (!isHTML) {
    return null;
  }

  const handlePreview = () => {
    setPreviewKey(prev => prev + 1);
    setPreviewOpen(true);
  };

  return (
    <>
      <Button
        type="link"
        size="small"
        icon={<EyeOutlined />}
        onClick={handlePreview}
        style={{ marginTop: 8 }}
      >
        预览 HTML
      </Button>
      <Modal
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={800}
        title="HTML 预览"
        destroyOnClose
      >
        <iframe
          key={previewKey}
          srcDoc={code}
          style={{
            width: "100%",
            height: "600px",
            border: "1px solid #d9d9d9",
            borderRadius: 4
          }}
          sandbox="allow-scripts allow-same-origin allow-forms"
          title="HTML Preview"
        />
      </Modal>
    </>
  );
}

// 自定义 Markdown 组件，支持 HTML 代码预览
const markdownComponents: Components = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    
    // 获取完整的代码内容
    const code = Array.isArray(children) 
      ? children.map((child: any) => {
          if (typeof child === 'string') return child;
          if (typeof child === 'object' && child?.props?.children) {
            return String(child.props.children);
          }
          return String(child);
        }).join('')
      : String(children);

    if (inline) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    return (
      <div style={{ position: "relative", margin: "8px 0" }}>
        <pre
          style={{
            backgroundColor: "#f5f5f5",
            padding: "12px",
            borderRadius: "4px",
            overflow: "auto",
            margin: 0
          }}
        >
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
        {/* 对于HTML代码块，显示预览按钮 */}
        <div style={{ marginTop: 8 }}>
          <HTMLPreview code={code} language={language} />
        </div>
      </div>
    );
  }
};

// 导出 AI 按钮组件，用于在 Header 中使用
export function AIButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="text"
      icon={<RobotOutlined />}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      AI
    </Button>
  );
}

// 导出 useAI hook
export function useAI() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [streaming, setStreaming] = useState(true); // Token Streaming开关
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<StreamingMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messageSequenceRef = useRef<number>(0); // 消息序号，确保顺序
  const currentAssistantMessageIdRef = useRef<string | null>(null); // 当前正在处理的 assistant 消息 ID

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStreamingMessage]);

  // 加载会话列表
  const loadSessions = async () => {
    if (!user) return;
    setLoadingSessions(true);
    try {
      const result = await getAISessions();
      setSessions(result.sessions);
      // 如果没有选中的会话，且有会话列表，默认选中第一个
      if (!sessionId && result.sessions.length > 0) {
        setSessionId(result.sessions[0].id);
      }
    } catch (err) {
      console.error("加载会话列表失败:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  // 当打开 Drawer 时加载会话列表
  useEffect(() => {
    if (open && user) {
      loadSessions();
    }
  }, [open, user]);

  // 当 sessionId 变化时，从数据库加载历史消息
  useEffect(() => {
    if (!sessionId || !user) return;
    
    const loadHistory = async () => {
      try {
        const result = await getAISessionMessages(sessionId);
        // 转换消息格式
        const historyMessages: Message[] = result.messages
          .filter((msg: AIMessage) => msg.role === "user" || msg.role === "assistant")
          .map((msg: AIMessage, index: number) => ({
            id: msg.id,
            role: msg.role as "user" | "assistant",
            content: msg.content,
            sequence: index
          }));
        setMessages(historyMessages);
        messageSequenceRef.current = historyMessages.length;
      } catch (err) {
        console.error("加载历史消息失败:", err);
      }
    };
    
    loadHistory();
  }, [sessionId, user]);

  // 清理函数
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // 打字机效果：逐字添加文本
  const appendToStreamingContent = (newText: string) => {
    if (!streaming) {
      // 如果不使用流式显示，直接追加所有文本
      setCurrentStreamingMessage((prev) => ({
        content: (prev?.content || "") + newText,
        toolCalls: prev?.toolCalls || []
      }));
      return;
    }

    // 使用打字机效果：直接追加新文本，不使用缓冲区
    setCurrentStreamingMessage((prev) => ({
      content: (prev?.content || "") + newText,
      toolCalls: prev?.toolCalls || []
    }));
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    const token = getToken();
    if (!token || !user) {
      setError("请先登录");
      return;
    }

    // 添加用户消息
    messageSequenceRef.current += 1;
    const userSequence = messageSequenceRef.current;
    const userMessage: Message = {
      id: `user-${userSequence}`,
      role: "user",
      content: text,
      sequence: userSequence
    };
    setMessages((prev) => {
      // 检查是否已存在相同序号的消息（防止重复）
      if (prev.some(m => m.sequence === userSequence)) {
        return prev;
      }
      const newMessages = [...prev, userMessage];
      // 按序号排序
      return newMessages.sort((a, b) => a.sequence - b.sequence);
    });
    setInput("");
    setLoading(true);
    setCurrentStreamingMessage({ content: "", toolCalls: [] });
    currentAssistantMessageIdRef.current = null; // 重置，准备接收新的 assistant 消息

    try {
      // 使用fetch发送POST请求，然后通过SSE接收响应
      const response = await fetch(`${API_AI}?stream=true`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          input: text,
          history: messages.map((m) => ({
            role: m.role,
            content: m.content
          })),
          permissions: user.permissions,
          sessionId: sessionId || undefined, // 如果没有 sessionId，后端会创建新会话
          stream: true
        })
      });

      if (!response.ok) {
        // 对于非流式响应（如401错误），尝试解析JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const body = await response.json().catch(() => ({}));
          const errorMsg = body.error || response.statusText || `HTTP ${response.status}`;
          console.error("AI请求失败:", errorMsg, body);
          throw new Error(errorMsg);
        } else {
          // 对于其他类型的错误响应，直接读取文本
          const errorText = await response.text().catch(() => response.statusText);
          console.error("AI请求失败:", response.status, errorText);
          throw new Error(errorText || `HTTP ${response.status}`);
        }
      }

      // 使用ReadableStream读取SSE数据
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("无法读取响应流");
      }

      let buffer = "";
      let currentToolCall: { toolName: string; status: "pending" | "success"; result?: any } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // 保留最后一个不完整的行

        for (const line of lines) {
          if (!line.trim()) continue;

          const parts = line.split("\n");
          let eventType = "message";
          let dataStr = "";

          for (const part of parts) {
            if (part.startsWith("event: ")) {
              eventType = part.substring(7).trim();
            } else if (part.startsWith("data: ")) {
              dataStr = part.substring(6).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            switch (eventType) {
              case "session":
                const newSessionId = data.sessionId || "";
                if (newSessionId && newSessionId !== sessionId) {
                  setSessionId(newSessionId);
                  // 重新加载会话列表以获取新会话
                  loadSessions();
                }
                break;

              case "text":
                // 如果还没有创建 assistant 消息，现在创建
                if (!currentAssistantMessageIdRef.current) {
                  messageSequenceRef.current += 1;
                  const assistantSequence = messageSequenceRef.current;
                  const assistantMessageId = `assistant-${assistantSequence}`;
                  currentAssistantMessageIdRef.current = assistantMessageId;
                  
                  const assistantMessage: Message = {
                    id: assistantMessageId,
                    role: "assistant",
                    content: "",
                    sequence: assistantSequence
                  };
                  
                  setMessages((prev) => {
                    // 检查是否已存在相同序号的消息（防止重复）
                    if (prev.some(m => m.sequence === assistantSequence)) {
                      return prev;
                    }
                    // 按序号排序
                    const newMessages = [...prev, assistantMessage];
                    return newMessages.sort((a, b) => a.sequence - b.sequence);
                  });
                }
                
                // 只更新流式内容（用于实时显示）
                if (data.content) {
                  appendToStreamingContent(data.content);
                } else {
                  // 如果没有content字段，尝试使用其他字段
                  const text = data.text || data.message || data.output || "";
                  if (text) {
                    appendToStreamingContent(String(text));
                  }
                }
                
                // 同时实时更新 messages 中对应的 assistant 消息内容
                if (currentAssistantMessageIdRef.current) {
                  setMessages((prev) => {
                    const textToAdd = data.content || data.text || data.message || data.output || "";
                    return prev.map((msg) => {
                      if (msg.id === currentAssistantMessageIdRef.current) {
                        return {
                          ...msg,
                          content: msg.content + textToAdd
                        };
                      }
                      return msg;
                    });
                  });
                }
                break;

              case "tool_call_start":
                // 如果还没有创建 assistant 消息，现在创建（工具调用可能先于 text 事件）
                if (!currentAssistantMessageIdRef.current) {
                  messageSequenceRef.current += 1;
                  const assistantSequence = messageSequenceRef.current;
                  const assistantMessageId = `assistant-${assistantSequence}`;
                  currentAssistantMessageIdRef.current = assistantMessageId;
                  
                  const assistantMessage: Message = {
                    id: assistantMessageId,
                    role: "assistant",
                    content: "",
                    sequence: assistantSequence
                  };
                  
                  setMessages((prev) => {
                    if (prev.some(m => m.sequence === assistantSequence)) {
                      return prev;
                    }
                    const newMessages = [...prev, assistantMessage];
                    return newMessages.sort((a, b) => a.sequence - b.sequence);
                  });
                }
                
                currentToolCall = {
                  toolName: data.toolName || "unknown",
                  status: "pending"
                };
                setCurrentStreamingMessage((prev) => ({
                  content: prev?.content || "",
                  toolCalls: [...(prev?.toolCalls || []), currentToolCall!]
                }));
                break;

              case "tool_call_end":
                setCurrentStreamingMessage((prev) => {
                  const updatedToolCalls = (prev?.toolCalls || []).map((tc) =>
                    tc.toolName === data.toolName
                      ? { ...tc, status: "success" as const, result: data.result }
                      : tc
                  );
                  // 如果工具调用结果包含数据，将其添加到消息内容中以便展示
                  let updatedContent = prev?.content || "";
                  if (data.result) {
                    try {
                      const resultText = typeof data.result === 'string' 
                        ? data.result 
                        : JSON.stringify(data.result, null, 2);
                      updatedContent += `\n\n**工具调用结果 (${data.toolName}):**\n\`\`\`json\n${resultText}\n\`\`\``;
                    } catch (e) {
                      // 忽略序列化错误
                      updatedContent += `\n\n**工具调用结果 (${data.toolName}):** ${String(data.result)}`;
                    }
                  }
                  return {
                    content: updatedContent,
                    toolCalls: updatedToolCalls
                  };
                });
                break;

              case "done":
                // done 事件时，确保 assistant 消息的最终内容已同步
                if (currentAssistantMessageIdRef.current && currentStreamingMessage) {
                  setMessages((prev) => {
                    return prev.map((msg) => {
                      if (msg.id === currentAssistantMessageIdRef.current) {
                        return {
                          ...msg,
                          content: currentStreamingMessage.content || msg.content,
                          toolCalls: currentStreamingMessage.toolCalls || msg.toolCalls
                        };
                      }
                      return msg;
                    });
                  });
                } else if (currentStreamingMessage && (currentStreamingMessage.content || (currentStreamingMessage.toolCalls && currentStreamingMessage.toolCalls.length > 0))) {
                  // 兜底：如果还没有创建 assistant 消息（不应该发生），现在创建
                  messageSequenceRef.current += 1;
                  const assistantSequence = messageSequenceRef.current;
                  const assistantMessage: Message = {
                    id: `assistant-${assistantSequence}`,
                    role: "assistant",
                    content: currentStreamingMessage.content || "",
                    toolCalls: currentStreamingMessage.toolCalls,
                    sequence: assistantSequence
                  };
                  
                  setMessages((prev) => {
                    if (prev.some(m => m.sequence === assistantSequence)) {
                      return prev;
                    }
                    const newMessages = [...prev, assistantMessage];
                    return newMessages.sort((a, b) => a.sequence - b.sequence);
                  });
                  currentAssistantMessageIdRef.current = assistantMessage.id;
                }
                setCurrentStreamingMessage(null);
                setLoading(false);
                break;

              case "error":
                setError(data.error || "发生错误");
                setLoading(false);
                break;
            }
          } catch (parseErr) {
            console.error("解析SSE数据失败:", parseErr, "原始数据:", dataStr);
          }
        }
      }

      // 确保清理（done 事件应该已经处理了消息同步）
      if (currentAssistantMessageIdRef.current && currentStreamingMessage) {
        // 最终同步一次消息内容（兜底）
        setMessages((prev) => {
          return prev.map((msg) => {
            if (msg.id === currentAssistantMessageIdRef.current) {
              return {
                ...msg,
                content: currentStreamingMessage.content || msg.content,
                toolCalls: currentStreamingMessage.toolCalls || msg.toolCalls
              };
            }
            return msg;
          });
        });
      }
      setCurrentStreamingMessage(null);
      setLoading(false);
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
      setCurrentStreamingMessage(null);
    }
  };

  const handleNewSession = async () => {
    setMessages([]);
    setSessionId(""); // 设置为空，下次发送消息时会创建新会话
    setCurrentStreamingMessage(null);
    setError(null);
    messageSequenceRef.current = 0; // 重置序号
    currentAssistantMessageIdRef.current = null; // 重置当前 assistant 消息 ID
    // 重新加载会话列表
    await loadSessions();
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await deleteAISession(id);
      // 如果删除的是当前会话，切换到新建会话
      if (id === sessionId) {
        setSessionId("");
        setMessages([]);
      }
      // 重新加载会话列表
      await loadSessions();
    } catch (err) {
      console.error("删除会话失败:", err);
      setError(getErrorMessage(err));
    }
  };

  const handleSelectSession = async (id: string) => {
    setSessionId(id);
    setError(null);
  };

  const handleDownloadHistory = () => {
    const historyText = messages
      .map((msg) => `${msg.role === "user" ? "用户" : "助手"}: ${msg.content}`)
      .join("\n\n");
    const blob = new Blob([historyText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-history-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return {
    open,
    setOpen,
    input,
    setInput,
    messages,
    loading,
    error,
    sessionId,
    sessions,
    loadingSessions,
    streaming,
    setStreaming,
    currentStreamingMessage,
    messagesEndRef,
    handleSend,
    handleNewSession,
    handleDeleteSession,
    handleSelectSession,
    handleDownloadHistory,
    loadSessions
  };
}

// 导出 AI Drawer 组件
export function AIDrawerComponent(props: ReturnType<typeof useAI>) {
  const { t } = useI18n();
  const { user } = useAuth();
  
  return (
    <Drawer
      title={
        <div>
          <div style={{ marginBottom: 8 }}>
            <Typography.Text strong>{t("menu.workbench", "工作台")} AI</Typography.Text>
          </div>
        </div>
      }
      placement="right"
      width={800}
      onClose={() => props.setOpen(false)}
      open={props.open}
      extra={
        <Space>
          <Button type="text" icon={<PlusOutlined />} size="small" onClick={props.handleNewSession}>
            新建会话
          </Button>
          {props.sessionId && (
            <Button
              type="text"
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => props.handleDeleteSession(props.sessionId)}
              danger
            >
              删除
            </Button>
          )}
          <Button
            type="text"
            icon={<DownloadOutlined />}
            size="small"
            onClick={props.handleDownloadHistory}
          >
            导出
          </Button>
        </Space>
      }
    >
      <div style={{ display: "flex", height: "calc(100vh - 120px)", maxHeight: "800px", overflow: "hidden" }}>
        {/* 左侧会话列表 */}
        <div style={{ 
          width: 220, 
          minWidth: 220,
          maxWidth: 220,
          borderRight: "1px solid #f0f0f0", 
          padding: "0 12px",
          marginRight: 16, 
          overflowY: "auto",
          overflowX: "hidden",
          flexShrink: 0,
          boxSizing: "border-box"
        }}>
          {props.loadingSessions ? (
            <div style={{ textAlign: "center", padding: 16, color: "#999" }}>加载中...</div>
          ) : (
            <div>
              {props.sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => props.handleSelectSession(session.id)}
                  style={{
                    padding: "8px 12px",
                    marginBottom: 4,
                    cursor: "pointer",
                    borderRadius: 4,
                    backgroundColor: session.id === props.sessionId ? "#e6f7ff" : "transparent",
                    border: session.id === props.sessionId ? "1px solid #1890ff" : "1px solid transparent",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    if (session.id !== props.sessionId) {
                      e.currentTarget.style.backgroundColor = "#f5f5f5";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (session.id !== props.sessionId) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <div style={{ 
                    fontSize: 14, 
                    color: "#000", 
                    marginBottom: 4,
                    wordBreak: "break-word",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical"
                  }}>
                    {session.title || "新会话"}
                  </div>
                  <div style={{ fontSize: 12, color: "#999" }}>
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧消息区域 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          {/* 消息列表 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "16px 0",
            marginBottom: 16,
            minWidth: 0
          }}
        >
          {[...props.messages]
            .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
            .map((msg) => (
              <div
                key={msg.id}
                style={{
                  marginBottom: 24,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start"
                }}
              >
                {(() => {
                  const isHTML = msg.role === "assistant" && msg.content && isHTMLContent(msg.content);
                  // 如果是HTML内容，使用整行宽度布局
                  if (isHTML) {
                    return (
                      <div style={{ width: "100%" }}>
                        <HTMLRenderer html={msg.content.trim()} />
                      </div>
                    );
                  }
                  // 普通消息使用原有布局
                  return (
                    <Space align="start" style={{ maxWidth: "85%" }}>
                      <Avatar
                        size="small"
                        icon={msg.role === "user" ? <UserOutlined /> : <RobotOutlined />}
                        style={{
                          backgroundColor: msg.role === "user" ? "#1890ff" : "#52c41a",
                          flexShrink: 0
                        }}
                      />
                      <div
                        style={{
                          backgroundColor: msg.role === "user" ? "#1890ff" : "#f0f0f0",
                          color: msg.role === "user" ? "#fff" : "#000",
                          padding: "8px 12px",
                          borderRadius: 8,
                          wordWrap: "break-word",
                          wordBreak: "break-word",
                          maxWidth: "100%",
                          minWidth: 0,
                          overflow: "hidden"
                        }}
                      >
                        {msg.role === "assistant" ? (
                          <div>
                            {msg.content ? (
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                components={markdownComponents}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            ) : (
                              <Typography.Text style={{ color: "#999", fontStyle: "italic" }}>
                                正在输入...
                              </Typography.Text>
                            )}
                          </div>
                        ) : (
                          <Typography.Text style={{ color: msg.role === "user" ? "#fff" : "#000" }}>
                            {msg.content}
                          </Typography.Text>
                        )}
                      </div>
                    </Space>
                  );
                })()}
              </div>
            ))}

          {/* 当前流式消息（仅在 messages 中还没有对应消息时显示，作为兜底） */}
          {props.currentStreamingMessage && 
           props.messages.filter(m => m.role === "assistant" && !m.content).length === 0 && (
            <div
              style={{
                marginBottom: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start"
              }}
            >
              {(() => {
                const content = props.currentStreamingMessage.content || "";
                const isHTML = isHTMLContent(content);
                // 如果是HTML内容，使用整行宽度布局
                if (isHTML) {
                  return (
                    <div style={{ width: "100%" }}>
                      <HTMLRenderer html={content.trim()} />
                    </div>
                  );
                }
                // 普通消息使用原有布局
                return (
                  <Space align="start" style={{ maxWidth: "85%" }}>
                    <Avatar
                      size="small"
                      icon={<RobotOutlined />}
                      style={{ backgroundColor: "#52c41a", flexShrink: 0 }}
                    />
                    <div
                      style={{
                        backgroundColor: "#f0f0f0",
                        padding: "8px 12px",
                        borderRadius: 8,
                        wordWrap: "break-word",
                        maxWidth: "100%"
                      }}
                    >
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {content}
                      </ReactMarkdown>
                    </div>
                  </Space>
                );
              })()}
            </div>
          )}

          {props.loading && !props.currentStreamingMessage && (
            <div style={{ textAlign: "center", color: "#999", padding: 16 }}>
              思考中...
            </div>
          )}

          {props.error && (
            <div style={{ textAlign: "center", color: "#ff4d4f", padding: 16 }}>
              {props.error}
            </div>
          )}

          <div ref={props.messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, minWidth: 0, overflow: "hidden" }}>
          <Space direction="vertical" style={{ width: "100%", minWidth: 0 }}>
            {/* <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Switch
                checked={props.streaming}
                onChange={props.setStreaming}
                checkedChildren="流式"
                unCheckedChildren="非流式"
                size="small"
              />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Token Streaming
              </Typography.Text>
            </div> */}
            <Input.TextArea
              value={props.input}
              onChange={(e) => props.setInput(e.target.value)}
              placeholder="输入消息... (Shift+Enter换行, Enter发送)"
              autoSize={{ minRows: 2, maxRows: 6 }}
              onPressEnter={(e) => {
                if (e.shiftKey) {
                  return; // Shift+Enter 换行
                }
                e.preventDefault();
                props.handleSend();
              }}
              disabled={props.loading}
            />
            <Button
              type="primary"
              onClick={props.handleSend}
              loading={props.loading}
              block
            >
              发送
            </Button>
          </Space>
        </div>
        </div>
      </div>
    </Drawer>
  );
}

export default function FloatingAI() {
  const ai = useAI();
  return (
    <>
      <AIButton onClick={() => ai.setOpen(true)} />
      <AIDrawerComponent {...ai} />
    </>
  );
}
