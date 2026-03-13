import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Edit, Save, X, Layers } from 'lucide-react';

export default function VariantDimensionsManager({ categoryId, categoryName }) {
  const [showAddDimension, setShowAddDimension] = useState(false);
  const [editingDimension, setEditingDimension] = useState(null);
  const [newDimensionName, setNewDimensionName] = useState('');
  const [newDimensionValues, setNewDimensionValues] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: dimensions = [] } = useQuery({
    queryKey: ['variant-dimensions', categoryId],
    queryFn: () => base44.entities.VariantDimension.filter({ category_id: categoryId }),
  });

  const createDimensionMutation = useMutation({
    mutationFn: (data) => base44.entities.VariantDimension.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variant-dimensions'] });
      setShowAddDimension(false);
      setNewDimensionName('');
      setNewDimensionValues('');
      toast({ title: 'הממד נוסף בהצלחה' });
    },
  });

  const updateDimensionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.VariantDimension.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variant-dimensions'] });
      setEditingDimension(null);
      toast({ title: 'הממד עודכן בהצלחה' });
    },
  });

  const deleteDimensionMutation = useMutation({
    mutationFn: (id) => base44.entities.VariantDimension.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variant-dimensions'] });
      toast({ title: 'הממד נמחק בהצלחה' });
    },
  });

  const handleCreateDimension = () => {
    const values = newDimensionValues.split(',').map(v => v.trim()).filter(v => v);
    if (!newDimensionName || values.length === 0) {
      toast({ title: 'יש למלא שם וערכים', variant: 'destructive' });
      return;
    }

    createDimensionMutation.mutate({
      category_id: categoryId,
      name: newDimensionName,
      values,
      is_active: true,
      sort_order: dimensions.length,
    });
  };

  const handleUpdateDimension = (dimension, updates) => {
    updateDimensionMutation.mutate({
      id: dimension.id,
      data: { ...dimension, ...updates },
    });
  };

  const handleDeleteDimension = (id) => {
    if (window.confirm('האם אתה בטוח שברצונך למחוק ממד זה? וריאציות קיימות עלולות להיפגע.')) {
      deleteDimensionMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-600" />
            ממדי וריאציות - {categoryName}
          </h3>
          <p className="text-sm text-gray-500">הגדר אילו מאפיינים יהיו בוריאציות של קטגוריה זו</p>
        </div>
        <Button onClick={() => setShowAddDimension(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          הוסף ממד
        </Button>
      </div>

      {dimensions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-400">
            <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>אין ממדים מוגדרים לקטגוריה זו</p>
            <p className="text-xs mt-1">לחץ על "הוסף ממד" כדי להתחיל</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dimensions
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            .map((dimension) => (
              <Card key={dimension.id} className={!dimension.is_active ? 'opacity-60' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={dimension.is_active}
                        onCheckedChange={(checked) =>
                          handleUpdateDimension(dimension, { is_active: checked })
                        }
                      />
                      <div>
                        <CardTitle className="text-base">{dimension.name}</CardTitle>
                        <p className="text-xs text-gray-500">{dimension.values?.length || 0} ערכים</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingDimension(dimension)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteDimension(dimension.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {dimension.values?.map((value, idx) => (
                      <Badge key={idx} variant="outline">
                        {value}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* Add Dimension Dialog */}
      <Dialog open={showAddDimension} onOpenChange={setShowAddDimension}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>הוסף ממד חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>שם הממד</Label>
              <Input
                value={newDimensionName}
                onChange={(e) => setNewDimensionName(e.target.value)}
                placeholder='לדוגמה: "צבע", "גודל", "סוג צווארון"'
              />
            </div>
            <div>
              <Label>ערכים (מופרדים בפסיקים)</Label>
              <Input
                value={newDimensionValues}
                onChange={(e) => setNewDimensionValues(e.target.value)}
                placeholder='לדוגמה: "כחול, אדום, ירוק" או "S, M, L, XL"'
              />
              <p className="text-xs text-gray-500 mt-1">
                הפרד בין הערכים עם פסיק
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setShowAddDimension(false)} variant="outline" className="flex-1">
                ביטול
              </Button>
              <Button onClick={handleCreateDimension} className="flex-1">
                <Save className="w-4 h-4 ml-2" />
                שמור
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dimension Dialog */}
      <Dialog open={!!editingDimension} onOpenChange={() => setEditingDimension(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת ממד</DialogTitle>
          </DialogHeader>
          {editingDimension && (
            <div className="space-y-4">
              <div>
                <Label>שם הממד</Label>
                <Input
                  value={editingDimension.name}
                  onChange={(e) =>
                    setEditingDimension({ ...editingDimension, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>ערכים (מופרדים בפסיקים)</Label>
                <Input
                  value={editingDimension.values?.join(', ') || ''}
                  onChange={(e) => {
                    const values = e.target.value.split(',').map(v => v.trim()).filter(v => v);
                    setEditingDimension({ ...editingDimension, values });
                  }}
                />
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => setEditingDimension(null)}
                  variant="outline"
                  className="flex-1"
                >
                  ביטול
                </Button>
                <Button
                  onClick={() => handleUpdateDimension(editingDimension, editingDimension)}
                  className="flex-1"
                >
                  <Save className="w-4 h-4 ml-2" />
                  שמור שינויים
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}