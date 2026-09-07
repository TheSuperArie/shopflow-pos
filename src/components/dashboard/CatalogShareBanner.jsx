import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Package } from 'lucide-react';

/**
 * Banner shown in the branch station's POS when the network master shared a
 * catalog with this branch. On "קלוט קטלוג" the station copies the shared
 * records into its own account — in small chunks with a progress bar, so a
 * large catalog never overloads a single request.
 */
export default function CatalogShareBanner({ branch, userEmail }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState('idle'); // idle | running | done | error
  const [progress, setProgress] = useState({ label: '', done: 0, total: 0 });
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const share = branch?.catalog_share;
  const isPendingShare = !!share?.category_ids?.length &&
    (!share.pulled_at || !share.shared_at || new Date(share.shared_at) > new Date(share.pulled_at));
  // Only a real station sees the banner — never the network master's own account
  const visible = branch?.status === 'ACTIVE' && branch?.tenant_email && branch.tenant_email !== userEmail && isPendingShare;

  if (phase === 'idle' && !visible) return null;
  if (phase === 'done' && !summary) return null;

  const runPull = async () => {
    if (!navigator.onLine) return;
    setPhase('running');
    setError(null);
    try {
      const me = userEmail;

      // Local records copied in previous pulls — makes the pull idempotent
      const [localCats, localGroups, localDims, localPV, localFV] = await Promise.all([
        base44.entities.Category.filter({ created_by: me }),
        base44.entities.ProductGroup.filter({ created_by: me }),
        base44.entities.VariantDimension.filter({ created_by: me }),
        base44.entities.ProductVariant.filter({ created_by: me }),
        base44.entities.FlexibleVariant.filter({ created_by: me }),
      ]);
      const catMap = new Map(), groupMap = new Map(), dimMap = new Map(), pvMap = new Map(), fvMap = new Map();
      localCats.forEach(r => r.source_id && catMap.set(r.source_id, r.id));
      localGroups.forEach(r => r.source_id && groupMap.set(r.source_id, r.id));
      localDims.forEach(r => r.source_id && dimMap.set(r.source_id, r.id));
      localPV.forEach(r => r.source_id && pvMap.set(r.source_id, r.id));
      localFV.forEach(r => r.source_id && fvMap.set(r.source_id, r.id));

      // Fetch the source records by the exact ids the master embedded in the share
      const fetchByIds = async (entity, ids) => {
        const out = [];
        for (let i = 0; i < ids.length; i += 100) {
          out.push(...await entity.filter({ id: { $in: ids.slice(i, i + 100) } }));
          if (i + 100 < ids.length) await new Promise(r => setTimeout(r, 150));
        }
        return out;
      };

      const [srcCats, srcDims, srcGroups, srcPV, srcFV] = await Promise.all([
        fetchByIds(base44.entities.Category, share.category_ids || []),
        fetchByIds(base44.entities.VariantDimension, share.dimension_ids || []),
        fetchByIds(base44.entities.ProductGroup, share.group_ids || []),
        fetchByIds(base44.entities.ProductVariant, share.pv_ids || []),
        fetchByIds(base44.entities.FlexibleVariant, share.fv_ids || []),
      ]);

      const total =
        srcCats.filter(s => !catMap.has(s.id)).length +
        srcDims.filter(s => !dimMap.has(s.id)).length +
        srcGroups.filter(s => !groupMap.has(s.id)).length +
        srcPV.filter(s => !pvMap.has(s.id)).length +
        srcFV.filter(s => !fvMap.has(s.id)).length;
      setProgress({ label: 'מתחיל העברה...', done: 0, total });

      let doneCount = 0;
      // Creates in small chunks — a large catalog never hits the server all at once
      const chunkCreate = async (entity, sources, map, build, label) => {
        const pending = sources.filter(s => s && !map.has(s.id));
        for (let i = 0; i < pending.length; i += 25) {
          const chunk = pending.slice(i, i + 25).map(build);
          const created = await entity.bulkCreate(chunk);
          created.forEach((r, idx) => map.set(chunk[idx].source_id, r.id));
          doneCount += chunk.length;
          setProgress({ label, done: doneCount, total });
          if (i + 25 < pending.length) await new Promise(r => setTimeout(r, 200));
        }
      };

      // Categories — parents first so sub-categories can link to their local parent
      const catBuild = s => ({
        name: s.name,
        icon: s.icon,
        parent_id: (s.parent_id && catMap.get(s.parent_id)) || null,
        inherit_dimensions: s.inherit_dimensions,
        is_shirts: s.is_shirts,
        sort_order: s.sort_order,
        source_id: s.id,
      });
      let remaining = [...srcCats];
      while (remaining.some(s => !catMap.has(s.id))) {
        const ready = remaining.filter(s => !catMap.has(s.id) && (!s.parent_id || catMap.has(s.parent_id)));
        if (ready.length === 0) break;
        await chunkCreate(base44.entities.Category, ready, catMap, catBuild, 'קטגוריות');
        remaining = remaining.filter(s => !catMap.has(s.id));
      }

      // Display defaults (variant dimensions) — only ids embedded when approved
      await chunkCreate(base44.entities.VariantDimension, srcDims.filter(s => catMap.get(s.category_id)), dimMap, s => ({
        category_id: catMap.get(s.category_id),
        name: s.name,
        values: s.values,
        is_active: s.is_active,
        sort_order: s.sort_order,
        source_id: s.id,
      }), 'הגדרות תצוגה');

      // Product groups — prices / barcode pass only if approved in the share
      await chunkCreate(base44.entities.ProductGroup, srcGroups.filter(s => catMap.get(s.category_id)), groupMap, s => ({
        name: s.name,
        category_id: catMap.get(s.category_id),
        image_url: s.image_url,
        has_uniform_price: s.has_uniform_price,
        uniform_sell_price: share.include_price ? (s.uniform_sell_price ?? 0) : 0,
        uniform_cost_price: share.include_cost ? (s.uniform_cost_price ?? 0) : 0,
        enabled_dimensions: (s.enabled_dimensions || []).map(id => dimMap.get(id)).filter(Boolean),
        primary_dimension_id: dimMap.get(s.primary_dimension_id) || null,
        barcode: share.include_sku ? (s.barcode || null) : null,
        source_id: s.id,
      }), 'מוצרים');

      const variantBuild = s => ({
        group_id: groupMap.get(s.group_id),
        dimensions: s.dimensions,
        stock: s.stock ?? 0,
        sell_price: share.include_price ? (s.sell_price ?? 0) : 0,
        cost_price: share.include_cost ? (s.cost_price ?? 0) : 0,
        sku: share.include_sku ? (s.sku || null) : null,
        source_id: s.id,
      });
      await chunkCreate(base44.entities.ProductVariant, srcPV.filter(s => groupMap.get(s.group_id)), pvMap, variantBuild, 'וריאציות');
      await chunkCreate(base44.entities.FlexibleVariant, srcFV.filter(s => groupMap.get(s.group_id)), fvMap, variantBuild, 'וריאציות');

      // Mark the share as received by the station
      await base44.entities.Branch.update(branch.id, {
        catalog_share: { ...share, pulled_at: new Date().toISOString() },
      });

      queryClient.invalidateQueries({ queryKey: ['pos-branches', userEmail] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });

      setSummary({
        cats: srcCats.length,
        groups: srcGroups.length,
        variants: srcPV.length + srcFV.length,
      });
      setPhase('done');
    } catch (e) {
      setError(e.message || 'שגיאה בקליטת הקטלוג — נסה שוב');
      setPhase('error');
    }
  };

  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <div dir="rtl" className="bg-indigo-50 border-b border-indigo-200 px-4 py-3">
      {phase === 'done' && summary ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-medium text-indigo-900">
            ✅ נקלטו {summary.cats} קטגוריות · {summary.groups} מוצרים · {summary.variants} וריאציות לקופה
          </p>
          <Button size="sm" variant="outline" onClick={() => { setPhase('idle'); setSummary(null); }}>
            סגור
          </Button>
        </div>
      ) : phase === 'running' ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-indigo-900">
            מעביר {progress.label}... {progress.done}/{progress.total}
          </p>
          <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: pct + '%' }} />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            <p className="text-sm font-medium text-indigo-900">
              שיתוף קטלוג מהרשת — {share?.group_ids?.length || 0} מוצרים ו-
              {(share?.pv_ids?.length || 0) + (share?.fv_ids?.length || 0)} וריאציות ממתינים לקליטה
            </p>
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <Button size="sm" onClick={runPull} disabled={!navigator.onLine}>
              {phase === 'error' ? 'נסה שוב' : 'קלוט קטלוג'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}