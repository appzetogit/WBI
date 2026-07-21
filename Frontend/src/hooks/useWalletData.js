import { useQuery } from '@tanstack/react-query';
import engineerWalletService from '../services/engineerWalletService';

export const useWalletData = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['engineer-wallet'],
    
    queryFn: async () => {
      try {
        const [walletRes, ctxRes, payRes, wdRes, bankRes] = await Promise.all([
          engineerWalletService.getWallet(),
          engineerWalletService.getAssignedServices(),
          engineerWalletService.getPayments(),
          engineerWalletService.getWithdrawals(),
          engineerWalletService.getBankDetails()
        ]);

        const w = walletRes.data || {};
        const mapTxnToPayment = (t) => {
          const amt = Math.abs(Number(t.amount) || 0);
          let status = 'Pending';
          if (t.type === 'earnings_credit' && t.status === 'completed') status = 'Released';
          else if (t.type === 'withdrawal' && t.status === 'pending') status = 'Under Review';
          else if (t.type === 'withdrawal' && t.status === 'completed') status = 'Withdrawn';
          else if (t.status === 'completed') status = 'Released';
          return {
            _id: t._id,
            id: t._id,
            amount: amt,
            jobTitle: t.description || 'Earnings',
            subService: t.metadata?.source === 'vendor_ops' ? 'Vendor job payout' : 'Service earnings',
            paymentType: t.type === 'earnings_credit' ? 'Wallet credit' : t.type,
            status,
            createdAt: t.createdAt,
            balanceAfter: t.balanceAfter
          };
        };

        return {
          wallet: {
            availableBalance: w.availableBalance ?? w.balance ?? 0,
            pendingWithdrawal: w.pendingWithdrawal ?? w.pendingBalance ?? 0,
            pendingBalance: w.pendingWithdrawal ?? w.pendingBalance ?? 0,
            underReviewBalance: w.pendingWithdrawal ?? w.pendingBalance ?? 0,
            totalEarned: w.totalBalance ?? w.totalEarnings ?? 0,
            withdrawnBalance: w.withdrawnAmount ?? 0
          },
          context: ctxRes.data || null,
          payments: Array.isArray(payRes.data) ? payRes.data.map(mapTxnToPayment) : [],
          withdrawals: Array.isArray(wdRes.data) ? wdRes.data : [],
          bankDetails: bankRes.data || null
        };
      } catch (err) {
        console.error('Wallet API error:', {
          message: err.message,
          status: err.response?.status,
        });
        throw err;
      }
    },
    
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30 * 1000,
  });
  
  return {
    walletData: data || {
      wallet: { availableBalance: 0, pendingBalance: 0, underReviewBalance: 0, totalEarned: 0, withdrawnBalance: 0 },
      context: null,
      payments: [],
      withdrawals: []
    },
    isLoading,
    error: error?.message || null,
    refetch,
  };
};
