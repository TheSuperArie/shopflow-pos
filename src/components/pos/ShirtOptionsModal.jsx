import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

const SIZES = ['12', '12.5', '13', '13.5', '14', '14.5', '15', '15.5', '16', '16.5', '17', '17.5', '18'];
const COLLARS = ['אמריקאי', 'כפתורים', 'רגיל'];
const CUTS = ['צרה', 'רחבה'];

export default function ShirtOptionsModal({ open, product, onConfirm, onClose }) {
  const [size, setSize] = useState('');
  const [collar, setCollar] = useState('');
  const [cut, setCut] = useState('');

  const handleConfirm = () => {
    if (!size || !collar || !cut) return;
    onConfirm({ shirt_size: size, shirt_collar: collar, shirt_cut: cut });
    setSize('');
    setCollar('');
    setCut('');
  };

  const OptionButton = ({ value, selected, onClick }) => (
    <button
      onClick={() => onClick(value)}
      className={`px-4 py-3 rounded-xl border-2 font-medium text-sm transition-all active:scale-95 ${
        selected === value
          ? 'border-amber-500 bg-amber-50 text-amber-700'
          : 'border-gray-200 bg-white text-gray-600 hover:border-amber-300'
      }`}
    >
      {value}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl">{product?.name} — בחירת פרטים</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <p className="font-semibold text-gray-700 mb-2">מידה</p>
            <div className="flex flex-wrap gap-2">
              {SIZES.map(s => <OptionButton key={s} value={s} selected={size} onClick={setSize} />)}
            </div>
          </div>

          <div>
            <p className="font-semibold text-gray-700 mb-2">צווארון</p>
            <div className="flex flex-wrap gap-2">
              {COLLARS.map(c => <OptionButton key={c} value={c} selected={collar} onClick={setCollar} />)}
            </div>
          </div>

          <div>
            <p className="font-semibold text-gray-700 mb-2">גזרה</p>
            <div className="flex flex-wrap gap-2">
              {CUTS.map(c => <OptionButton key={c} value={c} selected={cut} onClick={setCut} />)}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleConfirm}
            disabled={!size || !collar || !cut}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white h-12 text-lg rounded-xl"
          >
            <Check className="w-5 h-5 ml-2" />
            הוסף לעגלה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}