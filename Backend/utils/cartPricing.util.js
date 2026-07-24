/**
 * Server-side cart pricing — never trust client-supplied amounts.
 */

function resolveServiceUnitPrice(service) {
  if (!service) return null;
  const discount = service.discountPrice;
  const base = service.basePrice;
  if (typeof discount === 'number' && discount >= 0) return discount;
  if (typeof base === 'number' && base >= 0) return base;
  return null;
}

function resolveLineUnitPrice({ service, card, clientUnitPrice, clientPrice }) {
  const catalog = resolveServiceUnitPrice(service);
  if (catalog !== null) return catalog;
  if (card && typeof card.price === 'number' && card.price >= 0) return card.price;
  if (typeof clientUnitPrice === 'number' && clientUnitPrice >= 0) return clientUnitPrice;
  if (typeof clientPrice === 'number' && clientPrice >= 0) return clientPrice;
  return 0;
}

function lineTotal(unitPrice, qty) {
  const q = Math.max(1, parseInt(qty, 10) || 1);
  const u = Math.max(0, Number(unitPrice) || 0);
  return Math.round(u * q * 100) / 100;
}

module.exports = { resolveServiceUnitPrice, resolveLineUnitPrice, lineTotal };
