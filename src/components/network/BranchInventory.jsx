import React from 'react';
import InventoryManager from '@/components/inventory/InventoryManager';

/**
 * A branch's stock from the network side — the same inventory screen the branch uses,
 * reading and writing the stock its POS sells from.
 */
export default function BranchInventory({ branch }) {
  return <InventoryManager key={branch.id} branch={branch} title={null} />;
}
