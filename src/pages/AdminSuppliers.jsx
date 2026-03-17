import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Building2, Phone, Mail, MapPin, CreditCard, Package, Edit, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export default function AdminSuppliers() {
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', user?.email],
    queryFn: () => user ? base44.entities.Supplier.filter({ created_by: user.email }, '-created_date') : [],
    enabled: !!user,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['supplier-orders', user?.email],
    queryFn: () => user ? base44.entities.SupplierOrder.filter({ created_by: user.email }, '-created_date') : [],
    enabled: !!user,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['supplier-payments', user?.email],
    queryFn: () => user ? base44.entities.SupplierPayment.filter({ created_by: user.email }, '-created_date') : [],
    enabled: !!user,
  });

  const activeSuppliers = suppliers.filter(s => s.is_active);
  const totalDebt = activeSuppliers.reduce((sum, s) => sum + (s.total_debt || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">ניהול ספקים</h1>
          <p className="text-sm text-gray-500 mt-1">{activeSuppliers.length} ספקים פעילים</p>
        </div>
        <Button onClick={() => { setEditingSupplier(null); setShowSupplierForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          הוסף ספק
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> סך חובות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">₪{totalDebt.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Package className="w-4 h-4" /> הזמנות פעילות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              {orders.filter(o => o.status !== 'התקבל' && o.status !== 'בוטל').length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> ספקים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{activeSuppliers.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Suppliers List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {suppliers.map(supplier => {
          const supplierOrders = orders.filter(o => o.supplier_id === supplier.id);
          const supplierPayments = payments.filter(p => p.supplier_id === supplier.id);
          const pendingOrders = supplierOrders.filter(o => o.status !== 'התקבל' && o.status !== 'בוטל');
          
          return (
            <Card key={supplier.id} className={!supplier.is_active ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{supplier.name}</CardTitle>
                      {supplier.contact_person && (
                        <p className="text-sm text-gray-500">{supplier.contact_person}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditingSupplier(supplier); setShowSupplierForm(true); }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {supplier.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-4 h-4" />
                      {supplier.phone}
                    </div>
                  )}
                  {supplier.email && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="w-4 h-4" />
                      {supplier.email}
                    </div>
                  )}
                </div>
                
                {supplier.address && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4" />
                    {supplier.address}
                  </div>
                )}

                <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">חוב נוכחי</p>
                    <p className="text-lg font-bold text-red-600">₪{(supplier.total_debt || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">הזמנות פתוחות</p>
                    <p className="text-lg font-bold text-amber-600">{pendingOrders.length}</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSupplier(supplier)}
                    className="flex-1"
                  >
                    <Package className="w-4 h-4 ml-2" />
                    פרטים מלאים
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => { setEditingSupplier(supplier); setShowPaymentForm(true); }}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <CreditCard className="w-4 h-4 ml-2" />
                    רשום תשלום
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {suppliers.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>אין ספקים במערכת</p>
            <p className="text-sm mt-1">לחץ על "הוסף ספק" כדי להתחיל</p>
          </CardContent>
        </Card>
      )}

      <SupplierFormModal
        open={showSupplierForm}
        supplier={editingSupplier}
        onClose={() => { setShowSupplierForm(false); setEditingSupplier(null); }}
        queryClient={queryClient}
        toast={toast}
      />

      <PaymentFormModal
        open={showPaymentForm}
        supplier={editingSupplier}
        onClose={() => { setShowPaymentForm(false); setEditingSupplier(null); }}
        queryClient={queryClient}
        toast={toast}
      />

      <SupplierDetailsModal
        open={!!selectedSupplier}
        supplier={selectedSupplier}
        orders={orders.filter(o => o.supplier_id === selectedSupplier?.id)}
        payments={payments.filter(p => p.supplier_id === selectedSupplier?.id)}
        onClose={() => setSelectedSupplier(null)}
        onAddOrder={() => { setEditingSupplier(selectedSupplier); setShowOrderForm(true); }}
        onAddPayment={() => { setEditingSupplier(selectedSupplier); setShowPaymentForm(true); }}
        queryClient={queryClient}
        toast={toast}
      />

      <OrderFormModal
        open={showOrderForm}
        supplier={editingSupplier}
        onClose={() => { setShowOrderForm(false); setEditingSupplier(null); }}
        queryClient={queryClient}
        toast={toast}
      />
    </div>
  );
}

function SupplierFormModal({ open, supplier, onClose, queryClient, toast }) {
  const [form, setForm] = useState({
    name: '', contact_person: '', phone: '', email: '', address: '', notes: '', is_active: true,
  });

  React.useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name || '',
        contact_person: supplier.contact_person || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        address: supplier.address || '',
        notes: supplier.notes || '',
        is_active: supplier.is_active !== false,
      });
    } else {
      setForm({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '', is_active: true });
    }
  }, [supplier, open]);

  const mutation = useMutation({
    mutationFn: (data) =>
      supplier
        ? base44.entities.Supplier.update(supplier.id, data)
        : base44.entities.Supplier.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({ title: supplier ? '✅ הספק עודכן' : '✅ הספק נוסף', duration: 2000 });
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{supplier ? 'עריכת ספק' : 'ספק חדש'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <Label>שם הספק *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>איש קשר</Label>
              <Input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
            </div>
            <div>
              <Label>טלפון</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>אימייל</Label>
            <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>כתובת</Label>
            <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate(form)} disabled={!form.name}>
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentFormModal({ open, supplier, onClose, queryClient, toast }) {
  const [form, setForm] = useState({
    amount: 0, payment_date: format(new Date(), 'yyyy-MM-dd'), payment_method: 'מזומן', reference_number: '', notes: '',
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        amount: 0,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: 'מזומן',
        reference_number: '',
        notes: '',
      });
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.SupplierPayment.create(data);
      // Update supplier debt
      const newDebt = (supplier.total_debt || 0) - data.amount;
      await base44.entities.Supplier.update(supplier.id, { total_debt: Math.max(0, newDebt) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({ title: '✅ התשלום נרשם בהצלחה', duration: 2000 });
      onClose();
    },
  });

  if (!supplier) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>רישום תשלום - {supplier.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-red-50 rounded-lg">
            <p className="text-sm text-gray-600">חוב נוכחי</p>
            <p className="text-xl font-bold text-red-600">₪{(supplier.total_debt || 0).toLocaleString()}</p>
          </div>
          <div>
            <Label>סכום תשלום</Label>
            <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
          </div>
          <div>
            <Label>תאריך תשלום</Label>
            <Input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} />
          </div>
          <div>
            <Label>אמצעי תשלום</Label>
            <select
              value={form.payment_method}
              onChange={e => setForm({ ...form, payment_method: e.target.value })}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3"
            >
              <option value="מזומן">מזומן</option>
              <option value="אשראי">אשראי</option>
              <option value="העברה בנקאית">העברה בנקאית</option>
              <option value="צ'ק">צ'ק</option>
            </select>
          </div>
          <div>
            <Label>מספר אסמכתא</Label>
            <Input value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} />
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => mutation.mutate({ ...form, supplier_id: supplier.id })}
            disabled={form.amount <= 0}
            className="bg-green-600 hover:bg-green-700"
          >
            שמור תשלום
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderFormModal({ open, supplier, onClose, queryClient, toast }) {
  const [form, setForm] = useState({
    order_number: '',
    order_date: format(new Date(), 'yyyy-MM-dd'),
    expected_delivery: '',
    total_amount: 0,
    notes: '',
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        order_number: '',
        order_date: format(new Date(), 'yyyy-MM-dd'),
        expected_delivery: '',
        total_amount: 0,
        notes: '',
      });
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.SupplierOrder.create(data);
      // Update supplier debt
      const newDebt = (supplier.total_debt || 0) + data.total_amount;
      await base44.entities.Supplier.update(supplier.id, { total_debt: newDebt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-orders'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({ title: '✅ ההזמנה נוספה בהצלחה', duration: 2000 });
      onClose();
    },
  });

  if (!supplier) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>הזמנה חדשה - {supplier.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>מספר הזמנה</Label>
            <Input value={form.order_number} onChange={e => setForm({ ...form, order_number: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>תאריך הזמנה</Label>
              <Input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} />
            </div>
            <div>
              <Label>תאריך אספקה משוער</Label>
              <Input type="date" value={form.expected_delivery} onChange={e => setForm({ ...form, expected_delivery: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>סכום כולל</Label>
            <Input type="number" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: Number(e.target.value) })} />
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate({ ...form, supplier_id: supplier.id })} disabled={form.total_amount <= 0}>
            צור הזמנה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierDetailsModal({ open, supplier, orders, payments, onClose, onAddOrder, onAddPayment, queryClient, toast }) {
  const user = useCurrentUser();
  const { data: stockUpdates = [] } = useQuery({
    queryKey: ['stock-updates', user?.email],
    queryFn: () => user ? base44.entities.StockUpdate.filter({ created_by: user.email }, '-arrival_date') : [],
    enabled: open && !!supplier && !!user,
  });

  if (!supplier) return null;

  const supplierStockUpdates = stockUpdates.filter(u => u.supplier_id === supplier.id);

  // Build unified transaction log: shipments (debt) + payments (credit), sorted by date desc
  const transactions = [
    ...supplierStockUpdates.map(u => ({
      id: u.id,
      date: u.arrival_date,
      type: 'shipment',
      label: u.product_name,
      amount: u.quantity_added,
      rawDate: new Date(u.arrival_date),
    })),
    ...payments.map(p => ({
      id: p.id,
      date: p.payment_date,
      type: 'payment',
      label: p.payment_method + (p.reference_number ? ` (#${p.reference_number})` : ''),
      amount: p.amount,
      rawDate: new Date(p.payment_date),
    })),
  ].sort((a, b) => b.rawDate - a.rawDate);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Building2 className="w-6 h-6" />
            {supplier.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-gray-500">חוב נוכחי</p>
                <p className="text-2xl font-bold text-red-600">₪{(supplier.total_debt || 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-gray-500">משלוחים</p>
                <p className="text-2xl font-bold text-amber-600">{supplierStockUpdates.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-gray-500">תשלומים</p>
                <p className="text-2xl font-bold text-green-600">{payments.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button size="sm" variant="outline" onClick={onAddOrder} className="flex-1">
              <Plus className="w-4 h-4 ml-2" /> הזמנה חדשה
            </Button>
            <Button size="sm" onClick={onAddPayment} className="flex-1 bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 ml-2" /> רשום תשלום
            </Button>
          </div>

          {/* Unified Transaction Log */}
          <div>
            <h3 className="font-semibold mb-3">יומן עסקאות</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transactions.length === 0 ? (
                <p className="text-center text-gray-400 py-4">אין עסקאות</p>
              ) : (
                transactions.map(tx => (
                  <div key={tx.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                    tx.type === 'payment' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{tx.type === 'payment' ? '💳' : '📦'}</span>
                      <div>
                        <p className="font-medium text-sm">{tx.label}</p>
                        <p className="text-xs text-gray-500">
                          {tx.date ? format(new Date(tx.date), 'dd/MM/yyyy') : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      {tx.type === 'payment' ? (
                        <p className="font-bold text-green-700">-₪{tx.amount.toLocaleString()}</p>
                      ) : (
                        <p className="font-bold text-red-700">+{tx.amount} יח'</p>
                      )}
                      <p className="text-xs text-gray-400">{tx.type === 'payment' ? 'תשלום' : 'משלוח'}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Open Orders */}
          {orders.filter(o => o.status !== 'התקבל' && o.status !== 'בוטל').length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">הזמנות פתוחות</h3>
              <div className="space-y-2">
                {orders.filter(o => o.status !== 'התקבל' && o.status !== 'בוטל').map(order => (
                  <Card key={order.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">הזמנה #{order.order_number || order.id.slice(0, 8)}</p>
                          <p className="text-xs text-gray-500">{format(new Date(order.order_date), 'dd/MM/yyyy')}</p>
                        </div>
                        <div className="text-left">
                          <Badge variant="outline">{order.status}</Badge>
                          <p className="text-sm font-bold mt-1">₪{order.total_amount.toLocaleString()}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}