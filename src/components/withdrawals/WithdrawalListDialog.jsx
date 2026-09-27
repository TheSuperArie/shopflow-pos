import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pencil, Trash2 } from 'lucide-react';

/**
 * Withdrawals in the range, newest first. branchName(w) → label shown per row (network view).
 * onEdit/onDelete are optional — omitted = read-only.
 */
export default function WithdrawalListDialog({ open, onClose, withdrawals, branchName, onEdit, onDelete }) {
  const sorted = [...withdrawals].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const total = sorted.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>משיכות בטווח · ₪{total.toFixed(0)}</DialogTitle></DialogHeader>
        {sorted.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-6">אין משיכות בטווח הנבחר</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {sorted.map(w => (
              <div key={w.id} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid="withdrawal-row">
                <span className="text-xs text-gray-400 shrink-0 w-[68px]">{w.date}</span>
                <div className="min-w-0 flex-1">
                  {branchName && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 rounded">{branchName(w)}</span>}
                  <p className="text-gray-700 truncate">{w.notes || '—'}</p>
                </div>
                <span className="font-bold text-emerald-700 shrink-0">₪{Number(w.amount || 0).toFixed(0)}</span>
                {onEdit && (
                  <div className="flex shrink-0">
                    <button onClick={() => onEdit(w)} className="p-1.5 rounded-md hover:bg-gray-100" title="עריכה"><Pencil className="w-3.5 h-3.5 text-gray-500" /></button>
                    <button onClick={() => onDelete(w)} className="p-1.5 rounded-md hover:bg-red-50" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}