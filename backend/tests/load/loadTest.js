/**
 * Load & volume harness.
 *
 * Deliberately dependency-free (plain fetch + a concurrency pool) so it runs
 * anywhere Node runs, with no extra install.
 *
 * Runs against a throwaway local database by default — NEVER against Atlas.
 * To point it at an already-running server instead:
 *     TARGET_URL=http://localhost:5001 node tests/load/loadTest.js
 *
 * Usage:
 *     node tests/load/loadTest.js                # default profile
 *     node tests/load/loadTest.js --rps 50 --duration 20
 *     node tests/load/loadTest.js --scenario volume --orders 2000
 */
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { orderPayload, createUser } from '../helpers/factories.js';

// ---------- arg parsing ----------
const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SCENARIO = arg('scenario', 'load');
const CONCURRENCY = Number(arg('concurrency', 20));
const DURATION_S = Number(arg('duration', 15));
const ORDER_COUNT = Number(arg('orders', 500));
const TARGET_URL = process.env.TARGET_URL || null;

/**
 * Service level objectives. A run fails if these are breached, which turns the
 * harness from a vanity benchmark into a regression gate.
 *
 * Override per environment:
 *   SLO_P95_READ_MS=50 SLO_P95_WRITE_MS=250 SLO_ERROR_RATE=0.01 npm run test:perf
 */
const SLO = {
    p95ReadMs: Number(process.env.SLO_P95_READ_MS || 100),
    p95WriteMs: Number(process.env.SLO_P95_WRITE_MS || 500),
    errorRate: Number(process.env.SLO_ERROR_RATE || 0.05)
};

// ---------- stats ----------
const percentile = (sorted, p) => {
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[idx];
};

const report = (title, latencies, errors, elapsedMs, extra = {}) => {
    const sorted = [...latencies].sort((a, b) => a - b);
    const total = latencies.length + errors;
    const line = (k, v) => console.log(`   ${k.padEnd(22)} ${v}`);

    console.log(`\n── ${title} ─────────────────────────────`);
    line('requests', total);
    line('successful', latencies.length);
    line('errors', `${errors}${errors ? '  ⚠️' : ''}`);
    line('duration', `${(elapsedMs / 1000).toFixed(1)}s`);
    line('throughput', `${(total / (elapsedMs / 1000)).toFixed(1)} req/s`);
    if (sorted.length) {
        line('latency min', `${sorted[0].toFixed(0)}ms`);
        line('latency p50', `${percentile(sorted, 50).toFixed(0)}ms`);
        line('latency p95', `${percentile(sorted, 95).toFixed(0)}ms`);
        line('latency p99', `${percentile(sorted, 99).toFixed(0)}ms`);
        line('latency max', `${sorted[sorted.length - 1].toFixed(0)}ms`);
    }
    for (const [k, v] of Object.entries(extra)) line(k, v);

    return {
        requests: total,
        errors,
        errorRate: total ? errors / total : 0,
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        throughput: total / (elapsedMs / 1000)
    };
};

