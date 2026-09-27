import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle } from 'lucide-react';

const fmt = (n) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

function Banner({ label, value, sub, tone, testId, toggle, onExpensesClick }) {
  return (
    <Card className={tone}>
      <CardContent className="p-4" data-testid={testId}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium opacity-80">{label}</p>
          {toggle && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Switch checked={toggle.checked} onCheckedChange={toggle.onChange} id={toggle.id} className="scale-75" />
              <label htmlFor={toggle.id} className="text-[10px] opacity-80 cursor-pointer leading-tight">כלול הוצאות</label>
            </div>
          )}
        </div>
        <p className="text-2xl font-bold mt-1">{fmt(value)}</p>
        {sub && (
          onExpensesClick ? (
            <button
              onClick={onExpensesClick}
              className="text-[11px] opacity-70 mt-1 underline underline-offset-2 hover:opacity-100 transition-opacity"
            >
              {sub}
            </button>
          ) : (
            <p className="text-[11px] opacity-70 mt-1">{sub}</p>
          )
        )}
      </CardContent>
    </Card>
  );
}

export default function ProfitSplitBanners({ split, onShowExpenses, extra }) {
  // Each banner has its own toggle — the two sides are separate businesses
  const [impWithExp, setImpWithExp] = useState(false);
  const [prvWithExp, setPrvWithExp] = useState(false);
  const imp = impWithExp ? split.importer - split.importerExp : split.importer;
  const prv = prvWithExp ? split.priv - split.privateExp : split.priv;
  return (
    <div className="space-y-2">
      <div className={`grid grid-cols-1 gap-4 ${extra ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <Banner testId="banner-total" label="סך מכירות" value={split.total} tone="border-blue-100 bg-blue-50 text-blue-800" />
        <Banner testId="banner-importer" label="רווח המייבא" value={imp} tone="border-amber-100 bg-amber-50 text-amber-800"
          toggle={{ checked: impWithExp, onChange: setImpWithExp, id: 'incl-exp-imp' }}
          onExpensesClick={onShowExpenses ? () => onShowExpenses('importer') : undefined}
          sub={`הוצאות: ${fmt(split.importerExp)}${impWithExp ? ' (קוזזו)' : ''}`} />
        <Banner testId="banner-private" label="רווח פרטי" value={prv} tone="border-green-100 bg-green-50 text-green-800"
          toggle={{ checked: prvWithExp, onChange: setPrvWithExp, id: 'incl-exp-prv' }}
          onExpensesClick={onShowExpenses ? () => onShowExpenses('private') : undefined}
          sub={`הוצאות: ${fmt(split.privateExp)}${prvWithExp ? ' (קוזזו)' : ''}`} />
        {extra}
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