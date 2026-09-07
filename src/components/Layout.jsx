import React from 'react';
import { Outlet } from 'react-router-dom';
import BatchSummaryBar from '@/components/shipment/BatchSummaryBar';
import NetworkMessageNotifier from '@/components/notifications/NetworkMessageNotifier';

export default function Layout() {
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <style>{`
        :root {
          --primary: 220 14% 20%;
          --primary-foreground: 0 0% 98%;
          --accent: 38 80% 55%;
          --accent-foreground: 0 0% 10%;
        }
      `}</style>
      <NetworkMessageNotifier />
      <Outlet />
      <BatchSummaryBar />
    </div>
  );
}