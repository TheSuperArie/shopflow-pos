import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Mail, MapPin } from 'lucide-react';

export default function BranchList({ branches, isLoading, onSelect }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-gray-400">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין סניפים עדיין</p>
          <p className="text-sm mt-1">לחץ על "סניף חדש" כדי להתחיל</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {branches.map(branch => (
        <Card
          key={branch.id}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onSelect(branch)}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{branch.name}</p>
                <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                  <Mail className="w-3.5 h-3.5" />
                  {branch.station_email}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={branch.is_active ? 'default' : 'secondary'}>
                {branch.is_active ? 'פעיל' : 'לא פעיל'}
              </Badge>
              <ChevronLeft className="w-5 h-5 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}