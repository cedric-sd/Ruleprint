import { describe, expect, test } from 'vitest';

import { assertValidOrder, MAX_ITEMS_PER_ORDER, OrderError } from '../src/order.js';

const item = (quantity: number, unitPrice: number) => ({ sku: 'SKU-1', quantity, unitPrice });

describe('order validation', () => {
  test('rejects an empty order', () => {
    expect(() => assertValidOrder([])).toThrow(OrderError);
  });

  test('rejects an order below the minimum value', () => {
    expect(() => assertValidOrder([item(1, 5)])).toThrow('below minimum');
  });

  test(`rejects more than ${MAX_ITEMS_PER_ORDER} items in one order`, () => {
    expect(() => assertValidOrder([item(MAX_ITEMS_PER_ORDER + 1, 10)])).toThrow('too many items');
  });

  test.skip('rejects duplicated skus', () => {
    // pending product decision
  });

  test.todo('rejects items with negative quantity');

  test('accepts a valid order', () => {
    expect(() => assertValidOrder([item(2, 15)])).not.toThrow();
  });
});
