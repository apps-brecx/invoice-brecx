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
import { Items } from "./pages/Items/Items";
import { ItemDetail } from "./pages/Items/ItemDetail";
import { ItemForm } from "./pages/Items/ItemForm";
import { Reports } from "./pages/Reports/Reports";
import { ReportView } from "./pages/Reports/ReportView";
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
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/invoices/:id/edit" element={<CreateInvoice />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/items" element={<Items />} />
        <Route path="/items/new" element={<ItemForm />} />
        <Route path="/items/:id" element={<ItemDetail />} />
        <Route path="/items/:id/edit" element={<ItemForm />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:key" element={<ReportView />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/settings" element={<Navigate to="/settings/account" replace />} />
        <Route path="/settings/account" element={<SettingsAccount />} />
        <Route path="/settings/template" element={<SettingsTemplate />} />
        <Route path="*" element={<ErrorPage message="Page not found" />} />
      </Route>
    </Routes>
  );
}
