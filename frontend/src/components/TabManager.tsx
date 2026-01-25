import { useEffect, useState, useCallback, useMemo, createContext, useContext, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Tabs } from "antd";
import { CloseOutlined, ReloadOutlined } from "@ant-design/icons";
import type { TabsProps } from "antd";

export interface TabConfig {
  key: string;
  path: string;
  label: string;
  icon?: ReactNode;
  element?: ReactNode;
}

interface TabItem extends TabConfig {
  id: string;
  component: ReactNode;
}

interface TabManagerContextType {
  registerTab: (config: TabConfig, component: ReactNode) => void;
  tabs: TabItem[];
  removeTab: (key: string) => void;
  refreshTab: (key: string) => void;
  activeKey: string;
  setActiveKey: (key: string) => void;
}

const TabManagerContext = createContext<TabManagerContextType | null>(null);

export function useTabManager() {
  const context = useContext(TabManagerContext);
  if (!context) {
    throw new Error("useTabManager must be used within TabManagerProvider");
  }
  return context;
}

interface TabManagerProviderProps {
  children: ReactNode;
  tabConfigs: TabConfig[];
  defaultPath?: string;
}

export function TabManagerProvider({ children, tabConfigs, defaultPath = "/" }: TabManagerProviderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [activeKey, setActiveKey] = useState<string>("");

  // 注册tab配置
  const registerTab = useCallback((config: TabConfig, component: ReactNode) => {
    setTabs(prev => {
      // 如果已存在，更新组件，并确保"/"路由在第一个位置
      const existing = prev.find(t => t.key === config.key);
      if (existing) {
        const updated = prev.map(t => t.key === config.key ? { ...t, component } : t);
        // 确保"/"路由始终在第一个位置
        const rootTab = updated.find(t => t.key === "/");
        if (rootTab && updated[0]?.key !== "/") {
          return [rootTab, ...updated.filter(t => t.key !== "/")];
        }
        return updated;
      }
      // 否则添加新的
      const newTab: TabItem = {
        ...config,
        id: `${config.key}-${Date.now()}`,
        component
      };
      // 如果是要添加根路由"/"，确保它在第一个位置
      if (config.key === "/") {
        return [newTab, ...prev];
      }
      return [...prev, newTab];
    });
  }, []);

  // 根据路由自动打开或切换tab
  useEffect(() => {
    if (tabConfigs.length === 0) return; // 如果还没有配置，等待
    
    const currentPath = location.pathname;
    
    // 查找对应的tab配置（优先精确匹配，然后是最长路径匹配）
    let config = tabConfigs.find(c => c.path === currentPath);
    
    // 如果没有精确匹配，找最长路径匹配
    if (!config) {
      const matchingConfigs = tabConfigs.filter(c => currentPath.startsWith(c.path + "/"));
      // 选择路径最长的匹配
      config = matchingConfigs.reduce((prev, current) => {
        return current.path.length > prev.path.length ? current : prev;
      }, matchingConfigs[0]);
    }
    
    if (!config || !config.element) return;

    setTabs(prev => {
      // 检查是否已有该tab
      const existingTab = prev.find(t => t.key === config.key);
      
      if (existingTab) {
        // 切换到已有tab，并确保"/"路由在第一个位置
        setActiveKey(config.key);
        const rootTab = prev.find(t => t.key === "/");
        if (rootTab && prev[0]?.key !== "/") {
          return [rootTab, ...prev.filter(t => t.key !== "/")];
        }
        return prev;
      }
      
      // 创建新tab
      const newTab: TabItem = {
        ...config,
        id: `${config.key}-${Date.now()}`,
        component: config.element
      };
      
      // 如果是要添加根路由"/"，确保它在第一个位置
      if (config.key === "/") {
        setActiveKey(config.key);
        return [newTab, ...prev];
      }
      
      setActiveKey(config.key);
      const updated = [...prev, newTab];
      // 确保"/"路由始终在第一个位置
      const rootTab = updated.find(t => t.key === "/");
      if (rootTab && updated[0]?.key !== "/") {
        return [rootTab, ...updated.filter(t => t.key !== "/")];
      }
      return updated;
    });
  }, [location.pathname, tabConfigs]);


  const handleTabChange = useCallback((key: string) => {
    const tab = tabs.find(t => t.key === key);
    if (tab) {
      setActiveKey(key);
      navigate(tab.path);
    }
  }, [tabs, navigate]);

  const removeTab = useCallback((key: string) => {
    // 不允许关闭根路由"/"
    if (key === "/") {
      return;
    }
    
    setTabs(prev => {
      if (prev.length <= 1) {
        // 至少保留一个tab
        return prev;
      }
      return prev.filter(t => t.key !== key);
    });
  }, []);

  const refreshTab = useCallback((key: string) => {
    setTabs(prev => {
      const tab = prev.find(t => t.key === key);
      if (!tab) return prev;
      
      // 通过更新 id 来强制组件重新渲染
      return prev.map(t => 
        t.key === key 
          ? { ...t, id: `${t.key}-${Date.now()}` }
          : t
      );
    });
  }, []);

  const handleTabClose = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 不允许关闭根路由"/"
    if (key === "/") {
      return;
    }
    
    if (tabs.length <= 1) {
      // 至少保留一个tab
      return;
    }

    const tabIndex = tabs.findIndex(t => t.key === key);
    if (tabIndex === -1) return;

    // 如果关闭的是当前激活的tab，切换到其他tab（优先切换到根路由）
    if (key === activeKey) {
      const rootTab = tabs.find(t => t.key === "/");
      const nextTab = rootTab || tabs[tabIndex + 1] || tabs[tabIndex - 1];
      if (nextTab) {
        setActiveKey(nextTab.key);
        navigate(nextTab.path);
      }
    }

    // 移除tab
    removeTab(key);
  }, [tabs, activeKey, navigate, removeTab]);

  const tabItems: TabsProps["items"] = useMemo(() => {
    return tabs.map(tab => ({
      key: tab.key,
      label: (
        <span 
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 8,
            padding: "0 8px"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#f5f5f5";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          {tab.icon && <span style={{ fontSize: 14, display: "inline-flex" }}>{tab.icon}</span>}
          <span>{tab.label}</span>
          {/* 根路由"/"不允许关闭，其他tab在至少有两个tab时才显示关闭按钮 */}
          {tab.key !== "/" && tabs.length > 1 && (
            <CloseOutlined
              style={{ 
                fontSize: 12, 
                marginLeft: 4,
                padding: 2,
                borderRadius: 2
              }}
              onClick={(e) => handleTabClose(tab.key, e)}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#ff4d4f";
                e.currentTarget.style.backgroundColor = "#fff1f0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "inherit";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            />
          )}
        </span>
      ),
      closable: false // 我们自己处理关闭逻辑
    }));
  }, [tabs, handleTabClose]);

  const contextValue = useMemo(() => ({
    registerTab,
    tabs,
    removeTab,
    refreshTab,
    activeKey,
    setActiveKey
  }), [registerTab, tabs, removeTab, refreshTab, activeKey]);

  // 渲染tab管理界面和内容
  return (
    <TabManagerContext.Provider value={contextValue}>
      {children}
    </TabManagerContext.Provider>
  );
}

