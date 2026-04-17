import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";
import { message } from "antd";
import { fetchMe, loginApi } from "./api";
import { SafeUser } from "./types";

interface AuthState {
  user?: SafeUser;
  token?: string;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = "auth_token";

/**
 * 将 /auth/me 顶层返回（含 tenant/tenantContext/dataScopes 等）合并回 user 对象，
 * 使既有 `user?.orgContext` / `user?.permissions` 用法继续可用，同时暴露新字段。
 */
function mergeMeResponse(res: {
  user: SafeUser;
  permissions?: string[];
  orgContext?: SafeUser["orgContext"];
  tenant?: SafeUser["tenant"];
  tenantContext?: SafeUser["tenantContext"];
  roles?: SafeUser["roles"];
  groups?: SafeUser["groups"];
  dataScopes?: SafeUser["dataScopes"];
  grantBoundary?: SafeUser["grantBoundary"];
}): SafeUser {
  return {
    ...res.user,
    permissions: res.permissions ?? res.user.permissions,
    orgContext: res.orgContext,
    tenant: res.tenant,
    tenantContext: res.tenantContext,
    roles: res.roles,
    groups: res.groups,
    dataScopes: res.dataScopes,
    grantBoundary: res.grantBoundary
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | undefined>();
  const [token, setToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setUser(undefined);
    setToken(undefined);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await loginApi({ username, password });
    setToken(res.token);
    localStorage.setItem(STORAGE_KEY, res.token);
    // 登录后再拉一次 /auth/me 以拿到完整上下文
    try {
      const me = await fetchMe(res.token);
      setUser(mergeMeResponse(me));
    } catch {
      setUser(res.user);
    }
    message.success("登录成功");
  }, []);

  useEffect(() => {
    const existingToken = localStorage.getItem(STORAGE_KEY);
    if (!existingToken) {
      setLoading(false);
      return;
    }

    fetchMe(existingToken)
      .then((res) => {
        setUser(mergeMeResponse(res));
        setToken(existingToken);
      })
      .catch(() => {
        logout();
      })
      .finally(() => setLoading(false));
  }, [logout]);

  const value: AuthState = {
    user,
    token,
    loading,
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

