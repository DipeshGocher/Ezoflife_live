/**
 * A tiny stand-in for the Razorpay API (and RazorpayX fund account validation),
 * so payment flows can be tested end to end without real keys or money.
 *
 * The server under test is pointed at it with RAZORPAY_API_BASE_URL. Signatures
 * are produced with the same secret the server is given, exactly like Razorpay
 * Checkout does after a successful payment.
 */
import http from 'node:http';
import crypto from 'node:crypto';

export const FAKE_KEY_ID = 'rzp_test_fake';
export const FAKE_KEY_SECRET = 'fake_razorpay_secret';
export const FAKE_WEBHOOK_SECRET = 'fake_webhook_secret';

export const startFakeRazorpay = async () => {
    const orders = new Map();
    const payments = new Map();
    const refunds = [];
    const transfers = new Map();
    const transferKeys = new Map();
    const controls = { failTransferResponseOnce: false };
    const validations = new Map();
    let seq = 0;
    const nextId = (prefix) => `${prefix}_${Date.now().toString(36)}${(seq += 1)}`;

    const server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', chunk => { raw += chunk; });
        req.on('end', () => {
            const body = raw ? JSON.parse(raw) : {};
            const send = (status, data) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            };
            const url = new URL(req.url, 'http://fake');
            const parts = url.pathname.split('/').filter(Boolean); // ['v1', ...]

            if (req.method === 'POST' && url.pathname === '/v1/transfers') {
                const key = req.headers['x-transfer-idempotency'];
                if (!key) return send(400, { error: { description: 'Idempotency key required' } });
                if (transferKeys.has(key)) return send(200, transfers.get(transferKeys.get(key)));
                const transfer = { id: nextId('trf'), entity: 'transfer', amount: body.amount, recipient: body.account, currency: body.currency, status: 'processed', notes: body.notes };
                transfers.set(transfer.id, transfer);
                transferKeys.set(key, transfer.id);
                if (controls.failTransferResponseOnce) {
                    controls.failTransferResponseOnce = false;
                    return send(500, { error: { description: 'Provider processed transfer but response was lost' } });
                }
                return send(200, transfer);
            }
            const transferMatch = url.pathname.match(/^\/v1\/transfers\/(trf_[^/]+)$/);
            if (req.method === 'GET' && transferMatch) return send(200, transfers.get(transferMatch[1]));
            if (req.method === 'POST' && url.pathname === '/v1/orders') {
                const order = { id: nextId('order'), entity: 'order', amount: body.amount, currency: body.currency || 'INR', status: 'created', notes: body.notes };
                orders.set(order.id, order);
                return send(200, order);
            }
            if (req.method === 'GET' && parts[1] === 'orders' && parts[3] === 'payments') {
                const items = [...payments.values()].filter(p => p.order_id === parts[2]);
                return send(200, { entity: 'collection', count: items.length, items });
            }
            if (req.method === 'GET' && parts[1] === 'payments' && parts.length === 3) {
                const payment = payments.get(parts[2]);
                return payment ? send(200, payment) : send(404, { error: { description: 'The id provided does not exist' } });
            }
            if (req.method === 'POST' && parts[1] === 'payments' && parts[3] === 'capture') {
                const payment = payments.get(parts[2]);
                if (!payment) return send(404, { error: { description: 'not found' } });
                payment.status = 'captured';
                return send(200, payment);
            }
            if (req.method === 'POST' && parts[1] === 'payments' && parts[3] === 'refund') {
                const refund = { id: nextId('rfnd'), entity: 'refund', payment_id: parts[2], amount: body.amount, notes: body.notes };
                refunds.push(refund);
                return send(200, refund);
            }
            if (req.method === 'POST' && url.pathname === '/v1/fund_accounts/validations') {
                const validation = { id: nextId('fav'), entity: 'fund_account.validation', status: 'created', request: body, results: { account_status: null, registered_name: null } };
                validations.set(validation.id, validation);
                return send(200, validation);
            }
            if (req.method === 'GET' && parts[1] === 'fund_accounts' && parts[2] === 'validations') {
                const validation = validations.get(parts[3]);
                if (!validation) return send(404, { error: { description: 'not found' } });
                // Completes on the first status check; '000000' accounts are invalid.
                const invalid = validation.request.fund_account.bank_account.account_number.endsWith('000000');
                validation.status = 'completed';
                validation.results = { account_status: invalid ? 'invalid' : 'active', registered_name: invalid ? null : 'TEST ACCOUNT HOLDER' };
                return send(200, validation);
            }
            return send(404, { error: { description: `fake razorpay: no route ${req.method} ${url.pathname}` } });
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    /** Simulate the customer completing Razorpay Checkout for an order. */
    const pay = (orderId, { amount, status = 'captured', secret = FAKE_KEY_SECRET } = {}) => {
        const order = orders.get(orderId);
        if (!order) throw new Error(`fake razorpay: unknown order ${orderId}`);
        const payment = { id: nextId('pay'), entity: 'payment', order_id: orderId, amount: amount ?? order.amount, currency: 'INR', status };
        payments.set(payment.id, payment);
        return {
            razorpay_order_id: orderId,
            razorpay_payment_id: payment.id,
            razorpay_signature: crypto.createHmac('sha256', secret).update(`${orderId}|${payment.id}`).digest('hex')
        };
    };

    return {
        baseUrl: `http://127.0.0.1:${port}`,
        orders, payments, refunds, validations, transfers, controls,
        pay,
        env: {
            RAZORPAY_KEY_ID: FAKE_KEY_ID,
            RAZORPAY_KEY_SECRET: FAKE_KEY_SECRET,
            RAZORPAY_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
            RAZORPAY_API_BASE_URL: `http://127.0.0.1:${port}`,
            RAZORPAYX_API_KEY: 'rzpx_fake',
            RAZORPAYX_API_SECRET: 'rzpx_fake_secret',
            RAZORPAYX_ACCOUNT_NUMBER: '2323230000000000'
        },
        stop: () => new Promise(resolve => server.close(resolve))
    };
};

/** Sign a webhook body the way Razorpay does. */
export const signWebhook = (rawBody, secret = FAKE_WEBHOOK_SECRET) =>
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
