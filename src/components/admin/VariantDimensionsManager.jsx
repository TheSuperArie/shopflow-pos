import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

export default function VariantDimensionsManager({ categoryId, categoryName, group, onGroupUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [editingDimension, setEditingDimension] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: dimensions = [], isLoading } = useQuery({
    queryKey: ['variant-dimensions', categoryId],
    queryFn: () => base44.entities.VariantDimension.filter({ category_id: categoryId }),
  });

  const setPrimaryDimension = async (dimensionId) => {
    if (!group) return;
    try {
      await base44.entities.ProductGroup.update(group.id, { primary_dimension_id: dimensionId });
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      if (onGroupUpdate) {
        onGroupUpdate({ ...group, primary_dimension_id: dimensionId });
      }
      toast({ title: '✅ ממד ראשי עודכן' });
    } catch (error) {
      toast({ title: `❌ שגיאה: ${error.message}`, duration: 3000 });
    }
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.VariantDimension.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variant-dimensions'] });
      toast({ title: '✅ הממד נוצר בהצלחה' });
      setShowForm(false);
      setEditingDimension(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.VariantDimension.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variant-dimensions'] });
      toast({ title: '✅ הממד עודכן בהצלחה' });
      setShowForm(false);
      setEditingDimension(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VariantDimension.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variant-dimensions'] });
      toast({ title: '🗑️ הממד נמחק' });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }) => base44.entities.VariantDimension.update(id, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variant-dimensions'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">ממדי וריאציות - {categoryName}</h3>
          <p className="text-sm text-gray-500">הגדר ממדים שיופיעו במוצרים בקטגוריה זו</p>
        </div>
        <Button onClick={() => { setEditingDimension(null); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> ממד חדש
        </Button>
      </div>

      {dimensions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <p>לא הוגדרו ממדים לקטגוריה זו</p>
            <p className="text-sm mt-1">לחץ על "ממד חדש" כדי להתחיל</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dimensions.map(dim => (
            <Card key={dim.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={dim.is_active}
                      onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: dim.id, isActive: checked })}
                    />
                    <div>
                      <CardTitle className="text-base">{dim.name}</CardTitle>
                      <p className="text-xs text-gray-500 mt-1">
                        {dim.values?.length || 0} ערכים
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditingDimension(dim); setShowForm(true); }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (window.confirm('למחוק ממד זה?')) {
                          deleteMutation.mutate(dim.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {dim.values?.map((val, idx) => (
                    <div key={idx} className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-sm">
                      {val}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DimensionFormModal
        open={showForm}
        dimension={editingDimension}
        categoryId={categoryId}
        onClose={() => { setShowForm(false); setEditingDimension(null); }}
        onCreate={(data) => createMutation.mutate(data)}
        onUpdate={(id, data) => updateMutation.mutate({ id, data })}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

function DimensionFormModal({ open, dimension, categoryId, onClose, onCreate, onUpdate, isLoading }) {
  const [form, setForm] = useState({
    name: '',
    values: '',
  });

  React.useEffect(() => {
    if (dimension) {
      setForm({
        name: dimension.name || '',
        values: dimension.values?.join(', ') || '',
      });
    } else {
      setForm({ name: '', values: '' });
    }
  }, [dimension, open]);

  const handleSubmit = () => {
    const data = {
      category_id: categoryId,
      name: form.name,
      values: form.values.split(',').map(v => v.trim()).filter(v => v),
      is_active: true,
    };

    if (dimension) {
      onUpdate(dimension.id, data);
    } else {
      onCreate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>{dimension ? 'עריכת ממד' : 'ממד חדש'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>שם הממד</Label>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="למשל: צבע, מידה, גודל"
            />
          </div>
          <div>
            <Label>ערכים (מופרדים בפסיק)</Label>
            <Input
              value={form.values}
              onChange={e => setForm({ ...form, values: e.target.value })}
              placeholder="למשל: אדום, כחול, ירוק"
            />
            <p className="text-xs text-gray-500 mt-1">הפרד ערכים עם פסיק</p>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!form.name || !form.values || isLoading}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}