import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, WifiOff, Wifi, Download, Upload } from 'lucide-react';

/**
 * Step-by-step modal for going offline or coming back online.
 * mode: 'go-offline' | 'go-online'
 */
export default function SyncModal({ mode, onClose, onGoOffline, onGoOnline, pendingCount }) {
  const [step1Done, setStep1Done] = useState(false);
  const [step1Loading, setStep1Loading] = useState(false);
  const [step2Loading, setStep2Loading] = useState(false);

  const handleStep1 = async () => {
    setStep1Loading(true);
    try {
      if (mode === 'go-offline') {
        await onGoOffline.cacheInventory();
      } else {
        await onGoOnline.syncSales();
      }
      setStep1Done(true);
    } finally {
      setStep1Loading(false);
    }
  };

  const handleStep2 = async () => {
    setStep2Loading(true);
    try {
      if (mode === 'go-offline') {
        await onGoOffline.switchMode();
      } else {
        await onGoOnline.switchMode();
      }
      onClose();
    } finally {
      setStep2Loading(false);
    }
  };

  const isGoOffline = mode === 'go-offline';
  // For go-online, step1 can be skipped if there are no pending sales
  const canSkipStep1 = !isGoOffline && pendingCount === 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isGoOffline
              ? <><WifiOff className="w-5 h-5 text-orange-500" /> מעבר למצב לא מקוון</>
              : <><Wifi className="w-5 h-5 text-green-500" /> מעבר למצב מקוון</>
            }
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step 1 */}
          <div className={`border-2 rounded-xl p-4 transition-all ${
            step1Done ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${
                step1Done ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {step1Done ? <CheckCircle2 className="w-4 h-4" /> : '1'}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-800">
                  {isGoOffline ? 'שמור מלאי בזיכרון מקומי' : 'עדכן שרת במכירות'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isGoOffline
                    ? 'שומר את כל הקטגוריות, המוצרים והמלאי לשימוש אופליין'
                    : canSkipStep1
                      ? 'אין מכירות אופליין ממתינות — ניתן לדלג'
                      : `מעביר ${pendingCount} מכירות אופליין לשרת ומעדכן מלאי`
                  }
                </p>
                {!step1Done && !canSkipStep1 && (
                  <Button
                    size="sm"
                    onClick={handleStep1}
                    disabled={step1Loading}
                    className={`mt-3 gap-2 ${isGoOffline ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
                  >
                    {step1Loading
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> טוען...</>
                      : isGoOffline
                        ? <><Download className="w-4 h-4" /> שמור מלאי מקומית</>
                        : <><Upload className="w-4 h-4" /> שלח מכירות לשרת</>
                    }
                  </Button>
                )}
                {step1Done && (
                  <p className="mt-2 text-xs text-green-600 font-semibold">✅ הושלם בהצלחה</p>
                )}
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className={`border-2 rounded-xl p-4 transition-all ${
            (step1Done || canSkipStep1) ? 'border-gray-300 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${
                (step1Done || canSkipStep1) ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-400'
              }`}>
                2
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-800">
                  {isGoOffline ? 'עבור לאופליין' : 'עבור לאונליין ורענן'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isGoOffline
                    ? 'מפעיל מצב לא מקוון — מכירות יישמרו מקומית'
                    : 'מחזיר מצב מקוון וטוען מלאי עדכני מהשרת'
                  }
                </p>
                <Button
                  size="sm"
                  onClick={handleStep2}
                  disabled={(!step1Done && !canSkipStep1) || step2Loading}
                  className={`mt-3 gap-2 ${isGoOffline ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-white disabled:opacity-40`}
                >
                  {step2Loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> מחיל...</>
                    : isGoOffline
                      ? <><WifiOff className="w-4 h-4" /> עבור לאופליין</>
                      : <><Wifi className="w-4 h-4" /> עבור לאונליין</>
                  }
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}