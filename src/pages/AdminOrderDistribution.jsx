import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePosCatalogQuery } from '@/hooks/usePosCatalog';
import OrderDistributionView, { localDay } from '@/components/distribution/OrderDistributionView';

/**
 * Order distribution for a single store (branch admin). Stores that belong to a network don't see
 * this page in their menu — for them it lives in the network dashboard, over all branches.
 */
export default function AdminOrderDistribution() {
  const user = useCurrentUser();

  // Default range: last 30 days
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return localDay(d);
  });
  const [endDate, setEndDate] = useState(() => localDay(new Date()));

  const { data: sales = [], isLoading: salesLoading } = useQuery({
    queryKey: ['order-dist-sales', user?.email],
    queryFn: () => base44.entities.Sale.filter({ seller_email: user.email }, '-created_date', 5000),
    enabled: !!user?.email,
    staleTime: 60000,
  });

  // Own catalog + products the network master added for this branch (same scope as the POS)
  const { data: groups = [] } = usePosCatalogQuery('product-groups-all', 'ProductGroup', { sort: '-created_date', limit: 5000, staleTime: 60000 });
  const { data: variants = [] } = usePosCatalogQuery('product-variants-all', 'ProductVariant', { sort: '-created_date', limit: 5000, staleTime: 60000 });

  return (
    <OrderDistributionView
      sales={sales}
      salesLoading={salesLoading}
      groups={groups}
      variants={variants}
      startDate={startDate}
      endDate={endDate}
      setStartDate={setStartDate}
      setEndDate={setEndDate}
    />
  );
}
