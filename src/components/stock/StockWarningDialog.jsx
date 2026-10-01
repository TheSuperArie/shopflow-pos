import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const stockWarningTitle = (available) => {
  if (available <= 0) return 'שים לב — המוצר אזל מהמלאי';
  if (available === 1) return 'שים לב — קיים במלאי רק פריט אחד מהמוצר הזה';
  return `שים לב — קיימים במלאי רק ${available} פריטים מהמוצר הזה`;
};

/** "Only X left" warning — the user may still continue after confirming. */
export default function StockWarningDialog({ available, description, onConfirm, onCancel }) {
  return (
    <div dir="rtl" className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4">
        <div className="flex items-center gap-2 text-amber-600">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <h2 className="text-lg font-bold">{stockWarningTitle(available)}</h2>
        </div>
        {description && <p className="text-gray-700">{description}</p>}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1 h-12">ביטול</Button>
          <Button onClick={onConfirm} className="flex-1 h-12 bg-amber-600 hover:bg-amber-700">אשר בכל זאת</Button>
        </div>
      </div>
    </div>
  );
}