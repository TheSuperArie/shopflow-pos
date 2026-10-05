import React, { useState } from 'react';
import { Folder, Shirt } from 'lucide-react';
import VirtualFolderPickerModal from './VirtualFolderPickerModal';

const SERIF = { fontFamily: "'Frank Ruhl Libre', Georgia, serif" };
const money = (n) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

/**
 * groups: קבוצות מוצר להצגה
 * variants: כל הווריאנטים
 * virtualFolders: [{id, name, category_id?, group_ids[]}] — תיקיות וירטואליות לקיבוץ
 * currentCategoryId: הקטגוריה הנוכחית שמוצגת
 * tone: the category's color (icon tint when a product has no image)
 * onSelect(group): callback כשבוחרים מוצר
 * Products that are out of stock go to the end of the grid, so they don't get in the seller's way.
 */
export default function ProductGrid({ groups, variants, virtualFolders = [], currentCategoryId, onSelect, stockModeEnabled = true, tone = '#1F3A5F' }) {
  const [openFolder, setOpenFolder] = useState(null);

  if (!groups.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#5E5A52]">
        <Folder className="w-12 h-12 mb-3 text-[#B8AE9A]" />
        <p className="text-lg">אין מוצרים בקטגוריה זו</p>
      </div>
    );
  }

  const stockOf = (groupId) => variants.filter(v => v.group_id === groupId).reduce((s, v) => s + (v.stock || 0), 0);

  // Build set of group IDs that are "inside" a virtual folder
  const groupIdsInFolders = new Set(virtualFolders.flatMap(f => f.group_ids));

  // Virtual folders: show only those matching the current category (or without category assignment)
  const relevantFolders = virtualFolders.filter(f => {
    const categoryMatch = !f.category_id || f.category_id === currentCategoryId;
    const hasGroupsHere = f.group_ids.some(gid => groups.find(g => g.id === gid));
    return categoryMatch && hasGroupsHere;
  });

  // Groups NOT in any virtual folder — shown directly; in stock first, out of stock last
  const standaloneGroups = groups
    .filter(g => !groupIdsInFolders.has(g.id))
    .map((g, i) => ({ g, i, out: stockModeEnabled && stockOf(g.id) <= 0 }))
    .sort((a, b) => Number(a.out) - Number(b.out) || a.i - b.i)
    .map(x => x.g);

  const renderGroupCard = (group) => {
    const totalStock = stockOf(group.id);
    const isOutOfStock = stockModeEnabled && totalStock <= 0;

    return (
      <button
        key={group.id}
        onClick={() => !isOutOfStock && onSelect(group)}
        disabled={isOutOfStock}
        className={`flex flex-col rounded-2xl overflow-hidden text-right transition-all
          ${isOutOfStock
            ? 'border-[1.5px] border-dashed border-[#CFC5B2] bg-[#EFEAE0] opacity-70 cursor-not-allowed'
            : 'border-[1.5px] border-[#E2D8C4] bg-[#FFFDF8] hover:shadow-md hover:border-[#CDBF9F] active:scale-[0.98] cursor-pointer'
          }`}
      >
        <span className={`h-24 w-full flex items-center justify-center ${isOutOfStock ? 'bg-[#E4DED2]' : 'bg-[#F1EADB]'}`}>
          {group.image_url ? (
            <img src={group.image_url} alt="" className={`h-full w-full object-cover ${isOutOfStock ? 'grayscale' : ''}`} />
          ) : (
            <Shirt className="w-11 h-11" strokeWidth={1.4} style={{ color: isOutOfStock ? '#9A9385' : tone }} />
          )}
        </span>
        <span className="flex flex-col gap-1 px-3.5 pt-3 pb-3.5">
          <span className="text-[17px] font-bold leading-tight line-clamp-2">{group.name}</span>
          <span className="flex items-baseline justify-between gap-2 mt-1">
            {group.has_uniform_price ? (
              <span className={`text-[22px] font-bold ${isOutOfStock ? 'text-[#8A8478]' : 'text-[#7A5418]'}`} style={SERIF}>
                {money(group.uniform_sell_price)}
              </span>
            ) : <span />}
            <span className={`text-xs font-medium ${isOutOfStock ? 'text-[#A23B2A]' : 'text-[#5E5A52]'}`}>
              {isOutOfStock ? 'אזל מהמלאי' : `במלאי: ${totalStock}`}
            </span>
          </span>
        </span>
      </button>
    );
  };

  const renderVirtualFolder = (folder) => {
    const folderGroups = groups.filter(g => folder.group_ids.includes(g.id));
    const totalStock = folderGroups.reduce((sum, g) => sum + stockOf(g.id), 0);
    const isOutOfStock = stockModeEnabled && totalStock <= 0;

    return (
      <button
        key={`vf-${folder.id}`}
        onClick={() => !isOutOfStock && setOpenFolder(folder)}
        disabled={isOutOfStock}
        className={`flex flex-col rounded-2xl overflow-hidden text-right transition-all
          ${isOutOfStock
            ? 'border-[1.5px] border-dashed border-[#CFC5B2] bg-[#EFEAE0] opacity-70 cursor-not-allowed'
            : 'border-[1.5px] border-[#C9D3E0] bg-[#FFFDF8] hover:shadow-md hover:border-[#9FB0C7] active:scale-[0.98] cursor-pointer'
          }`}
      >
        <span className={`h-24 w-full flex items-center justify-center ${isOutOfStock ? 'bg-[#E4DED2]' : 'bg-[#E4EAF2]'}`}>
          <Folder className="w-11 h-11" strokeWidth={1.4} style={{ color: isOutOfStock ? '#9A9385' : '#1F3A5F' }} />
        </span>
        <span className="flex flex-col gap-1 px-3.5 pt-3 pb-3.5">
          <span className="text-[17px] font-bold leading-tight line-clamp-2 text-[#1F3A5F]">{folder.name}</span>
          <span className="flex items-baseline justify-between gap-2 mt-1">
            <span className="text-sm text-[#5E5A52]">{folderGroups.length} סוגים</span>
            <span className={`text-xs font-medium ${isOutOfStock ? 'text-[#A23B2A]' : 'text-[#5E5A52]'}`}>
              {isOutOfStock ? 'אזל מהמלאי' : `במלאי: ${totalStock}`}
            </span>
          </span>
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {relevantFolders.map(renderVirtualFolder)}
        {standaloneGroups.map(renderGroupCard)}
      </div>

      <VirtualFolderPickerModal
        folder={openFolder}
        groups={groups}
        variants={variants}
        stockModeEnabled={stockModeEnabled}
        onSelect={(group) => { setOpenFolder(null); onSelect(group); }}
        onClose={() => setOpenFolder(null)}
      />
    </>
  );
}