// 导出用于在Content中渲染tab内容的组件
export function TabContent() {
  const { tabs, activeKey } = useTabManager();

  if (tabs.length === 0) {
    // 如果没有tabs，返回null，让Outlet正常渲染
    return null;
  }

  return (
    <div style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 0 }}>
      {/* 渲染所有已打开的tab，使用display控制显示/隐藏以保持状态 */}
      {tabs.map(tab => {
        const isActive = tab.key === activeKey;
        return (
          <div
            key={tab.id}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: isActive ? "flex" : "none",
              flexDirection: "column",
              overflow: "auto",
              width: "100%",
              height: "100%"
            }}
          >
            {tab.component}
          </div>
        );
      })}
    </div>
  );
}

// 导出用于在Header中渲染tab的组件
export function TabBar() {
  const { tabs, activeKey, setActiveKey, removeTab, refreshTab } = useTabManager();
  const location = useLocation();
  const navigate = useNavigate();
  const [hoveredIconTabKey, setHoveredIconTabKey] = useState<string | null>(null);

  // 根据当前路径设置activeKey
  useEffect(() => {
    const currentPath = location.pathname;
    // 优先精确匹配
    let activeTab = tabs.find(t => currentPath === t.path);
    // 如果没有精确匹配，找最长路径匹配
    if (!activeTab) {
      const matchingTabs = tabs.filter(t => currentPath.startsWith(t.path + "/"));
      if (matchingTabs.length > 0) {
        activeTab = matchingTabs.reduce((prev, current) => {
          return current.path.length > prev.path.length ? current : prev;
        }, matchingTabs[0]);
      }
    }
    if (activeTab && activeTab.key !== activeKey) {
      setActiveKey(activeTab.key);
    }
  }, [location.pathname, tabs, activeKey, setActiveKey]);

  const handleTabChange = useCallback((key: string) => {
    const tab = tabs.find(t => t.key === key);
    if (tab) {
      setActiveKey(key);
      navigate(tab.path);
    }
  }, [tabs, navigate, setActiveKey]);

  const handleTabClose = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 不允许关闭根路由"/"
    if (key === "/") {
      return;
    }
    
    if (tabs.length <= 1) {
      return;
    }

    const tabIndex = tabs.findIndex(t => t.key === key);
    if (tabIndex === -1) return;

    // 如果关闭的是当前激活的tab，切换到其他tab（优先切换到根路由）
    if (key === activeKey) {
      const rootTab = tabs.find(t => t.key === "/");
      const nextTab = rootTab || tabs[tabIndex + 1] || tabs[tabIndex - 1];
      if (nextTab) {
        setActiveKey(nextTab.key);
        navigate(nextTab.path);
      }
    }

    // 移除tab
    removeTab(key);
  }, [tabs, activeKey, navigate, setActiveKey, removeTab]);

  const handleRefresh = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.key === key);
    if (tab) {
      // 先更新 tab 的 id 来强制组件重新渲染
      refreshTab(key);
      // 然后通过导航到相同路径来触发路由重新渲染（如果有副作用的话）
      // 使用 replace: false 来确保即使是相同路径也能触发一些更新
      navigate(tab.path, { replace: false });
    }
  }, [tabs, navigate, refreshTab]);

  const tabItems: TabsProps["items"] = useMemo(() => {
    return tabs.map(tab => {
      const isActive = tab.key === activeKey;
      const isIconHovered = hoveredIconTabKey === tab.key;
      const showRefreshIcon = isActive && isIconHovered;

      return {
        key: tab.key,
        label: (
          <span 
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: 8,
              padding: "0 8px"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f5f5f5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              setHoveredIconTabKey(null);
            }}
          >
            {tab.icon && (
              <span 
                style={{ fontSize: 14, display: "inline-flex", cursor: isActive ? "pointer" : "default" }}
                onMouseEnter={() => {
                  if (isActive) {
                    setHoveredIconTabKey(tab.key);
                  }
                }}
                onMouseLeave={() => {
                  setHoveredIconTabKey(null);
                }}
                onClick={(e) => {
                  if (isActive && showRefreshIcon) {
                    handleRefresh(tab.key, e);
                  }
                }}
              >
                {showRefreshIcon ? <ReloadOutlined /> : tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {/* 根路由"/"不允许关闭，其他tab在至少有两个tab时才显示关闭按钮 */}
            {tab.key !== "/" && tabs.length > 1 && (
              <CloseOutlined
                style={{ 
                  fontSize: 12, 
                  marginLeft: 4,
                  padding: 2,
                  borderRadius: 2
                }}
                onClick={(e) => handleTabClose(tab.key, e)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#ff4d4f";
                  e.currentTarget.style.backgroundColor = "#fff1f0";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "inherit";
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              />
            )}
          </span>
        ),
        closable: false
      };
    });
  }, [tabs, handleTabClose, activeKey, hoveredIconTabKey, handleRefresh]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <Tabs
      activeKey={activeKey}
      onChange={handleTabChange}
      items={tabItems}
      type="editable-card"
      hideAdd
      size="small"
      style={{ 
        margin: 0,
        flex: 1,
        height: "100%"
      }}
      tabBarStyle={{ 
        margin: 0, 
        padding: 0,
        background: "transparent",
        border: "none",
        height: "100%"
      }}
    />
  );
}
