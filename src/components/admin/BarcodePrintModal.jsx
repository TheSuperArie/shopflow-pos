import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import Barcode from 'react-barcode';
import { Printer } from 'lucide-react';

export default function BarcodePrintModal({ open, onClose, variant, group }) {
  const [copies, setCopies] = useState(1);
  const printRef = useRef();

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const content = printRef.current.innerHTML;
    
    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>הדפסת מדבקות ברקוד</title>
          <style>
            @page { 
              size: 50mm 30mm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
            }
            .label {
              width: 50mm;
              height: 30mm;
              padding: 2mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              page-break-after: always;
              box-sizing: border-box;
            }
            .label:last-child {
              page-break-after: auto;
            }
            .product-name {
              font-size: 8pt;
              font-weight: bold;
              text-align: center;
              margin-bottom: 1mm;
              max-width: 100%;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .variant-info {
              font-size: 6pt;
              text-align: center;
              margin-bottom: 1mm;
            }
            .barcode-container {
              display: flex;
              justify-content: center;
            }
            .barcode-container svg {
              max-width: 45mm;
              height: auto;
            }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (!variant || !group) return null;

  const labels = Array(copies).fill(null);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>הדפסת מדבקות ברקוד</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="font-semibold">{group.name}</p>
            <p className="text-sm text-gray-600">
              מידה {variant.size} | {variant.cut} | {variant.collar}
            </p>
            <p className="text-xs text-gray-500 mt-1">ברקוד: {variant.barcode}</p>
          </div>

          <div>
            <Label>כמות מדבקות להדפסה</Label>
            <Input 
              type="number" 
              min="1" 
              max="100"
              value={copies} 
              onChange={e => setCopies(Math.max(1, Math.min(100, Number(e.target.value))))} 
            />
          </div>

          <div className="border rounded-lg p-3 bg-white max-h-60 overflow-y-auto">
            <p className="text-xs text-gray-500 mb-2">תצוגה מקדימה:</p>
            <div ref={printRef}>
              {labels.map((_, idx) => (
                <div key={idx} className="label border-b pb-2 mb-2 last:border-b-0">
                  <div className="product-name">{group.name}</div>
                  <div className="variant-info">
                    מידה {variant.size} • {variant.cut} • {variant.collar}
                  </div>
                  <div className="barcode-container">
                    <Barcode 
                      value={variant.barcode} 
                      width={1.5}
                      height={35}
                      fontSize={10}
                      margin={0}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handlePrint} className="gap-2 bg-amber-500 hover:bg-amber-600">
            <Printer className="w-4 h-4" /> הדפס {copies} מדבקות
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}