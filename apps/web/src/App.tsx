import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { BillingProvider } from "./lib/store";
import { AppLayout } from "./components/AppLayout";
import { Login } from "./pages/Login/Login";
import { Dashboard } from "./pages/Dashboard/Dashboard";
import { Invoices } from "./pages/Invoices/Invoices";
import { CreateInvoice } from "./pages/CreateInvoice/CreateInvoice";
import { Customers } from "./pages/Customers/Customers";
import { Reports } from "./pages/Reports/Reports";
import { Payments } from "./pages/Payments/Payments";
import { SettingsAccount } from "./pages/SettingsAccount/SettingsAccount";
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
        <Route path="/customers" element={<Customers />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/settings" element={<Navigate to="/settings/account" replace />} />
        <Route path="/settings/account" element={<SettingsAccount />} />
        <Route path="*" element={<ErrorPage message="Page not found" />} />
      </Route>
    </Routes>
  );
}
