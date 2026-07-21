const VendorFinanceWallet = require('../models/VendorFinanceWallet');
const VendorFinanceTransaction = require('../models/VendorFinanceTransaction');

/**
 * Credit / debit vendor finance wallet and write a tagged ledger row.
 * Always attach serviceCategoryCode when known so Finance UI can break down by service.
 */
async function postVendorFinanceLedger({
  vendorId,
  type = 'credit',
  amount,
  description = '',
  projectCode = '',
  referenceCode = '',
  status = 'completed',
  serviceCategoryCode = '',
  serviceCategoryName = '',
  subCatCode = '',
  subCategoryName = '',
  source = 'system',
  walletInc = null
}) {
  const amt = Math.max(0, Number(amount) || 0);
  if (!vendorId || amt <= 0) {
    return { skipped: true, reason: 'invalid_amount_or_vendor' };
  }

  const code = serviceCategoryCode ? String(serviceCategoryCode).toUpperCase() : '';
  const inc = walletInc || (
    type === 'credit' || type === 'escrow_release' || type === 'refund'
      ? { availableBalance: amt, totalEarnings: amt }
      : type === 'escrow_hold'
        ? { escrowBalance: amt }
        : type === 'withdrawal'
          ? { availableBalance: -amt, processingWithdrawal: amt, totalWithdrawn: 0 }
          : type === 'commission'
            ? { availableBalance: -amt, commissionDeducted: amt }
            : { availableBalance: -amt }
  );

  const wallet = await VendorFinanceWallet.findOneAndUpdate(
    { vendorId },
    { $inc: inc, $setOnInsert: { vendorId } },
    { new: true, upsert: true }
  );

  const txn = await new VendorFinanceTransaction({
    vendorId,
    type,
    amount: amt,
    description,
    projectCode: projectCode || '',
    referenceCode: referenceCode || '',
    balanceAfter: wallet.availableBalance,
    status,
    serviceCategoryCode: code,
    serviceCategoryName: serviceCategoryName || '',
    subCatCode: subCatCode ? String(subCatCode).toUpperCase() : '',
    subCategoryName: subCategoryName || '',
    source,
    occurredAt: new Date()
  }).save();

  return { wallet, transaction: txn };
}

module.exports = { postVendorFinanceLedger };
