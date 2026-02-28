import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Typography, message } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { getErrorMessage } from "../api";

const { Title, Paragraph, Text } = Typography;

function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleFinish = async (values: { username: string; password: string }) => {
    try {
      setLoading(true);
      setErrorMsg("");
      await login(values.username, values.password);
      navigate("/", { replace: true });
    } catch (err) {
      const msg = getErrorMessage(err) || t("login.error", "用户名或密码错误");
      setErrorMsg(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #e0f7ff 0%, #f7f9fb 100%)",
        padding: "24px"
      }}
    >
      <Card style={{ width: 380, boxShadow: "0 12px 40px rgba(0,0,0,0.08)" }}>
        <Title level={3} style={{ textAlign: "center", marginBottom: 8 }}>
          {t("login.title", "登录")}
        </Title>
        <Paragraph style={{ textAlign: "center", color: "#6b7280" }}>
          {t("login.subtitle", "请输入管理员或已有账户")}
        </Paragraph>
        <Form layout="vertical" onFinish={handleFinish} requiredMark={false}>
          <Form.Item
            name="username"
            label={t("login.username", "用户名")}
            rules={[{ required: true, message: t("login.username_required", "请输入用户名") }]}
          >
            <Input prefix={<UserOutlined />} placeholder="admin" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("login.password", "密码")}
            rules={[{ required: true, message: t("login.password_required", "请输入密码") }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={t("login.password_placeholder", "密码")}
              size="large"
            />
          </Form.Item>
          {errorMsg && (
            <div style={{ 
              marginBottom: 16, 
              padding: "8px 12px", 
              background: "#FEF2F2", 
              borderRadius: 6,
              border: "1px solid #FECACA"
            }}>
              <Text type="danger" style={{ fontSize: 13 }}>{errorMsg}</Text>
            </div>
          )}
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
            >
              {t("login.submit", "登录")}
            </Button>
          </Form.Item>
        </Form>
      </Card>
      
      {/* 页脚版权信息 */}
      <div style={{ 
        position: "absolute", 
        bottom: 24, 
        left: 0, 
        right: 0, 
        textAlign: "center" 
      }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Copyright © 2024-{new Date().getFullYear()} 北京登途云物流科技有限公司. All Rights Reserved.
        </Text>
      </div>
    </div>
  );
}

export default LoginPage;

