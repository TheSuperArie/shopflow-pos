import React from 'react';
import { Folder } from 'lucide-react';

/**
 * מודל בחירת מוצר מתוך תיקייה וירטואלית
 * folder: {id, name, group_ids[]}
 * groups: כל קבוצות המוצר
 * variants: כל הווריאנטים
 * onSelect(group): callback כשבוחרים מוצר
 * onClose(): סגור
 */
export default function VirtualFolderPickerModal({ folder, groups, variants, onSelect, onClose }) {
  if (!folder) return null;

  const folderGroups = groups.filter(g => folder.group_ids.includes(g.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl p-5 w-[90%] max-w-sm"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">📁</span>
          <h2 className="text-lg font-bold text-gray-800">{folder.name}</h2>
        </div>

        <div className="space-y-2">
          {folderGroups.map(group => {
            const groupVariants = variants.filter(v => v.group_id === group.id);
            const totalStock = groupVariants.reduce((s, v) => s + (v.stock || 0), 0);
            const isOutOfStock = totalStock <= 0;

            return (
              <button
                key={group.id}
                onClick={() => !isOutOfStock && onSelect(group)}
                disabled={isOutOfStock}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-right
                  ${isOutOfStock
                    ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 bg-white hover:border-amber-400 hover:bg-amber-50 active:scale-[0.98] cursor-pointer'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOutOfStock ? 'bg-gray-100' : 'bg-amber-50'}`}>
                    <Folder className={`w-5 h-5 ${isOutOfStock ? 'text-gray-300' : 'text-amber-400'}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{group.name}</p>
                    <p className={`text-xs ${isOutOfStock ? 'text-red-400' : 'text-gray-400'}`}>
                      {isOutOfStock ? 'אזל מהמלאי' : `מלאי: ${totalStock}`}
                    </p>
                  </div>
                </div>
                {group.has_uniform_price && (
                  <span className={`font-bold text-sm ${isOutOfStock ? 'text-gray-400' : 'text-amber-600'}`}>
                    ₪{group.uniform_sell_price}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium text-sm transition-colors"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}