import React from 'react';
import { Link } from 'react-router-dom';
import { useShipmentBatch } from '@/lib/ShipmentBatchContext';
import { Button } from '@/components/ui/button';
import { Package, X, ChevronRight } from 'lucide-react';

export default function BatchSummaryBar() {
  const { selectedItems, clearBatch } = useShipmentBatch();

  if (selectedItems.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-2xl border-t-2 border-blue-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            <span className="text-lg font-semibold">{selectedItems.length} פריטים נבחרו</span>
          </div>
          <div className="text-sm opacity-90">
            {selectedItems.map(item => item.dimensions ? Object.values(item.dimensions).join(' / ') : 'רגיל').join(', ')}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearBatch}
            className="text-white hover:bg-blue-800"
          >
            <X className="w-4 h-4 ml-2" /> ביטול
          </Button>

          <Link to="/BatchShipmentEntry">
            <Button className="bg-white text-blue-600 hover:bg-gray-100 gap-2">
              המשך לפרטי משלוח <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}