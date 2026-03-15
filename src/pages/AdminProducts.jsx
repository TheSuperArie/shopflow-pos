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
import { Plus, Pencil, Trash2, FolderPlus, Loader2, Folder, ChevronDown, Settings, Barcode } from 'lucide-react';
import VariantDimensionsManager from '@/components/admin/VariantDimensionsManager';
import BarcodePrintModal from '@/components/admin/BarcodePrintModal';

const SIZES = ['12', '12.5', '13', '13.5', '14', '14.5', '15', '15.5', '16', '16.5', '17', '17.5', '18'];
const CUTS = ['צרה', 'רחבה'];
const COLLARS = ['אמריקאי', 'כפתורים', 'רגיל'];

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

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('sort_order'),
  });

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants'],
    queryFn: () => base44.entities.ProductVariant.list(),
  });

  // Group products by category
  const categorizedGroups = {};
  categories.forEach(cat => {
    categorizedGroups[cat.id] = {
      category: cat,
      groups: groups.filter(g => g.category_id === cat.id),
    };
  });

  const categorizedData = Object.values(categorizedGroups).filter(({ groups }) => groups.length > 0);

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
      />

      <ProductGroupFormModal
        open={showGroupForm}
        group={editingGroup}
        categories={categories}
        onClose={() => setShowGroupForm(false)}
        queryClient={queryClient}
        toast={toast}
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

