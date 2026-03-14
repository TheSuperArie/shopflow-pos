import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default function ReturnDetailsModal({ open, returnData, onClose }) {
  if (!returnData) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>פרטי החזרה</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">סטטוס:</span>
              <Badge>{returnData.status}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">תאריך יצירה:</span>
              <span className="font-medium">
                {returnData.created_date && format(new Date(returnData.created_date), 'dd/MM/yyyy HH:mm')}
              </span>
            </div>
          </div>

          {/* Customer */}
          <div>
            <h3 className="font-semibold mb-2">פרטי לקוח</h3>
            <div className="bg-gray-50 p-3 rounded space-y-1 text-sm">
              <p><strong>שם:</strong> {returnData.customer_name}</p>
              {returnData.customer_phone && <p><strong>טלפון:</strong> {returnData.customer_phone}</p>}
              {returnData.customer_email && <p><strong>אימייל:</strong> {returnData.customer_email}</p>}
            </div>
          </div>

          {/* Items */}
          <div>
            <h3 className="font-semibold mb-2">פריטים</h3>
            <div className="space-y-2">
              {returnData.items?.map((item, idx) => (
                <div key={idx} className="bg-gray-50 p-3 rounded flex justify-between">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-sm text-gray-600">כמות: {item.quantity}</p>
                  </div>
                  <p className="font-bold">₪{(item.sell_price * item.quantity).toFixed(2)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t">
              <div className="flex justify-between text-lg font-bold">
                <span>סה"כ:</span>
                <span>₪{returnData.total_amount?.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Details */}
          <div>
            <h3 className="font-semibold mb-2">פרטים נוספים</h3>
            <div className="bg-gray-50 p-3 rounded space-y-2 text-sm">
              <div>
                <p className="text-gray-600">סיבת החזרה:</p>
                <p className="font-medium">{returnData.reason}</p>
              </div>
              {returnData.refund_method && (
                <div>
                  <p className="text-gray-600">אופן החזר:</p>
                  <p className="font-medium">{returnData.refund_method}</p>
                </div>
              )}
              {returnData.notes && (
                <div>
                  <p className="text-gray-600">הערות:</p>
                  <p className="font-medium">{returnData.notes}</p>
                </div>
              )}
              {returnData.approval_date && (
                <div>
                  <p className="text-gray-600">תאריך אישור:</p>
                  <p className="font-medium">{returnData.approval_date}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}