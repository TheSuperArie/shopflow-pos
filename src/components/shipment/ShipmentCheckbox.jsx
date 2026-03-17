import React from 'react';
import { useShipmentBatch } from '@/lib/ShipmentBatchContext';
import { Checkbox } from '@/components/ui/checkbox';

export default function ShipmentCheckbox({ variant, group }) {
  const { isItemSelected, toggleItem } = useShipmentBatch();
  const isSelected = isItemSelected(variant.id);

  const handleToggle = (e) => {
    e.stopPropagation();
    toggleItem(variant.id, {
      ...variant,
      group_id: group.id,
      group_name: group.name,
    });
  };

  return (
    <div onClick={handleToggle} className="cursor-pointer">
      <Checkbox
        checked={isSelected}
        onChange={handleToggle}
        className="w-5 h-5"
      />
    </div>
  );
}