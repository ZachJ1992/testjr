import { Spin } from "antd";
import { Suspense } from "react";
import {
  Navigate,
  Outlet,
  Route,
  BrowserRouter,
  Routes
} from "react-router-dom";
import { useAuth } from "./auth";
import AppLayout from "./layouts/AppLayout";
import GroupsPage from "./pages/Groups";
import LoginPage from "./pages/Login";
import PermissionsPage from "./pages/Permissions";
import OrgsPage from "./pages/Orgs";
import WorkbenchPage from "./pages/Workbench";
import { I18nProvider } from "./i18n";
import I18nAdminPage from "./pages/I18nAdmin";
import UsersPage from "./pages/Users";
import ContractsPage from "./pages/Contracts";
import CreateFinancingContractPage from "./pages/CreateFinancingContract";
import CreateBrokerageContractPage from "./pages/CreateBrokerageContract";
import SystemParametersPage from "./pages/SystemParameters";
import FundersPage from "./pages/Funders";
import FinanciersPage from "./pages/Financiers";
import FundPoolMonitoringPage from "./pages/FundPoolMonitoring";
import WaybillsPage from "./pages/Waybills";
import BrokerageContractsPage from "./pages/BrokerageContracts";
import NewContractsPage from "./pages/NewContracts";
import PaymentApprovalPage from "./pages/PaymentApproval";
import PaymentLedgerPage from "./pages/PaymentLedger";
import PaymentWaybillLedgerPage from "./pages/PaymentWaybillLedger";
import PendingSettlementsPage from "./pages/PendingSettlements";
import FinancingRepaymentSettlementPage from "./pages/FinancingRepaymentSettlement";
import ProfitSharingSettlementPage from "./pages/ProfitSharingSettlement";
import FundIncomeSettlementPage from "./pages/FundIncomeSettlement";
import OperationLogsPage from "./pages/OperationLogs";
import DirectedPayContractsPage from "./pages/DirectedPayContracts";
import CreateDirectedPayContractPage from "./pages/CreateDirectedPayContract";
import DirectedPayRequestsPage from "./pages/DirectedPayRequests";
import DirectedPayApprovalsPage from "./pages/DirectedPayApprovals";
import DirectedPaySettlementsPage from "./pages/DirectedPaySettlements";
import FinancierExpensePage from "./pages/FinancierExpense";
import FunderRevenuePage from "./pages/FunderRevenue";
import PlatformRevenuePage from "./pages/PlatformRevenue";
import SettlementDashboardPage from "./pages/SettlementDashboard";

function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <Suspense fallback={<Spin />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<WorkbenchPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/groups" element={<GroupsPage />} />
                <Route path="/orgs" element={<OrgsPage />} />
                <Route path="/permissions" element={<PermissionsPage />} />
                <Route path="/i18n-admin" element={<I18nAdminPage />} />
                <Route path="/contracts" element={<ContractsPage />} />
                <Route path="/contracts/create-financing" element={<CreateFinancingContractPage />} />
                <Route path="/brokerage-contracts" element={<BrokerageContractsPage />} />
                <Route path="/new-contracts" element={<NewContractsPage />} />
                <Route path="/contracts/create-brokerage" element={<CreateBrokerageContractPage />} />
                <Route path="/system-parameters" element={<SystemParametersPage />} />
                <Route path="/funders" element={<FundersPage />} />
                <Route path="/financiers" element={<FinanciersPage />} />
                <Route path="/fund-pool-monitoring" element={<FundPoolMonitoringPage />} />
                <Route path="/waybills" element={<WaybillsPage />} />
                <Route path="/payment-approval" element={<PaymentApprovalPage />} />
                <Route path="/payment-ledger" element={<PaymentLedgerPage />} />
                <Route path="/payment-waybill-ledger" element={<PaymentWaybillLedgerPage />} />
                <Route path="/settlement-dashboard" element={<SettlementDashboardPage />} />
                <Route path="/pending-settlements" element={<PendingSettlementsPage />} />
                <Route path="/financing-repayment-settlement" element={<FinancingRepaymentSettlementPage />} />
                <Route path="/profit-sharing-settlement" element={<ProfitSharingSettlementPage />} />
                <Route path="/fund-income-settlement" element={<FundIncomeSettlementPage />} />
                <Route path="/operation-logs" element={<OperationLogsPage />} />
                <Route path="/directed-pay-contracts" element={<DirectedPayContractsPage />} />
                <Route path="/directed-pay-contracts/create" element={<CreateDirectedPayContractPage />} />
                <Route path="/directed-pay/requests" element={<DirectedPayRequestsPage />} />
                <Route path="/directed-pay/approvals" element={<DirectedPayApprovalsPage />} />
                <Route path="/directed-pay-settlements" element={<DirectedPaySettlementsPage />} />
                <Route path="/revenue/platform" element={<PlatformRevenuePage />} />
                <Route path="/revenue/funder" element={<FunderRevenuePage />} />
                <Route path="/expense/financier" element={<FinancierExpensePage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </I18nProvider>
    </BrowserRouter>
  );
}

export default App;

