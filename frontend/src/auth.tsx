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
    setUser(res.user);
    setToken(res.token);
    localStorage.setItem(STORAGE_KEY, res.token);
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
        setUser(res.user);
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

