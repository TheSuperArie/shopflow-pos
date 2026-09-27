import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle } from 'lucide-react';

const fmt = (n) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

function Banner({ label, value, sub, tone, testId }) {
  return (
    <Card className={tone}>
      <CardContent className="p-4" data-testid={testId}>
        <p className="text-xs font-medium opacity-80">{label}</p>
        <p className="text-2xl font-bold mt-1">{fmt(value)}</p>
        {sub && <p className="text-[11px] opacity-70 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function ProfitSplitBanners({ split }) {
  const [withExp, setWithExp] = useState(false);
  const imp = withExp ? split.importer - split.importerExp : split.importer;
  const prv = withExp ? split.priv - split.privateExp : split.priv;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Switch checked={withExp} onCheckedChange={setWithExp} id="incl-exp" />
        <label htmlFor="incl-exp">כלול הוצאות ברווח</label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Banner testId="banner-total" label="סך מכירות" value={split.total} tone="border-blue-100 bg-blue-50 text-blue-800" />
        <Banner testId="banner-importer" label="רווח המייבא" value={imp} tone="border-amber-100 bg-amber-50 text-amber-800"
          sub={`הוצאות: ${fmt(split.importerExp)}${withExp ? ' (קוזזו)' : ''}`} />
        <Banner testId="banner-private" label="רווח פרטי" value={prv} tone="border-green-100 bg-green-50 text-green-800"
          sub={`הוצאות: ${fmt(split.privateExp)}${withExp ? ' (קוזזו)' : ''}`} />
      </div>
      {split.missingCost > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-3 py-1.5" data-testid="missing-cost">
          <AlertTriangle className="w-3.5 h-3.5" />
          {split.missingCost} מכירות בסניפי "המלאי שלנו" נרשמו בלי מחיר עלות בטווח הנבחר — הרווח הפרטי עשוי להיראות נמוך מהאמת
        </p>
      )}
    </div>
  );
}