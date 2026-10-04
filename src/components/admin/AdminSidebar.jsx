import { useShortageCount } from '@/hooks/useShortageCount';
import { useCurrentBranch } from '@/hooks/useCurrentBranch';
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  History,
  Wallet,
  TruckIcon,
  Settings,
  LogOut,
  X,
  Menu,
  ShoppingCart,
  AlertTriangle,
  RotateCcw,
  Users,
  DollarSign,
  GitBranch,
  Crown,
  BarChart3,
} from 'lucide-react';

const BRANCH_MANAGER_ITEMS = [
  { path: '/AdminDashboard', label: 'לוח בקרה', icon: LayoutDashboard },
  { path: '/AdminProducts', label: 'מוצרים וקטלוג', icon: Package },
  { path: '/AdminStock', label: 'מלאי', icon: TruckIcon },
  { path: '/AdminLowStock', label: 'חוסרים', icon: AlertTriangle },
  { path: '/AdminOrders', label: 'הזמנות לרשת', icon: ShoppingCart },
  { path: '/AdminSales', label: 'היסטוריית מכירות', icon: History },
  { path: '/AdminOrderDistribution', label: 'חלוקת הזמנה', icon: BarChart3 },
  { path: '/AdminReturns', label: 'החזרות', icon: RotateCcw },
  { path: '/AdminExpenses', label: 'הוצאות', icon: Wallet },
  { path: '/AdminEmployees', label: 'ניהול עובדים', icon: Users },
  { path: '/AdminCashReport', label: 'דוח קופה יומי', icon: DollarSign },
  { path: '/AdminSettings', label: 'הגדרות', icon: Settings },
];

const NETWORK_MASTER_EXTRA = [
  { path: '/AdminNetwork', label: 'רשת סניפים', icon: GitBranch },
];

export default function AdminSidebar({ mobileOpen, setMobileOpen, adminRole }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isNetworkMaster = adminRole === 'NETWORK_MASTER';
  // A store that belongs to a network orders through the network — "order distribution" lives in
  // the network dashboard (all branches together). Independent stores keep it here.
  const { branch } = useCurrentBranch();
  const inNetwork = !!branch?.tenant_email && (branch.status === 'ACTIVE' || branch.is_active);
  const branchItems = inNetwork
    ? BRANCH_MANAGER_ITEMS.filter(i => i.path !== '/AdminOrderDistribution')
    : BRANCH_MANAGER_ITEMS;
  const navItems = isNetworkMaster
    ? [...branchItems.slice(0, -1), ...NETWORK_MASTER_EXTRA, branchItems[branchItems.length - 1]]
    : branchItems;

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth');
    navigate('/POS');
  };

  const sidebar = (
    <div className="flex flex-col bg-gray-900 text-white overflow-hidden" style={{ height: '100vh' }}>
      <div className="p-5 border-b border-white/10 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-amber-400">🏪 ניהול</h2>
          {isNetworkMaster && (
            <div className="flex items-center gap-1 mt-0.5">
              <Crown className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-amber-400/80">בעל רשת</span>
            </div>
          )}
        </div>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="p-3 space-y-1" style={{ flex: 1, overflowY: 'auto' }}>
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
              {path === '/AdminLowStock' && <ShortageBadge />}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-1">
        <Link
          to="/POS"
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-400 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="w-5 h-5" />
          חזרה לקופה
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-red-500/10 w-full"
        >
          <LogOut className="w-5 h-5" />
          יציאה מניהול
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebar}
      </div>

      {/* Mobile */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-64" onClick={e => e.stopPropagation()}>
            {sidebar}
          </div>
        </div>
      )}
    </>
  );
}
/** Live count of sizes under their shortage threshold — same catalog cache as the POS. */
function ShortageBadge() {
  const count = useShortageCount();
  if (!count) return null;
  return <span className="mr-auto rounded-full bg-red-500 text-white text-xs font-bold px-2 py-0.5">{count}</span>;
}
