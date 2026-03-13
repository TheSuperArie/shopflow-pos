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
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, FolderPlus, Loader2, Folder, ChevronLeft } from 'lucide-react';

const SIZES = ['12', '12.5', '13', '13.5', '14', '14.5', '15', '15.5', '16', '16.5', '17', '17.5', '18'];
const CUTS = ['צרה', 'רחבה'];
const COLLARS = ['אמריקאי', 'כפתורים', 'רגיל'];

export default function AdminProducts() {
  const [showCatForm, setShowCatForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [selectedCat, setSelectedCat] = useState(null);
  const [viewingGroup, setViewingGroup] = useState(null);
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

  const filteredGroups = selectedCat
    ? groups.filter(g => g.category_id === selectedCat)
    : groups;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">מוצרים וקטלוג</h1>
        <div className="flex gap-2">
          <Button onClick={() => { setEditingCategory(null); setShowCatForm(true); }} variant="outline" className="gap-2">
            <FolderPlus className="w-4 h-4" /> קטגוריה
          </Button>
          <Button onClick={() => { setEditingGroup(null); setShowGroupForm(true); }} className="gap-2 bg-amber-500 hover:bg-amber-600">
            <Plus className="w-4 h-4" /> תיקיית מוצר
          </Button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCat(null)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            !selectedCat ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-amber-300'
          }`}
        >
          הכל ({groups.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCat(cat.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              selectedCat === cat.id ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-amber-300'
            }`}
          >
            {cat.name}
            <button
              onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); setShowCatForm(true); }}
              className="opacity-60 hover:opacity-100"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </button>
        ))}
      </div>

      {/* Product Groups grid */}
      {loadingGroups ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGroups.map(group => {
            const groupVariants = variants.filter(v => v.group_id === group.id);
            const totalStock = groupVariants.reduce((s, v) => s + (v.stock || 0), 0);
            return (
              <Card key={group.id}>
                <CardContent className="p-4">
                  <div className="flex gap-3">
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
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => setViewingGroup(group)}
                        className="p-2 rounded-lg hover:bg-gray-100"
                      >
                        <ChevronLeft className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => { setEditingGroup(group); setShowGroupForm(true); }}
                        className="p-2 rounded-lg hover:bg-gray-100"
                      >
                        <Pencil className="w-4 h-4 text-gray-500" />
                      </button>
                      <DeleteGroupButton groupId={group.id} queryClient={queryClient} toast={toast} />
                    </div>
                  </div>
                </CardContent>
              </Card>
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
        title: 'התיקייה נמחקה',
        duration: 3000
      });
    },
  });

  return (
    <button
      onClick={() => { if (window.confirm('למחוק תיקייה וכל הוריאציות?')) deleteMut.mutate(); }}
      className="p-2 rounded-lg hover:bg-red-50"
    >
      <Trash2 className="w-4 h-4 text-red-400" />
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
        title: category ? 'הקטגוריה עודכנה' : 'הקטגוריה נוצרה',
        duration: 3000
      });
      onClose();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => base44.entities.Category.delete(category.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ 
        title: 'הקטגוריה נמחקה',
        duration: 3000
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
        title: group ? 'התיקייה עודכנה' : 'התיקייה נוצרה',
        duration: 3000 
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

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group.name} — וריאציות</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Button onClick={() => setEditingVariant({ group_id: group.id })} className="gap-2 bg-amber-500 hover:bg-amber-600">
            <Plus className="w-4 h-4" /> הוסף וריאציה
          </Button>
          
          {variants.length === 0 ? (
            <p className="text-center text-gray-400 py-8">אין וריאציות. לחץ על "הוסף וריאציה" כדי להתחיל.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {variants.map(v => (
                <Card key={v.id}>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">מידה {v.size} | {v.cut} | {v.collar}</p>
                        <p className="text-sm text-gray-500">מלאי: {v.stock || 0}</p>
                        {!group.has_uniform_price && (
                          <p className="text-sm text-gray-500">מחיר: ₪{v.sell_price || 0}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditingVariant(v)} className="p-1 hover:bg-gray-100 rounded">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <DeleteVariantButton variantId={v.id} queryClient={queryClient} toast={toast} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
    </Dialog>
  );
}

function DeleteVariantButton({ variantId, queryClient, toast }) {
  const deleteMut = useMutation({
    mutationFn: () => base44.entities.ProductVariant.delete(variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast({ 
        title: 'הוריאציה נמחקה',
        duration: 3000
      });
    },
  });

  return (
    <button onClick={() => { if (window.confirm('למחוק?')) deleteMut.mutate(); }} className="p-1 hover:bg-red-50 rounded">
      <Trash2 className="w-3 h-3 text-red-400" />
    </button>
  );
}

function VariantFormModal({ variant, group, onClose, queryClient, toast }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    size: '', cut: '', collar: '', stock: 0, sell_price: 0, cost_price: 0,
  });

  React.useEffect(() => {
    if (variant.id) {
      setForm({
        size: variant.size || '',
        cut: variant.cut || '',
        collar: variant.collar || '',
        stock: variant.stock || 0,
        sell_price: variant.sell_price || 0,
        cost_price: variant.cost_price || 0,
      });
      setStep(4);
    } else {
      setForm({ size: '', cut: '', collar: '', stock: 0, sell_price: 0, cost_price: 0 });
      setStep(1);
    }
  }, [variant]);

  const mutation = useMutation({
    mutationFn: (data) =>
      variant.id
        ? base44.entities.ProductVariant.update(variant.id, data)
        : base44.entities.ProductVariant.create({ ...data, group_id: group.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast({ 
        title: variant.id ? 'הוריאציה עודכנה' : 'הוריאציה נוספה',
        duration: 3000
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