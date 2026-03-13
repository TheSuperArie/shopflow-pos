import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, FolderPlus, Loader2, Package } from 'lucide-react';

export default function AdminProducts() {
  const [showCatForm, setShowCatForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [selectedCat, setSelectedCat] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('sort_order'),
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });

  const filteredProducts = selectedCat
    ? products.filter(p => p.category_id === selectedCat)
    : products;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">מוצרים וקטלוג</h1>
        <div className="flex gap-2">
          <Button onClick={() => { setEditingCategory(null); setShowCatForm(true); }} variant="outline" className="gap-2">
            <FolderPlus className="w-4 h-4" /> קטגוריה
          </Button>
          <Button onClick={() => { setEditingProduct(null); setShowProductForm(true); }} className="gap-2 bg-amber-500 hover:bg-amber-600">
            <Plus className="w-4 h-4" /> מוצר
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
          הכל ({products.length})
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

      {/* Products grid */}
      {loadingProducts ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(product => (
            <Card key={product.id}>
              <CardContent className="p-4">
                <div className="flex gap-3">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{product.name}</p>
                    <p className="text-sm text-gray-500">
                      עלות: ₪{product.cost_price || 0} | מכירה: ₪{product.sell_price}
                    </p>
                    <p className="text-sm text-gray-500">מלאי: {product.stock || 0}</p>
                    {product.is_shirt && (
                      <p className="text-xs text-amber-600 mt-0.5">חולצה — מידות/צווארון/גזרה</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => { setEditingProduct(product); setShowProductForm(true); }}
                      className="p-2 rounded-lg hover:bg-gray-100"
                    >
                      <Pencil className="w-4 h-4 text-gray-500" />
                    </button>
                    <DeleteProductButton productId={product.id} queryClient={queryClient} toast={toast} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CategoryFormModal
        open={showCatForm}
        category={editingCategory}
        onClose={() => setShowCatForm(false)}
        queryClient={queryClient}
        toast={toast}
      />

      <ProductFormModal
        open={showProductForm}
        product={editingProduct}
        categories={categories}
        onClose={() => setShowProductForm(false)}
        queryClient={queryClient}
        toast={toast}
      />
    </div>
  );
}

function DeleteProductButton({ productId, queryClient, toast }) {
  const deleteMut = useMutation({
    mutationFn: () => base44.entities.Product.delete(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'המוצר נמחק' });
    },
  });

  return (
    <button
      onClick={() => { if (window.confirm('למחוק מוצר?')) deleteMut.mutate(); }}
      className="p-2 rounded-lg hover:bg-red-50"
    >
      <Trash2 className="w-4 h-4 text-red-400" />
    </button>
  );
}

function CategoryFormModal({ open, category, onClose, queryClient, toast }) {
  const [name, setName] = useState('');
  const [isShirts, setIsShirts] = useState(false);

  React.useEffect(() => {
    if (category) {
      setName(category.name);
      setIsShirts(category.is_shirts || false);
    } else {
      setName('');
      setIsShirts(false);
    }
  }, [category, open]);

  const mutation = useMutation({
    mutationFn: (data) =>
      category
        ? base44.entities.Category.update(category.id, data)
        : base44.entities.Category.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: category ? 'הקטגוריה עודכנה' : 'הקטגוריה נוצרה' });
      onClose();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => base44.entities.Category.delete(category.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: 'הקטגוריה נמחקה' });
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
          <div className="flex items-center gap-3">
            <Switch checked={isShirts} onCheckedChange={setIsShirts} />
            <Label>קטגוריית חולצות (מידות/צווארון/גזרה)</Label>
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          {category && (
            <Button variant="destructive" onClick={() => { if (window.confirm('למחוק?')) deleteMut.mutate(); }}>
              מחק
            </Button>
          )}
          <Button
            onClick={() => mutation.mutate({ name, is_shirts: isShirts })}
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

function ProductFormModal({ open, product, categories, onClose, queryClient, toast }) {
  const [form, setForm] = useState({
    name: '', category_id: '', cost_price: 0, sell_price: 0, stock: 0, is_shirt: false, image_url: '',
  });
  const [uploading, setUploading] = useState(false);

  React.useEffect(() => {
    if (product) {
      setForm({
        name: product.name || '',
        category_id: product.category_id || '',
        cost_price: product.cost_price || 0,
        sell_price: product.sell_price || 0,
        stock: product.stock || 0,
        is_shirt: product.is_shirt || false,
        image_url: product.image_url || '',
      });
    } else {
      setForm({ name: '', category_id: '', cost_price: 0, sell_price: 0, stock: 0, is_shirt: false, image_url: '' });
    }
  }, [product, open]);

  const mutation = useMutation({
    mutationFn: (data) =>
      product
        ? base44.entities.Product.update(product.id, data)
        : base44.entities.Product.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: product ? 'המוצר עודכן' : 'המוצר נוצר' });
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

  const selectedCategory = categories.find(c => c.id === form.category_id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'עריכת מוצר' : 'מוצר חדש'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>שם המוצר</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>מחיר עלות (ספק)</Label>
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
          <div>
            <Label>תמונה</Label>
            <Input type="file" accept="image/*" onChange={handleImageUpload} />
            {uploading && <p className="text-sm text-amber-500 mt-1">מעלה...</p>}
            {form.image_url && <img src={form.image_url} alt="" className="w-20 h-20 rounded-xl mt-2 object-cover" />}
          </div>
          {selectedCategory?.is_shirts && (
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl">
              <Switch checked={form.is_shirt} onCheckedChange={v => setForm({ ...form, is_shirt: v })} />
              <Label>מוצר חולצה (שדות מידה/צווארון/גזרה)</Label>
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