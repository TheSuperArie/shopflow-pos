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
import VariantDimensionFolders from '@/components/admin/VariantDimensionFolders';
import { useInventorySync } from '@/hooks/useInventorySync';
import { format } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import ShipmentCheckbox from '@/components/shipment/ShipmentCheckbox';
import VariantItemWithCheckbox from '@/components/shipment/VariantItemWithCheckbox';

export default function AdminStock() {
  const [showForm, setShowForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  useInventorySync();
  const user = useCurrentUser();

  const { data: updates = [], isLoading } = useQuery({
    queryKey: ['stock-updates', user?.email],
    queryFn: () => user ? base44.entities.StockUpdate.filter({ created_by: user.email }, '-arrival_date') : [],
    enabled: !!user,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.email],
    queryFn: () => user ? base44.entities.Category.filter({ created_by: user.email }, 'sort_order') : [],
    enabled: !!user,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups', user?.email],
    queryFn: () => user ? base44.entities.ProductGroup.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants', user?.email],
    queryFn: () => user ? base44.entities.ProductVariant.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  const { data: allDimensions = [] } = useQuery({
    queryKey: ['variant-dimensions', user?.email],
    queryFn: () => user ? base44.entities.VariantDimension.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  // Calculate low stock items by category → group (with hierarchy)
  const lowStockByCategory = {};
  categories.forEach(cat => {
    lowStockByCategory[cat.id] = {
      category: cat,
      groups: {},
      totalVariants: 0,
    };
  });

  groups.forEach(group => {
    const lowStockVariants = variants.filter(v => v.group_id === group.id && (v.stock || 0) < 5);
    if (lowStockVariants.length === 0) return;

    const catId = group.category_id;
    if (!lowStockByCategory[catId]) {
      lowStockByCategory[catId] = { category: { id: catId, name: 'ללא קטגוריה' }, groups: {}, totalVariants: 0 };
    }

    lowStockByCategory[catId].groups[group.id] = { group, variants: lowStockVariants };
    lowStockByCategory[catId].totalVariants += lowStockVariants.length;
  });

  const lowStockData = Object.values(lowStockByCategory).filter(cat => cat.totalVariants > 0);
  const totalLowStock = lowStockData.reduce((sum, cat) => sum + cat.totalVariants, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">עדכון מלאי</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowForm(true)} className="gap-2 bg-amber-500 hover:bg-amber-600">
            <Plus className="w-4 h-4" /> סחורה חדשה
          </Button>
        </div>
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
            {lowStockData.map(({ category, groups: catGroups, totalVariants }) => {
              const catGroupsList = Object.values(catGroups);
              return (
                <div key={category.id} className="border-2 border-red-300 rounded-xl overflow-hidden">
                  {/* Category Folder Header */}
                  <div className="bg-red-200 p-3 flex items-center justify-between border-b-2 border-red-300">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📁</span>
                      <div className="text-right">
                        <h3 className="font-bold text-red-900">{category.name}</h3>
                        <p className="text-xs text-red-700">{catGroupsList.length} מוצרים • {totalVariants} וריאציות</p>
                      </div>
                    </div>
                    <Badge className="bg-red-700 text-white">{totalVariants}</Badge>
                  </div>

                  {/* Products inside category folder */}
                  <div className="bg-white p-3 space-y-3">
                    {catGroupsList.map(({ group, variants: gVariants }) => (
                      <Card key={group.id} className="border-red-200 bg-gray-50">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              {group.image_url && (
                                <img src={group.image_url} alt={group.name} className="w-12 h-12 object-cover rounded-lg" />
                              )}
                              <div>
                                <CardTitle className="text-base">{group.name}</CardTitle>
                                <p className="text-xs text-gray-500 mt-1">{gVariants.length} וריאציות</p>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <VariantDimensionFolders
                            variants={gVariants.sort((a, b) => (a.stock || 0) - (b.stock || 0))}
                            group={group}
                            allDimensions={allDimensions}
                            badgeColor="bg-red-600"
                            folderBg="bg-red-50"
                            folderBorder="border-red-200"
                            renderVariant={(v) => {
                              const dimText = v.dimensions && Object.keys(v.dimensions).length > 0
                                ? Object.entries(v.dimensions).map(([k, val]) => `${k}: ${val}`).join(' • ')
                                : v.sku || 'מוצר בודד';
                              return (
                                <div className="flex items-center justify-between p-2 bg-white rounded border border-red-200">
                                  <p className="font-medium text-sm">{dimText}</p>
                                  <div className="text-left">
                                    <p className="text-sm font-bold text-red-600">{v.stock || 0}</p>
                                  </div>
                                </div>
                              );
                            }}
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
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

      <StockFormModal open={showForm} onClose={() => setShowForm(false)} />
    </div>
  );
}

function StockFormModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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

  const { data: allDimensions = [] } = useQuery({
    queryKey: ['variant-dimensions'],
    queryFn: () => base44.entities.VariantDimension.list(),
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
    const gVariants = variants.filter(v => v.group_id === group.id);
    const isSimple = (!group.enabled_dimensions || group.enabled_dimensions.length === 0) && gVariants.length === 1;
    if (isSimple) {
      setSelectedVariant(gVariants[0]);
      setStep('details');
    } else {
      setStep('variant');
    }
  };

  const handleVariantSelect = (variant) => {
    setSelectedVariant(variant);
    setStep('details');
  };

  const handleBack = () => {
    if (step === 'details') {
      // Check if variant step was skipped (simple product)
      const gVariants = variants.filter(v => v.group_id === selectedGroup?.id);
      const wasSkipped = (!selectedGroup?.enabled_dimensions || selectedGroup.enabled_dimensions.length === 0) && gVariants.length === 1;
      if (wasSkipped) {
        setStep('group');
        setSelectedGroup(null);
        setSelectedVariant(null);
      } else {
        setStep('variant');
        setSelectedVariant(null);
      }
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
      
      // Build product name from dimensions
      let variantDesc = '';
      if (selectedVariant.dimensions && typeof selectedVariant.dimensions === 'object') {
        variantDesc = Object.entries(selectedVariant.dimensions)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
      } else {
        variantDesc = 'רגיל';
      }
      
      const productName = selectedVariant.sku || selectedVariant.barcode
        ? `${selectedGroup.name} - ${variantDesc} [${(selectedVariant.sku || selectedVariant.barcode).slice(-4)}]`
        : `${selectedGroup.name} - ${variantDesc}`;
      
      // Determine cost price: variant-level or group-level
      const costPrice = selectedGroup.has_uniform_price
        ? (selectedGroup.uniform_cost_price || 0)
        : (selectedVariant.cost_price || 0);
      const debtAmount = data.quantity_added * costPrice;

      // Create stock update record
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

      // Update stock directly using current known stock value
      const currentStock = selectedVariant.stock || 0;
      await base44.entities.ProductVariant.update(selectedVariant.id, {
        stock: currentStock + data.quantity_added,
      });

      // Automatically add debt to supplier if a supplier was selected
      if (supplier && debtAmount > 0) {
        const currentDebt = supplier.total_debt || 0;
        await base44.entities.Supplier.update(supplier.id, {
          total_debt: currentDebt + debtAmount,
        });
      }

      if (data.order_id) {
        await base44.entities.SupplierOrder.update(data.order_id, { status: 'התקבל חלקית' });
      }
    },
    onSuccess: () => {
      // Invalidate all query keys that reference variants (including POS offline keys)
      queryClient.invalidateQueries({ queryKey: ['stock-updates'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-orders'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({ 
        title: '✅ המלאי עודכן בהצלחה',
        description: 'כל הדפים מסונכרנים אוטומטית',
        duration: 3000,
      });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: '❌ שגיאה בעדכון המלאי',
        description: error.message,
        duration: 4000,
      });
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
            <VariantDimensionFolders
              variants={groupVariants}
              group={selectedGroup}
              badgeColor="bg-amber-500"
              folderBg="bg-amber-50"
              folderBorder="border-amber-200"
              renderVariant={(variant) => {
                const displayText = variant.dimensions && typeof variant.dimensions === 'object'
                  ? Object.entries(variant.dimensions).map(([k, v]) => `${k}: ${v}`).join(' | ')
                  : 'רגיל';
                return (
                  <button
                    onClick={() => handleVariantSelect(variant)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border-2 border-gray-200 hover:border-amber-500 hover:bg-amber-50 transition-all text-right"
                  >
                    <span className="font-semibold text-sm">{displayText}</span>
                    <Badge variant="outline">מלאי: {variant.stock || 0}</Badge>
                  </button>
                );
              }}
            />
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
                  : 'רגיל'}
              </p>
              <p className="text-xs text-gray-500 mt-1">מלאי נוכחי: {selectedVariant?.stock || 0}</p>
              {selectedGroup && (
                <p className="text-xs text-gray-500 mt-0.5">
                  מחיר עלות: ₪{selectedGroup.has_uniform_price ? (selectedGroup.uniform_cost_price || 0) : (selectedVariant?.cost_price || 0)}
                </p>
              )}
            </div>

            <div><Label>כמות שהגיעה</Label><Input type="number" value={form.quantity_added} onChange={e => setForm({ ...form, quantity_added: Number(e.target.value) })} /></div>

            {form.quantity_added > 0 && form.supplier_id && (() => {
              const costPrice = selectedGroup?.has_uniform_price
                ? (selectedGroup?.uniform_cost_price || 0)
                : (selectedVariant?.cost_price || 0);
              const debtAmount = form.quantity_added * costPrice;
              return debtAmount > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                  <p className="text-red-700 font-semibold">חוב שיתווסף לספק: ₪{debtAmount.toLocaleString()}</p>
                  <p className="text-red-500 text-xs">{form.quantity_added} × ₪{costPrice}</p>
                </div>
              ) : null;
            })()}
            
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
              <Button onClick={() => mutation.mutate(form)} disabled={!(form.quantity_added > 0) || mutation.isPending} className="bg-amber-500 hover:bg-amber-600 w-full">
                {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור ועדכן מלאי'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}