import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Mail, Download, Check, Receipt as ReceiptIcon } from 'lucide-react';
import { format } from 'date-fns';

export default function ReceiptModal({ open, sale, onClose }) {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const list = await base44.entities.AppSettings.list();
      return list[0] || { store_name: 'החנות שלי' };
    },
  });

  const generateReceiptNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    return `${year}${month}${day}-${random}`;
  };

  const createReceiptMutation = useMutation({
    mutationFn: async () => {
      const receiptNumber = generateReceiptNumber();
      return await base44.entities.Receipt.create({
        sale_id: sale.id,
        receipt_number: receiptNumber,
        customer_name: customerName || 'לקוח',
        customer_email: customerEmail || null,
        items: sale.items,
        total: sale.total,
        payment_method: sale.payment_method,
        sent_by_email: false,
      });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (receipt) => {
      const storeName = settings?.store_name || 'החנות שלי';
      const receiptDate = format(new Date(sale.created_date), 'dd/MM/yyyy HH:mm');
      
      const itemsHtml = sale.items.map(item => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product_name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: left;">₪${item.sell_price.toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: left; font-weight: bold;">₪${(item.quantity * item.sell_price).toFixed(2)}</td>
        </tr>
      `).join('');

      const emailBody = `
        <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #f59e0b; margin: 0;">${storeName}</h1>
              <p style="color: #666; margin: 5px 0;">קבלה דיגיטלית</p>
            </div>
            
            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 5px 0;"><strong>מספר קבלה:</strong> ${receipt.receipt_number}</p>
              <p style="margin: 5px 0;"><strong>תאריך:</strong> ${receiptDate}</p>
              <p style="margin: 5px 0;"><strong>שם לקוח:</strong> ${customerName || 'לקוח'}</p>
              <p style="margin: 5px 0;"><strong>אמצעי תשלום:</strong> ${sale.payment_method}</p>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #ddd;">פריט</th>
                  <th style="padding: 12px 8px; text-align: center; border-bottom: 2px solid #ddd;">כמות</th>
                  <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #ddd;">מחיר יחידה</th>
                  <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #ddd;">סה"כ</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div style="text-align: left; padding: 15px; background-color: #f59e0b; color: white; border-radius: 8px;">
              <h2 style="margin: 0; font-size: 24px;">סה"כ לתשלום: ₪${sale.total.toFixed(2)}</h2>
            </div>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 14px;">
              <p>תודה שקנית אצלנו! 🙏</p>
              <p style="margin: 5px 0;">לשירות ותמיכה, צור קשר עם ${storeName}</p>
            </div>
          </div>
        </div>
      `;

      await base44.integrations.Core.SendEmail({
        to: customerEmail,
        subject: `קבלה ${receipt.receipt_number} - ${storeName}`,
        body: emailBody,
        from_name: storeName,
      });

      await base44.entities.Receipt.update(receipt.id, {
        sent_by_email: true,
      });
    },
    onSuccess: () => {
      setEmailSent(true);
    },
  });

  const handleGenerateAndSend = async () => {
    const receipt = await createReceiptMutation.mutateAsync();
    if (customerEmail && customerEmail.includes('@')) {
      await sendEmailMutation.mutateAsync(receipt);
    }
  };

  const handleDownloadPDF = () => {
    // Create a printable version
    const receiptNumber = generateReceiptNumber();
    const storeName = settings?.store_name || 'החנות שלי';
    const receiptDate = format(new Date(sale.created_date), 'dd/MM/yyyy HH:mm');
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>קבלה ${receiptNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #f59e0b; padding-bottom: 20px; }
            .header h1 { color: #f59e0b; margin: 0; font-size: 32px; }
            .info { background: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
            .info p { margin: 8px 0; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #f3f4f6; padding: 12px; text-align: right; border-bottom: 2px solid #ddd; }
            td { padding: 12px; border-bottom: 1px solid #eee; }
            .total { background: #f59e0b; color: white; padding: 20px; border-radius: 8px; text-align: center; font-size: 24px; font-weight: bold; }
            .footer { margin-top: 40px; text-align: center; color: #666; border-top: 1px solid #ddd; padding-top: 20px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${storeName}</h1>
            <p>קבלה דיגיטלית</p>
          </div>
          <div class="info">
            <p><strong>מספר קבלה:</strong> ${receiptNumber}</p>
            <p><strong>תאריך:</strong> ${receiptDate}</p>
            <p><strong>שם לקוח:</strong> ${customerName || 'לקוח'}</p>
            <p><strong>אמצעי תשלום:</strong> ${sale.payment_method}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>פריט</th>
                <th style="text-align: center;">כמות</th>
                <th style="text-align: left;">מחיר יחידה</th>
                <th style="text-align: left;">סה"כ</th>
              </tr>
            </thead>
            <tbody>
              ${sale.items.map(item => `
                <tr>
                  <td>${item.product_name}</td>
                  <td style="text-align: center;">${item.quantity}</td>
                  <td style="text-align: left;">₪${item.sell_price.toFixed(2)}</td>
                  <td style="text-align: left; font-weight: bold;">₪${(item.quantity * item.sell_price).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="total">
            סה"כ לתשלום: ₪${sale.total.toFixed(2)}
          </div>
          <div class="footer">
            <p>תודה שקנית אצלנו! 🙏</p>
            <p>${storeName}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (!sale) return null;

  const storeName = settings?.store_name || 'החנות שלי';
  const safeDate = sale.created_date
    ? (sale.created_date.endsWith('Z') ? sale.created_date : `${sale.created_date}Z`)
    : null;
  const receiptDate = safeDate
    ? new Date(safeDate).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <ReceiptIcon className="w-6 h-6 text-amber-500" />
            הפקת קבלה
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Receipt Preview */}
          <Card className="p-6 bg-gradient-to-br from-amber-50 to-white">
            <div className="text-center mb-4 pb-4 border-b-2 border-amber-200">
              <h2 className="text-2xl font-bold text-amber-600">{storeName}</h2>
              <p className="text-sm text-gray-500">קבלה דיגיטלית</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div><span className="text-gray-500">תאריך:</span> <strong>{receiptDate}</strong></div>
              <div><span className="text-gray-500">אמצעי תשלום:</span> <strong>{sale.payment_method}</strong></div>
            </div>

            <div className="space-y-2 mb-4">
              {sale.items?.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm bg-white p-2 rounded">
                  <span>{item.product_name}</span>
                  <span>x{item.quantity} - ₪{(item.quantity * item.sell_price).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="bg-amber-500 text-white p-4 rounded-lg text-center">
              <p className="text-2xl font-bold">סה"כ: ₪{sale.total?.toFixed(2)}</p>
            </div>
          </Card>

          {/* Customer Details Form */}
          <div className="space-y-3">
            <div>
              <Label>שם לקוח (אופציונלי)</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="הזן שם לקוח"
              />
            </div>
            <div>
              <Label>אימייל לקוח (לשליחת קבלה)</Label>
              <Input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="example@email.com"
              />
            </div>
          </div>

          {emailSent && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <Check className="w-5 h-5 text-green-600" />
              <p className="text-green-800 font-medium">הקבלה נשלחה בהצלחה למייל!</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={handleDownloadPDF}
              variant="outline"
              className="flex-1 gap-2"
            >
              <Download className="w-4 h-4" />
              הדפס/שמור PDF
            </Button>
            <Button
              onClick={handleGenerateAndSend}
              disabled={!customerEmail || !customerEmail.includes('@') || createReceiptMutation.isPending || sendEmailMutation.isPending}
              className="flex-1 bg-amber-500 hover:bg-amber-600 gap-2"
            >
              {createReceiptMutation.isPending || sendEmailMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              שלח במייל
            </Button>
          </div>

          <Button onClick={onClose} variant="outline" className="w-full">
            שמור
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}