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
  FileText,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/AdminDashboard', label: 'לוח בקרה', icon: LayoutDashboard },
  { path: '/AdminProducts', label: 'מוצרים וקטלוג', icon: Package },
  { path: '/AdminSales', label: 'היסטוריית מכירות', icon: History },
  { path: '/AdminDailyReport', label: 'דו"ח יומי', icon: FileText },
  { path: '/AdminExpenses', label: 'הוצאות', icon: Wallet },
  { path: '/AdminStock', label: 'עדכון מלאי', icon: TruckIcon },
  { path: '/AdminSettings', label: 'הגדרות', icon: Settings },
];

export default function AdminSidebar({ mobileOpen, setMobileOpen }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth');
    navigate('/POS');
  };

  const sidebar = (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      <div className="p-5 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-lg font-bold text-amber-400">🏪 ניהול</h2>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
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