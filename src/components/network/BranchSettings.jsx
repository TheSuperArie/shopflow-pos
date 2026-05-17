import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowRight, Eye, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CatalogVisibility from './CatalogVisibility';
import BranchInventory from './BranchInventory';

export default function BranchSettings({ branch, tenantEmail, onBack }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowRight className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{branch.name}</h1>
          <p className="text-sm text-gray-500">{branch.station_email}</p>
        </div>
      </div>

      <Tabs defaultValue="catalog" dir="rtl">
        <TabsList className="grid grid-cols-2 w-full max-w-sm">
          <TabsTrigger value="catalog" className="gap-2">
            <Eye className="w-4 h-4" />
            נראות קטלוג
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-2">
            <Package className="w-4 h-4" />
            מלאי סניף
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4">
          <CatalogVisibility branch={branch} tenantEmail={tenantEmail} />
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          <BranchInventory branch={branch} tenantEmail={tenantEmail} />
        </TabsContent>
      </Tabs>
    </div>
  );
}