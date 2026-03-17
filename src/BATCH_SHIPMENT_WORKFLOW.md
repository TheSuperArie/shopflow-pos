# Batch Shipment Entry Workflow

## Overview
Persistent cart-style batch shipping system for bulk stock updates. Select multiple variants, set global supplier & quantity, then execute bulk updates.

## Architecture

### 1. **ShipmentBatchContext** (`lib/ShipmentBatchContext.jsx`)
- Central state management for selected items
- Persistent storage via localStorage
- Survives page navigation and filter changes
- Methods:
  - `toggleItem(variantId, variant)` — Add/remove from batch
  - `removeItem(variantId)` — Remove specific item
  - `isItemSelected(variantId)` — Check selection status
  - `clearBatch()` — Reset everything
  - `updateShipmentDetails(details)` — Save supplier/invoice details

### 2. **BatchSummaryBar** (`components/shipment/BatchSummaryBar.jsx`)
- **Floating bar** at bottom of screen
- Only shows when items selected
- Displays count of selected items
- "Cancel" button to clear selection
- "Proceed to Shipment Details" link to `/BatchShipmentEntry`

### 3. **ShipmentCheckbox** (`components/shipment/ShipmentCheckbox.jsx`)
- Reusable checkbox component for variant selection
- Integrates with ShipmentBatchContext
- Used on product/variant cards throughout the app

### 4. **VariantItemWithCheckbox** (`components/shipment/VariantItemWithCheckbox.jsx`)
- Display component for variants with integrated checkbox
- Shows variant details (dimensions, stock, group name)
- Clickable toggle for selection

### 5. **BatchShipmentEntry Page** (`pages/BatchShipmentEntry.jsx`)
**Dedicated workflow screen with:**
- **Selected Items List** — View all picked variants with removal option
- **Global Form:**
  - Supplier name (autocomplete from existing suppliers)
  - Invoice/Shipment number
  - Order ID link
  - Quantity field (applied to ALL selected items)
  - Notes
- **Summary Card** — Shows:
  - Number of items
  - Quantity per item
  - **Total units** (items × quantity)
  - Supplier name
- **Confirmation Dialog** — Final review before execution
- **Batch Execution:**
  - Updates stock for each variant: `stock + global_quantity`
  - Creates StockUpdate records for tracking
  - Clears batch selection on success
  - Redirects back to AdminStock

## User Flow

### Selection (Multiple Pages)
1. Browse AdminStock, AdminLowStock, AdminOrders, etc.
2. Click checkbox on any variant to add to batch
3. **Selection persists** even when navigating between pages/categories
4. **BatchSummaryBar** shows count at bottom

### Batch Entry
1. Click "Proceed to Shipment Details" in bar
2. Navigate to `/BatchShipmentEntry`
3. View all selected items (can remove individually)
4. Enter supplier name (autocomplete)
5. Set quantity (e.g., 40 units → applies to all items)
6. Add invoice number, order ID, notes (optional)
7. Review summary
8. Confirm → Stock updates execute

### Execution
- All variants get: `stock + quantity`
- StockUpdate records created for each item
- Supplier debt automatically tracked
- Batch cleared, user returns to AdminStock

## Integration Points

### AdminStock (Already Integrated)
- Low stock items now show checkboxes
- Variants in modal also support batch selection

### AdminLowStock, AdminOrders, etc. (Ready to Extend)
Simply add `<ShipmentCheckbox>` or `<VariantItemWithCheckbox>` components to variant displays.

## Key Features

✅ **Persistent Across Navigation** — localStorage maintains selection  
✅ **Floating UI** — Always accessible summary bar  
✅ **Bulk Operations** — Single quantity applies to all items  
✅ **Real-time Sync** — Supplier management, stock tracking  
✅ **Confirmation Workflow** — Dialog prevents accidents  
✅ **Graceful Empty State** — Redirects if batch is empty  

## Next Steps (Optional Extensions)

- Add batch to specific order (instead of general "order_id")
- Pre-fill supplier from recent shipments
- Batch export/print shipping labels
- Undo/restore cleared batches
- Schedule batch delivery (future date support)