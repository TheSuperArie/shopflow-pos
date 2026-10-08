import React, { useEffect, useState } from 'react';
import { base44, getDelegateOwner } from '@/api/base44Client';
import { Crown, GitBranch, BarChart2, BarChart3, LogOut, X, ShoppingCart, Settings, LayoutDashboard, Warehouse, Landmark, Boxes } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { tab: 'overview',  label: 'דאשבורד מנהל',      icon: LayoutDashboard },
  { tab: 'branches',  label: 'רשימת סניפים',     icon: GitBranch },
  { tab: 'analytics', label: 'דוחות וגרפים',      icon: BarChart2 },
  { tab: 'network-expenses', label: 'הוצאות הרשת', icon: Landmark },
  { tab: 'supply',    label: 'הזמנות ואספקה',     icon: Warehouse },
  { tab: 'distribution', label: 'חלוקת הזמנה',    icon: BarChart3 },
  { tab: 'warehouse-stock', label: 'מחסן',         icon: Boxes },
  // Hidden (replaced by 'supply'): { tab: 'orders', הזמנות מהסניפים }, { tab: 'warehouse', הזמנות מהמחסן }
  // Hidden (supply now goes through the warehouse; data kept): { tab: 'suppliers', label: 'ניהול ספקים', icon: Building2 },
  { tab: 'settings',  label: 'הגדרות רשת',         icon: Settings },
];

export default function NetworkMasterSidebar({ activeTab, onTabChange, mobileOpen, setMobileOpen }) {
  const navigate = useNavigate();
  // Authorized network manager: no POS to go back to — "exit" signs the account out
  const [isDelegate, setIsDelegate] = useState(false);
  useEffect(() => { getDelegateOwner().then(o => setIsDelegate(!!o)); }, []);

  const handleLogout = () => {
    if (isDelegate) { base44.auth.logout(); return; }
    sessionStorage.removeItem('admin_auth');
    sessionStorage.removeItem('admin_role');
    sessionStorage.removeItem('network_master_email');
    navigate('/POS');
  };

  const sidebar = (
    <div className="flex flex-col bg-gray-950 text-white overflow-hidden" style={{ height: '100vh' }}>
      {/* Header */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-amber-400">מרכז פיקוד</h2>
            </div>
            <p className="text-xs text-amber-300/70">{isDelegate ? 'מנהל רשת' : 'בעל הרשת'}</p>
          </div>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-gray-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="p-3 space-y-1 flex-1">
        {NAV_ITEMS.map(({ tab, label, icon: NavIcon }) => (
          <button
            key={tab}
            onClick={() => { onTabChange(tab); setMobileOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-right ${
              activeTab === tab
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <NavIcon className="w-5 h-5 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 space-y-1">
        {!isDelegate && (
          <button
            onClick={() => navigate('/POS')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-300 hover:bg-white/5 hover:text-white"
          >
            <ShoppingCart className="w-5 h-5" />
            חזרה לקופה
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-red-500/10"
        >
          <LogOut className="w-5 h-5" />
          {isDelegate ? 'התנתק' : 'יציאה'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebar}
      </div>
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