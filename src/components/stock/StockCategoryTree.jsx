import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Package, ChevronDown } from 'lucide-react';
import StockProductBlock from './StockProductBlock';
import SelectAllCheckbox from './SelectAllCheckbox';
import { toBatchItemsFromGroups } from '@/lib/stockSelection';

/**
 * Category → sub-category → product → dimension folder → variant tree.
 * Every parent level carries a "select all" that covers everything beneath it,
 * and the selection is shared across categories and products.
 */
export default function StockCategoryTree({ categories, groups, variants, allDimensions = [], threshold = 5 }) {
  const [openCat, setOpenCat] = useState(null);
  const [openSubs, setOpenSubs] = useState({});

  const varsByGroup = {};
  variants.forEach(v => {
    if (!varsByGroup[v.group_id]) varsByGroup[v.group_id] = [];
    varsByGroup[v.group_id].push(v);
  });

  const entriesByCat = {};
  groups.forEach(g => {
    const gVars = varsByGroup[g.id];
    if (!gVars?.length) return;
    if (!entriesByCat[g.category_id]) entriesByCat[g.category_id] = [];
    entriesByCat[g.category_id].push({ group: g, variants: gVars });
  });

  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  const covered = new Set();
  const nodes = [];

  categories.filter(c => !c.parent_id).forEach(cat => {
    const own = entriesByCat[cat.id] || [];
    const subs = categories
      .filter(s => s.parent_id === cat.id)
      .map(s => ({ category: s, entries: entriesByCat[s.id] || [] }))
      .filter(s => s.entries.length > 0);
    if (own.length === 0 && subs.length === 0) return;
    covered.add(cat.id);
    subs.forEach(s => covered.add(s.category.id));
    nodes.push({ category: cat, own, subs });
  });

  // Categories that are not reachable from a top-level parent (orphans / unknown ids)
  Object.entries(entriesByCat).forEach(([catId, entries]) => {
    if (covered.has(catId)) return;
    nodes.push({
      category: catById[catId] || { id: catId, name: 'ללא קטגוריה' },
      own: entries,
      subs: [],
    });
  });

  if (nodes.length === 0) return null;

  return (
    <div className="space-y-3">
      {nodes.map(({ category, own, subs }) => {
        const allEntries = [...own, ...subs.flatMap(s => s.entries)];
        const totalVariants = allEntries.reduce((sum, e) => sum + e.variants.length, 0);
        const isOpen = openCat === category.id;

        return (
          <div key={category.id} className="border-2 border-red-300 rounded-xl overflow-hidden">
            {/* Category level */}
            <div className="sticky top-0 z-10 bg-red-200 flex items-center gap-2 pl-3 border-b-2 border-red-300">
              <button
                onClick={() => setOpenCat(isOpen ? null : category.id)}
                className="flex-1 p-4 flex items-center justify-between hover:brightness-95 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-right">
                    <h3 className="font-bold text-red-900 text-lg">{category.name}</h3>
                    <p className="text-sm text-red-700">
                      {allEntries.length} מוצרים • {totalVariants} וריאציות
                      {subs.length > 0 ? ` • ${subs.length} תת-קטגוריות` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-red-700 text-white text-sm px-3 py-1">{totalVariants}</Badge>
                  <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              <SelectAllCheckbox
                items={toBatchItemsFromGroups(allEntries)}
                label="כל הקטגוריה"
                className="text-red-900 bg-white/70 border border-red-300 rounded-lg px-2 py-1 shrink-0"
              />
            </div>

            {isOpen && (
              <div className="bg-white p-4 space-y-4">
                {own.map(({ group, variants: gVars }) => (
                  <StockProductBlock
                    key={group.id}
                    group={group}
                    variants={gVars}
                    allDimensions={allDimensions}
                    threshold={threshold}
                  />
                ))}

                {subs.map(({ category: sub, entries }) => {
                  const subOpen = !!openSubs[sub.id];
                  const subTotal = entries.reduce((s, e) => s + e.variants.length, 0);
                  return (
                    <div key={sub.id} className="border-2 border-orange-200 rounded-xl overflow-hidden">
                      {/* Sub-category level */}
                      <div className="bg-orange-100 flex items-center gap-2 pl-3">
                        <button
                          onClick={() => setOpenSubs(prev => ({ ...prev, [sub.id]: !prev[sub.id] }))}
                          className="flex-1 px-4 py-3 flex items-center justify-between hover:brightness-95"
                        >
                          <div className="flex items-center gap-2">
                            <span>🗂️</span>
                            <span className="font-semibold text-orange-900">{sub.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-orange-500 text-white text-xs">{subTotal}</Badge>
                            <ChevronDown className={`w-4 h-4 transition-transform ${subOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </button>
                        <SelectAllCheckbox
                          items={toBatchItemsFromGroups(entries)}
                          label="כל התת-קטגוריה"
                          className="text-orange-900 bg-white border border-orange-200 rounded-lg px-2 py-1 shrink-0"
                        />
                      </div>
                      {subOpen && (
                        <div className="bg-white p-3 space-y-3">
                          {entries.map(({ group, variants: gVars }) => (
                            <StockProductBlock
                              key={group.id}
                              group={group}
                              variants={gVars}
                              allDimensions={allDimensions}
                              threshold={threshold}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}