/** Run `task` with a fixed worker pool until the deadline. */
const drive = async (task, { concurrency, deadline }) => {
    const latencies = [];
    let errors = 0;

    const worker = async () => {
        while (Date.now() < deadline) {
            const t0 = performance.now();
            try {
                const ok = await task();
                if (ok) latencies.push(performance.now() - t0);
                else errors++;
            } catch {
                errors++;
            }
        }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    return { latencies, errors };
};

// ---------- scenarios ----------
const scenarios = {
    /** Sustained read traffic against the service catalogue. */
    async load(baseUrl) {
        console.log(`\n▶ LOAD: ${CONCURRENCY} concurrent readers for ${DURATION_S}s`);
        const started = Date.now();
        const { latencies, errors } = await drive(
            async () => (await api(baseUrl, '/api/services')).status === 200,
            { concurrency: CONCURRENCY, deadline: started + DURATION_S * 1000 }
        );
        return report('READ LOAD  GET /api/services', latencies, errors, Date.now() - started);
    },

    /** Sustained write traffic — the expensive path (pricing + geo + persistence). */
    async write(baseUrl, ctx) {
        console.log(`\n▶ WRITE LOAD: ${CONCURRENCY} concurrent writers for ${DURATION_S}s`);
        const started = Date.now();
        const { latencies, errors } = await drive(
            async () => {
                const res = await api(baseUrl, '/api/orders', {
                    method: 'POST', body: orderPayload(ctx.customerId), token: ctx.customerToken
                });
                return res.status === 201;
            },
            { concurrency: CONCURRENCY, deadline: started + DURATION_S * 1000 }
        );
        return report('WRITE LOAD  POST /api/orders', latencies, errors, Date.now() - started);
    },

    /**
     * Stress: ramp concurrency and find the knee — the point where latency
     * starts climbing faster than throughput. That knee, not a single number,
     * is what tells you how much headroom the service has.
     */
    async stress(baseUrl, ctx) {
        const steps = (arg('steps', '1,5,10,20,40,80')).split(',').map(Number);
        const perStep = Number(arg('step-duration', 6));
        console.log(`\n▶ STRESS: ramping concurrency ${steps.join(' → ')} (${perStep}s per step)`);
        console.log('\n   conc    req/s    p50     p95     p99   errors');
        console.log('   ─────────────────────────────────────────────────');

        const rows = [];
        for (const conc of steps) {
            const started = Date.now();
            const { latencies, errors } = await drive(
                async () => {
                    const res = await api(baseUrl, '/api/orders', {
                        method: 'POST', body: orderPayload(ctx.customerId), token: ctx.customerToken
                    });
                    return res.status === 201;
                },
                { concurrency: conc, deadline: started + perStep * 1000 }
            );
            const elapsed = (Date.now() - started) / 1000;
            const sorted = [...latencies].sort((a, b) => a - b);
            const row = {
                conc,
                rps: (latencies.length + errors) / elapsed,
                p50: percentile(sorted, 50),
                p95: percentile(sorted, 95),
                p99: percentile(sorted, 99),
                errors
            };
            rows.push(row);
            console.log(
                `   ${String(conc).padStart(4)}  ${row.rps.toFixed(0).padStart(7)}` +
                `  ${row.p50.toFixed(0).padStart(5)}ms ${row.p95.toFixed(0).padStart(5)}ms` +
                ` ${row.p99.toFixed(0).padStart(5)}ms  ${String(errors).padStart(6)}`
            );
        }

        // The knee: last step where throughput still grew meaningfully (>10%).
        let knee = rows[0];
        for (let i = 1; i < rows.length; i++) {
            if (rows[i].rps > rows[i - 1].rps * 1.1) knee = rows[i];
        }
        const peak = rows.reduce((a, b) => (b.rps > a.rps ? b : a), rows[0]);

        console.log(`\n   saturation knee : ~${knee.conc} concurrent (${knee.rps.toFixed(0)} req/s, p95 ${knee.p95.toFixed(0)}ms)`);
        console.log(`   peak throughput : ${peak.rps.toFixed(0)} req/s at ${peak.conc} concurrent`);
        console.log('   Beyond the knee, added concurrency buys latency, not throughput.');

        const totalErrors = rows.reduce((s, r) => s + r.errors, 0);
        const totalReqs = rows.reduce((s, r) => s + r.rps * perStep, 0);
        return {
            requests: Math.round(totalReqs),
            errors: totalErrors,
            errorRate: totalReqs ? totalErrors / totalReqs : 0,
            p95: peak.p95,
            p99: peak.p99,
            throughput: peak.rps,
            knee: knee.conc
        };
    },

    /** Volume: build a large dataset, then measure whether reads degrade. */
    async volume(baseUrl, ctx) {
        console.log(`\n▶ VOLUME: inserting ${ORDER_COUNT} orders, then measuring read latency`);

        const timeRead = async () => {
            const t0 = performance.now();
            const response = await api(baseUrl, `/api/orders/my?customerId=${ctx.customerId}`, { token: ctx.customerToken });
            if (response.status !== 200 || !Array.isArray(response.body)) throw new Error(`Volume verification read failed: HTTP ${response.status}`);
            return performance.now() - t0;
        };

        const baseline = await timeRead();
        console.log(`   baseline read (empty):  ${baseline.toFixed(0)}ms`);

        const started = Date.now();
        let inserted = 0, failed = 0;
        const writeLatencies = [];
        const BATCH = 25;

        for (let i = 0; i < ORDER_COUNT; i += BATCH) {
            const size = Math.min(BATCH, ORDER_COUNT - i);
            const results = await Promise.all(
                Array.from({ length: size }, async () => {
                    const start = performance.now();
                    try {
                        const response = await api(baseUrl, '/api/orders', { method: 'POST', body: orderPayload(ctx.customerId), token: ctx.customerToken });
                        if (response.status === 201) { writeLatencies.push(performance.now() - start); return true; }
                        return false;
                    } catch { return false; }
                })
            );
            inserted += results.filter(Boolean).length;
            failed += results.filter(r => !r).length;
            if ((i + size) % 100 === 0 || i + size >= ORDER_COUNT) {
                process.stdout.write(`\r   inserted ${inserted}/${ORDER_COUNT}`);
            }
        }
        console.log('');

        const loaded = await timeRead();
        const elapsed = Date.now() - started;

        console.log(`   read @ ${inserted} orders:   ${loaded.toFixed(0)}ms`);
        const factor = baseline > 0 ? loaded / baseline : 0;
        console.log(`   degradation factor:     ${factor.toFixed(1)}x`);
        if (factor > 10) {
            console.log('   ⚠️  reads degrade sharply with volume — check indexes on Order.customer');
        }

        return report('VOLUME  bulk insert', writeLatencies, failed, elapsed, {
            inserted,
            'insert rate': `${(inserted / (elapsed / 1000)).toFixed(1)} orders/s`,
            'read baseline': `${baseline.toFixed(0)}ms`,
            'read at volume': `${loaded.toFixed(0)}ms`
        });
    }
};

// ---------- runner ----------
const main = async () => {
    let env = null;
    let baseUrl = TARGET_URL;

    if (!baseUrl) {
        console.log('Starting isolated test environment (throwaway mongod)...');
        env = await startTestEnvironment();
        baseUrl = env.baseUrl;
    } else {
        console.log(`⚠️  Targeting an external server: ${baseUrl}`);
        console.log('   Make sure this is NOT production.');
    }

    try {
        const user = await createUser(api, baseUrl, `9${Date.now() % 1000000000}`, 'Customer');
        const ctx = { customerId: user.id, customerToken: user.token };
        if (!ctx.customerToken) throw new Error('could not authenticate the load-test customer');
        if (!ctx.customerId) throw new Error('could not create a load-test customer');

        const chosen = SCENARIO === 'all' ? ['load', 'write', 'volume'] : [SCENARIO];
        const results = {};
        for (const name of chosen) {
            if (!scenarios[name]) throw new Error(`unknown scenario "${name}"`);
            results[name] = await scenarios[name](baseUrl, ctx);
        }

        // ---- environment, so numbers are interpretable later ----
        const os = await import('node:os');
        console.log('\n── environment ─────────────────────────────');
        console.log(`   host        ${os.cpus().length} x ${os.cpus()[0]?.model?.trim() || 'unknown'}`);
        console.log(`   memory      ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`);
        console.log(`   node        ${process.version}`);
        console.log(`   database    ${TARGET_URL ? 'external target' : 'local mongod (same host)'}`);
        console.log(`   network     ${TARGET_URL ? 'over the network' : 'loopback — no real latency'}`);

        // ---- SLO gate ----
        console.log('\n── SLO check ───────────────────────────────');
        const breaches = [];
        for (const [name, r] of Object.entries(results)) {
            const budget = name === 'load' ? SLO.p95ReadMs : SLO.p95WriteMs;
            if (r.errorRate > SLO.errorRate) {
                breaches.push(`${name}: error rate ${(r.errorRate * 100).toFixed(1)}% > ${(SLO.errorRate * 100).toFixed(0)}%`);
            }
            if (r.p95 && r.p95 > budget) {
                breaches.push(`${name}: p95 ${r.p95.toFixed(0)}ms > ${budget}ms`);
            }
            console.log(`   ${name.padEnd(8)} errors ${(r.errorRate * 100).toFixed(2)}%  p95 ${(r.p95 || 0).toFixed(0)}ms  (budget ${budget}ms)`);
        }

        console.log('');
        if (breaches.length) {
            console.log('❌ SLO breached:');
            for (const b of breaches) console.log(`   - ${b}`);
            process.exitCode = 1;
        } else {
            console.log('✅ all scenarios within SLO');
        }

        if (!TARGET_URL) {
            console.log('\n⚠️  These are LOCAL numbers: app and database share one host over');
            console.log('   loopback, with no network latency, no TLS, and no connection pool');
            console.log('   contention. They are valid for spotting REGRESSIONS, not for');
            console.log('   sizing production. For real capacity, run against staging with');
            console.log('   TARGET_URL and production-shaped data.');
        }
    } finally {
        if (env) await env.stop();
    }
};

main().catch(err => {
    console.error('Load test failed:', err);
    process.exit(1);
});
