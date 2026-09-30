import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserRound, Loader2, Plus } from 'lucide-react';

/** On entering picking: who is picking? (list from the pickers page; quick-add if the list is empty) */
export default function PickerSelectDialog({ warehouse, current, onSelect, onCancel }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const { data: pickers = [], isLoading } = useQuery({
    queryKey: ['warehouse-pickers', warehouse.id],
    queryFn: () => base44.entities.WarehousePicker.filter({ warehouse_id: warehouse.id }, 'name'),
  });
  const active = pickers.filter(p => p.is_active !== false);

  const addAndSelect = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await base44.entities.WarehousePicker.create({ warehouse_id: warehouse.id, tenant_email: warehouse.tenant_email, name, is_active: true });
      queryClient.invalidateQueries({ queryKey: ['warehouse-pickers', warehouse.id] });
      onSelect(name);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 space-y-4">
        <p className="text-2xl font-bold text-gray-900 flex items-center gap-2"><UserRound className="w-7 h-7 text-blue-600" /> מי מלקט?</p>
        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>
        ) : active.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
            {active.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p.name)}
                className={`h-16 rounded-2xl border-2 text-lg font-semibold transition-colors ${
                  p.name === current ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-400'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">עוד אין מלקטים ברשימה. אפשר להוסיף כאן, או בדף "מלקטים".</p>
        )}
        <div className="flex gap-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="מלקט חדש — שם" className="h-12 text-base"
            onKeyDown={e => { if (e.key === 'Enter') addAndSelect(); }} />
          <Button onClick={addAndSelect} disabled={!newName.trim() || adding} className="h-12 gap-1 bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> הוסף
          </Button>
        </div>
        <Button variant="outline" onClick={onCancel} className="w-full h-12">ביטול</Button>
      </div>
    </div>
  );
}
