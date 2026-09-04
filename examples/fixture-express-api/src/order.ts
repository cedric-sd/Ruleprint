export const MIN_ORDER_VALUE = 20;
export const MAX_ITEMS_PER_ORDER = 50;

export interface Item {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export class OrderError extends Error {}

export function subtotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function assertValidOrder(items: Item[]): void {
  if (items.length === 0) {
    throw new OrderError('empty order');
  }
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  if (count > MAX_ITEMS_PER_ORDER) {
    throw new OrderError('too many items');
  }
  if (subtotal(items) < MIN_ORDER_VALUE) {
    throw new OrderError('below minimum');
  }
}
