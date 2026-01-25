import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";

const { Title, Paragraph } = Typography;

function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleFinish = async (values: { username: string; password: string }) => {
    try {
      setLoading(true);
      await login(values.username, values.password);
      navigate("/", { replace: true });
    } catch (err) {
      // error handled in login
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
    </div>
  );
}

export default LoginPage;

