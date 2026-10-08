import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ShipmentBatchProvider } from '@/lib/ShipmentBatchContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { useUsageLogger } from '@/hooks/useUsageLogger';
import AccessGate from '@/components/access/AccessGate';
import WarehouseGate from '@/components/access/WarehouseGate';
import DelegateGate from '@/components/access/DelegateGate';

import POS from './pages/POS.jsx';
import Layout from './components/Layout';
import AdminLayout from './components/admin/AdminLayout';

// Lazy-loaded pages — only downloaded when their route is navigated to,
// keeping the POS landing page's initial bundle small.
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminProducts = lazy(() => import('./pages/AdminProducts'));
const AdminSales = lazy(() => import('./pages/AdminSales'));
const AdminExpenses = lazy(() => import('./pages/AdminExpenses'));
const BranchInventoryPage = lazy(() => import('./pages/BranchInventoryPage'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const AdminDailyReport = lazy(() => import('./pages/AdminDailyReport'));
const AdminOrders = lazy(() => import('./pages/AdminOrders'));
const AdminSuppliers = lazy(() => import('./pages/AdminSuppliers'));
const AdminReturns = lazy(() => import('./pages/AdminReturns'));
const AdminEmployees = lazy(() => import('./pages/AdminEmployees'));
const AdminCashReport = lazy(() => import('./pages/AdminCashReport'));
const AdminCategoryInsights = lazy(() => import('./pages/AdminCategoryInsights'));
const AdminNetwork = lazy(() => import('./pages/AdminNetwork'));
const NetworkMasterDashboard = lazy(() => import('./pages/NetworkMasterDashboard'));
const BatchShipmentEntry = lazy(() => import('./pages/BatchShipmentEntry'));
const BranchSupplyOrders = lazy(() => import('./pages/BranchSupplyOrders'));
const WarehouseHome = lazy(() => import('./pages/WarehouseHome'));
const UsageAnalytics = lazy(() => import('./pages/UsageAnalytics'));

const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  useUsageLogger();

  // Only show loading for auth, not for public settings
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Only block for user_not_registered, not for network errors or auth_required (public app)
  if (authError && authError.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  // For public apps, auth_required errors should be ignored
  if (authError && authError.type === 'auth_required') {
    // Continue rendering the app without blocking
  }

  // Always render the app - let individual pages handle their own data loading
  return (
    <ShipmentBatchProvider>
      <AccessGate>
      <DelegateGate>
      <WarehouseGate>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/POS" replace />} />
            <Route path="/POS" element={<POS />} />
            <Route path="/AdminLogin" element={<AdminLogin />} />
            <Route element={<AdminLayout />}>
              <Route path="/AdminDashboard" element={<AdminDashboard />} />
              <Route path="/AdminProducts" element={<AdminProducts />} />
              <Route path="/AdminLowStock" element={<BranchInventoryPage defaultTab="shortages" />} />
              <Route path="/AdminSales" element={<AdminSales />} />
              <Route path="/AdminExpenses" element={<AdminExpenses />} />
              <Route path="/AdminStock" element={<BranchInventoryPage defaultTab="stock" />} />
              {/* Supply orders to the network (the old ticket screen, BranchNetworkOrders, is kept but unrouted) */}
              <Route path="/AdminOrders" element={<BranchSupplyOrders />} />
              <Route path="/AdminSuppliers" element={<AdminSuppliers />} />
              <Route path="/AdminReturns" element={<AdminReturns />} />
              <Route path="/AdminDailyReport" element={<AdminDailyReport />} />
              <Route path="/AdminSettings" element={<AdminSettings />} />
              <Route path="/AdminEmployees" element={<AdminEmployees />} />
              <Route path="/AdminCashReport" element={<AdminCashReport />} />
              <Route path="/admin/reports/category/:id" element={<AdminCategoryInsights />} />
              <Route path="/AdminNetwork" element={<AdminNetwork />} />
            </Route>
          </Route>
          <Route path="/UsageAnalytics" element={<UsageAnalytics />} />
          <Route path="/Warehouse" element={<WarehouseHome />} />
          <Route path="/NetworkMasterDashboard" element={<NetworkMasterDashboard />} />
          <Route
            path="/network/reports/category/:id"
            element={<div className="min-h-screen bg-gray-50 p-4 md:p-6"><AdminCategoryInsights /></div>}
          />
          <Route path="/BatchShipmentEntry" element={<BatchShipmentEntry />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
      </WarehouseGate>
      </DelegateGate>
      </AccessGate>
    </ShipmentBatchProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App