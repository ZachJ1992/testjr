import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Typography, message } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { getErrorMessage } from "../api";

const { Title, Text, Paragraph } = Typography;

/** 与 `frontend/public/brand/` 下文件名一致；带 BASE_URL 避免非根部署时 404 */
const LOGIN_BG_URL = `${import.meta.env.BASE_URL}brand/login-bg.png`;

/** 模板 C：整页装饰背景 + 轻蒙版、中间登录卡为唯一主交互区；无租户 ID */
const shell: React.CSSProperties = {
  position: "relative",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#eef2f6",
  backgroundImage: `url(${JSON.stringify(LOGIN_BG_URL)})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat"
};

/** 整页可读性蒙版：配图本身偏亮，蒙版过重会完全盖住纹理，看起来像「没换图」 */
const shellMask: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
  pointerEvents: "none",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.48) 42%, rgba(255,255,255,0.44) 100%)"
};

const shellContent: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: "100vh"
};

const main: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 24px 48px"
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 400,
  borderRadius: 12,
  border: "1px solid rgba(15, 23, 42, 0.06)",
  boxShadow:
    "0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px rgba(15, 23, 42, 0.08)"
};

const brandBlock: React.CSSProperties = {
  textAlign: "center",
  marginBottom: 24
};

const brandTitleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 8,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  color: "#0f172a",
  lineHeight: 1.35,
  fontSize: 20,
  wordBreak: "break-word",
  overflowWrap: "anywhere"
};

const brandTaglineStyle: React.CSSProperties = {
  marginBottom: 0,
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
  wordBreak: "break-word",
  overflowWrap: "anywhere"
};

const errorBox: React.CSSProperties = {
  marginBottom: 16,
  padding: "10px 12px",
  background: "#FEF2F2",
  borderRadius: 8,
  border: "1px solid #FECACA"
};

const footerBar: React.CSSProperties = {
  flexShrink: 0,
  padding: "16px 24px 24px",
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  alignItems: "center",
  gap: "0 4px",
  rowGap: 6,
  fontSize: 12,
  color: "rgba(0, 0, 0, 0.45)",
  lineHeight: 1.5
};

const footerLink: React.CSSProperties = {
  color: "inherit",
  textDecoration: "none",
  whiteSpace: "nowrap"
};

const footerSep: React.CSSProperties = {
  margin: "0 6px",
  userSelect: "none",
  color: "rgba(0, 0, 0, 0.25)"
};

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
    <div style={shell}>
      <div style={shellMask} aria-hidden />
      <div style={shellContent}>
        <div style={main}>
          <Card styles={{ body: { padding: "32px 28px 28px" } }} style={cardStyle}>
            <div style={brandBlock}>
              <Title level={1} style={brandTitleStyle}>
                {t("login.brand_title", "登途云经营与结算管理系统")}
              </Title>
              <Paragraph style={brandTaglineStyle}>
                {t("login.brand_tagline", "让合同、支付、收益与结算协同更清晰")}
              </Paragraph>
            </div>
            <Form layout="vertical" onFinish={handleFinish} requiredMark={false}>
              <Form.Item
                name="username"
                label={t("login.username", "用户名")}
                rules={[{ required: true, message: t("login.username_required", "请输入用户名") }]}
                style={{ marginBottom: 20 }}
              >
                <Input prefix={<UserOutlined />} placeholder="admin" size="large" />
              </Form.Item>
              <Form.Item
                name="password"
                label={t("login.password", "密码")}
                rules={[{ required: true, message: t("login.password_required", "请输入密码") }]}
                style={{ marginBottom: errorMsg ? 16 : 20 }}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder={t("login.password_placeholder", "密码")}
                  size="large"
                />
              </Form.Item>
              {errorMsg && (
                <div style={errorBox}>
                  <Text type="danger" style={{ fontSize: 13 }}>
                    {errorMsg}
                  </Text>
                </div>
              )}
              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  loading={loading}
                  style={{ height: 44, fontWeight: 500 }}
                >
                  {t("login.submit", "登录")}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </div>
        <div className="login-page-footer" style={footerBar}>
          <span style={{ whiteSpace: "nowrap" }}>
            Copyright © 2024-{new Date().getFullYear()} 北京登途云物流科技有限公司. All Rights Reserved.
          </span>
          <span style={footerSep} aria-hidden>
            |
          </span>
          <a
            href="https://beian.miit.gov.cn/#/Integrated/index"
            target="_blank"
            rel="noopener noreferrer"
            style={footerLink}
          >
            京ICP备2026007002号-1
          </a>
          <span style={footerSep} aria-hidden>
            |
          </span>
          <a
            href="https://beian.mps.gov.cn/#/query/webSearch"
            target="_blank"
            rel="noopener noreferrer"
            style={footerLink}
          >
            京公网安备11011502039755号
          </a>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
