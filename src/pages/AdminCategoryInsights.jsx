import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowRight, ChevronRight, Pin, PinOff } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ANALYTICS_COLORS } from '@/hooks/useCategorySalesAnalytics';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { format, startOfMonth } from 'date-fns';

export default function AdminCategoryInsights() {
  const { id: categoryId } = useParams();
  const navigate = useNavigate();
  const user = useCurrentUser();

  const [drillPath, setDrillPath] = useState([]);
  const [searchParams] = useSearchParams();
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('from') || format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => searchParams.get('to') || format(new Date(), 'yyyy-MM-dd'));
  const branchId = searchParams.get('branchId') || null;
  const [selectedDimension, setSelectedDimension] = useState('__auto__');
  const [level0GroupBy, setLevel0GroupBy] = useState('subcat'); // 'subcat' | 'dimension'

  // On category change: restore pinned global dimension (if any), else __auto__
  useEffect(() => {
    const globalPin = localStorage.getItem(`insights_dim_pin_${categoryId}`);
    setSelectedDimension(globalPin || '__auto__');
    setDrillPath([]);
    setLevel0GroupBy('subcat');
  }, [categoryId]);

  // ── Data fetching ────────────────────────────────────────────────
  const { data: categories = [], isLoading: loadingCategories, isFetching: fetchingCategories } = useQuery({
    queryKey: ['categories', user?.email],
    queryFn: () => base44.entities.Category.filter({ created_by: user.email }),
    enabled: !!user,
    staleTime: 0,
  });

  // Use a ref to track the "settled" categories — only update when NOT fetching
  // This prevents the brief moment where categories is stale/empty while isFetching=true
  const settledCategoriesRef = useRef([]);
  const [settledCategories, setSettledCategories] = useState([]);

  useEffect(() => {
    if (!loadingCategories && !fetchingCategories && categories.length >= 0) {
      settledCategoriesRef.current = categories;
      setSettledCategories(categories);
    }
  }, [categories, loadingCategories, fetchingCategories]);

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['insights-sales', user?.email, branchId],
    queryFn: async () => {
      if (branchId) {
        const [branchSales, nullBranchSales] = await Promise.all([
          base44.entities.Sale.filter({ created_by: user.email, branch_id: branchId }, '-created_date', 10000),
          base44.entities.Sale.filter({ created_by: user.email, branch_id: null }, '-created_date', 2000),
        ]);
        return [...branchSales, ...nullBranchSales];
      }
      return base44.entities.Sale.filter({ created_by: user.email }, '-created_date', 10000);
    },
    enabled: !!user,
    staleTime: 0,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['insights-groups', user?.email],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: user.email }),
    enabled: !!user,
    staleTime: 0,
  });

  const { data: productVariants = [] } = useQuery({
    queryKey: ['insights-variants', user?.email],
    queryFn: () => base44.entities.ProductVariant.filter({ created_by: user.email }),
    enabled: !!user,
    staleTime: 0,
  });

  const { data: flexibleVariants = [] } = useQuery({
    queryKey: ['insights-flexible-variants', user?.email],
    queryFn: () => base44.entities.FlexibleVariant.filter({ created_by: user.email }),
    enabled: !!user,
    staleTime: 0,
  });

  const variants = [...productVariants, ...flexibleVariants];

  const { data: dimensions = [] } = useQuery({
    queryKey: ['insights-dimensions', user?.email],
    queryFn: () => base44.entities.VariantDimension.filter({ created_by: user.email }),
    enabled: !!user,
    staleTime: 0,
  });

  // ── Lookup maps ──────────────────────────────────────────────────
  const categoryById = useMemo(() => {
    const m = {};
    for (const c of settledCategories) m[c.id] = c;
    return m;
  }, [settledCategories]);

  const groupById = useMemo(() => {
    const m = {};
    for (const g of groups) m[g.id] = g;
    return m;
  }, [groups]);

  const variantById = useMemo(() => {
    const m = {};
    for (const v of variants) m[String(v.id)] = v;
    return m;
  }, [variants]);

  // ── Category tree ────────────────────────────────────────────────
  const category = categoryById[categoryId];

  const subCategories = useMemo(
    () => settledCategories.filter(c => c.parent_id === categoryId),
    [settledCategories, categoryId]
  );

  const subCatById = useMemo(() => {
    const m = {};
    for (const c of subCategories) m[c.id] = c;
    return m;
  }, [subCategories]);

  // ── Dimensions available for this category tree ──────────────────
  // Collect all category IDs in our tree (parent + sub-cats)
  const treeCategoryIds = useMemo(() => {
    const ids = new Set([categoryId]);
    for (const sc of subCategories) ids.add(sc.id);
    return ids;
  }, [categoryId, subCategories]);

  // All dimension names used by groups in our tree
  const availableDimensionNames = useMemo(() => {
    // Only include dimension names that actually appear in variants belonging to this category tree
    const namesSet = new Set();
    for (const v of variants) {
      const g = groupById[v.group_id];
      if (g && treeCategoryIds.has(g.category_id)) {
        for (const key of Object.keys(v.dimensions || {})) {
          namesSet.add(key.trim());
        }
      }
    }
    return [...namesSet];
  }, [variants, groupById, treeCategoryIds]);



  // ── Date-filtered sales ──────────────────────────────────────────
  const toLocalDate = (isoString) => {
    if (!isoString) return null;
    const safe = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    return new Date(safe).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  };

  const dateSales = useMemo(() => sales.filter(s => {
    const d = toLocalDate(s.created_date);
    return d && d >= dateFrom && d <= dateTo;
  }), [sales, dateFrom, dateTo]);

  // ── Resolve all items belonging to this category tree ───────────
  // STRICT RULE: only items whose group_id is verified to belong to treeCategoryIds are included.
  // Items without a verifiable group_id are discarded — no name-based guessing across categories.
  const resolvedItems = useMemo(() => {
    if (loadingCategories || fetchingCategories || settledCategories.length === 0) return [];
    const items = [];
    for (const sale of dateSales) {
      for (const item of (sale.items || [])) {
        let group = null;

        // P1: group_id directly on item — most reliable
        if (item.group_id && groupById[item.group_id]) {
          const g = groupById[item.group_id];
          if (treeCategoryIds.has(g.category_id)) group = g;
          else continue; // group belongs to a different category — skip
        }

        // P2: variant_id → group (only if group belongs to this tree)
        if (!group) {
          const varId = item.variant_id ?? item.variantId;
          if (varId) {
            const v = variantById[String(varId)];
            if (v) {
              const g = groupById[v.group_id];
              if (g && treeCategoryIds.has(g.category_id)) group = g;
              else continue; // variant belongs to a different category — skip
            }
          }
        }

        // P3: product_id as group_id fallback (legacy)
        if (!group && item.product_id && groupById[item.product_id]) {
          const g = groupById[item.product_id];
          if (treeCategoryIds.has(g.category_id)) group = g;
          else continue;
        }

        // No verified group found — discard item entirely (cannot safely assign to this category)
        if (!group) continue;

        const catId = group.category_id;
        const varId = item.variant_id ?? item.variantId;
        const resolvedVariant = varId ? (variantById[String(varId)] || null) : null;

        items.push({
          ...item,
          resolvedGroup: group,
          resolvedVariant,
          subCatId: subCatById[catId] ? catId : null,
          subCatName: subCatById[catId] ? categoryById[catId].name : null,
        });
      }
    }
    return items;
  }, [dateSales, groupById, categoryById, treeCategoryIds, subCatById, variantById, loadingCategories, settledCategories]);

  // When no sub-cats exist but dimensions do — auto-switch to dimension view at level 0
  useEffect(() => {
    if (subCategories.length === 0 && availableDimensionNames.length > 0) {
      setLevel0GroupBy('dimension');
    }
  }, [subCategories.length, availableDimensionNames.length]);

  // ── Drill state ──────────────────────────────────────────────────
  // drillBucket stores { bucketId (subCatId or '__direct__'), bucketName }
  // This is STATIC — it only changes when user clicks a slice or hits back
  const drillBucket = drillPath[0] || null;

  // ── Step 1: Filter items by drill bucket (static — no selectedDimension dep) ──
  // At Level 1 this gives us ONLY items inside the drilled sub-category (or dim-value bucket)
  const filteredItems = useMemo(() => {
    if (!drillBucket) return resolvedItems; // Level 0: use all items

    const { bucketId } = drillBucket;

    // Sub-category drill
    if (bucketId === '__direct__') return resolvedItems.filter(item => !item.subCatId);
    // Sub-category ID drill (real sub-cats)
    if (!bucketId.startsWith('__dim__')) {
      // First try to match as subCatId, then as resolvedGroup.id (no-sub-cats case)
      const bySubCat = resolvedItems.filter(item => item.subCatId === bucketId);
      if (bySubCat.length > 0) return bySubCat;
      return resolvedItems.filter(item => item.resolvedGroup?.id === bucketId);
    }

    // Dimension-value drill (no sub-cats at Level 0 — bucketId = "__dim__<value>")
    const dimValue = bucketId.slice('__dim__'.length);
    const dimKey = selectedDimension === '__auto__' ? (availableDimensionNames[0] || null) : selectedDimension;

    return resolvedItems.filter(item => {
      // Direct variant match
      if (dimKey && item.resolvedVariant?.dimensions?.[dimKey] != null) {
        return String(item.resolvedVariant.dimensions[dimKey]).trim() === dimValue;
      }
      // Parse product_name segments
      if (item.product_name) {
        const segments = item.product_name.split(/[\s\-\/]+/).map(s => s.trim());
        return segments.some(s => s.toLowerCase() === dimValue.toLowerCase());
      }
      return false;
    });
  }, [resolvedItems, drillBucket, selectedDimension, availableDimensionNames]);

  // ── Dimension names available within current drill bucket ────────
  // Defined BEFORE chartData so it can be used inside chartData useMemo
  const bucketDimensionNames = useMemo(() => {
    if (!drillBucket) return availableDimensionNames;
    const namesSet = new Set();
    for (const item of filteredItems) {
      if (item.resolvedVariant?.dimensions) {
        for (const key of Object.keys(item.resolvedVariant.dimensions)) {
          namesSet.add(key.trim());
        }
      }
    }
    if (namesSet.size === 0) {
      const groupIds = new Set(filteredItems.map(i => i.resolvedGroup?.id).filter(Boolean));
      for (const v of variants) {
        if (groupIds.has(v.group_id) && v.dimensions) {
          for (const key of Object.keys(v.dimensions)) namesSet.add(key.trim());
        }
      }
    }
    if (namesSet.size === 0) return availableDimensionNames;
    return [...namesSet];
  }, [drillBucket, filteredItems, variants, availableDimensionNames]);

  // ── Step 2: Build chart data from filteredItems (dynamic — selectedDimension dep) ──
  const chartData = useMemo(() => {
    // Don't bucket until categories are fully settled — prevents wrong "no sub-cats" branch
    if (loadingCategories || fetchingCategories || settledCategories.length === 0) return [];
    const hasSubCatsLocal = subCategories.length > 0;
    const dimKey = selectedDimension === '__auto__' ? (availableDimensionNames[0] || null) : selectedDimension;

    if (!drillBucket) {
      // ── LEVEL 0 ──────────────────────────────────────────────────

      // If user chose to group by dimension at level 0
      if (level0GroupBy === 'dimension' && dimKey) {
        const variantDimMapL0 = {};
        for (const v of variants) {
          if (v.dimensions?.[dimKey] != null) {
            variantDimMapL0[String(v.id)] = String(v.dimensions[dimKey]).trim();
          }
        }
        const allKnownDimValuesL0 = new Set(Object.values(variantDimMapL0).map(v => v.toLowerCase()));

        const map = {};
        for (const item of filteredItems) {
          let dimVal = null;
          if (item.resolvedVariant?.dimensions?.[dimKey] != null) {
            dimVal = String(item.resolvedVariant.dimensions[dimKey]).trim();
          }
          if (!dimVal) {
            const varId = item.variant_id ?? item.variantId;
            if (varId && variantDimMapL0[String(varId)]) dimVal = variantDimMapL0[String(varId)];
          }
          if (!dimVal && item.product_name && allKnownDimValuesL0.size > 0) {
            const segments = item.product_name.split(/[\s\-\/,()]+/).map(s => s.trim()).filter(Boolean);
            for (const seg of segments) {
              if (allKnownDimValuesL0.has(seg.toLowerCase())) {
                dimVal = seg;
                break;
              }
            }
          }
          if (!dimVal) dimVal = 'ללא וריאציה';
          if (!map[dimVal]) map[dimVal] = { id: `__dim__${dimVal}`, name: dimVal, revenue: 0, quantity: 0 };
          map[dimVal].revenue += (item.sell_price || 0) * (item.quantity || 0);
          map[dimVal].quantity += item.quantity || 0;
        }
        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
      }

      if (hasSubCatsLocal) {
        // Group strictly by sub-category only — items without subCatId go to "כללי"
        const map = {};
        for (const item of filteredItems) {
          const key = item.subCatId || '__direct__';
          const label = item.subCatName || 'כללי';
          if (!map[key]) map[key] = { id: key, name: label, revenue: 0, quantity: 0 };
          map[key].revenue += (item.sell_price || 0) * (item.quantity || 0);
          map[key].quantity += item.quantity || 0;
        }
        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
      }
      {
        // No sub-cats: group by product group name (Level 0)
        const map = {};
        for (const item of filteredItems) {
          const key = item.resolvedGroup?.id || 'other';
          const label = item.resolvedGroup?.name || 'כללי';
          if (!map[key]) map[key] = { id: key, name: label, revenue: 0, quantity: 0 };
          map[key].revenue += (item.sell_price || 0) * (item.quantity || 0);
          map[key].quantity += item.quantity || 0;
        }
        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
      }
    }

    // ── LEVEL 1: filteredItems already contains ONLY the drilled bucket's items ──
    // Now slice them by selectedDimension — this is purely a display bucketing step

    // Build a set of known valid values ONLY from variants belonging to this category tree
    const knownValuesForDim = new Set();
    if (dimKey) {
      for (const v of variants) {
        const g = groupById[v.group_id];
        if (g && treeCategoryIds.has(g.category_id) && v.dimensions?.[dimKey] != null) {
          knownValuesForDim.add(String(v.dimensions[dimKey]).trim());
        }
      }
    }

    // Build known values for the selected dimension
    const allKnownValuesL1 = {};
    for (const dim of dimensions) {
      if (treeCategoryIds.has(dim.category_id) && dim.is_active !== false) {
        allKnownValuesL1[dim.name.trim()] = (dim.values || []).map(v => v.trim());
      }
    }
    const targetValuesL1 = dimKey ? (allKnownValuesL1[dimKey] || [...knownValuesForDim]) : Object.values(allKnownValuesL1).flat();

    // Build a map of variant_id → dimension value for quick lookup
    const variantDimMap = {};
    // Also build a map of all known dim values across ALL variants (for product_name parsing)
    const allKnownDimValues = new Set();
    if (dimKey) {
      for (const v of variants) {
        if (v.dimensions?.[dimKey] != null) {
          const val = String(v.dimensions[dimKey]).trim();
          variantDimMap[String(v.id)] = val;
          allKnownDimValues.add(val.toLowerCase());
        }
      }
    }

    // Helper: group by product group name
    const groupByProductName = () => {
      const map = {};
      for (const item of filteredItems) {
        const key = item.resolvedGroup?.id || item.product_name || 'כללי';
        const label = item.resolvedGroup?.name || item.product_name || 'כללי';
        if (!map[key]) map[key] = { id: key, name: label, revenue: 0, quantity: 0 };
        map[key].revenue += (item.sell_price || 0) * (item.quantity || 0);
        map[key].quantity += item.quantity || 0;
      }
      return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    };

    // If no dimension key at all — group by product group name
    if (!dimKey) return groupByProductName();

    // If the selected dimension doesn't exist on ANY variant in this bucket — fallback to product name grouping
    // This handles categories like "belts" that have no variants with this dimension at all
    const dimExistsInBucket = filteredItems.some(item => {
      if (item.resolvedVariant?.dimensions?.[dimKey] != null) return true;
      const varId = item.variant_id ?? item.variantId;
      if (varId && variantDimMap[String(varId)]) return true;
      return false;
    });
    const dimExistsInTargetValues = targetValuesL1.length > 0 || allKnownDimValues.size > 0;
    if (!dimExistsInBucket && !dimExistsInTargetValues) return groupByProductName();

    const map = {};
    for (const item of filteredItems) {
      let dimVal = null;

      // Priority 1: Direct variant dimension lookup via resolvedVariant
      if (item.resolvedVariant?.dimensions?.[dimKey] != null) {
        dimVal = String(item.resolvedVariant.dimensions[dimKey]).trim();
      }

      // Priority 2: variant_id lookup in full variants list
      if (!dimVal) {
        const varId = item.variant_id ?? item.variantId;
        if (varId && variantDimMap[String(varId)]) {
          dimVal = variantDimMap[String(varId)];
        }
      }

      // Priority 3: Parse product_name against ALL known dim values across all variants
      if (!dimVal && item.product_name && allKnownDimValues.size > 0) {
        const segments = item.product_name.split(/[\s\-\/,()]+/).map(s => s.trim()).filter(Boolean);
        for (const seg of segments) {
          if (allKnownDimValues.has(seg.toLowerCase())) {
            const found = Object.entries(variantDimMap).find(([, v]) => v.toLowerCase() === seg.toLowerCase());
            dimVal = found ? found[1] : seg;
            break;
          }
        }
      }

      // Priority 4: targetValuesL1 from dimension definitions
      if (!dimVal && item.product_name) {
        const segments = item.product_name.split(/[\s\-\/,()]+/).map(s => s.trim()).filter(Boolean);
        for (const seg of segments) {
          if (targetValuesL1.some(v => v.toLowerCase() === seg.toLowerCase())) {
            dimVal = seg;
            break;
          }
        }
      }

      if (!dimVal) dimVal = item.resolvedGroup?.name || item.product_name || 'ללא וריאציה';

      if (!map[dimVal]) map[dimVal] = { id: dimVal, name: dimVal, revenue: 0, quantity: 0 };
      map[dimVal].revenue += (item.sell_price || 0) * (item.quantity || 0);
      map[dimVal].quantity += item.quantity || 0;
    }

    // If everything fell into a single "no variant" bucket whose name is a group name,
    // it means the dimension didn't match at all — fallback to group-based breakdown
    const resultValues = Object.values(map);
    const allFallback = resultValues.every(r => !allKnownDimValues.has(r.name.toLowerCase()) && !targetValuesL1.some(v => v.toLowerCase() === r.name.toLowerCase()));
    if (allFallback && resultValues.some(r => r.name !== 'ללא וריאציה')) {
      // Already grouped by product name / group name — just return as-is (it's meaningful)
      return resultValues.sort((a, b) => b.revenue - a.revenue);
    }

    return resultValues.sort((a, b) => b.revenue - a.revenue);
  }, [filteredItems, drillBucket, subCategories, selectedDimension, availableDimensionNames, loadingCategories, fetchingCategories, variants, settledCategories, level0GroupBy]);

  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);
  const hasSubCats = subCategories.length > 0;
  // Pinned dimension per product-bucket (stored as insights_pin_<categoryId>_<bucketId>)
  const pinnedDimKey = drillBucket ? `insights_pin_${categoryId}_${drillBucket.bucketId}` : null;
  const globalPinKey = `insights_dim_pin_${categoryId}`;
  const globalPinnedDim = localStorage.getItem(globalPinKey) || null;
  const pinnedDim = pinnedDimKey ? (localStorage.getItem(pinnedDimKey) || globalPinnedDim) : globalPinnedDim;

  const handlePinDimension = () => {
    const current = selectedDimension === '__auto__' ? (bucketDimensionNames[0] || null) : selectedDimension;
    if (!current) return;
    if (pinnedDim === current) {
      // Unpin both
      if (pinnedDimKey) localStorage.removeItem(pinnedDimKey);
      localStorage.removeItem(globalPinKey);
    } else {
      // Pin globally for this category (applies on every entry)
      localStorage.setItem(globalPinKey, current);
      if (pinnedDimKey) localStorage.setItem(pinnedDimKey, current);
    }
    setSelectedDimension(v => v); // force re-render to refresh pinnedDim
  };

  // When drilling into a bucket, apply pinned bucket-level dimension, else global pin, else __auto__
  useEffect(() => {
    if (drillBucket) {
      const bucketPin = pinnedDimKey ? localStorage.getItem(pinnedDimKey) : null;
      const globalPin = localStorage.getItem(`insights_dim_pin_${categoryId}`);
      setSelectedDimension(bucketPin || globalPin || '__auto__');
    }
  }, [drillBucket?.bucketId]);

  const dimLabel = selectedDimension === '__auto__' ? (bucketDimensionNames[0] || 'ממד') : selectedDimension;
  // Level 0: if has sub-cats WITH data → "תת-קטגוריות", else → dimension name
  const level0Label = hasSubCats ? 'תת-קטגוריות' : 'מוצרים';
  const level0DisplayLabel = (!drillBucket && level0GroupBy === 'dimension') ? (availableDimensionNames[0] || 'ממד') : level0Label;
  const currentLabel = !drillBucket ? level0DisplayLabel : dimLabel;
  const topLevelLabel = level0Label;
  const canDrill = !drillBucket && !(level0GroupBy === 'dimension');

  const handleDrillDown = (row) => {
    if (canDrill) {
      setDrillPath([{ bucketId: row.id, bucketName: row.name }]);
    }
  };

  const handleBack = () => {
    setDrillPath([]);
    const globalPin = localStorage.getItem(`insights_dim_pin_${categoryId}`);
    setSelectedDimension(globalPin || '__auto__');
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/AdminDashboard')} className="gap-2">
            <ArrowRight className="w-4 h-4" />
            חזור ללוח בקרה
          </Button>
          <h1 className="text-2xl font-bold text-gray-800">
            ניתוח קטגוריה: {category?.name || '...'}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Level 0 groupBy toggle — shown at top level when there are dimensions */}
          {!drillBucket && availableDimensionNames.length > 0 && (
            <div className="flex items-center gap-1 border rounded-lg overflow-hidden text-sm">
              <button
                onClick={() => setLevel0GroupBy('subcat')}
                className={`px-3 py-1.5 transition-colors ${level0GroupBy === 'subcat' ? 'bg-amber-500 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {hasSubCats ? 'תת-קטגוריות' : 'מוצרים'}
              </button>
              <button
                onClick={() => setLevel0GroupBy('dimension')}
                className={`px-3 py-1.5 transition-colors ${level0GroupBy === 'dimension' ? 'bg-amber-500 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {availableDimensionNames[0] || 'ממד'}
              </button>
            </div>
          )}

          {/* Dimension selector + pin — shown at Level 1, or Level 0 with dimensions */}
          {bucketDimensionNames.length > 0 && (!!drillBucket || availableDimensionNames.length > 0) && (
            <div className="flex items-center gap-1">
              {!!drillBucket && (
                <Select
                  value={selectedDimension}
                  onValueChange={(v) => { setSelectedDimension(v); }}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="קבץ לפי..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">אוטומטי</SelectItem>
                    {bucketDimensionNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="ghost"
                size="icon"
                title={pinnedDim ? `מוצמד: ${pinnedDim} — לחץ להסרה` : 'נעץ ממד ברירת מחדל לכל הכניסות'}
                onClick={handlePinDimension}
                className={pinnedDim ? 'text-amber-500' : 'text-gray-400'}
              >
                <Pin className="w-4 h-4" />
              </Button>
            </div>
          )}
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); handleBack(); }} className="w-40" />
          <span className="text-gray-400">עד</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); handleBack(); }} className="w-40" />
        </div>
      </div>

      {/* Breadcrumb */}
      {drillPath.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={handleBack} className="text-sm text-blue-600 hover:underline font-medium">
            {topLevelLabel}
          </button>
          {drillPath.map((step, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-800">{step.bucketName}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {loadingSales || loadingCategories || fetchingCategories ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : chartData.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            אין מכירות לקטגוריה זו בטווח התאריכים
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                פילוח לפי: <span className="text-amber-600">{currentLabel}</span>
                {drillBucket && (
                  <span className="text-sm text-gray-400 font-normal mr-2">({drillBucket.bucketName})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="revenue"
                    labelLine={false}
                    label={({ name, percent }) => percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''}
                    onClick={(entry) => handleDrillDown(entry)}
                    style={{ cursor: canDrill ? 'pointer' : 'default' }}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `₪${value.toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Breakdown List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">פירוט — {currentLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {chartData.map((row, idx) => (
                  <button
                    key={row.id}
                    onClick={() => canDrill && handleDrillDown(row)}
                    className={`w-full text-right p-3 rounded-xl border transition-all ${
                      canDrill ? 'hover:border-amber-400 hover:bg-amber-50 cursor-pointer' : 'cursor-default'
                    } bg-white border-gray-100`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ANALYTICS_COLORS[idx % ANALYTICS_COLORS.length] }} />
                        <span className="font-semibold text-sm">{row.name}</span>
                        {canDrill && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-amber-600">₪{row.revenue.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">
                          {Math.round(row.quantity)} יח׳ • {totalRevenue > 0 ? ((row.revenue / totalRevenue) * 100).toFixed(1) : 0}%
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Summary stats */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-gray-500">סה"כ הכנסות</p>
                <p className="text-xl font-bold text-amber-600">₪{totalRevenue.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">סה"כ יחידות</p>
                <p className="text-xl font-bold text-gray-700">{Math.round(chartData.reduce((s, d) => s + d.quantity, 0))}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ערכים שונים</p>
                <p className="text-xl font-bold text-blue-600">{chartData.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}