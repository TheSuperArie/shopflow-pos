import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function BranchForm({ onSubmit, onCancel, isLoading }) {
  const [form, setForm] = useState({ name: '', station_email: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.station_email.trim()) return;
    onSubmit(form);
  };

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">יצירת סניף חדש</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>שם הסניף *</Label>
              <Input
                placeholder="לדוגמה: סניף תל אביב"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>אימייל תחנת הקופה *</Label>
              <Input
                type="email"
                placeholder="branch-tlv@gmail.com"
                value={form.station_email}
                onChange={e => setForm(p => ({ ...p, station_email: e.target.value }))}
                required
              />
              <p className="text-xs text-gray-500">חשבון Google שמחובר למכשיר הקופה בסניף</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>ביטול</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'יוצר...' : 'צור סניף'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}