import { useEffect, ReactNode } from "react";
import { useLocation, useMatch } from "react-router-dom";
import { useTabManager } from "./TabManager";

interface KeepAliveProps {
  children: ReactNode;
  path: string;
  label: string;
  icon?: ReactNode;
}

/**
 * KeepAlive组件：将子组件注册到TabManager中
 * 使用此组件包裹页面组件，使其可以被Tab系统管理
 */
export function KeepAlive({ children, path, label, icon }: KeepAliveProps) {
  const location = useLocation();
  const match = useMatch(path);
  const { registerTab } = useTabManager();

  useEffect(() => {
    // 生成唯一key（使用path）
    const key = path;
    registerTab({ key, path, label, icon }, children);
  }, [path, label, icon, children, registerTab]);

  // 如果是当前路径，显示内容
  if (match || location.pathname === path) {
    return <>{children}</>;
  }

  return null;
}

