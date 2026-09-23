import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Plus } from 'lucide-react';
import FixedTemplateForm from './FixedTemplateForm';
import FixedTemplateRow from './FixedTemplateRow';

/** Manage fixed-expense templates. `scope` = fields stamped on new templates (branch / network). */
export default function FixedTemplatesDialog({ open, onClose, templates = [], lastUsed = {}, categories, scope }) {
  const [editing, setEditing] = useState(null); // null | 'new' | template
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ['fixed-templates'] });
  const onError = (e) => toast({ title: '❌ הפעולה נכשלה', description: e?.message || 'נסה שוב', variant: 'destructive' });
  const E = base44.entities.FixedExpenseTemplate;

  const save = useMutation({
    mutationFn: (data) => editing === 'new' ? E.create({ ...data, ...scope, is_active: true }) : E.update(editing.id, data),
    onSuccess: () => { onSuccess(); setEditing(null); },
    onError,
  });
  const toggle = useMutation({ mutationFn: (t) => E.update(t.id, { is_active: t.is_active === false }), onSuccess, onError });
  const remove = useMutation({ mutationFn: (t) => E.delete(t.id), onSuccess, onError });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setEditing(null); onClose(); } }}>
      <DialogContent dir="rtl" className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>הוצאות קבועות</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500">תבניות לבחירה מהירה בטופס ההוצאה. אין רישום אוטומטי — כל הוצאה נרשמת ידנית.</p>
        {editing ? (
          <FixedTemplateForm
            key={editing === 'new' ? 'new' : editing.id}
            template={editing === 'new' ? null : editing}
            categories={categories}
            saving={save.isPending}
            onSave={(data) => save.mutate(data)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Button size="sm" onClick={() => setEditing('new')} className="gap-1.5 bg-amber-500 hover:bg-amber-600 w-fit">
            <Plus className="w-3.5 h-3.5" /> תבנית חדשה
          </Button>
        )}
        <div className="rounded-lg border">
          {templates.length === 0
            ? <p className="text-center text-sm text-gray-400 py-4">אין עדיין הוצאות קבועות</p>
            : templates.map(t => (
              <FixedTemplateRow
                key={t.id} t={t} lastUsed={lastUsed[t.id]}
                onEdit={() => setEditing(t)}
                onToggle={() => toggle.mutate(t)}
                onDelete={() => { if (window.confirm(`למחוק את התבנית "${t.name}"? הוצאות שכבר נרשמו לא יימחקו.`)) remove.mutate(t); }}
              />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}