import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { BillingProvider } from "./lib/store";
import { AppLayout } from "./components/AppLayout";
import { Login } from "./pages/Login/Login";
import { Dashboard } from "./pages/Dashboard/Dashboard";
import { Invoices } from "./pages/Invoices/Invoices";
import { InvoiceDetail } from "./pages/Invoices/InvoiceDetail";
import { CreateInvoice } from "./pages/CreateInvoice/CreateInvoice";
import { SettingsTemplate } from "./pages/SettingsTemplate/SettingsTemplate";
import { Customers } from "./pages/Customers/Customers";
import { CustomerDetail } from "./pages/Customers/CustomerDetail";
import { Items } from "./pages/Items/Items";
import { ItemDetail } from "./pages/Items/ItemDetail";
import { Reports } from "./pages/Reports/Reports";
import { ReportView } from "./pages/Reports/ReportView";
import { Payments } from "./pages/Payments/Payments";
import { Activity } from "./pages/Activity/Activity";
import { Assistant } from "./pages/Assistant/Assistant";
import { Settings } from "./pages/Settings/Settings";
import { AcceptInvite } from "./pages/AcceptInvite/AcceptInvite";
import { ShareInvoice } from "./pages/Share/ShareInvoice";
import { ErrorPage } from "./pages/ErrorPage/ErrorPage";

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="center-fill">
        <div className="spinner" />
      </div>
    );
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public: the tokened link from the invite email lands here. */}
      <Route path="/invite/:token" element={<AcceptInvite />} />
      {/* Public: a shared invoice link — read-only, no login. */}
      <Route path="/share/:token" element={<ShareInvoice />} />
      <Route
        element={
          <Protected>
            <BillingProvider>
              <AppLayout />
            </BillingProvider>
          </Protected>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/new" element={<CreateInvoice />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/invoices/:id/edit" element={<CreateInvoice />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/items" element={<Items />} />
        {/* New/Edit now happen in a modal (Zoho-style) — keep old deep links working. */}
        <Route path="/items/new" element={<Navigate to="/items?new=1" replace />} />
        <Route path="/items/:id" element={<ItemDetail />} />
        <Route path="/items/:id/edit" element={<ItemDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:key" element={<ReportView />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        {/* Old bookmark — the account form now lives on the Users tab. */}
        <Route path="/settings/account" element={<Navigate to="/settings/users" replace />} />
        <Route path="/settings/template" element={<SettingsTemplate />} />
        <Route path="/settings/:tab" element={<Settings />} />
        <Route path="*" element={<ErrorPage message="Page not found" />} />
      </Route>
    </Routes>
  );
}
