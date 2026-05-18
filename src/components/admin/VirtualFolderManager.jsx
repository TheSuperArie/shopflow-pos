import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderPlus, Trash2, X, FolderOpen, Save } from 'lucide-react';

/**
 * VirtualFolderManager — ניהול תיקיות וירטואליות בקופה
 * folders: [{id, name, category_id?, group_ids[]}]
 * allGroups: כל קבוצות המוצר
 * allCategories: כל הקטגוריות
 * onChange(folders): callback כשמשתנה
 */
export default function VirtualFolderManager({ folders = [], allGroups = [], allCategories = [], onChange, onSave, isSaving }) {
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderCategoryId, setNewFolderCategoryId] = useState('');

  const addFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const newFolder = {
      id: Date.now().toString(),
      name,
      category_id: newFolderCategoryId || null,
      group_ids: [],
    };
    onChange([...folders, newFolder]);
    setNewFolderName('');
    setNewFolderCategoryId('');
  };

  const removeFolder = (folderId) => {
    onChange(folders.filter(f => f.id !== folderId));
  };

  const updateFolderCategory = (folderId, categoryId) => {
    onChange(folders.map(f =>
      f.id === folderId ? { ...f, category_id: categoryId || null } : f
    ));
  };

  const toggleGroup = (folderId, groupId) => {
    onChange(folders.map(f => {
      if (f.id !== folderId) return f;
      const already = f.group_ids.includes(groupId);
      return {
        ...f,
        group_ids: already
          ? f.group_ids.filter(id => id !== groupId)
          : [...f.group_ids, groupId],
      };
    }));
  };

  // Filter available groups: if folder has a category, show only groups in that category
  const getAvailableGroups = (folder) => {
    const base = folder.category_id
      ? allGroups.filter(g => g.category_id === folder.category_id)
      : allGroups;
    return base.filter(g => !folder.group_ids.includes(g.id));
  };

  const getCategoryName = (categoryId) => {
    const cat = allCategories.find(c => c.id === categoryId);
    return cat ? cat.name : null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FolderOpen className="w-5 h-5 text-amber-500" />
          תיקיות וירטואליות בקופה
        </CardTitle>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">קיבוץ ויזואלי של מוצרים לנוחות הקופאי — ניתן לשייך לקטגוריה ספציפית</p>
          {onSave && (
            <Button onClick={onSave} disabled={isSaving} className="bg-amber-500 hover:bg-amber-600 gap-2 h-8 text-xs">
              {isSaving ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3 h-3" />}
              שמור
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new folder */}
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="שם תיקייה חדשה (למשל: אמריקאית)"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addFolder()}
            className="flex-1 min-w-40"
          />
          <Select value={newFolderCategoryId || '__all__'} onValueChange={v => setNewFolderCategoryId(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="כל הקטגוריות" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">כל הקטגוריות</SelectItem>
              {allCategories.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addFolder} className="bg-amber-500 hover:bg-amber-600 gap-2 shrink-0">
            <FolderPlus className="w-4 h-4" />
            הוסף
          </Button>
        </div>

        {folders.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">אין תיקיות וירטואליות — צור תיקייה ראשונה</p>
        )}

        {folders.map(folder => (
          <div key={folder.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-amber-500">📁</span>
                <span className="font-semibold text-gray-800">{folder.name}</span>
                <span className="text-xs text-gray-400">({folder.group_ids.length} מוצרים)</span>
                {folder.category_id && (
                  <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                    📂 {getCategoryName(folder.category_id) || 'קטגוריה'}
                  </span>
                )}
              </div>
              <button onClick={() => removeFolder(folder.id)} className="text-red-400 hover:text-red-600 p-1 shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Category assignment */}
            <div>
              <p className="text-xs text-gray-500 font-medium mb-1">קטגוריה בקופה (אופציונלי):</p>
              <Select
                value={folder.category_id || '__all__'}
                onValueChange={v => updateFolderCategory(folder.id, v === '__all__' ? '' : v)}
              >
                <SelectTrigger className="h-8 text-xs w-52">
                  <SelectValue placeholder="כל הקטגוריות" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">ללא שיוך — מוצג בכל קטגוריה</SelectItem>
                  {allCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selected groups */}
            {folder.group_ids.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {folder.group_ids.map(gid => {
                  const g = allGroups.find(gr => gr.id === gid);
                  if (!g) return null;
                  return (
                    <span key={gid} className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-full px-3 py-1">
                      {g.name}
                      <button onClick={() => toggleGroup(folder.id, gid)} className="ml-1 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Available groups to add */}
            <div className="space-y-1">
              <p className="text-xs text-gray-500 font-medium">הוסף מוצרים לתיקייה{folder.category_id ? ` (מסונן לפי קטגוריה)` : ''}:</p>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {getAvailableGroups(folder).map(g => (
                  <button
                    key={g.id}
                    onClick={() => toggleGroup(folder.id, g.id)}
                    className="text-xs bg-gray-100 hover:bg-blue-50 hover:border-blue-300 border border-gray-200 rounded-full px-3 py-1 text-gray-700 transition-colors"
                  >
                    + {g.name}
                  </button>
                ))}
                {getAvailableGroups(folder).length === 0 && (
                  <p className="text-xs text-gray-400">אין מוצרים זמינים להוספה</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}