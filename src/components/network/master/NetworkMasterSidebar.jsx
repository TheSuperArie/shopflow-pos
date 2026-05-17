import React from 'react';
import { Crown, GitBranch, BarChart2, LogOut, X, ShoppingCart, Settings, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { tab: 'branches', label: 'רשימת סניפים', icon: GitBranch },
  { tab: 'analytics', label: 'דוחות וגרפים', icon: BarChart2 },
  { tab: 'suppliers', label: 'ניהול ספקים', icon: Building2 },
  { tab: 'settings', label: 'הגדרות רשת', icon: Settings },
];

export default function NetworkMasterSidebar({ activeTab, onTabChange, mobileOpen, setMobileOpen }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth');
    sessionStorage.removeItem('admin_role');
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
            <p className="text-xs text-amber-300/70">בעל הרשת</p>
          </div>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-gray-400 hover:text-white">
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
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <NavIcon className="w-5 h-5 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 space-y-1">
        <button
          onClick={() => navigate('/POS')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-400 hover:bg-white/5 hover:text-white"
        >
          <ShoppingCart className="w-5 h-5" />
          חזרה לקופה
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-red-500/10"
        >
          <LogOut className="w-5 h-5" />
          יציאה
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