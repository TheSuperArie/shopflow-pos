import React from 'react';
import { Outlet } from 'react-router-dom';

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
      <Outlet />
    </div>
  );
}