import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CatalogVisibility from '../CatalogVisibility';
import BranchInventory from '../BranchInventory';
import BranchDashboard from '@/components/dashboard/BranchDashboard';

export default function BranchCommandCenter({ branch, tenantEmail, onBack }) {
  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowRight className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{branch.name}</h1>
          <p className="text-sm text-gray-500">{branch.station_email}</p>
        </div>
        <Badge variant={branch.is_active ? 'default' : 'secondary'}>
          {branch.is_active ? 'פעיל' : 'לא פעיל'}
        </Badge>
      </div>

      <Tabs defaultValue="dashboard" dir="rtl">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="dashboard">לוח בקרה</TabsTrigger>
          <TabsTrigger value="catalog">נראות קטלוג</TabsTrigger>
          <TabsTrigger value="inventory">מלאי</TabsTrigger>
        </TabsList>

        {/* ── DASHBOARD TAB — exact same component as local branch admin ── */}
        <TabsContent value="dashboard" className="mt-4">
          <BranchDashboard branchId={branch.id} tenantEmail={tenantEmail} />
        </TabsContent>

        {/* ── CATALOG TAB — master-only ── */}
        <TabsContent value="catalog" className="mt-4">
          <CatalogVisibility branch={branch} tenantEmail={tenantEmail} />
        </TabsContent>

        {/* ── INVENTORY TAB ── */}
        <TabsContent value="inventory" className="mt-4">
          <BranchInventory branch={branch} tenantEmail={tenantEmail} />
        </TabsContent>
      </Tabs>
    </div>
  );
}