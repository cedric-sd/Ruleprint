import express from 'express';

import { assertValidOrder, subtotal } from './order.js';
import { calcFreight } from './shipping.js';

export const app = express();
app.use(express.json());

app.post('/orders', (req, res) => {
  try {
    assertValidOrder(req.body.items);
  } catch (error) {
    res.status(422).json({ error: (error as Error).message });
    return;
  }
  const total = subtotal(req.body.items);
  res.json({ total, freight: calcFreight(total, req.body.address) });
});
