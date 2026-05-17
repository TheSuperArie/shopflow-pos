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
  Building2,
  RotateCcw,
  Users,
  DollarSign,
  GitBranch,
  Crown,
} from 'lucide-react';

const BRANCH_MANAGER_ITEMS = [
  { path: '/AdminDashboard', label: 'לוח בקרה', icon: LayoutDashboard },
  { path: '/AdminProducts', label: 'מוצרים וקטלוג', icon: Package },
  { path: '/AdminLowStock', label: 'מלאי חסר', icon: AlertTriangle },
  { path: '/AdminStock', label: 'עדכון מלאי', icon: TruckIcon },
  { path: '/AdminSuppliers', label: 'ניהול ספקים', icon: Building2 },
  { path: '/AdminOrders', label: 'הזמנות לספקים', icon: ShoppingCart },
  { path: '/AdminSales', label: 'היסטוריית מכירות', icon: History },
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
  const navItems = isNetworkMaster
    ? [...BRANCH_MANAGER_ITEMS.slice(0, -1), ...NETWORK_MASTER_EXTRA, BRANCH_MANAGER_ITEMS[BRANCH_MANAGER_ITEMS.length - 1]]
    : BRANCH_MANAGER_ITEMS;

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