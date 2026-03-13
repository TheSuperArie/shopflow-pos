import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, Loader2 } from 'lucide-react';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSettings.list(),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const adminPassword = settings[0]?.admin_password || '12345678';
    if (password === adminPassword) {
      sessionStorage.setItem('admin_auth', 'true');
      navigate('/AdminDashboard');
    } else {
      setError('סיסמה שגויה');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">ניהול החנות</h1>
          <p className="text-gray-400 text-center mb-8">הזן סיסמת מנהל לכניסה</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="סיסמת מנהל"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className="h-12 bg-white/10 border-white/20 text-white placeholder:text-gray-500 rounded-xl text-center text-lg"
            />
            {error && <p className="text-red-400 text-center text-sm">{error}</p>}
            <Button
              type="submit"
              className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-lg"
            >
              כניסה
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