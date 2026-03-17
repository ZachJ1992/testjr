import {
  DashboardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TeamOutlined,
  DollarOutlined,
  FundOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  CreditCardOutlined,
  AccountBookOutlined,
  RiseOutlined
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Dropdown,
  Layout,
  Menu,
  Space,
  Typography
} from "antd";
import { useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useRoutes } from "react-router-dom";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { SettingOutlined } from "@ant-design/icons";
import { changePasswordApi, getErrorMessage, getToken } from "../api";
import { designColors, siderStyles, headerStyles } from "../theme";
import { Modal, Form, Input, message } from "antd";
import FloatingAI, { useAI, AIButton, AIDrawerComponent } from "../components/FloatingAI";
import { TabManagerProvider, TabConfig, TabBar, TabContent } from "../components/TabManager";
import GroupsPage from "../pages/Groups";
import PermissionsPage from "../pages/Permissions";
import OrgsPage from "../pages/Orgs";
import WorkbenchPage from "../pages/Workbench";
import I18nAdminPage from "../pages/I18nAdmin";
import UsersPage from "../pages/Users";
import ContractsPage from "../pages/Contracts";
import CreateFinancingContractPage from "../pages/CreateFinancingContract";
import CreateBrokerageContractPage from "../pages/CreateBrokerageContract";
import SystemParametersPage from "../pages/SystemParameters";
import FundersPage from "../pages/Funders";
import FinanciersPage from "../pages/Financiers";
import FundPoolMonitoringPage from "../pages/FundPoolMonitoring";
import WaybillsPage from "../pages/Waybills";
import BrokerageContractsPage from "../pages/BrokerageContracts";
import NewContractsPage from "../pages/NewContracts";
import PaymentApprovalPage from "../pages/PaymentApproval";
import PaymentLedgerPage from "../pages/PaymentLedger";
import PaymentWaybillLedgerPage from "../pages/PaymentWaybillLedger";
import PendingSettlementsPage from "../pages/PendingSettlements";
import FinancingRepaymentSettlementPage from "../pages/FinancingRepaymentSettlement";
import ProfitSharingSettlementPage from "../pages/ProfitSharingSettlement";
import FundIncomeSettlementPage from "../pages/FundIncomeSettlement";
import OperationLogsPage from "../pages/OperationLogs";
import DirectedPaySettlementsPage from "../pages/DirectedPaySettlements";
import DirectedPayContractsPage from "../pages/DirectedPayContracts";
import CreateDirectedPayContractPage from "../pages/CreateDirectedPayContract";
import DirectedPayRequestsPage from "../pages/DirectedPayRequests";
import DirectedPayApprovalsPage from "../pages/DirectedPayApprovals";
import PlatformRevenuePage from "../pages/PlatformRevenue";
import FunderRevenuePage from "../pages/FunderRevenue";
import FinancierExpensePage from "../pages/FinancierExpense";
import SettlementDashboardPage from "../pages/SettlementDashboard";

const { Header, Sider, Content, Footer } = Layout;

// 辅助函数：检查用户是否有指定权限（支持 * 通配符）
function hasPermission(permissions: string[] | undefined, permissionCode: string): boolean {
  if (!permissions) return false;
  return permissions.includes("*") || permissions.includes(permissionCode);
}

// 辅助函数：检查用户是否有任意一个权限
function hasAnyPermission(permissions: string[] | undefined, ...permissionCodes: string[]): boolean {
  if (!permissions) return false;
  if (permissions.includes("*")) return true;
  return permissionCodes.some(code => permissions.includes(code));
}

