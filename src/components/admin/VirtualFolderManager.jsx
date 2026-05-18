import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderPlus, Trash2, X, FolderOpen } from 'lucide-react';

/**
 * VirtualFolderManager — ניהול תיקיות וירטואליות בקופה
 * folders: [{id, name, group_ids[]}]
 * allGroups: כל קבוצות המוצר
 * onChange(folders): callback כשמשתנה
 */
export default function VirtualFolderManager({ folders = [], allGroups = [], onChange }) {
  const [newFolderName, setNewFolderName] = useState('');

  const addFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const newFolder = { id: Date.now().toString(), name, group_ids: [] };
    onChange([...folders, newFolder]);
    setNewFolderName('');
  };

  const removeFolder = (folderId) => {
    onChange(folders.filter(f => f.id !== folderId));
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FolderOpen className="w-5 h-5 text-amber-500" />
          תיקיות וירטואליות בקופה
        </CardTitle>
        <p className="text-xs text-gray-400">קיבוץ ויזואלי של מוצרים לנוחות הקופאי — ללא שינוי במסד הנתונים</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new folder */}
        <div className="flex gap-2">
          <Input
            placeholder="שם תיקייה חדשה (למשל: אמריקאית)"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addFolder()}
            className="flex-1"
          />
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-amber-500">📁</span>
                <span className="font-semibold text-gray-800">{folder.name}</span>
                <span className="text-xs text-gray-400">({folder.group_ids.length} מוצרים)</span>
              </div>
              <button onClick={() => removeFolder(folder.id)} className="text-red-400 hover:text-red-600 p-1">
                <Trash2 className="w-4 h-4" />
              </button>
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
              <p className="text-xs text-gray-500 font-medium">הוסף מוצרים לתיקייה:</p>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {allGroups
                  .filter(g => !folder.group_ids.includes(g.id))
                  .map(g => (
                    <button
                      key={g.id}
                      onClick={() => toggleGroup(folder.id, g.id)}
                      className="text-xs bg-gray-100 hover:bg-blue-50 hover:border-blue-300 border border-gray-200 rounded-full px-3 py-1 text-gray-700 transition-colors"
                    >
                      + {g.name}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}