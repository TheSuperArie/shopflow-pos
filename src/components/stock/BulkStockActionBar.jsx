import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, PlusCircle, Equal, X } from 'lucide-react';
import { useShipmentBatch } from '@/lib/ShipmentBatchContext';

/**
 * Sticky bottom bar shown whenever variants are selected.
 * Applies one stock action to every selected variant at once:
 * add a quantity to all, or set a uniform quantity for all.
 *
 * variants - the page's current ProductVariant records (for fresh stock values)
 */
export default function BulkStockActionBar({ variants = [] }) {
  const { selectedItems, unselectAll } = useShipmentBatch();
  const [mode, setMode] = useState('add'); // 'add' | 'set'
  const [value, setValue] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const byId = Object.fromEntries(variants.map(v => [v.id, v]));

  const mutation = useMutation({
    mutationFn: async ({ mode: m, amount }) => {
      const updates = selectedItems.map(item => {
        const current = byId[item.id]?.stock ?? item.stock ?? 0;
        return { id: item.id, stock: m === 'add' ? current + amount : amount };
      });
      await base44.entities.ProductVariant.bulkUpdate(updates);
      return updates;
    },
    onSuccess: (updates, { mode: m, amount }) => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast({
        title: `✅ ${updates.length} פריטים עודכנו`,
        description: m === 'add' ? `נוספו ${amount} יחידות לכל אחד` : `המלאי נקבע ל-${amount} יחידות`,
        duration: 3000,
        className: 'bg-green-500 text-white border-green-600',
      });
      unselectAll(updates.map(u => u.id));
      setValue('');
    },
    onError: (error) => {
      toast({ title: `❌ שגיאה בעדכון המלאי: ${error.message}`, duration: 4000 });
    },
  });

  if (selectedItems.length === 0) return null;

  const amount = Number(value);
  const canApply = value !== '' && !isNaN(amount) && amount >= 0 && !mutation.isPending;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 text-white shadow-2xl" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="bg-blue-600 rounded-full px-3 py-1 text-sm font-bold">{selectedItems.length}</span>
          <span className="text-sm">נבחרו {selectedItems.length} פריטים</span>
        </div>

        <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
          <button
            onClick={() => setMode('add')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${mode === 'add' ? 'bg-white text-gray-900' : 'text-gray-300'}`}
          >
            <PlusCircle className="w-3.5 h-3.5" /> הוסף לכולם
          </button>
          <button
            onClick={() => setMode('set')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${mode === 'set' ? 'bg-white text-gray-900' : 'text-gray-300'}`}
          >
            <Equal className="w-3.5 h-3.5" /> קבע לכולם
          </button>
        </div>

        <Input
          type="number"
          min={0}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={mode === 'add' ? 'כמות להוספה' : 'מלאי אחיד'}
          className="w-32 bg-white text-gray-900 text-center"
        />

        <Button
          onClick={() => mutation.mutate({ mode, amount })}
          disabled={!canApply}
          className="bg-green-600 hover:bg-green-700 gap-2"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'החל על הנבחרים'}
        </Button>

        <button
          onClick={() => unselectAll(selectedItems.map(i => i.id))}
          className="mr-auto flex items-center gap-1 text-xs text-gray-300 hover:text-white"
        >
          <X className="w-4 h-4" /> נקה בחירה
        </button>
      </div>
    </div>
  );
}