function AppLayout() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdForm] = Form.useForm<{ oldPassword: string; newPassword: string }>();
  const ai = useAI();

  const menuItems = useMemo(() => {
    const items: any[] = [
      {
        key: "/",
        icon: <DashboardOutlined />,
        label: <Link to="/">{t("menu.workbench", "工作台")}</Link>
      }
    ];

    // ==================== 收益看板菜单（工作台下方）====================
    const revenueChildren: any[] = [];
    
    // 判断是否为平台用户（包括admin、有*权限、orgType为platform）
    const isPlatformUser = user?.permissions?.includes("*") || 
                           user?.orgContext?.orgType === 'platform' ||
                           hasPermission(user?.permissions, "view_platform_revenue");

    // 平台收益看板（平台用户可见）
    if (isPlatformUser) {
      revenueChildren.push({
        key: "/revenue/platform",
        label: <Link to="/revenue/platform">{t("menu.platform_revenue", "平台收益看板")}</Link>
      });
    }
    
    // 资金方收益（平台用户 + 资金方用户可见）
    if (isPlatformUser || user?.orgContext?.orgType === 'funder' || hasPermission(user?.permissions, "view_funder_revenue")) {
      const isFunderView = user?.orgContext?.orgType === 'funder' && !isPlatformUser;
      revenueChildren.push({
        key: "/revenue/funder",
        label: <Link to="/revenue/funder">{t("menu.funder_revenue", isFunderView ? "我的收益" : "资金方收益")}</Link>
      });
    }
    
    // 合作方支出（平台用户 + 合作方用户可见）
    if (isPlatformUser || user?.orgContext?.orgType === 'financier' || hasPermission(user?.permissions, "view_financier_expense")) {
      const isFinancierView = user?.orgContext?.orgType === 'financier' && !isPlatformUser;
      revenueChildren.push({
        key: "/expense/financier",
        label: <Link to="/expense/financier">{t("menu.financier_expense", isFinancierView ? "我的支出" : "合作方支出")}</Link>
      });
    }

    // 如果收益看板有子菜单，添加收益看板父菜单
    if (revenueChildren.length > 0) {
      items.push({
        key: "revenue-dashboard",
        icon: <RiseOutlined />,
        label: t("menu.revenue_dashboard", "收益看板"),
        children: revenueChildren
      });
    }

    // 构建合同管理的子菜单
    if (user?.permissions?.includes("manage_contracts")) {
      const contractChildren: any[] = [
        {
          key: "/contracts",
          label: <Link to="/contracts">{t("contracts.financing_contracts", "三方融资合同")}</Link>
        },
        {
          key: "/brokerage-contracts",
          label: <Link to="/brokerage-contracts">{t("contracts.brokerage_contracts", "撮合业务合同")}</Link>
        },
        {
          key: "/new-contracts",
          label: <Link to="/new-contracts">{t("contracts.commission_contracts", "抽成合同")}</Link>
        },
        {
          key: "/directed-pay-contracts",
          label: <Link to="/directed-pay-contracts">{t("contracts.directed_pay_contracts", "定向支付合同")}</Link>
        }
      ];
      
      items.push({
        key: "contracts",
        icon: <FileTextOutlined />,
        label: t("menu.contracts", "合同管理"),
        children: contractChildren
      });
    }


    // 构建定向支付的子菜单
    const directedPayChildren: any[] = [];
    if (hasAnyPermission(user?.permissions, "create_directed_payment", "approve_directed_payment_platform", "approve_directed_payment_funder")) {
      directedPayChildren.push({
        key: "/directed-pay/requests",
        label: <Link to="/directed-pay/requests">{t("menu.directed_pay_requests", "支付申请")}</Link>
      });
    }
    if (hasAnyPermission(user?.permissions, "approve_directed_payment_platform", "approve_directed_payment_funder")) {
      directedPayChildren.push({
        key: "/directed-pay/approvals",
        label: <Link to="/directed-pay/approvals">{t("menu.directed_pay_approvals", "待审批")}</Link>
      });
    }
    
    // 如果定向支付有子菜单，添加定向支付父菜单
    if (directedPayChildren.length > 0) {
      items.push({
        key: "directed-pay",
        icon: <DollarOutlined />,
        label: t("menu.directed_pay", "定向支付"),
        children: directedPayChildren
      });
    }

    // 构建支付中心的子菜单
    const paymentChildren: any[] = [];
    if (user?.permissions?.includes("approve_payments")) {
      paymentChildren.push({
        key: "/payment-approval",
        label: <Link to="/payment-approval">{t("menu.payment_approval", "待办代付审核")}</Link>
      });
    }
    if (user?.permissions?.includes("view_payment_ledger")) {
      paymentChildren.push({
        key: "/payment-ledger",
        label: <Link to="/payment-ledger">{t("menu.payment_ledger", "支付流水台账")}</Link>
      });
    }
    if (user?.permissions?.includes("view_payment_waybill_ledger")) {
      paymentChildren.push({
        key: "/payment-waybill-ledger",
        label: <Link to="/payment-waybill-ledger">{t("menu.payment_waybill_ledger", "单车运单台账")}</Link>
      });
    }

    // 如果支付中心有子菜单，添加支付中心父菜单
    if (paymentChildren.length > 0) {
      items.push({
        key: "payment-center",
        icon: <CreditCardOutlined />,
        label: t("menu.payment_center", "支付中心"),
        children: paymentChildren
      });
    }

       // 构建结算中心的子菜单
       const settlementChildren: any[] = [];
       if (user?.permissions?.includes("manage_settlements") || user?.permissions?.includes("view_directed_pay_settlements")) {
         settlementChildren.push({
           key: "/settlement-dashboard",
           label: <Link to="/settlement-dashboard">{t("menu.settlement_dashboard", "结算中心")}</Link>
         });
       }
       if (user?.permissions?.includes("manage_settlements")) {
         settlementChildren.push({
           key: "/pending-settlements",
           label: <Link to="/pending-settlements">{t("menu.pending_settlements", "待处理结算单")}</Link>
         });
         settlementChildren.push({
           key: "/financing-repayment-settlement",
           label: <Link to="/financing-repayment-settlement">{t("menu.financing_repayment_settlement", "融资还款结算")}</Link>
         });
         settlementChildren.push({
           key: "/profit-sharing-settlement",
           label: <Link to="/profit-sharing-settlement">{t("menu.profit_sharing_settlement", "业务抽成结算")}</Link>
         });
         settlementChildren.push({
           key: "/fund-income-settlement",
           label: <Link to="/fund-income-settlement">{t("menu.fund_income_settlement", "资金收益结算")}</Link>
         });
       }
       // 定向支付结算菜单 - 平台用户和资金方可见，合作方不可见
       const canViewDirectedPaySettlements = 
         user?.permissions?.includes("*") ||
         user?.permissions?.includes("manage_directed_pay_settlements") || 
         user?.permissions?.includes("view_directed_pay_settlements") ||
         user?.orgContext?.orgType === 'platform' ||
         user?.orgContext?.orgType === 'funder';
       
       if (canViewDirectedPaySettlements) {
         settlementChildren.push({
           key: "/directed-pay-settlements",
           label: <Link to="/directed-pay-settlements">{t("menu.directed_pay_settlements", "定向支付结算")}</Link>
         });
       }
   
       // 如果结算中心有子菜单，添加结算中心父菜单
       if (settlementChildren.length > 0) {
         items.push({
           key: "settlement-center",
           icon: <AccountBookOutlined />,
           label: t("menu.settlement_center", "结算中心"),
           children: settlementChildren
         });
       }

    // 构建资源管理的子菜单
    const resourceChildren: any[] = [];

    if (user?.permissions?.includes("manage_funders")) {
      resourceChildren.push({
        key: "/funders",
        icon: <DollarOutlined />,
        label: <Link to="/funders">{t("menu.funders", "资金方档案")}</Link>
      });
    }

    if (user?.permissions?.includes("manage_financiers")) {
      resourceChildren.push({
        key: "/financiers",
        icon: <DollarOutlined />,
        label: <Link to="/financiers">{t("menu.financiers", "合作方档案")}</Link>
      });
    }

    if (user?.permissions?.includes("view_fund_pool")) {
      resourceChildren.push({
        key: "/fund-pool-monitoring",
        icon: <FundOutlined />,
        label: <Link to="/fund-pool-monitoring">{t("menu.fund_pool", "资金池监控")}</Link>
      });
    }

    // 运单数据菜单 - manage_waybills 权限
    resourceChildren.push({
      key: "/waybills",
      icon: <FileTextOutlined />,
      label: <Link to="/waybills">{t("menu.waybills", "运单数据")}</Link>
    });

    // 如果资源管理有子菜单，添加资源管理父菜单
    if (resourceChildren.length > 0) {
      items.push({
        key: "resource",
        icon: <DatabaseOutlined />,
        label: t("menu.resource", "资源管理"),
        children: resourceChildren
      });
    }
    // 构建系统管理的子菜单
    const systemChildren: any[] = [];

    if (user?.permissions?.includes("manage_users")) {
      systemChildren.push({
        key: "/users",
        icon: <TeamOutlined />,
        label: <Link to="/users">{t("menu.users", "用户管理")}</Link>
      });
    }

    if (user?.permissions?.includes("manage_permissions")) {
      systemChildren.push({
        key: "/permissions",
        icon: <TeamOutlined />,
        label: <Link to="/permissions">{t("menu.permissions", "权限管理")}</Link>
      });
    }

    if (user?.permissions?.includes("manage_groups")) {
      systemChildren.push({
        key: "/groups",
        icon: <TeamOutlined />,
        label: <Link to="/groups">{t("menu.groups", "用户组管理")}</Link>
      });
    }

    if (user?.permissions?.includes("manage_orgs")) {
      systemChildren.push({
        key: "/orgs",
        icon: <TeamOutlined />,
        label: <Link to="/orgs">{t("menu.orgs", "组织管理")}</Link>
      });
    }

    if (user?.permissions?.includes("manage_permissions")) {
      systemChildren.push({
        key: "/i18n-admin",
        icon: <SettingOutlined />,
        label: <Link to="/i18n-admin">{t("menu.i18n", "多语言管理")}</Link>
      });
    }

    if (user?.permissions?.includes("manage_system_parameters")) {
      systemChildren.push({
        key: "/system-parameters",
        icon: <SettingOutlined />,
        label: <Link to="/system-parameters">{t("menu.system_parameters", "参数配置")}</Link>
      });
    }

    if (user?.permissions?.includes("view_operation_logs")) {
      systemChildren.push({
        key: "/operation-logs",
        icon: <FileTextOutlined />,
        label: <Link to="/operation-logs">{t("menu.operation_logs", "操作日志")}</Link>
      });
    }

    // 如果系统管理有子菜单，添加系统管理父菜单
    if (systemChildren.length > 0) {
      items.push({
        key: "system",
        icon: <AppstoreOutlined />,
        label: t("menu.system", "系统管理"),
        children: systemChildren
      });
    }


    return items;
  }, [user, t]);

  // 构建tab配置
  const tabConfigs: TabConfig[] = useMemo(() => {
    const configs: TabConfig[] = [
      {
        key: "/",
        path: "/",
        label: t("menu.workbench", "工作台"),
        icon: <DashboardOutlined />,
        element: <WorkbenchPage />
      }
    ];

    if (user?.permissions?.includes("manage_users")) {
      configs.push({
        key: "/users",
        path: "/users",
        label: t("menu.users", "用户管理"),
        icon: <TeamOutlined />,
        element: <UsersPage />
      });
    }

    if (user?.permissions?.includes("manage_permissions")) {
      configs.push({
        key: "/permissions",
        path: "/permissions",
        label: t("menu.permissions", "权限管理"),
        icon: <TeamOutlined />,
        element: <PermissionsPage />
      });
    }

    if (user?.permissions?.includes("manage_groups")) {
      configs.push({
        key: "/groups",
        path: "/groups",
        label: t("menu.groups", "用户组管理"),
        icon: <TeamOutlined />,
        element: <GroupsPage />
      });
    }

    if (user?.permissions?.includes("manage_orgs")) {
      configs.push({
        key: "/orgs",
        path: "/orgs",
        label: t("menu.orgs", "组织管理"),
        icon: <TeamOutlined />,
        element: <OrgsPage />
      });
    }

    if (user?.permissions?.includes("manage_permissions")) {
      configs.push({
        key: "/i18n-admin",
        path: "/i18n-admin",
        label: t("menu.i18n", "多语言管理"),
        icon: <SettingOutlined />,
        element: <I18nAdminPage />
      });
    }

    if (user?.permissions?.includes("manage_system_parameters")) {
      configs.push({
        key: "/system-parameters",
        path: "/system-parameters",
        label: t("menu.system_parameters", "参数配置"),
        icon: <SettingOutlined />,
        element: <SystemParametersPage />
      });
    }

    if (user?.permissions?.includes("view_operation_logs")) {
      configs.push({
        key: "/operation-logs",
        path: "/operation-logs",
        label: t("menu.operation_logs", "操作日志"),
        icon: <FileTextOutlined />,
        element: <OperationLogsPage />
      });
    }

    if (user?.permissions?.includes("manage_contracts")) {
      configs.push(
        {
          key: "/contracts",
          path: "/contracts",
          label: t("contracts.financing_contracts", "三方融资合同"),
          icon: <FileTextOutlined />,
          element: <ContractsPage />
        },
        {
          key: "/brokerage-contracts",
          path: "/brokerage-contracts",
          label: t("contracts.brokerage_contracts", "撮合业务合同"),
          icon: <FileTextOutlined />,
          element: <BrokerageContractsPage />
        },
        {
          key: "/contracts/create-financing",
          path: "/contracts/create-financing",
          label: t("contracts.create_financing", "创建三方融资合同"),
          icon: <FileTextOutlined />,
          element: <CreateFinancingContractPage />
        },
        {
          key: "/contracts/create-brokerage",
          path: "/contracts/create-brokerage",
          label: t("contracts.create_brokerage", "录入撮合合同"),
          icon: <FileTextOutlined />,
          element: <CreateBrokerageContractPage />
        },
        {
          key: "/new-contracts",
          path: "/new-contracts",
          label: t("contracts.commission_contracts", "抽成合同"),
          icon: <FileTextOutlined />,
          element: <NewContractsPage />
        },
        {
          key: "/directed-pay-contracts",
          path: "/directed-pay-contracts",
          label: t("contracts.directed_pay_contracts", "定向支付合同"),
          icon: <FileTextOutlined />,
          element: <DirectedPayContractsPage />
        },
        {
          key: "/directed-pay-contracts/create",
          path: "/directed-pay-contracts/create",
          label: t("contracts.create_directed_pay", "创建定向支付合同"),
          icon: <FileTextOutlined />,
          element: <CreateDirectedPayContractPage />
        }
      );
    }

    if (user?.permissions?.includes("manage_funders")) {
      configs.push({
        key: "/funders",
        path: "/funders",
        label: t("menu.funders", "资金方档案"),
        icon: <DollarOutlined />,
        element: <FundersPage />
      });
    }

    if (user?.permissions?.includes("manage_financiers")) {
      configs.push({
        key: "/financiers",
        path: "/financiers",
        label: t("menu.financiers", "合作方档案"),
        icon: <DollarOutlined />,
        element: <FinanciersPage />
      });
    }

    if (user?.permissions?.includes("view_fund_pool")) {
      configs.push({
        key: "/fund-pool-monitoring",
        path: "/fund-pool-monitoring",
        label: t("menu.fund_pool", "资金池监控"),
        icon: <FundOutlined />,
        element: <FundPoolMonitoringPage />
      });
    }

    // 运单数据页面配置
    configs.push({
      key: "/waybills",
      path: "/waybills",
      label: t("menu.waybills", "运单数据"),
      icon: <FileTextOutlined />,
      element: <WaybillsPage />
    });

    if (user?.permissions?.includes("approve_payments")) {
      configs.push({
        key: "/payment-approval",
        path: "/payment-approval",
        label: t("menu.payment_approval", "待办代付审核"),
        icon: <CreditCardOutlined />,
        element: <PaymentApprovalPage />
      });
    }

    if (user?.permissions?.includes("view_payment_ledger")) {
      configs.push({
        key: "/payment-ledger",
        path: "/payment-ledger",
        label: t("menu.payment_ledger", "支付流水台账"),
        icon: <CreditCardOutlined />,
        element: <PaymentLedgerPage />
      });
    }

    if (user?.permissions?.includes("view_payment_waybill_ledger")) {
      configs.push({
        key: "/payment-waybill-ledger",
        path: "/payment-waybill-ledger",
        label: t("menu.payment_waybill_ledger", "单车运单台账"),
        icon: <CreditCardOutlined />,
        element: <PaymentWaybillLedgerPage />
      });
    }

    // 结算中心（优先显示）
    if (user?.permissions?.includes("manage_settlements") || user?.permissions?.includes("view_directed_pay_settlements")) {
      configs.push({
        key: "/settlement-dashboard",
        path: "/settlement-dashboard",
        label: t("menu.settlement_dashboard", "结算中心"),
        icon: <AccountBookOutlined />,
        element: <SettlementDashboardPage />
      });
    }

    if (user?.permissions?.includes("manage_settlements")) {
      configs.push({
        key: "/pending-settlements",
        path: "/pending-settlements",
        label: t("menu.pending_settlements", "待处理结算单"),
        icon: <AccountBookOutlined />,
        element: <PendingSettlementsPage />
      });
      configs.push({
        key: "/financing-repayment-settlement",
        path: "/financing-repayment-settlement",
        label: t("menu.financing_repayment_settlement", "融资还款结算"),
        icon: <AccountBookOutlined />,
        element: <FinancingRepaymentSettlementPage />
      });
      configs.push({
        key: "/profit-sharing-settlement",
        path: "/profit-sharing-settlement",
        label: t("menu.profit_sharing_settlement", "业务抽成结算"),
        icon: <AccountBookOutlined />,
        element: <ProfitSharingSettlementPage />
      });
      configs.push({
        key: "/fund-income-settlement",
        path: "/fund-income-settlement",
        label: t("menu.fund_income_settlement", "资金收益结算"),
        icon: <AccountBookOutlined />,
        element: <FundIncomeSettlementPage />
      });
    }

    // 定向支付结算页面 - 平台用户和资金方可见，合作方不可见
    const canViewDirectedPaySettlementsTab = 
      user?.permissions?.includes("*") ||
      user?.permissions?.includes("manage_directed_pay_settlements") || 
      user?.permissions?.includes("view_directed_pay_settlements") ||
      user?.orgContext?.orgType === 'platform' ||
      user?.orgContext?.orgType === 'funder';
    
    if (canViewDirectedPaySettlementsTab) {
      configs.push({
        key: "/directed-pay-settlements",
        path: "/directed-pay-settlements",
        label: t("menu.directed_pay_settlements", "定向支付结算"),
        icon: <AccountBookOutlined />,
        element: <DirectedPaySettlementsPage />
      });
    }

    // 定向支付 - 支付申请页面
    if (hasAnyPermission(user?.permissions, "create_directed_payment", "approve_directed_payment_platform", "approve_directed_payment_funder")) {
      configs.push({
        key: "/directed-pay/requests",
        path: "/directed-pay/requests",
        label: t("menu.directed_pay_requests", "支付申请"),
        icon: <DollarOutlined />,
        element: <DirectedPayRequestsPage />
      });
    }

    // 定向支付 - 待审批页面
    if (hasAnyPermission(user?.permissions, "approve_directed_payment_platform", "approve_directed_payment_funder")) {
      configs.push({
        key: "/directed-pay/approvals",
        path: "/directed-pay/approvals",
        label: t("menu.directed_pay_approvals", "待审批"),
        icon: <DollarOutlined />,
        element: <DirectedPayApprovalsPage />
      });
    }

    // 平台收益看板页面（平台用户可见）
    if (hasPermission(user?.permissions, "view_platform_revenue")) {
      configs.push({
        key: "/revenue/platform",
        path: "/revenue/platform",
        label: t("menu.platform_revenue", "平台收益看板"),
        icon: <DollarOutlined />,
        element: <PlatformRevenuePage />
      });
    }

    // 资金方收益页面（平台用户 + 资金方用户可见）
    // isPlatformUser 包括：admin(*权限)、orgType为platform、有view_platform_revenue权限
    const isPlatformUserForTabs = user?.permissions?.includes("*") || 
                                   user?.orgContext?.orgType === 'platform' ||
                                   hasPermission(user?.permissions, "view_platform_revenue");
    
    if (isPlatformUserForTabs || user?.orgContext?.orgType === 'funder' || hasPermission(user?.permissions, "view_funder_revenue")) {
      const isFunderView = user?.orgContext?.orgType === 'funder' && !isPlatformUserForTabs;
      configs.push({
        key: "/revenue/funder",
        path: "/revenue/funder",
        label: t("menu.funder_revenue", isFunderView ? "我的收益" : "资金方收益"),
        icon: <DollarOutlined />,
        element: <FunderRevenuePage />
      });
    }

    // 合作方支出页面（平台用户 + 合作方用户可见）
    if (isPlatformUserForTabs || user?.orgContext?.orgType === 'financier' || hasPermission(user?.permissions, "view_financier_expense")) {
      const isFinancierView = user?.orgContext?.orgType === 'financier' && !isPlatformUserForTabs;
      configs.push({
        key: "/expense/financier",
        path: "/expense/financier",
        label: t("menu.financier_expense", isFinancierView ? "我的支出" : "合作方支出"),
        icon: <DollarOutlined />,
        element: <FinancierExpensePage />
      });
    }

    return configs;
  }, [user, t]);

  const userMenu = {
    items: [
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: t("menu.logout", "退出登录"),
        onClick: () => {
          logout();
          navigate("/login", { replace: true });
        }
      },
      {
        key: "password",
        icon: <SettingOutlined />,
        label: t("users.change_password", "修改密码"),
        onClick: () => {
          pwdForm.resetFields();
          setPwdOpen(true);
        }
      }
    ]
  };

  return (
    <TabManagerProvider tabConfigs={tabConfigs}>
      <Layout style={{ height: "100vh", overflow: "hidden" }}>
        <Sider 
          collapsible 
          collapsed={collapsed} 
          onCollapse={setCollapsed}
          width={siderStyles.width}
          collapsedWidth={siderStyles.collapsedWidth}
          style={{
            overflow: "hidden",
            height: "100vh",
            background: siderStyles.background,
          }}
        >
          <div
            style={{
              height: 48,
              margin: 12,
              color: "rgba(255, 255, 255, 0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: collapsed ? 16 : 18,
              flexShrink: 0,
              letterSpacing: collapsed ? 0 : 2,
              transition: "all 0.2s ease",
            }}
          >
            {collapsed ? "登途" : "登途云"}
          </div>
          <div style={{ 
            height: "calc(100vh - 72px)",
            overflowY: "auto", 
            overflowX: "hidden"
          }}>
            <Menu
              theme="dark"
              mode="inline"
              selectedKeys={[location.pathname]}
              defaultOpenKeys={menuItems.filter((item: any) => item.children && item.children.length > 0).map((item: any) => item.key)}
              items={menuItems}
              style={{ borderRight: 0 }}
            />
          </div>
        </Sider>
        <Layout style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Header
          style={{
            background: headerStyles.background,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            borderBottom: headerStyles.borderBottom,
            zIndex: 10,
            flexDirection: "column",
            paddingTop: 0,
            paddingBottom: 0,
            flexShrink: 0,
            height: headerStyles.height,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", width: "100%", height: 48 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((c) => !c)}
            />
            <div style={{ flex: 1, overflow: "hidden", marginLeft: 16 }}>
              <TabBar />
            </div>
            <Space style={{ marginLeft: 16 }}>
              <AIButton onClick={() => ai.setOpen(true)} />
              <Dropdown
                menu={{
                  items: [
                    { key: "zh-CN", label: t("menu.lang.zh", "中文"), onClick: () => setLang("zh-CN") },
                    { key: "en-US", label: t("menu.lang.en", "English"), onClick: () => setLang("en-US") }
                  ]
                }}
              >
                <Button type="text">{lang === "en-US" ? "English" : "中文"}</Button>
              </Dropdown>
              <Dropdown menu={userMenu} placement="bottomRight">
                <Space style={{ cursor: "pointer" }}>
                  <Avatar size="small">
                    {user?.displayName?.[0]?.toUpperCase() || "U"}
                  </Avatar>
                  <Typography.Text>
                    {user?.displayName || user?.username || t("common.not_logged_in", "未登录")}
                  </Typography.Text>
                </Space>
              </Dropdown>
            </Space>
          </div>
        </Header>
        <Content style={{ 
          background: designColors.bgPrimary, 
          display: "flex", 
          flexDirection: "column", 
          flex: 1,
          overflow: "hidden",
          minHeight: 0
        }}>
          <TabContent />
          {/* 隐藏Outlet，确保路由正常工作但内容由TabContent渲染 */}
          <div style={{ display: "none" }}>
            <Outlet />
          </div>
          <AIDrawerComponent {...ai} />
        </Content>
        {/* 页脚版权信息 */}
        <Footer style={{ 
          textAlign: "center", 
          padding: "12px 24px",
          background: "transparent",
          color: "#CBD5E1",
          fontSize: 12,
          flexShrink: 0
        }}>
          Copyright © 2024-{new Date().getFullYear()} 北京登途云物流科技有限公司. All Rights Reserved.
        </Footer>
      </Layout>
      <Modal
        title={t("users.change_password", "修改密码")}
        open={pwdOpen}
        onCancel={() => setPwdOpen(false)}
        onOk={async () => {
          const token = getToken();
          if (!token) {
            message.error(t("common.not_logged_in", "未登录"));
            return;
          }
          try {
            const values = await pwdForm.validateFields();
            await changePasswordApi(token, values);
            message.success(
              t("users.password_changed", "已修改，请使用新密码登录。")
            );
            setPwdOpen(false);
            pwdForm.resetFields();
          } catch (err) {
            const msg = getErrorMessage(err) || "修改失败";
            pwdForm.setFields([
              { name: "oldPassword", errors: msg ? [msg] : [] }
            ]);
            message.error(msg);
          }
        }}
        destroyOnHidden
      >
        <Form layout="vertical" form={pwdForm}>
          <Form.Item
            name="oldPassword"
            label={t("users.old_password", "原密码")}
            rules={[{ required: true, message: t("users.old_password_required", "请输入原密码") }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label={t("users.password", "密码")}
            rules={[{ required: true, message: t("users.password_required", "请输入密码") }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
      </Layout>
    </TabManagerProvider>
  );
}

export default AppLayout;

