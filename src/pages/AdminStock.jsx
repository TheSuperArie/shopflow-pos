import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Loader2, TruckIcon, AlertTriangle, Package, ChevronLeft, Folder } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminStock() {
  const [showForm, setShowForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: updates = [], isLoading } = useQuery({
    queryKey: ['stock-updates'],
    queryFn: () => base44.entities.StockUpdate.list('-arrival_date'),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('sort_order'),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants'],
    queryFn: () => base44.entities.ProductVariant.list(),
  });

  // Calculate low stock items by category
  const lowStockByCategory = {};
  groups.forEach(group => {
    const category = categories.find(c => c.id === group.category_id);
    const categoryName = category?.name || 'אחר';
    
    const groupVariants = variants.filter(v => v.group_id === group.id);
    groupVariants.forEach(variant => {
      if ((variant.stock || 0) < 5) {
        if (!lowStockByCategory[categoryName]) {
          lowStockByCategory[categoryName] = [];
        }
        
        // Build variant description
        let variantDesc = '';
        if (variant.dimensions && typeof variant.dimensions === 'object') {
          variantDesc = Object.entries(variant.dimensions).map(([k, v]) => `${k}: ${v}`).join(' | ');
        } else if (variant.size) {
          variantDesc = `${variant.size} | ${variant.cut} | ${variant.collar}`;
        } else {
          variantDesc = 'רגיל';
        }
        
        lowStockByCategory[categoryName].push({
          groupName: group.name,
          variantDesc,
          stock: variant.stock || 0,
        });
      }
    });
  });

  const totalLowStock = Object.values(lowStockByCategory).reduce((sum, items) => sum + items.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">עדכון מלאי</h1>
        <Button onClick={() => setShowForm(true)} className="gap-2 bg-amber-500 hover:bg-amber-600">
          <Plus className="w-4 h-4" /> סחורה חדשה
        </Button>
      </div>

      {/* Low Stock Alert - Organized by Categories as Folders */}
      {totalLowStock > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              התראות מלאי נמוך ({totalLowStock} פריטים)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(lowStockByCategory).map(([categoryName, items]) => (
              <div key={categoryName} className="border-2 border-red-300 rounded-xl overflow-hidden">
                {/* Category Folder Header */}
                <div className="bg-red-200 p-3 flex items-center justify-between border-b-2 border-red-300">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📁</span>
                    <h3 className="font-bold text-red-900">{categoryName}</h3>
                  </div>
                  <Badge className="bg-red-700 text-white">
                    {items.length}
                  </Badge>
                </div>
                
                {/* Items inside category folder */}
                <div className="bg-white p-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map((item, idx) => (
                      <div key={idx} className="p-3 bg-red-50 rounded-lg border-2 border-red-200">
                        <p className="font-semibold text-sm">{item.groupName}</p>
                        <p className="text-xs text-gray-600">{item.variantDesc}</p>
                        <Badge className="mt-2 bg-red-600">
                          מלאי: {item.stock} יחידות
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : (
        <div className="space-y-3">
          {updates.map(upd => (
            <Card key={upd.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <TruckIcon className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{upd.product_name}</p>
                  <p className="text-sm text-gray-500">
                    +{upd.quantity_added} יחידות • {upd.supplier_name || 'ספק לא צוין'} • {upd.arrival_date}
                  </p>
                  {upd.notes && <p className="text-xs text-gray-400 mt-1">{upd.notes}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
          {updates.length === 0 && <p className="text-center text-gray-400 py-12">אין עדכוני מלאי</p>}
        </div>
      )}

      <StockFormModal open={showForm} onClose={() => setShowForm(false)} queryClient={queryClient} toast={toast} />
    </div>
  );
}

function StockFormModal({ open, onClose, queryClient, toast }) {
  const [step, setStep] = useState('category'); // 'category' | 'group' | 'variant' | 'details'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [form, setForm] = useState({
    quantity_added: 0, supplier_id: '', order_id: '', arrival_date: format(new Date(), 'yyyy-MM-dd'), notes: '',
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('sort_order'),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants'],
    queryFn: () => base44.entities.ProductVariant.list(),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['supplier-orders'],
    queryFn: () => base44.entities.SupplierOrder.list(),
    enabled: !!form.supplier_id,
  });

  const categoryGroups = selectedCategory 
    ? groups.filter(g => g.category_id === selectedCategory.id)
    : [];

  const groupVariants = selectedGroup
    ? variants.filter(v => v.group_id === selectedGroup.id)
    : [];

  const supplierOrders = orders.filter(o => o.supplier_id === form.supplier_id && o.status !== 'התקבל' && o.status !== 'בוטל');

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setStep('group');
  };

  const handleGroupSelect = (group) => {
    setSelectedGroup(group);
    setStep('variant');
  };

  const handleVariantSelect = (variant) => {
    setSelectedVariant(variant);
    setStep('details');
  };

  const handleBack = () => {
    if (step === 'details') {
      setStep('variant');
      setSelectedVariant(null);
    } else if (step === 'variant') {
      setStep('group');
      setSelectedGroup(null);
    } else if (step === 'group') {
      setStep('category');
      setSelectedCategory(null);
    }
  };

  const handleClose = () => {
    setStep('category');
    setSelectedCategory(null);
    setSelectedGroup(null);
    setSelectedVariant(null);
    setForm({ quantity_added: 0, supplier_id: '', order_id: '', arrival_date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
    onClose();
  };

  const mutation = useMutation({
    mutationFn: async (data) => {
      const supplier = suppliers.find(s => s.id === data.supplier_id);
      
      // Build product name from dimensions or fallback
      let variantDesc = '';
      if (selectedVariant.dimensions && typeof selectedVariant.dimensions === 'object') {
        variantDesc = Object.entries(selectedVariant.dimensions)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
      } else if (selectedVariant.size) {
        // Legacy format support
        variantDesc = `מידה ${selectedVariant.size}, ${selectedVariant.cut}, ${selectedVariant.collar}`;
      }
      
      const productName = selectedVariant.sku || selectedVariant.barcode
        ? `${selectedGroup.name} - ${variantDesc} [${(selectedVariant.sku || selectedVariant.barcode).slice(-4)}]`
        : `${selectedGroup.name} - ${variantDesc}`;
      
      await base44.entities.StockUpdate.create({
        product_id: selectedVariant.id,
        product_name: productName,
        quantity_added: data.quantity_added,
        supplier_id: data.supplier_id,
        supplier_name: supplier?.name || '',
        order_id: data.order_id,
        arrival_date: data.arrival_date,
        notes: data.notes,
      });

      await base44.entities.ProductVariant.update(selectedVariant.id, {
        stock: (selectedVariant.stock || 0) + data.quantity_added,
      });

      if (data.order_id) {
        await base44.entities.SupplierOrder.update(data.order_id, { status: 'התקבל חלקית' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-updates'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-orders'] });
      toast({ 
        title: '✅ המלאי עודכן בהצלחה',
        duration: 2000,
      });
      handleClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step !== 'category' && (
              <button onClick={handleBack} className="p-1 hover:bg-gray-100 rounded">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <DialogTitle>
              {step === 'category' && 'בחר קטגוריה'}
              {step === 'group' && `קטגוריה: ${selectedCategory?.name}`}
              {step === 'variant' && `${selectedGroup?.name}`}
              {step === 'details' && 'פרטי המשלוח'}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Step 1: Select Category */}
        {step === 'category' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">בחר את הקטגוריה של המוצר:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat)}
                  className="p-6 rounded-xl border-2 border-gray-200 hover:border-amber-500 hover:bg-amber-50 transition-all text-center"
                >
                  <p className="font-semibold">{cat.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {groups.filter(g => g.category_id === cat.id).length} תיקיות
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Select Group */}
        {step === 'group' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">בחר תיקיית מוצר:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categoryGroups.map(group => {
                const groupVars = variants.filter(v => v.group_id === group.id);
                const totalStock = groupVars.reduce((s, v) => s + (v.stock || 0), 0);
                return (
                  <button
                    key={group.id}
                    onClick={() => handleGroupSelect(group)}
                    className="p-4 rounded-xl border-2 border-gray-200 hover:border-amber-500 hover:bg-amber-50 transition-all text-right"
                  >
                    <div className="flex gap-3">
                      {group.image_url ? (
                        <img src={group.image_url} alt="" className="w-12 h-12 rounded object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center">
                          <Package className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-semibold">{group.name}</p>
                        <p className="text-xs text-gray-500">מלאי כולל: {totalStock}</p>
                        <p className="text-xs text-gray-400">{groupVars.length} וריאציות</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Select Variant */}
        {step === 'variant' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">בחר וריאציה:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {groupVariants.map(variant => {
                // Display dimensions or legacy fields
                const displayText = variant.dimensions && typeof variant.dimensions === 'object'
                  ? Object.entries(variant.dimensions).map(([k, v]) => `${k}: ${v}`).join(' | ')
                  : variant.size ? `מידה ${variant.size} | ${variant.cut} | ${variant.collar}` : 'רגיל';
                
                return (
                  <button
                    key={variant.id}
                    onClick={() => handleVariantSelect(variant)}
                    className="p-4 rounded-xl border-2 border-gray-200 hover:border-amber-500 hover:bg-amber-50 transition-all text-center"
                  >
                    <p className="font-semibold text-sm">{displayText}</p>
                    <Badge className="mt-2" variant="outline">
                      מלאי: {variant.stock || 0}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Enter Details */}
        {step === 'details' && (
          <div className="space-y-4">
            <div className="bg-amber-50 p-3 rounded-lg">
              <p className="font-semibold">{selectedGroup?.name}</p>
              <p className="text-sm text-gray-600">
                {selectedVariant?.dimensions && typeof selectedVariant.dimensions === 'object'
                  ? Object.entries(selectedVariant.dimensions).map(([k, v]) => `${k}: ${v}`).join(' | ')
                  : selectedVariant?.size ? `מידה ${selectedVariant.size} | ${selectedVariant.cut} | ${selectedVariant.collar}` : 'רגיל'}
              </p>
              <p className="text-xs text-gray-500 mt-1">מלאי נוכחי: {selectedVariant?.stock || 0}</p>
              {(selectedVariant?.sku || selectedVariant?.barcode) && (
                <p className="text-xs text-gray-400 mt-1">
                  מק"ט: {selectedVariant.sku || selectedVariant.barcode} (4 ספרות: {(selectedVariant.sku || selectedVariant.barcode).slice(-4)})
                </p>
              )}
            </div>

            <div><Label>כמות שהגיעה</Label><Input type="number" value={form.quantity_added} onChange={e => setForm({ ...form, quantity_added: Number(e.target.value) })} /></div>
            
            <div>
              <Label>ספק</Label>
              <Select value={form.supplier_id} onValueChange={v => setForm({ ...form, supplier_id: v, order_id: '' })}>
                <SelectTrigger><SelectValue placeholder="בחר ספק" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {form.supplier_id && supplierOrders.length > 0 && (
              <div>
                <Label>קשר להזמנה (אופציונלי)</Label>
                <Select value={form.order_id} onValueChange={v => setForm({ ...form, order_id: v })}>
                  <SelectTrigger><SelectValue placeholder="ללא קישור" /></SelectTrigger>
                  <SelectContent>
                    {supplierOrders.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        הזמנה #{o.order_number || o.id.slice(0, 8)} - {o.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div><Label>תאריך הגעה</Label><Input type="date" value={form.arrival_date} onChange={e => setForm({ ...form, arrival_date: e.target.value })} /></div>
            <div><Label>הערות</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>

            <DialogFooter>
              <Button onClick={() => mutation.mutate(form)} disabled={!form.quantity_added} className="bg-amber-500 hover:bg-amber-600 w-full">
                {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור ועדכן מלאי'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}