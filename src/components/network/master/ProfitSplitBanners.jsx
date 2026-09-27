import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle } from 'lucide-react';

const fmt = (n) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

function Banner({ label, value, sub, tone, testId, toggle, toggle2, onExpensesClick }) {
  return (
    <Card className={tone}>
      <CardContent className="p-4" data-testid={testId}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium opacity-80">{label}</p>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {[toggle, toggle2].filter(Boolean).map(t => (
              <div key={t.id} className="flex items-center gap-1.5">
                <Switch checked={t.checked} onCheckedChange={t.onChange} id={t.id} className="scale-75" />
                <label htmlFor={t.id} className="text-[10px] opacity-80 cursor-pointer leading-tight">{t.label || 'כלול הוצאות'}</label>
              </div>
            ))}
          </div>
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

export default function ProfitSplitBanners({ split, onShowExpenses, extra, withdrawn = 0 }) {
  // Each banner has its own toggle — the two sides are separate businesses
  const [impWithExp, setImpWithExp] = useState(false);
  const [prvWithExp, setPrvWithExp] = useState(false);
  const [prvWithWd, setPrvWithWd] = useState(false);
  const imp = impWithExp ? split.importer - split.importerExp : split.importer;
  const prv = split.priv - (prvWithExp ? split.privateExp : 0) - (prvWithWd ? withdrawn : 0);
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
          toggle2={withdrawn > 0 ? { checked: prvWithWd, onChange: setPrvWithWd, id: 'incl-wd-prv', label: 'כלול משיכות' } : null}
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