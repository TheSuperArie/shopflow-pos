import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Check, Pencil, X } from 'lucide-react';

/** Add / rename / delete categories in a branch's catalog. */
export default function BranchCategoryManager({ branch, categories, groups, onChanged }) {
  const { toast } = useToast();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }

  const run = (fn, title) => ({
    mutationFn: fn,
    onSuccess: () => { toast({ title }); onChanged(); },
    onError: (e) => toast({ title: 'הפעולה נכשלה', description: e?.message, variant: 'destructive' }),
  });

  const createMut = useMutation(run(
    () => base44.entities.Category.create({ name: newName.trim(), branch_id: branch.id }),
    'הקטגוריה נוספה'
  ));
  const renameMut = useMutation(run(
    () => base44.entities.Category.update(editing.id, { name: editing.name.trim() }),
    'הקטגוריה עודכנה'
  ));
  const deleteMut = useMutation(run(
    (id) => base44.entities.Category.delete(id),
    'הקטגוריה נמחקה'
  ));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="font-semibold text-gray-700 text-sm">קטגוריות</p>

        <div className="flex gap-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="שם קטגוריה חדשה" />
          <Button disabled={!newName.trim() || createMut.isPending}
            onClick={() => createMut.mutate(null, { onSuccess: () => setNewName('') })}>
            <Plus className="w-4 h-4 ml-1" /> הוסף
          </Button>
        </div>

        <div className="space-y-1">
          {categories.map(cat => {
            const count = groups.filter(g => g.category_id === cat.id).length;
            const isEditing = editing?.id === cat.id;
            return (
              <div key={cat.id} className="flex items-center gap-2 py-1">
                {isEditing ? (
                  <>
                    <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="flex-1" />
                    <button onClick={() => renameMut.mutate(null, { onSuccess: () => setEditing(null) })}
                      className="p-2 rounded-lg hover:bg-green-50"><Check className="w-4 h-4 text-green-600" /></button>
                    <button onClick={() => setEditing(null)} className="p-2 rounded-lg hover:bg-gray-100">
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-800">{cat.name}</span>
                    <span className="text-xs text-gray-400">{count} מוצרים</span>
                    <button onClick={() => setEditing({ id: cat.id, name: cat.name })}
                      className="p-2 rounded-lg hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-gray-500" /></button>
                    <button
                      onClick={() => {
                        if (count > 0) {
                          toast({ title: 'יש מוצרים בקטגוריה', description: 'מחק או העבר אותם קודם', variant: 'destructive' });
                          return;
                        }
                        if (window.confirm(`למחוק את הקטגוריה "${cat.name}"?`)) deleteMut.mutate(cat.id);
                      }}
                      className="p-2 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </>
                )}
              </div>
            );
          })}
          {categories.length === 0 && <p className="text-xs text-gray-400">אין קטגוריות</p>}
        </div>
      </CardContent>
    </Card>
  );
}