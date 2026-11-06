// Purchase line unit price: shown with up to 4 decimals, while the stored value keeps its full precision until the user edits the field.
export const PRICE_DECIMALS = 4;
const round = (value: number, decimals: number) => Math.round((value + Number.EPSILON) * 10 ** decimals) / 10 ** decimals;

/** Value for the price input: at most 4 decimals (1.482685 -> 1.4827). The stored price is not changed by displaying it. */
export function displayPrice(price: number | null | undefined) {
  const value = Number(price);
  return Number.isFinite(value) ? round(value, PRICE_DECIMALS) : 0;
}

/** Price typed by the user: what is visible in the field is what is stored (up to 4 decimals). */
export function typedPrice(text: string) {
  const value = parseFloat(text);
  return Number.isFinite(value) && value > 0 ? round(value, PRICE_DECIMALS) : 0;
}

// A stored line with price 0 but a line sum (legacy import) shows the price derived from the stored sum, so saving keeps the total.
export function editablePrice(it: { price?: number; quantity?: number; sumWithoutVat?: number; sumWithVat?: number }) {
  if (Number(it.price)) return Number(it.price);
  const sum = Number(it.sumWithoutVat) || Number(it.sumWithVat) || 0;
  const qty = Number(it.quantity) || 1;
  return sum ? Math.round((sum / qty) * 1e6) / 1e6 : 0;
}

/** Line sum without VAT from the stored (full precision) price, not from the displayed one. */
export const lineSum = (quantity: number | undefined, price: number | undefined) => (Number(quantity) || 1) * (Number(price) || 0);
