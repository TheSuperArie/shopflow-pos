import React, { useState } from 'react';
import { Folder } from 'lucide-react';
import VirtualFolderPickerModal from './VirtualFolderPickerModal';

/**
 * groups: קבוצות מוצר להצגה
 * variants: כל הווריאנטים
 * virtualFolders: [{id, name, category_id?, group_ids[]}] — תיקיות וירטואליות לקיבוץ
 * currentCategoryId: הקטגוריה הנוכחית שמוצגת
 * onSelect(group): callback כשבוחרים מוצר
 */
export default function ProductGrid({ groups, variants, virtualFolders = [], currentCategoryId, onSelect }) {
  const [openFolder, setOpenFolder] = useState(null);

  if (!groups.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Folder className="w-12 h-12 mb-3" />
        <p className="text-lg">אין מוצרים בקטגוריה זו</p>
      </div>
    );
  }

  // Build set of group IDs that are "inside" a virtual folder
  const groupIdsInFolders = new Set(virtualFolders.flatMap(f => f.group_ids));

  // Virtual folders: show only those matching the current category (or without category assignment)
  const relevantFolders = virtualFolders.filter(f => {
    const categoryMatch = !f.category_id || f.category_id === currentCategoryId;
    const hasGroupsHere = f.group_ids.some(gid => groups.find(g => g.id === gid));
    return categoryMatch && hasGroupsHere;
  });

  // Groups NOT in any virtual folder — shown directly
  const standaloneGroups = groups.filter(g => !groupIdsInFolders.has(g.id));

  const renderGroupCard = (group) => {
    const groupVariants = variants.filter(v => v.group_id === group.id);
    const totalStock = groupVariants.reduce((s, v) => s + (v.stock || 0), 0);
    const isOutOfStock = totalStock <= 0;

    return (
      <button
        key={group.id}
        onClick={() => !isOutOfStock && onSelect(group)}
        disabled={isOutOfStock}
        className={`relative flex flex-col items-center p-4 rounded-2xl border-2 transition-all
          ${isOutOfStock
            ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
            : 'border-gray-200 bg-white hover:border-amber-300 hover:shadow-md active:scale-95 cursor-pointer'
          }`}
      >
        {group.image_url ? (
          <img
            src={group.image_url}
            alt={group.name}
            className={`w-16 h-16 object-cover rounded-xl mb-2 ${isOutOfStock ? 'grayscale' : ''}`}
          />
        ) : (
          <div className={`w-16 h-16 rounded-xl mb-2 flex items-center justify-center ${isOutOfStock ? 'bg-gray-100' : 'bg-amber-50'}`}>
            <Folder className={`w-8 h-8 ${isOutOfStock ? 'text-gray-300' : 'text-amber-400'}`} />
          </div>
        )}
        <span className="font-semibold text-sm text-center leading-tight">{group.name}</span>
        {group.has_uniform_price && (
          <span className={`font-bold mt-1 ${isOutOfStock ? 'text-gray-400' : 'text-amber-600'}`}>
            ₪{group.uniform_sell_price}
          </span>
        )}
        <span className={`text-xs mt-0.5 font-semibold ${isOutOfStock ? 'text-red-400' : 'text-gray-400'}`}>
          {isOutOfStock ? 'אזל מהמלאי' : `מלאי: ${totalStock}`}
        </span>
      </button>
    );
  };

  const renderVirtualFolder = (folder) => {
    const folderGroups = groups.filter(g => folder.group_ids.includes(g.id));
    const totalStock = folderGroups.reduce((sum, g) => {
      return sum + variants.filter(v => v.group_id === g.id).reduce((s, v) => s + (v.stock || 0), 0);
    }, 0);
    const isOutOfStock = totalStock <= 0;

    return (
      <button
        key={`vf-${folder.id}`}
        onClick={() => !isOutOfStock && setOpenFolder(folder)}
        disabled={isOutOfStock}
        className={`relative flex flex-col items-center p-4 rounded-2xl border-2 transition-all
          ${isOutOfStock
            ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
            : 'border-blue-200 bg-blue-50 hover:border-blue-400 hover:shadow-md active:scale-95 cursor-pointer'
          }`}
      >
        <div className={`w-16 h-16 rounded-xl mb-2 flex items-center justify-center ${isOutOfStock ? 'bg-gray-100' : 'bg-blue-100'}`}>
          <span className="text-3xl">📁</span>
        </div>
        <span className="font-semibold text-sm text-center leading-tight text-blue-800">{folder.name}</span>
        <span className="text-xs text-blue-500 mt-0.5">{folderGroups.length} סוגים</span>
        <span className={`text-xs mt-0.5 font-semibold ${isOutOfStock ? 'text-red-400' : 'text-gray-400'}`}>
          {isOutOfStock ? 'אזל מהמלאי' : `מלאי: ${totalStock}`}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {relevantFolders.map(renderVirtualFolder)}
        {standaloneGroups.map(renderGroupCard)}
      </div>

      <VirtualFolderPickerModal
        folder={openFolder}
        groups={groups}
        variants={variants}
        onSelect={(group) => { setOpenFolder(null); onSelect(group); }}
        onClose={() => setOpenFolder(null)}
      />
    </>
  );
}