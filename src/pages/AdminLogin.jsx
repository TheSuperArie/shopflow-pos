import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, Loader2 } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { DEV_CODE_SESSION_KEY } from '@/lib/developerAccess';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();
  const user = useCurrentUser();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setError('טוען נתונים... נסה שוב בעוד רגע');
      return;
    }
    if (checking || !password.trim()) return;
    setChecking(true);
    setError('');

    const enterNetwork = (email) => {
      sessionStorage.setItem('admin_auth', 'true');
      sessionStorage.setItem('admin_role', 'NETWORK_MASTER');
      sessionStorage.setItem('network_master_email', email);
      navigate('/NetworkMasterDashboard');
    };

    try {
      // Tier 1 + 2: the network master code / local branch code are checked on the server only
      // (they are no longer readable from the browser). A branch station of someone else's
      // network never gets the network dashboard — the server enforces that too.
      try {
        const res = await base44.functions.invoke('adminAuth', { action: 'verify', password });
        if (res.data?.role === 'NETWORK_MASTER') { enterNetwork(user.email); return; }
        if (res.data?.role === 'BRANCH_MANAGER') {
          sessionStorage.removeItem('network_master_email');
          sessionStorage.setItem('admin_auth', 'true');
          sessionStorage.setItem('admin_role', 'BRANCH_MANAGER');
          navigate('/AdminDashboard');
          return;
        }
      } catch (err) {
        if (err?.status === 429) { setError(err?.data?.error || 'יותר מדי ניסיונות שגויים. נסה שוב מאוחר יותר'); return; }
        if (!err?.status) { setError('אין חיבור לשרת — נסה שוב'); return; }
      }

      // Tier 3: Global developer code (verified server-side) → Developer page
      try {
        const res = await base44.functions.invoke('developerPortal', { action: 'verify', code: password });
        if (res.data?.ok) {
          sessionStorage.setItem(DEV_CODE_SESSION_KEY, password);
          navigate('/UsageAnalytics');
          return;
        }
      } catch {
        // not the developer code either
      }

      setError('סיסמה שגויה');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">ניהול החנות</h1>
          <p className="text-gray-400 text-center mb-8">הזן קוד גישה לכניסה</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="קוד גישה"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className="h-12 bg-white/10 border-white/20 text-white placeholder:text-gray-500 rounded-xl text-center text-lg"
              autoFocus
            />
            {error && <p className="text-red-400 text-center text-sm">{error}</p>}
            <Button
              type="submit"
              disabled={checking}
              className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-lg"
            >
              {checking ? <Loader2 className="w-5 h-5 animate-spin" /> : 'כניסה'}
            </Button>
          </form>

          <button
            onClick={() => navigate('/POS')}
            className="w-full mt-4 text-gray-400 hover:text-white text-sm transition-colors"
          >
            חזרה לקופה →
          </button>
        </div>
      </div>
    </div>
  );
}