function CategoryFormModal({ open, category, onClose, queryClient, toast }) {
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
            onClick={() => mutation.mutate({ name })}
            className="bg-amber-500 hover:bg-amber-600"
            disabled={!name}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductGroupFormModal({ open, group, categories, onClose, queryClient, toast }) {
  const [form, setForm] = useState({
    name: '', category_id: '', has_uniform_price: true, uniform_sell_price: 0, uniform_cost_price: 0, image_url: '',
  });
  const [uploading, setUploading] = useState(false);

  React.useEffect(() => {
    if (group) {
      setForm({
        name: group.name || '',
        category_id: group.category_id || '',
        has_uniform_price: group.has_uniform_price !== false,
        uniform_sell_price: group.uniform_sell_price || 0,
        uniform_cost_price: group.uniform_cost_price || 0,
        image_url: group.image_url || '',
      });
    } else {
      setForm({ name: '', category_id: '', has_uniform_price: true, uniform_sell_price: 0, uniform_cost_price: 0, image_url: '' });
    }
  }, [group, open]);

  const mutation = useMutation({
    mutationFn: (data) =>
      group
        ? base44.entities.ProductGroup.update(group.id, data)
        : base44.entities.ProductGroup.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      toast({ 
        title: group ? '✅ התיקייה עודכנה' : '✅ התיקייה נוצרה',
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
            onClick={() => mutation.mutate(form)}
            className="bg-amber-500 hover:bg-amber-600"
            disabled={!form.name || !form.category_id}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VariantsViewModal({ open, group, variants, onClose, queryClient, toast }) {
  const [editingVariant, setEditingVariant] = useState(null);
  const [printingBarcode, setPrintingBarcode] = useState(null);
  const [expandedSize, setExpandedSize] = useState(null);

  if (!group) return null;

  // Group variants by size
  const variantsBySize = {};
  variants.forEach(v => {
    if (!variantsBySize[v.size]) {
      variantsBySize[v.size] = [];
    }
    variantsBySize[v.size].push(v);
  });

  const sizes = Object.keys(variantsBySize).sort((a, b) => parseFloat(a) - parseFloat(b));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group.name} — וריאציות</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={() => setEditingVariant({ group_id: group.id })} className="gap-2 bg-amber-500 hover:bg-amber-600">
              <Plus className="w-4 h-4" /> הוסף וריאציה בודדת
            </Button>
            <GenerateAllVariantsButton group={group} queryClient={queryClient} toast={toast} />
          </div>
          
          {variants.length === 0 ? (
            <p className="text-center text-gray-400 py-8">אין וריאציות. לחץ על "הוסף וריאציה" כדי להתחיל.</p>
          ) : (
            <div className="space-y-3">
              {sizes.map(size => {
                const sizeVariants = variantsBySize[size];
                const isExpanded = expandedSize === size;
                const totalStock = sizeVariants.reduce((s, v) => s + (v.stock || 0), 0);
                
                return (
                  <div key={size} className="border-2 border-gray-200 rounded-xl overflow-hidden">
                    {/* Size Header - Clickable */}
                    <button
                      onClick={() => setExpandedSize(isExpanded ? null : size)}
                      className="sticky top-0 z-10 w-full bg-amber-50 p-3 flex items-center justify-between border-b-2 border-amber-200 hover:bg-amber-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold text-amber-700">מידה {size}</span>
                        <Badge className="bg-amber-600 text-white">
                          {sizeVariants.length} וריאציות
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">סה"כ מלאי: {totalStock}</span>
                        <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {/* Variants Grid - Expandable */}
                    {isExpanded && (
                      <div className="bg-white p-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {sizeVariants.map(v => (
                            <Card key={v.id}>
                              <CardContent className="p-3">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <p className="font-semibold">{v.cut} | {v.collar}</p>
                                    <p className="text-sm text-gray-500">מלאי: {v.stock || 0}</p>
                                    {!group.has_uniform_price && (
                                      <p className="text-sm text-gray-500">מחיר: ₪{v.sell_price || 0}</p>
                                    )}
                                    {v.barcode && (
                                      <p className="text-xs text-gray-400 mt-1">ברקוד: {v.barcode}</p>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    {v.barcode && (
                                      <button 
                                        onClick={() => setPrintingBarcode({ variant: v, group })} 
                                        className="p-2.5 hover:bg-blue-50 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                                        title="הדפס מדבקות"
                                      >
                                        <Barcode className="w-5 h-5 text-blue-500" />
                                      </button>
                                    )}
                                    <button onClick={() => setEditingVariant(v)} className="p-2.5 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center">
                                      <Pencil className="w-5 h-5" />
                                    </button>
                                    <DeleteVariantButton variantId={v.id} queryClient={queryClient} toast={toast} />
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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

function GenerateAllVariantsButton({ group, queryClient, toast }) {
  const [showWizard, setShowWizard] = useState(false);

  return (
    <>
      <Button onClick={() => setShowWizard(true)} variant="outline" className="gap-2">
        <Plus className="w-4 h-4" />
        צור וריאציות אוטומטית
      </Button>
      
      {showWizard && (
        <BulkVariantWizard
          group={group}
          onClose={() => setShowWizard(false)}
          queryClient={queryClient}
          toast={toast}
        />
      )}
    </>
  );
}

function BulkVariantWizard({ group, onClose, queryClient, toast }) {
  const [step, setStep] = useState('sizes'); // 'sizes' | 'cuts' | 'collars' | 'confirm'
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [selectedCuts, setSelectedCuts] = useState([]);
  const [selectedCollars, setSelectedCollars] = useState([]);
  const [creating, setCreating] = useState(false);

  const toggleSize = (size) => {
    setSelectedSizes(prev => 
      prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]
    );
  };

  const toggleCut = (cut) => {
    setSelectedCuts(prev => 
      prev.includes(cut) ? prev.filter(c => c !== cut) : [...prev, cut]
    );
  };

  const toggleCollar = (collar) => {
    setSelectedCollars(prev => 
      prev.includes(collar) ? prev.filter(c => c !== collar) : [...prev, collar]
    );
  };

  const handleNext = () => {
    if (step === 'sizes' && selectedSizes.length > 0) setStep('cuts');
    else if (step === 'cuts' && selectedCuts.length > 0) setStep('collars');
    else if (step === 'collars' && selectedCollars.length > 0) setStep('confirm');
  };

  const handleBack = () => {
    if (step === 'cuts') setStep('sizes');
    else if (step === 'collars') setStep('cuts');
    else if (step === 'confirm') setStep('collars');
  };

  const generateBarcode = (groupId, size, cut, collar) => {
    const timestamp = Date.now().toString().slice(-6);
    const sizeCode = size.replace('.', '');
    const cutCode = cut === 'צרה' ? '1' : '2';
    const collarCode = collar === 'אמריקאי' ? '1' : collar === 'כפתורים' ? '2' : '3';
    return `${timestamp}${sizeCode}${cutCode}${collarCode}`;
  };

  const handleCreate = async () => {
    setCreating(true);
    const allVariants = [];
    
    for (const size of selectedSizes) {
      for (const cut of selectedCuts) {
        for (const collar of selectedCollars) {
          allVariants.push({
            group_id: group.id,
            size,
            cut,
            collar,
            stock: 0,
            barcode: generateBarcode(group.id, size, cut, collar),
            ...(group.has_uniform_price ? {} : { sell_price: 0, cost_price: 0 })
          });
        }
      }
    }

    await base44.entities.ProductVariant.bulkCreate(allVariants);
    queryClient.invalidateQueries({ queryKey: ['product-variants'] });
    toast({ 
      title: `✅ נוצרו ${allVariants.length} וריאציות בהצלחה!`,
      duration: 2000,
      className: 'bg-green-500 text-white border-green-600'
    });
    setCreating(false);
    onClose();
  };

  const totalVariants = selectedSizes.length * selectedCuts.length * selectedCollars.length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>יצירת וריאציות אוטומטית - {group.name}</DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${step === 'sizes' ? 'bg-amber-500 text-white' : 'bg-gray-200'}`}>
            1. מידות
          </div>
          <div className="w-8 h-0.5 bg-gray-300"></div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${step === 'cuts' ? 'bg-amber-500 text-white' : 'bg-gray-200'}`}>
            2. גזרות
          </div>
          <div className="w-8 h-0.5 bg-gray-300"></div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${step === 'collars' ? 'bg-amber-500 text-white' : 'bg-gray-200'}`}>
            3. צווארונים
          </div>
          <div className="w-8 h-0.5 bg-gray-300"></div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${step === 'confirm' ? 'bg-amber-500 text-white' : 'bg-gray-200'}`}>
            4. אישור
          </div>
        </div>

        {/* Sizes Selection */}
        {step === 'sizes' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-center">בחר מידות</h3>
            <p className="text-sm text-gray-500 text-center">נבחרו: {selectedSizes.length} מידות</p>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {SIZES.map(size => (
                <button
                  key={size}
                  onClick={() => toggleSize(size)}
                  className={`p-4 text-xl font-bold rounded-xl border-2 transition-all ${
                    selectedSizes.includes(size)
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 hover:border-amber-300'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cuts Selection */}
        {step === 'cuts' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-center">בחר גזרות</h3>
            <p className="text-sm text-gray-500 text-center">נבחרו: {selectedCuts.length} גזרות</p>
            <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
              {CUTS.map(cut => (
                <button
                  key={cut}
                  onClick={() => toggleCut(cut)}
                  className={`p-10 text-2xl font-bold rounded-xl border-2 transition-all ${
                    selectedCuts.includes(cut)
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 hover:border-amber-300'
                  }`}
                >
                  {cut}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Collars Selection */}
        {step === 'collars' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-center">בחר צווארונים</h3>
            <p className="text-sm text-gray-500 text-center">נבחרו: {selectedCollars.length} צווארונים</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {COLLARS.map(collar => (
                <button
                  key={collar}
                  onClick={() => toggleCollar(collar)}
                  className={`p-10 text-2xl font-bold rounded-xl border-2 transition-all ${
                    selectedCollars.includes(collar)
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 hover:border-amber-300'
                  }`}
                >
                  {collar}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirmation */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-center">סיכום</h3>
            <div className="bg-amber-50 p-6 rounded-xl space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">מידות:</span>
                <span className="font-semibold">{selectedSizes.join(', ')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">גזרות:</span>
                <span className="font-semibold">{selectedCuts.join(', ')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">צווארונים:</span>
                <span className="font-semibold">{selectedCollars.join(', ')}</span>
              </div>
              <div className="pt-3 border-t border-amber-200">
                <div className="flex justify-between">
                  <span className="text-gray-600">סה"כ וריאציות:</span>
                  <span className="text-2xl font-bold text-amber-600">{totalVariants}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={handleBack} disabled={step === 'sizes' || creating}>
            חזור
          </Button>
          {step !== 'confirm' ? (
            <Button 
              onClick={handleNext}
              className="bg-amber-500 hover:bg-amber-600"
              disabled={
                (step === 'sizes' && selectedSizes.length === 0) ||
                (step === 'cuts' && selectedCuts.length === 0) ||
                (step === 'collars' && selectedCollars.length === 0)
              }
            >
              המשך
            </Button>
          ) : (
            <Button 
              onClick={handleCreate}
              className="bg-green-600 hover:bg-green-700"
              disabled={creating}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : `צור ${totalVariants} וריאציות`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      });

      // Create a single variant for this product
      await base44.entities.ProductVariant.create({
        group_id: group.id,
        size: 'רגיל',
        cut: 'רגיל',
        collar: 'רגיל',
        stock: data.stock,
        barcode: `SP${Date.now()}`,
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
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    size: '', cut: '', collar: '', stock: 0, sell_price: 0, cost_price: 0, barcode: '',
  });

  const generateBarcode = (size, cut, collar) => {
    const timestamp = Date.now().toString().slice(-6);
    const sizeCode = size.replace('.', '');
    const cutCode = cut === 'צרה' ? '1' : '2';
    const collarCode = collar === 'אמריקאי' ? '1' : collar === 'כפתורים' ? '2' : '3';
    return `${timestamp}${sizeCode}${cutCode}${collarCode}`;
  };

  React.useEffect(() => {
    if (variant.id) {
      setForm({
        size: variant.size || '',
        cut: variant.cut || '',
        collar: variant.collar || '',
        stock: variant.stock || 0,
        sell_price: variant.sell_price || 0,
        cost_price: variant.cost_price || 0,
        barcode: variant.barcode || '',
      });
      setStep(4);
    } else {
      setForm({ size: '', cut: '', collar: '', stock: 0, sell_price: 0, cost_price: 0, barcode: '' });
      setStep(1);
    }
  }, [variant]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const dataWithBarcode = {
        ...data,
        barcode: data.barcode || generateBarcode(data.size, data.cut, data.collar)
      };
      return variant.id
        ? base44.entities.ProductVariant.update(variant.id, dataWithBarcode)
        : base44.entities.ProductVariant.create({ ...dataWithBarcode, group_id: group.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast({ 
        title: variant.id ? '✅ הוריאציה עודכנה בהצלחה' : '✅ הוריאציה נוספה בהצלחה',
        duration: 2000,
        className: variant.id ? 'bg-blue-500 text-white border-blue-600' : 'bg-green-500 text-white border-green-600'
      });
      onClose();
    },
  });

  const handleSizeSelect = (size) => {
    setForm({ ...form, size });
    setStep(2);
  };

  const handleCutSelect = (cut) => {
    setForm({ ...form, cut });
    setStep(3);
  };

  const handleCollarSelect = (collar) => {
    setForm({ ...form, collar });
    setStep(4);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {variant.id ? 'עריכת וריאציה' : 'וריאציה חדשה'}
            {step > 1 && !variant.id && (
              <button onClick={() => setStep(step - 1)} className="mr-3 text-sm text-gray-500 hover:text-gray-700">
                ← חזור
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-center">בחר מידה</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {SIZES.map(size => (
                <button
                  key={size}
                  onClick={() => handleSizeSelect(size)}
                  className="p-6 text-2xl font-bold rounded-xl border-2 border-gray-200 hover:border-amber-500 hover:bg-amber-50 transition-all"
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-center">בחר גזרה</h3>
            <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
              {CUTS.map(cut => (
                <button
                  key={cut}
                  onClick={() => handleCutSelect(cut)}
                  className="p-12 text-3xl font-bold rounded-xl border-2 border-gray-200 hover:border-amber-500 hover:bg-amber-50 transition-all"
                >
                  {cut}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-center">בחר צווארון</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
              {COLLARS.map(collar => (
                <button
                  key={collar}
                  onClick={() => handleCollarSelect(collar)}
                  className="p-12 text-3xl font-bold rounded-xl border-2 border-gray-200 hover:border-amber-500 hover:bg-amber-50 transition-all"
                >
                  {collar}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-amber-50 p-4 rounded-xl text-center">
              <p className="text-lg font-semibold">מידה {form.size} | {form.cut} | {form.collar}</p>
            </div>
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
              <Label>ברקוד (אופציונלי)</Label>
              <Input 
                value={form.barcode} 
                onChange={e => setForm({ ...form, barcode: e.target.value })} 
                placeholder="יוצר אוטומטית אם לא מוזן"
              />
              <p className="text-xs text-gray-500 mt-1">
                {form.barcode ? `4 ספרות אחרונות: ${form.barcode.slice(-4)}` : 'ברקוד ייווצר אוטומטית'}
              </p>
            </div>
            <DialogFooter>
              <Button
                onClick={() => mutation.mutate(form)}
                className="bg-amber-500 hover:bg-amber-600 w-full"
              >
                {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}