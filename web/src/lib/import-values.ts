export function importedUnitPrice(item: Record<string, unknown>): number {
  for (const key of ['priceWithoutVatWithDiscount', 'priceWithoutVat', 'price']) {
    if (item[key] != null && item[key] !== '') {
      const value = Number(item[key]);
      if (Number.isFinite(value)) return value;
    }
  }
  const quantity = Number(item.quantity ?? 1);
  const net = Number(item.sumWithoutVatWithDiscount ?? item.sumWithoutVat);
  return quantity > 0 && Number.isFinite(net) ? Math.round(net / quantity * 1e6) / 1e6 : 0;
}
