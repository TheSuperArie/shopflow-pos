import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { fetchBranchCatalogRecords } from '@/lib/branchCatalog';
import { createProductForBranches } from '@/lib/networkProductCreate';
import BranchVariantsEditor from './BranchVariantsEditor';
import NetworkBranchPicker from './NetworkBranchPicker';
import NetworkProductSummary from './NetworkProductSummary';

const emptyForm = {
  name: '', category_name: '', barcode: '', is_active: true,
  has_uniform_price: true, uniform_sell_price: '', uniform_cost_price: '', initial_stock: '',
};
const newRow = () => ({ dimensions: {}, sell_price: null, cost_price: null });

/** Add one product to several ACTIVE branches at once — a branch-stamped copy per branch. */
export default function NetworkProductFormModal({ open, onClose, branches }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [rows, setRows] = useState([newRow()]);
  const [mode, setMode] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [results, setResults] = useState(null);
  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm); setRows([newRow()]); setMode('all'); setSelectedIds([]); setResults(null);
  }, [open]);

  // Category name suggestions from every active branch's catalog
  const { data: categoryNames = [] } = useQuery({
    queryKey: ['network-category-names', branches.map(b => b.id).join(',')],
    queryFn: async () => {
      const lists = await Promise.all(branches.map(b => fetchBranchCatalogRecords(base44.entities.Category, b)));
      return [...new Set(lists.flat().map(c => c.name?.trim()).filter(Boolean))].sort();
    },
    enabled: open && branches.length > 0,
  });

  const targets = mode === 'all' ? branches : branches.filter(b => selectedIds.includes(b.id));

  const saveMutation = useMutation({
    mutationFn: () => createProductForBranches(targets, form, rows, form.initial_stock === '' ? 0 : Number(form.initial_stock)),
    onSuccess: (res) => {
      setResults(res);
      res.filter(r => r.ok).forEach(r => queryClient.invalidateQueries({ queryKey: ['branch-catalog', r.branch.id] }));
    },
    onError: (e) => toast({ title: 'השמירה נכשלה', description: e?.message, variant: 'destructive' }),
  });

  const canSave = form.name.trim() && form.category_name.trim() && rows.length > 0 && targets.length > 0 && !saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>הוספת מוצר לרשת</DialogTitle></DialogHeader>

        {results ? (
          <NetworkProductSummary productName={form.name} results={results} />
        ) : (
          <div className="space-y-4">
            <div><Label>שם המוצר</Label><Input value={form.name} onChange={e => set({ name: e.target.value })} /></div>
            <div>
              <Label>קטגוריה</Label>
              <Input list="network-category-names" value={form.category_name} onChange={e => set({ category_name: e.target.value })}
                placeholder="בחר או הקלד שם — תיווצר בסניף אם אינה קיימת" />
              <datalist id="network-category-names">{categoryNames.map(n => <option key={n} value={n} />)}</datalist>
            </div>
            <div><Label>ברקוד</Label><Input value={form.barcode} onChange={e => set({ barcode: e.target.value })} placeholder="אופציונלי" /></div>
            <div className="flex items-center justify-between p-3 rounded-xl border">
              <Label>מחיר אחיד לכל הוריאנטים</Label>
              <Switch checked={form.has_uniform_price} onCheckedChange={v => set({ has_uniform_price: v })} />
            </div>
            {form.has_uniform_price && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>מחיר מכירה</Label><Input type="number" value={form.uniform_sell_price} onChange={e => set({ uniform_sell_price: e.target.value })} /></div>
                <div><Label>מחיר עלות</Label><Input type="number" value={form.uniform_cost_price} onChange={e => set({ uniform_cost_price: e.target.value })} /></div>
              </div>
            )}
            <BranchVariantsEditor variants={rows} onChange={setRows} hasUniformPrice={form.has_uniform_price} hideStock />
            <div>
              <Label>מלאי התחלתי (אופציונלי)</Label>
              <Input type="number" value={form.initial_stock} onChange={e => set({ initial_stock: e.target.value })}
                placeholder="אותו מלאי לכל וריאנט בכל סניף שנבחר" />
            </div>
            <NetworkBranchPicker branches={branches} mode={mode} onModeChange={setMode}
              selectedIds={selectedIds} onSelectedChange={setSelectedIds} />
            <div className="flex items-center justify-between p-3 rounded-xl border">
              <Label>מוצר פעיל (מוצג בקופה)</Label>
              <Switch checked={form.is_active} onCheckedChange={v => set({ is_active: v })} />
            </div>
          </div>
        )}

        <DialogFooter>
          {results ? (
            <Button onClick={onClose}>סגור</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>ביטול</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={!canSave}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `הוסף ל-${targets.length} סניפים`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}