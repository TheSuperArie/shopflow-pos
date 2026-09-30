import React from 'react';
import { useInventorySync } from '@/hooks/useInventorySync';
import InventoryManager from '@/components/inventory/InventoryManager';

/** Branch / store inventory — replaces the old "עדכון מלאי" and "מלאי חסר" pages (kept unrouted). */
export default function BranchInventoryPage({ defaultTab = 'stock' }) {
  useInventorySync();
  return <InventoryManager key={defaultTab} defaultTab={defaultTab} title="מלאי" />;
}
