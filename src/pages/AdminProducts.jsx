import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, FolderPlus, Loader2, Folder, ChevronDown, Settings, Zap } from 'lucide-react';
import VariantDimensionsManager from '@/components/admin/VariantDimensionsManager';
import VariantDimensionFolders from '@/components/admin/VariantDimensionFolders';
import BarcodePrintModal from '@/components/admin/BarcodePrintModal';
import { useCurrentUser } from '@/hooks/useCurrentUser';



export default function AdminProducts() {
  const [showCatForm, setShowCatForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [viewingGroup, setViewingGroup] = useState(null);
  const [managingDimensions, setManagingDimensions] = useState(null);
  const [printingBarcode, setPrintingBarcode] = useState(null);
  const [showSimpleProductForm, setShowSimpleProductForm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.email],
    queryFn: () => user ? base44.entities.Category.filter({ created_by: user.email }, 'sort_order') : [],
    enabled: !!user,
  });

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['product-groups', user?.email],
    queryFn: () => user ? base44.entities.ProductGroup.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants', user?.email],
    queryFn: () => user ? base44.entities.ProductVariant.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  // Group products by category - show ALL categories even empty ones
  const categorizedGroups = {};
  categories.forEach(cat => {
    categorizedGroups[cat.id] = {
      category: cat,
      groups: groups.filter(g => g.category_id === cat.id),
    };
  });

  const categorizedData = Object.values(categorizedGroups);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">מוצרים וקטלוג</h1>
        <div className="flex gap-2">
          <Button onClick={() => { setEditingCategory(null); setShowCatForm(true); }} variant="outline" className="gap-2">
            <FolderPlus className="w-4 h-4" /> קטגוריה
          </Button>
          <Button onClick={() => setShowSimpleProductForm(true)} variant="outline" className="gap-2 border-green-300 text-green-600 hover:bg-green-50">
            <Plus className="w-4 h-4" /> מוצר בודד
          </Button>
          <Button onClick={() => { setEditingGroup(null); setShowGroupForm(true); }} className="gap-2 bg-amber-500 hover:bg-amber-600">
            <Plus className="w-4 h-4" /> תיקיית מוצר
          </Button>
        </div>
      </div>

      {/* Collapsible Categories */}
      {loadingGroups ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : (
        <div className="space-y-3">
          {categorizedData.map(({ category, groups: catGroups }) => {
            const isExpanded = expandedCategory === category.id;
            const totalVariants = catGroups.reduce((sum, g) => {
              return sum + variants.filter(v => v.group_id === g.id).length;
            }, 0);
            
            return (
              <div key={category.id} className="border-2 border-amber-200 rounded-xl overflow-hidden">
                {/* Category Header - Sticky */}
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                  className="sticky top-0 z-10 w-full bg-amber-100 p-4 flex items-center justify-between border-b-2 border-amber-200 hover:bg-amber-150 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center">
                      <Folder className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-right">
                      <h3 className="font-bold text-amber-900 text-lg">{category.name}</h3>
                      <p className="text-sm text-amber-700">{catGroups.length} מוצרים • {totalVariants} וריאציות</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setManagingDimensions(category); }}
                      className="p-2 rounded-lg hover:bg-amber-200 transition-colors"
                      title="ניהול ממדי וריאציות"
                    >
                      <Settings className="w-5 h-5 text-amber-700" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingCategory(category); setShowCatForm(true); }}
                      className="p-2 rounded-lg hover:bg-amber-200 transition-colors"
                    >
                      <Pencil className="w-5 h-5 text-amber-700" />
                    </button>
                    <DeleteCategoryButton categoryId={category.id} queryClient={queryClient} toast={toast} />
                    <ChevronDown className={`w-5 h-5 ml-2 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                
                {/* Products Grid - Expandable */}
                {isExpanded && (
                  <div className="bg-white p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {catGroups.map(group => {
                        const groupVariants = variants.filter(v => v.group_id === group.id);
                        const totalStock = groupVariants.reduce((s, v) => s + (v.stock || 0), 0);
                        return (
                          <Card key={group.id} className="cursor-pointer hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="flex gap-3" onClick={() => setViewingGroup(group)}>
                                {group.image_url ? (
                                  <img src={group.image_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
                                ) : (
                                  <div className="w-16 h-16 rounded-xl bg-amber-50 flex items-center justify-center">
                                    <Folder className="w-8 h-8 text-amber-400" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold truncate">{group.name}</p>
                                  <p className="text-sm text-gray-500">
                                    {group.has_uniform_price ? (
                                      <>עלות: ₪{group.uniform_cost_price || 0} | מכירה: ₪{group.uniform_sell_price}</>
                                    ) : (
                                      <>מחירים משתנים</>
                                    )}
                                  </p>
                                  <p className="text-sm text-gray-500">סה"כ מלאי: {totalStock}</p>
                                  <p className="text-xs text-amber-600 mt-0.5">{groupVariants.length} וריאציות</p>
                                </div>
                                <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => { setEditingGroup(group); setShowGroupForm(true); }}
                                    className="p-3 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                  >
                                    <Pencil className="w-5 h-5 text-gray-500" />
                                  </button>
                                  <DeleteGroupButton groupId={group.id} queryClient={queryClient} toast={toast} />
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CategoryFormModal
        open={showCatForm}
        category={editingCategory}
        onClose={() => setShowCatForm(false)}
        queryClient={queryClient}
        toast={toast}
        user={user}
      />

      <ProductGroupFormModal
        open={showGroupForm}
        group={editingGroup}
        categories={categories}
        onClose={() => setShowGroupForm(false)}
        queryClient={queryClient}
        toast={toast}
        user={user}
      />

      <VariantsViewModal
        open={!!viewingGroup}
        group={viewingGroup}
        variants={variants.filter(v => v.group_id === viewingGroup?.id)}
        onClose={() => setViewingGroup(null)}
        queryClient={queryClient}
        toast={toast}
      />

      <Dialog open={!!managingDimensions} onOpenChange={() => setManagingDimensions(null)}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ניהול ממדי וריאציות</DialogTitle>
          </DialogHeader>
          {managingDimensions && (
            <VariantDimensionsManager
              categoryId={managingDimensions.id}
              categoryName={managingDimensions.name}
            />
          )}
        </DialogContent>
      </Dialog>

      {printingBarcode && (
        <BarcodePrintModal
          open={!!printingBarcode}
          onClose={() => setPrintingBarcode(null)}
          variant={printingBarcode.variant}
          group={printingBarcode.group}
        />
      )}

      <SimpleProductFormModal
        open={showSimpleProductForm}
        categories={categories}
        onClose={() => setShowSimpleProductForm(false)}
        queryClient={queryClient}
        toast={toast}
      />
    </div>
  );
}

function DeleteCategoryButton({ categoryId, queryClient, toast }) {
  const deleteMut = useMutation({
    mutationFn: async () => {
      // Delete all groups and their variants in this category
      const allGroups = await base44.entities.ProductGroup.list();
      const catGroups = allGroups.filter(g => g.category_id === categoryId);
      const allVariants = await base44.entities.ProductVariant.list();
      await Promise.all(
        catGroups.flatMap(g =>
          allVariants.filter(v => v.group_id === g.id).map(v => base44.entities.ProductVariant.delete(v.id))
        )
      );
      await Promise.all(catGroups.map(g => base44.entities.ProductGroup.delete(g.id)));
      await base44.entities.Category.delete(categoryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast({ title: '🗑️ הקטגוריה נמחקה', duration: 2000, className: 'bg-red-500 text-white border-red-600' });
    },
  });

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (window.confirm('למחוק קטגוריה זו וכל המוצרים בתוכה?')) deleteMut.mutate();
      }}
      className="p-2 rounded-lg hover:bg-red-100 transition-colors"
      title="מחק קטגוריה"
    >
      {deleteMut.isPending ? <Loader2 className="w-5 h-5 animate-spin text-red-500" /> : <Trash2 className="w-5 h-5 text-red-500" />}
    </button>
  );
}

function DeleteGroupButton({ groupId, queryClient, toast }) {
  const deleteMut = useMutation({
    mutationFn: async () => {
      await base44.entities.ProductGroup.delete(groupId);
      const variants = await base44.entities.ProductVariant.list();
      const toDelete = variants.filter(v => v.group_id === groupId);
      await Promise.all(toDelete.map(v => base44.entities.ProductVariant.delete(v.id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast({ 
        title: '🗑️ התיקייה נמחקה',
        duration: 2000,
        className: 'bg-red-500 text-white border-red-600'
      });
    },
  });

  return (
    <button
      onClick={() => { if (window.confirm('למחוק תיקייה וכל הוריאציות?')) deleteMut.mutate(); }}
      className="p-3 rounded-lg hover:bg-red-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
    >
      <Trash2 className="w-5 h-5 text-red-400" />
    </button>
  );
}

function CategoryFormModal({ open, category, onClose, queryClient, toast, user }) {
  const [name, setName] = useState('');

  React.useEffect(() => {
    if (category) {
      setName(category.name);
    } else {
      setName('');
    }
  }, [category, open]);

  const mutation = useMutation({
    mutationFn: (data) =>
      category
        ? base44.entities.Category.update(category.id, data)
        : base44.entities.Category.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ 
        title: category ? '✅ הקטגוריה עודכנה' : '✅ הקטגוריה נוצרה',
        duration: 2000,
        className: 'bg-blue-500 text-white border-blue-600'
      });
      onClose();
    },
    onError: (error) => {
      toast({ title: `❌ שגיאה: ${error.message}`, duration: 5000 });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => base44.entities.Category.delete(category.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ 
        title: '🗑️ הקטגוריה נמחקה',
        duration: 2000,
        className: 'bg-red-500 text-white border-red-600'
      });
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{category ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>שם הקטגוריה</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="למשל: חולצות" />
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          {category && (
            <Button variant="destructive" onClick={() => { if (window.confirm('למחוק?')) deleteMut.mutate(); }}>
              מחק
            </Button>
          )}
          <Button
            onClick={() => mutation.mutate(category ? { name } : { name, created_by: user?.email })}
            className="bg-amber-500 hover:bg-amber-600"
            disabled={!name || mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
          {mutation.isError && (
            <p className="text-red-500 text-xs mt-1">{mutation.error?.message}</p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductGroupFormModal({ open, group, categories, onClose, queryClient, toast, user }) {
  const [form, setForm] = useState({
    name: '', category_id: '', has_uniform_price: true, uniform_sell_price: 0, uniform_cost_price: 0, image_url: '', barcode: '', enabled_dimensions: [],
  });
  const [uploading, setUploading] = useState(false);
  const [generatedPreview, setGeneratedPreview] = useState(null); // null = not generated yet
  const [generating, setGenerating] = useState(false);
  const [progressText, setProgressText] = useState('');

  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  const createVariantsBatched = async (toCreate, groupId, onProgress) => {
    const BATCH_SIZE = 20;
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((combo, batchIdx) =>
        base44.entities.ProductVariant.create({
          group_id: groupId,
          dimensions: combo,
          stock: 0,
          sku: `${groupId.slice(-4)}-${i + batchIdx + 1}`,
        })
      ));
      onProgress(Math.min(i + BATCH_SIZE, toCreate.length), toCreate.length);
      if (i + BATCH_SIZE < toCreate.length) await delay(50);
    }
  };

  const { data: dimensions = [] } = useQuery({
    queryKey: ['variant-dimensions', form.category_id],
    queryFn: () => form.category_id ? base44.entities.VariantDimension.filter({ category_id: form.category_id }) : Promise.resolve([]),
    enabled: !!form.category_id,
  });

  React.useEffect(() => {
    if (group) {
      setForm({
        name: group.name || '',
        category_id: group.category_id || '',
        has_uniform_price: group.has_uniform_price !== false,
        uniform_sell_price: group.uniform_sell_price || 0,
        uniform_cost_price: group.uniform_cost_price || 0,
        image_url: group.image_url || '',
        barcode: group.barcode || '',
        enabled_dimensions: group.enabled_dimensions || [],
      });
    } else {
      setForm({ name: '', category_id: '', has_uniform_price: true, uniform_sell_price: 0, uniform_cost_price: 0, image_url: '', barcode: '', enabled_dimensions: [] });
    }
    setGeneratedPreview(null);
  }, [group, open]);

  // Helper: compute all combinations (cartesian product) of dimension values
  // Uses sorted, stable dimension order to guarantee consistency
  const cartesianProduct = (dims) => {
    if (dims.length === 0) return [{}];
    const result = [{}];
    for (const dim of dims) {
      const expanded = [];
      for (const existing of result) {
        for (const val of (dim.values || [])) {
          expanded.push({ ...existing, [dim.name]: val });
        }
      }
      result.length = 0;
      result.push(...expanded);
    }
    return result;
  };

  const handleGeneratePreview = () => {
    const selected = dimensions
      .filter(d => form.enabled_dimensions.includes(d.id))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (selected.length === 0) return;
    const combos = cartesianProduct(selected);
    setGeneratedPreview(combos);
    toast({ title: `⚡ נוצרו ${combos.length} צירופים — לחץ "שמור" לאישור`, duration: 3000 });
  };

  const mutation = useMutation({
    mutationFn: async ({ formData, dimensionsSnapshot, previewSnapshot }) => {
      if (group) {
        await base44.entities.ProductGroup.update(group.id, formData);
        return { count: 0 };
      }
      // Create new group
      const newGroup = await base44.entities.ProductGroup.create(formData);

      // Always compute combinations fresh at save time from the passed-in snapshot
      const enabledDims = dimensionsSnapshot
        .filter(d => formData.enabled_dimensions?.includes(d.id))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      // Use previewSnapshot if available (already computed), else compute now
      const combinations = (previewSnapshot && previewSnapshot.length > 0)
        ? previewSnapshot
        : enabledDims.length > 0 ? cartesianProduct(enabledDims) : [];

      if (combinations.length > 0) {
        // Fetch existing variants for this group scoped to this user to prevent duplicates
        const existingVariants = await base44.entities.ProductVariant.filter({ group_id: newGroup.id, created_by: user?.email });
        const existingKeys = new Set(existingVariants.map(v => JSON.stringify(v.dimensions)));
        const toCreate = combinations.filter(combo => !existingKeys.has(JSON.stringify(combo)));

        setProgressText(`יוצר 0/${toCreate.length}...`);
        await createVariantsBatched(toCreate, newGroup.id, (done, total) => {
          setProgressText(`יוצר ${done}/${total}...`);
        });
        setProgressText('');
      }
      return { newGroup, count: combinations.length };
    },
    onSuccess: (result) => {
      const count = result?.count;
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast({ 
        title: group
          ? '✅ התיקייה עודכנה'
          : count
            ? `✅ התיקייה נוצרה עם ${count} וריאציות`
            : '✅ התיקייה נוצרה',
        duration: 2000,
        className: 'bg-green-500 text-white border-green-600'
      });
      onClose();
    },
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, image_url: file_url }));
    setUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group ? 'עריכת תיקייה' : 'תיקיית מוצר חדשה'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>שם התיקייה</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="למשל: חולצה לבנה קלאסית" />
          </div>
          <div>
            <Label>קטגוריה</Label>
            <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>תמונה</Label>
            <Input type="file" accept="image/*" onChange={handleImageUpload} />
            {uploading && <p className="text-sm text-amber-500 mt-1">מעלה...</p>}
            {form.image_url && <img src={form.image_url} alt="" className="w-20 h-20 rounded-xl mt-2 object-cover" />}
          </div>
          <div>
            <Label>ברקוד (אופציונלי)</Label>
            <Input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="הזן ברקוד קיים מהספק" />
          </div>
          {dimensions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>ממדי וריאציות מופעלים</Label>
                {form.enabled_dimensions.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1 border-blue-300 text-blue-600 hover:bg-blue-50 text-xs"
                    onClick={handleGeneratePreview}
                  >
                    ⚡ צור וריאציות
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {dimensions.map(dim => (
                  <div key={dim.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.enabled_dimensions.includes(dim.id)}
                      onChange={e => {
                        const updated = e.target.checked
                          ? [...form.enabled_dimensions, dim.id]
                          : form.enabled_dimensions.filter(id => id !== dim.id);
                        setForm({ ...form, enabled_dimensions: updated });
                        setGeneratedPreview(null); // reset preview on change
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">{dim.name}</span>
                    <span className="text-xs text-gray-400">
                      ({dim.values?.join(', ')})
                    </span>
                  </div>
                ))}
              </div>

              {/* Preview of generated variations */}
              {generatedPreview !== null && (
                <div className="mt-3 border border-blue-200 rounded-xl overflow-hidden">
                  <div className="bg-blue-50 px-3 py-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-blue-800">
                      תצוגה מקדימה — {generatedPreview.length} וריאציות
                    </span>
                    <button
                      type="button"
                      onClick={() => setGeneratedPreview(null)}
                      className="text-blue-400 hover:text-blue-600 text-xs"
                    >
                      ✕ סגור
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto bg-white divide-y divide-gray-100">
                    {generatedPreview.map((combo, idx) => (
                      <div key={idx} className="px-3 py-1.5 text-xs text-gray-700 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {idx + 1}
                        </span>
                        {Object.entries(combo).map(([k, v]) => (
                          <span key={k} className="bg-gray-100 px-2 py-0.5 rounded-full">{k}: <strong>{v}</strong></span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!generatedPreview && form.enabled_dimensions.length > 0 && (() => {
                const selected = dimensions.filter(d => form.enabled_dimensions.includes(d.id));
                const count = selected.reduce((acc, d) => acc * (d.values?.length || 1), 1);
                return (
                  <div className="mt-2 p-2 bg-blue-50 rounded-lg text-sm text-blue-700">
                    ⚡ ייווצרו <strong>{count}</strong> וריאציות — לחץ "צור וריאציות" לתצוגה מקדימה
                  </div>
                );
              })()}
            </div>
          )}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <Switch checked={form.has_uniform_price} onCheckedChange={v => setForm({ ...form, has_uniform_price: v })} />
            <Label>מחיר אחיד לכל הוריאציות</Label>
          </div>
          {form.has_uniform_price && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>מחיר עלות</Label>
                <Input type="number" value={form.uniform_cost_price} onChange={e => setForm({ ...form, uniform_cost_price: Number(e.target.value) })} />
              </div>
              <div>
                <Label>מחיר מכירה</Label>
                <Input type="number" value={form.uniform_sell_price} onChange={e => setForm({ ...form, uniform_sell_price: Number(e.target.value) })} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => mutation.mutate({
              formData: form,
              dimensionsSnapshot: dimensions,
              previewSnapshot: generatedPreview,
            })}
            className="bg-amber-500 hover:bg-amber-600"
            disabled={!form.name || !form.category_id || mutation.isPending}
          >
            {mutation.isPending
              ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{progressText || 'שומר...'}</span>
              : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VariantsViewModal({ open, group, variants, onClose, queryClient, toast }) {
  const [editingVariant, setEditingVariant] = useState(null);
  const [printingBarcode, setPrintingBarcode] = useState(null);
  const [expandedDim, setExpandedDim] = useState(null);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [generateProgress, setGenerateProgress] = useState('');
  const user = useCurrentUser();

  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  const createVariantsBatched = async (combinations, groupId, onProgress) => {
    const BATCH_SIZE = 20;
    for (let i = 0; i < combinations.length; i += BATCH_SIZE) {
      const batch = combinations.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((combo, batchIdx) =>
        base44.entities.ProductVariant.create({
          group_id: groupId,
          dimensions: combo,
          stock: 0,
          sku: `${groupId.slice(-4)}-${i + batchIdx + 1}`,
        })
      ));
      onProgress(Math.min(i + BATCH_SIZE, combinations.length), combinations.length);
      if (i + BATCH_SIZE < combinations.length) await delay(50);
    }
  };

  const { data: allDimensions = [] } = useQuery({
    queryKey: ['variant-dimensions', group?.category_id],
    queryFn: () => group?.category_id ? base44.entities.VariantDimension.filter({ category_id: group.category_id, is_active: true }) : Promise.resolve([]),
    enabled: !!group?.category_id,
  });

  if (!group) return null;

  const enabledDimensions = allDimensions
    .filter(d => group.enabled_dimensions?.includes(d.id))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // Stable iterative cartesian product — no recursion, guaranteed consistent order
  const cartesianProduct = (dims) => {
    if (dims.length === 0) return [{}];
    const result = [{}];
    for (const dim of dims) {
      const expanded = [];
      for (const existing of result) {
        for (const val of (dim.values || [])) {
          expanded.push({ ...existing, [dim.name]: val });
        }
      }
      result.length = 0;
      result.push(...expanded);
    }
    return result;
  };

  const handleAutoGenerate = async () => {
    if (!window.confirm('זה ימחק את כל הוריאציות הקיימות ויצור מחדש מכל הצירופים האפשריים. להמשיך?')) return;
    setGeneratingVariants(true);

    // Delete only THIS user's existing variants for this group
    const myVariants = variants.filter(v => v.created_by === user?.email);
    for (const v of myVariants) {
      await base44.entities.ProductVariant.delete(v.id);
    }

    // Generate all combinations in batches of 20 with 50ms delay between batches
    const combinations = cartesianProduct(enabledDimensions);
    setGenerateProgress(`יוצר 0/${combinations.length}...`);
    await createVariantsBatched(combinations, group.id, (done, total) => {
      setGenerateProgress(`יוצר ${done}/${total}...`);
    });
    setGenerateProgress('');

    queryClient.invalidateQueries({ queryKey: ['product-variants'] });
    toast({ title: `✅ נוצרו ${combinations.length} וריאציות אוטומטית`, duration: 2000 });
    setGeneratingVariants(false);
  };

  const handleSetPrimaryDimension = async (dimensionId) => {
    try {
      await base44.entities.ProductGroup.update(group.id, { primary_dimension_id: dimensionId });
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      toast({ title: '✅ ממד ראשי עודכן', duration: 2000 });
    } catch (error) {
      toast({ title: `❌ שגיאה: ${error.message}`, duration: 3000 });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group.name} — וריאציות</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setEditingVariant({ group_id: group.id })} className="gap-2 bg-amber-500 hover:bg-amber-600">
              <Plus className="w-4 h-4" /> הוסף וריאציה
            </Button>
            {enabledDimensions.length > 0 && (
              <Button onClick={handleAutoGenerate} variant="outline" className="gap-2 border-blue-300 text-blue-600 hover:bg-blue-50" disabled={generatingVariants}>
                <Loader2 className={`w-4 h-4 ${generatingVariants ? 'animate-spin' : 'hidden'}`} />
                {generatingVariants
                  ? (generateProgress || 'יוצר...')
                  : `⚡ צור וריאציות אוטומטית (${cartesianProduct(enabledDimensions).length})`}
              </Button>
            )}
          </div>

          {allDimensions.length > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-semibold text-blue-900 mb-2">📊 ממד ראשי לארגון וריאציות</p>
              <div className="flex flex-wrap gap-2">
                {enabledDimensions.map(dim => (
                  <button
                    key={dim.id}
                    onClick={() => handleSetPrimaryDimension(dim.id)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      group.primary_dimension_id === dim.id
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-100'
                    }`}
                  >
                    {dim.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-blue-600 mt-2">בחר ממד לארגון הוריאציות בתצוגת הקבוצה</p>
            </div>
          )}
          
          {variants.length === 0 ? (
            <p className="text-center text-gray-400 py-8">אין וריאציות. לחץ על "הוסף וריאציה" או "צור וריאציות אוטומטית".</p>
          ) : (
            <div className="space-y-3">
              <VariantDimensionFolders
                variants={variants}
                group={group}
                allDimensions={allDimensions}
                badgeColor="bg-amber-600"
                folderBg="bg-amber-50"
                folderBorder="border-amber-200"
                renderVariant={(v) => {
                  const dimText = v.dimensions && Object.keys(v.dimensions).length > 0
                    ? Object.entries(v.dimensions).map(([k, val]) => `${k}: ${val}`).join(' | ')
                    : 'רגיל';
                  return (
                    <Card key={v.id}>
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-semibold text-sm">{dimText}</p>
                            <p className="text-sm text-gray-500">מלאי: {v.stock || 0}</p>
                            {!group.has_uniform_price && (
                              <p className="text-sm text-gray-500">מחיר: ₪{v.sell_price || 0}</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => setEditingVariant(v)} className="p-2.5 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <DeleteVariantButton variantId={v.id} queryClient={queryClient} toast={toast} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }}
              />
            </div>
          )}
        </div>
      </DialogContent>

      {editingVariant && (
        <VariantFormModal
          variant={editingVariant}
          group={group}
          onClose={() => setEditingVariant(null)}
          queryClient={queryClient}
          toast={toast}
        />
      )}

      {printingBarcode && (
        <BarcodePrintModal
          open={!!printingBarcode}
          onClose={() => setPrintingBarcode(null)}
          variant={printingBarcode.variant}
          group={printingBarcode.group}
        />
      )}
    </Dialog>
  );
}

function DeleteVariantButton({ variantId, queryClient, toast }) {
  const deleteMut = useMutation({
    mutationFn: () => base44.entities.ProductVariant.delete(variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast({ 
        title: '🗑️ הוריאציה נמחקה',
        duration: 2000,
        className: 'bg-red-500 text-white border-red-600'
      });
    },
  });

  return (
    <button onClick={() => { if (window.confirm('למחוק?')) deleteMut.mutate(); }} className="p-2.5 hover:bg-red-50 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center">
      <Trash2 className="w-5 h-5 text-red-400" />
    </button>
  );
}



function SimpleProductFormModal({ open, categories, onClose, queryClient, toast }) {
  const [form, setForm] = useState({
    name: '',
    category_id: '',
    sell_price: 0,
    cost_price: 0,
    stock: 0,
    image_url: '',
  });
  const [uploading, setUploading] = useState(false);

  React.useEffect(() => {
    if (!open) {
      setForm({ name: '', category_id: '', sell_price: 0, cost_price: 0, stock: 0, image_url: '' });
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      // Create a simple group with one variant
      const group = await base44.entities.ProductGroup.create({
        name: data.name,
        category_id: data.category_id,
        has_uniform_price: true,
        uniform_sell_price: data.sell_price,
        uniform_cost_price: data.cost_price,
        image_url: data.image_url,
        enabled_dimensions: [],
      });

      // Create a single variant for this product (simple product - no dimensions)
      await base44.entities.ProductVariant.create({
        group_id: group.id,
        dimensions: {},
        stock: data.stock,
        sku: `SP${Date.now()}`,
      });

      return group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast({ 
        title: '✅ המוצר נוסף בהצלחה',
        duration: 2000,
        className: 'bg-green-500 text-white border-green-600'
      });
      onClose();
    },
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, image_url: file_url }));
    setUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>הוספת מוצר בודד</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>שם המוצר</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="למשל: עט כחול" />
          </div>
          <div>
            <Label>קטגוריה</Label>
            <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>תמונה</Label>
            <Input type="file" accept="image/*" onChange={handleImageUpload} />
            {uploading && <p className="text-sm text-amber-500 mt-1">מעלה...</p>}
            {form.image_url && <img src={form.image_url} alt="" className="w-20 h-20 rounded-xl mt-2 object-cover" />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>מחיר עלות</Label>
              <Input type="number" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: Number(e.target.value) })} />
            </div>
            <div>
              <Label>מחיר מכירה</Label>
              <Input type="number" value={form.sell_price} onChange={e => setForm({ ...form, sell_price: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>מלאי</Label>
            <Input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => mutation.mutate(form)}
            className="bg-green-600 hover:bg-green-700 w-full"
            disabled={!form.name || !form.category_id}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'הוסף מוצר'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VariantFormModal({ variant, group, onClose, queryClient, toast }) {
  const [form, setForm] = useState({
    dimensions: {}, stock: 0, sell_price: 0, cost_price: 0, sku: '',
  });

  const { data: allDimensions = [] } = useQuery({
    queryKey: ['variant-dimensions', group?.category_id],
    queryFn: () => group?.category_id ? base44.entities.VariantDimension.filter({ category_id: group.category_id, is_active: true }) : Promise.resolve([]),
    enabled: !!group?.category_id,
  });

  const enabledDimensions = allDimensions.filter(dim => 
    group?.enabled_dimensions?.includes(dim.id)
  ).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  React.useEffect(() => {
    if (variant.id) {
      setForm({
        dimensions: variant.dimensions || {},
        stock: variant.stock || 0,
        sell_price: variant.sell_price || 0,
        cost_price: variant.cost_price || 0,
        sku: variant.sku || '',
      });
    } else {
      setForm({ dimensions: {}, stock: 0, sell_price: 0, cost_price: 0, sku: '' });
    }
  }, [variant]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const dataToSave = {
        ...data,
        sku: data.sku || `SKU${Date.now()}`
      };
      return variant.id
        ? base44.entities.ProductVariant.update(variant.id, dataToSave)
        : base44.entities.ProductVariant.create({ ...dataToSave, group_id: group.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast({ 
        title: variant.id ? '✅ הוריאציה עודכנה' : '✅ הוריאציה נוספה',
        duration: 2000,
      });
      onClose();
    },
  });

  const handleDimensionChange = (dimName, value) => {
    setForm(prev => ({
      ...prev,
      dimensions: { ...prev.dimensions, [dimName]: value }
    }));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{variant.id ? 'עריכת וריאציה' : 'וריאציה חדשה'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {enabledDimensions.map(dim => (
            <div key={dim.id}>
              <Label>{dim.name}</Label>
              <Select 
                value={form.dimensions[dim.name] || ''} 
                onValueChange={(v) => handleDimensionChange(dim.name, v)}
              >
                <SelectTrigger><SelectValue placeholder={`בחר ${dim.name}`} /></SelectTrigger>
                <SelectContent>
                  {dim.values.map(val => (
                    <SelectItem key={val} value={val}>{val}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          <div>
            <Label>מלאי</Label>
            <Input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} />
          </div>

          {!group.has_uniform_price && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>מחיר עלות</Label>
                <Input type="number" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: Number(e.target.value) })} />
              </div>
              <div>
                <Label>מחיר מכירה</Label>
                <Input type="number" value={form.sell_price} onChange={e => setForm({ ...form, sell_price: Number(e.target.value) })} />
              </div>
            </div>
          )}

          <div>
            <Label>מק"ט (אופציונלי)</Label>
            <Input 
              value={form.sku} 
              onChange={e => setForm({ ...form, sku: e.target.value })} 
              placeholder="יוצר אוטומטית"
            />
          </div>

          <DialogFooter>
            <Button
              onClick={() => mutation.mutate(form)}
              className="bg-amber-500 hover:bg-amber-600 w-full"
              disabled={enabledDimensions.some(dim => !form.dimensions[dim.name])}
            >
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}