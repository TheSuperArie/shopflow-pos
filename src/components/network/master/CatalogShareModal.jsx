import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';

const CHECK = 'w-5 h-5 accent-indigo-600 cursor-pointer shrink-0';
const ROW = 'flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer';

export default function CatalogShareModal({ branch, tenantEmail, onClose }) {
  const queryClient = useQueryClient();
  const existing = branch?.catalog_share || {};
  const [selected, setSelected] = useState(new Set());
  const [includeSku, setIncludeSku] = useState(existing.include_sku !== false);
  const [includeCost, setIncludeCost] = useState(existing.include_cost !== false);
  const [includePrice, setIncludePrice] = useState(existing.include_price !== false);
  const [includeDefaults, setIncludeDefaults] = useState(existing.include_defaults !== false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const enabled = !!tenantEmail;

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['share-categories', tenantEmail],
    queryFn: () => base44.entities.Category.filter({ created_by: tenantEmail }),
    enabled,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ['share-groups', tenantEmail],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: tenantEmail }),
    enabled,
  });
  const { data: variants = [] } = useQuery({
    queryKey: ['share-variants', tenantEmail],
    queryFn: () => base44.entities.ProductVariant.filter({ created_by: tenantEmail }),
    enabled,
  });
  const { data: flexVariants = [] } = useQuery({
    queryKey: ['share-flex-variants', tenantEmail],
    queryFn: () => base44.entities.FlexibleVariant.filter({ created_by: tenantEmail }),
    enabled,
  });
  const { data: dimensions = [] } = useQuery({
    queryKey: ['share-dimensions', tenantEmail],
    queryFn: () => base44.entities.VariantDimension.filter({ created_by: tenantEmail }),
    enabled,
  });

  const topCats = categories.filter(c => !c.parent_id);

  // Preselect what was shared previously
  useEffect(() => {
    if (!categories.length || selected.size > 0 || !existing.category_ids?.length) return;
    const prev = new Set(existing.category_ids);
    setSelected(new Set(topCats.filter(c => prev.has(c.id)).map(c => c.id)));
  }, [categories]);

  // Resolve the full share scope: selected categories + all their descendants,
  // then every product group and variant beneath them.
  const scope = useMemo(() => {
    const catIds = new Set(selected);
    let grew = true;
    while (grew) {
      grew = false;
      categories.forEach(c => {
        if (c.parent_id && catIds.has(c.parent_id) && !catIds.has(c.id)) {
          catIds.add(c.id);
          grew = true;
        }
      });
    }
    const groupIds = new Set(groups.filter(g => catIds.has(g.category_id)).map(g => g.id));
    return {
      catIds: [...catIds],
      groupIds: [...groupIds],
      pvIds: variants.filter(v => groupIds.has(v.group_id)).map(v => v.id),
      fvIds: flexVariants.filter(v => groupIds.has(v.group_id)).map(v => v.id),
      dimIds: dimensions.filter(d => catIds.has(d.category_id)).map(d => d.id),
    };
  }, [selected, categories, groups, variants, flexVariants, dimensions]);

  const statsFor = (topId) => {
    const ids = new Set([topId]);
    let grew = true;
    while (grew) {
      grew = false;
      categories.forEach(c => {
        if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
          ids.add(c.id);
          grew = true;
        }
      });
    }
    const g = new Set(groups.filter(gr => ids.has(gr.category_id)).map(gr => gr.id));
    const v = variants.filter(vr => g.has(vr.group_id)).length +
      flexVariants.filter(vr => g.has(vr.group_id)).length;
    return { groups: g.size, variants: v, subCats: categories.filter(c => c.parent_id === topId) };
  };

  const toggleCat = (id) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const handleShare = async () => {
    if (scope.groupIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await base44.entities.Branch.update(branch.id, {
        catalog_share: {
          category_ids: scope.catIds,
          group_ids: scope.groupIds,
          pv_ids: scope.pvIds,
          fv_ids: scope.fvIds,
          dimension_ids: includeDefaults ? scope.dimIds : [],
          include_sku: includeSku,
          include_cost: includeCost,
          include_price: includePrice,
          include_defaults: includeDefaults,
          shared_at: new Date().toISOString(),
          pulled_at: null,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['branches', tenantEmail] });
      setDone(true);
    } catch (e) {
      setError(e.message || 'שגיאה בשיתוף הקטלוג');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!branch} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>שיתוף קטלוג לסניף {branch?.name}</DialogTitle>
          <DialogDescription>
            סמן מה יעבור לקופה של הסניף. אחרי השיתוף יופיע לסניף באנר בקופה לקליטת הקטלוג בלחיצה.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <p className="font-medium text-gray-800">הקטלוג שותף בהצלחה!</p>
            <p className="text-sm text-gray-500">
              בפעם הבאה שהסניף יפתח את הקופה יופיע לו באנר קליטה, וההעברה תתבצע בחבילות עם מד התקדמות.
            </p>
            <Button onClick={onClose}>סגור</Button>
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <h3 className="font-bold text-gray-900 mb-1">קטגוריות</h3>
              <p className="text-xs text-gray-400 mb-2">
                בסימון קטגוריה — כל תתי הקטגוריות והווריאציות שלה יעברו גם.
              </p>
              {isLoading ? (
                <p className="text-sm text-gray-400 py-4 text-center">טוען קטגוריות...</p>
              ) : topCats.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">אין קטגוריות בקטלוג</p>
              ) : (
                <div className="space-y-1">
                  {topCats.map(cat => {
                    const st = statsFor(cat.id);
                    return (
                      <label key={cat.id} className={ROW}>
                        <input
                          type="checkbox"
                          className={CHECK}
                          checked={selected.has(cat.id)}
                          onChange={() => toggleCat(cat.id)}
                        />
                        <span className="flex-1">
                          <span className="text-sm font-medium text-gray-800 block">{cat.name}</span>
                          {st.subCats.length > 0 && (
                            <span className="text-xs text-gray-400">
                              כולל: {st.subCats.map(s => s.name).join(', ')}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {st.groups} מוצרים · {st.variants} וריאציות
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="border-t pt-4">
              <h3 className="font-bold text-gray-900 mb-2">מקטים</h3>
              <label className={ROW}>
                <input type="checkbox" className={CHECK} checked={includeSku} onChange={e => setIncludeSku(e.target.checked)} />
                <span className="flex-1 text-sm text-gray-700">כל המוצרים שאושרו למעבר יעברו עם המקטים שלהם</span>
              </label>
            </section>

            <section className="border-t pt-4">
              <h3 className="font-bold text-gray-900 mb-2">מחיר עלות</h3>
              <label className={ROW}>
                <input type="checkbox" className={CHECK} checked={includeCost} onChange={e => setIncludeCost(e.target.checked)} />
                <span className="flex-1 text-sm text-gray-700">כל המוצרים שאושרו למעבר יעברו עם מחיר העלות</span>
              </label>
            </section>

            <section className="border-t pt-4">
              <h3 className="font-bold text-gray-900 mb-2">מחיר</h3>
              <label className={ROW}>
                <input type="checkbox" className={CHECK} checked={includePrice} onChange={e => setIncludePrice(e.target.checked)} />
                <span className="flex-1 text-sm text-gray-700">כל המוצרים שאושרו למעבר יעברו עם מחיר המכירה שלהם</span>
              </label>
            </section>

            <section className="border-t pt-4">
              <h3 className="font-bold text-gray-900 mb-2">ברירת מחדל</h3>
              <label className={ROW}>
                <input type="checkbox" className={CHECK} checked={includeDefaults} onChange={e => setIncludeDefaults(e.target.checked)} />
                <span className="flex-1 text-sm text-gray-700">כל ברירות המחדל כמו תצוגת וריאציות וכו' יעברו אוטומטית</span>
              </label>
            </section>

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm text-gray-600">
                יעברו: <b>{scope.groupIds.length}</b> מוצרים ·{' '}
                <b>{scope.pvIds.length + scope.fvIds.length}</b> וריאציות ·{' '}
                <b>{scope.catIds.length}</b> קטגוריות
              </p>
              {!includePrice && (
                <p className="text-xs text-amber-600">
                  המוצרים יעברו ללא מחיר מכירה — הסניף יקבע מחיר בעצמו.
                </p>
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex items-center gap-2">
                <Button onClick={handleShare} disabled={saving || scope.groupIds.length === 0} className="gap-2">
                  {saving
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> משתף...</>
                    : 'שתף קטלוג'}
                </Button>
                <Button variant="outline" onClick={onClose}>בטל</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}