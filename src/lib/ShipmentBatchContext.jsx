import React, { createContext, useContext, useState, useEffect } from 'react';

const ShipmentBatchContext = createContext();

export function ShipmentBatchProvider({ children }) {
  const [selectedItems, setSelectedItems] = useState([]);
  const [shipmentDetails, setShipmentDetails] = useState({
    supplier_id: '',
    supplier_name: '',
    invoice_number: '',
    order_id: '',
    quantity: 0,
    notes: '',
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('shipmentBatch', JSON.stringify({
      selectedItems,
      shipmentDetails,
    }));
  }, [selectedItems, shipmentDetails]);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('shipmentBatch');
    if (saved) {
      const { selectedItems: si, shipmentDetails: sd } = JSON.parse(saved);
      if (si?.length) setSelectedItems(si);
      if (sd && Object.keys(sd).length > 0) setShipmentDetails(sd);
    }
  }, []);

  const toggleItem = (variantId, variant) => {
    setSelectedItems(prev => {
      const exists = prev.find(item => item.id === variantId);
      if (exists) {
        return prev.filter(item => item.id !== variantId);
      } else {
        return [...prev, { id: variantId, ...variant }];
      }
    });
  };

  const removeItem = (variantId) => {
    setSelectedItems(prev => prev.filter(item => item.id !== variantId));
  };

  const isItemSelected = (variantId) => {
    return selectedItems.some(item => item.id === variantId);
  };

  const clearBatch = () => {
    setSelectedItems([]);
    setShipmentDetails({
      supplier_id: '',
      supplier_name: '',
      invoice_number: '',
      order_id: '',
      quantity: 0,
      notes: '',
    });
    localStorage.removeItem('shipmentBatch');
  };

  const updateShipmentDetails = (details) => {
    setShipmentDetails(prev => ({ ...prev, ...details }));
  };

  return (
    <ShipmentBatchContext.Provider value={{
      selectedItems,
      toggleItem,
      removeItem,
      isItemSelected,
      clearBatch,
      shipmentDetails,
      updateShipmentDetails,
    }}>
      {children}
    </ShipmentBatchContext.Provider>
  );
}

export function useShipmentBatch() {
  const context = useContext(ShipmentBatchContext);
  if (!context) {
    throw new Error('useShipmentBatch must be used within ShipmentBatchProvider');
  }
  return context;
}