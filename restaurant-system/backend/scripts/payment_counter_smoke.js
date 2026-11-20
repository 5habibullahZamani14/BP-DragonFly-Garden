(async () => {
  try {
    if (process.env.CONFIRM_DISPOSABLE_DATABASE !== '1') {
      throw new Error('Refusing to run against application data. Set CONFIRM_DISPOSABLE_DATABASE=1 only for a disposable database.');
    }
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET must be set in the environment before running this smoke test.');
    }

    const crypto = require('crypto');
    const jwt = require('jsonwebtoken');
    const db = require('../src/database/db');
    const fetch = global.fetch || require('node-fetch');

    const get = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
    const run = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function (err) { if (err) rej(err); else res(this); }));

    const empId = 'EMP_TEST';
    const name = 'Tester';

    const existing = await get('SELECT id FROM employees WHERE employee_id = ?', [empId]);
    if (!existing) {
      await run('INSERT INTO employees (employee_id, name, department) VALUES (?, ?, ?)', [empId, name, 'Front']);
      console.log('[SCRIPT] Inserted test employee');
    } else {
      console.log('[SCRIPT] Test employee exists');
    }

    const sessionId = crypto.randomBytes(16).toString('hex');
    const sessionPayload = { sessionId, employee_id: empId, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    await run("INSERT INTO restaurant_settings (key, value) VALUES ('payment_counter_session', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify(sessionPayload)]);
    console.log('[SCRIPT] payment_counter_session stored');

    const token = jwt.sign({ role: 'payment_counter', id: empId, name, sessionId }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Create an order via HTTP
    const base = 'http://localhost:5000';
    const orderResp = await fetch(base + '/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ table_id: 1, items: [{ menu_item_id: 1, quantity: 1 }] })
    });

    const order = await orderResp.json();
    console.log('[SCRIPT] Created order id=', order.id || order.order?.id);
    const orderId = order.id || order.order?.id;
    if (!orderId) throw new Error('No order id returned');

    // Post add-on using payment counter token
    const addonResp = await fetch(base + `/payments/${orderId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ menu_item_id: 2, quantity: 1, notes: 'addon via HTTP test', employee_id: empId, employee_name: name })
    });

    const addonJson = await addonResp.json();
    console.log('[SCRIPT] Add-on response status=', addonResp.status, 'body=', addonJson && (addonJson.id || addonJson));
  } catch (err) {
    console.error('[SCRIPT] Error', err);
    process.exit(1);
  }
})();
