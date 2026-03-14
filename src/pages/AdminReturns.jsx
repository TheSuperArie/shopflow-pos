import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { RotateCcw, Loader2, CheckCircle, XCircle, Clock, Package, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import ReturnFormModal from '@/components/returns/ReturnFormModal';
import ReturnDetailsModal from '@/components/returns/ReturnDetailsModal';

export default function AdminReturns() {
  const [showForm, setShowForm] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['returns'],
    queryFn: () => base44.entities.Return.list('-created_date'),
  });

  const { data: credits = [] } = useQuery({
    queryKey: ['credits'],
    queryFn: () => base44.entities.Credit.list('-created_date'),
  });

  const approveReturnMutation = useMutation({
    mutationFn: async ({ returnId, returnData }) => {
      // Update return status
      await base44.entities.Return.update(returnId, {
        status: 'אושר',
        approval_date: format(new Date(), 'yyyy-MM-dd'),
        processed_by: 'admin',
      });

      // Update inventory
      const variants = await base44.entities.ProductVariant.list();
      for (const item of returnData.items) {
        const variant = variants.find(v => v.id === item.variant_id);
        if (variant) {
          await base44.entities.ProductVariant.update(variant.id, {
            stock: (variant.stock || 0) + item.quantity,
          });
        }
      }

      // Create credit if refund method is זיכוי
      if (returnData.refund_method === 'זיכוי') {
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 6);
        
        await base44.entities.Credit.create({
          customer_name: returnData.customer_name,
          customer_email: returnData.customer_email,
          customer_phone: returnData.customer_phone,
          amount: returnData.total_amount,
          balance: returnData.total_amount,
          return_id: returnId,
          expiry_date: format(expiryDate, 'yyyy-MM-dd'),
          status: 'פעיל',
        });
      }

      // Create expense record
      await base44.entities.Expense.create({
        description: `החזרה - ${returnData.customer_name || 'לקוח'}`,
        amount: returnData.total_amount,
        category: 'אחר',
        custom_category: 'החזרות מוצרים',
        date: format(new Date(), 'yyyy-MM-dd'),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({ 
        title: '✅ ההחזרה אושרה',
        description: 'המלאי עודכן והזיכוי נוצר',
        duration: 3000,
      });
    },
  });

  const rejectReturnMutation = useMutation({
    mutationFn: async (returnId) => {
      await base44.entities.Return.update(returnId, {
        status: 'נדחה',
        processed_by: 'admin',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      toast({ 
        title: 'ההחזרה נדחתה',
        duration: 2000,
      });
    },
  });

  const filteredReturns = filterStatus === 'all' 
    ? returns 
    : returns.filter(r => r.status === filterStatus);

  const approvedCount = returns.filter(r => r.status === 'אושר').length;
  const totalRefundAmount = returns
    .filter(r => r.status === 'אושר')
    .reduce((sum, r) => sum + (r.total_amount || 0), 0);

  const activeCredits = credits.filter(c => c.status === 'פעיל');
  const totalCreditBalance = activeCredits.reduce((sum, c) => sum + (c.balance || 0), 0);

  const getStatusBadge = (status) => {
    const styles = {
      'ממתין': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'אושר': 'bg-green-100 text-green-800 border-green-300',
      'נדחה': 'bg-red-100 text-red-800 border-red-300',
      'הושלם': 'bg-blue-100 text-blue-800 border-blue-300',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ממתין': return <Clock className="w-4 h-4" />;
      case 'אושר': return <CheckCircle className="w-4 h-4" />;
      case 'נדחה': return <XCircle className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">ניהול החזרות</h1>
        <Button onClick={() => setShowForm(true)} className="gap-2 bg-purple-600 hover:bg-purple-700">
          <RotateCcw className="w-4 h-4" /> החזרה חדשה
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500">סה"כ החזרות</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{approvedCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500">סכום החזרות</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">₪{totalRefundAmount.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500">יתרת זיכויים</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">₪{totalCreditBalance.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'אושר', 'נדחה'].map(status => (
          <Button
            key={status}
            onClick={() => setFilterStatus(status)}
            variant={filterStatus === status ? 'default' : 'outline'}
            size="sm"
          >
            {status === 'all' ? 'הכל' : status}
          </Button>
        ))}
      </div>

      {/* Returns List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReturns.map(returnItem => (
            <Card key={returnItem.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`${getStatusBadge(returnItem.status)} border`}>
                        {getStatusIcon(returnItem.status)}
                        <span className="mr-1">{returnItem.status}</span>
                      </Badge>
                      {returnItem.refund_method && (
                        <Badge variant="outline">{returnItem.refund_method}</Badge>
                      )}
                    </div>
                    <p className="font-semibold text-gray-800">
                      {returnItem.customer_name || 'לקוח'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {returnItem.items?.length || 0} פריטים • ₪{returnItem.total_amount?.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {returnItem.created_date && format(new Date(returnItem.created_date), 'dd/MM/yyyy HH:mm')}
                    </p>
                    {returnItem.reason && (
                      <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-2 rounded">
                        <strong>סיבה:</strong> {returnItem.reason}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedReturn(returnItem)}
                    >
                      פרטים
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredReturns.length === 0 && (
            <p className="text-center text-gray-400 py-12">אין החזרות להצגה</p>
          )}
        </div>
      )}

      <ReturnFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
      />

      <ReturnDetailsModal
        open={!!selectedReturn}
        returnData={selectedReturn}
        onClose={() => setSelectedReturn(null)}
      />
    </div>
  );
}