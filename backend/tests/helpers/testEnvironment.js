/**
 * Test environment harness.
 *
 * Boots a throwaway MongoDB (local mongod, ephemeral port + temp dbpath) and
 * then starts the real server.js against it as a child process. Nothing here
 * ever touches the Atlas cluster — the whole point is that tests can create,
 * mutate and delete freely without risking production data.
 *
 * Usage:
 *   const env = await startTestEnvironment();
 *   await fetch(`${env.baseUrl}/api/orders`, ...)
 *   await env.stop();
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import mongoose from 'mongoose';

const BACKEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Find a free TCP port so parallel runs never collide. */
const freePort = () =>
    new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });

/** Poll until `check` resolves truthy, or throw after `timeoutMs`. */
const waitFor = async (check, { timeoutMs = 45000, intervalMs = 300, label = 'condition' } = {}) => {
    const startedAt = Date.now();
    for (;;) {
        try {
            if (await check()) return;
        } catch {
            // not ready yet
        }
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }
};

/**
 * @param {object}  [opts]
 * @param {boolean} [opts.silent] pipe server output to /dev/null
 * @param {object}  [opts.env]    extra env vars for the server process
 */
export const startTestEnvironment = async ({ silent = true, env: extraEnv = {} } = {}) => {
    const dbPath = mkdtempSync(join(tmpdir(), 'ezoflife-test-db-'));
    const mongoPort = await freePort();
    const appPort = await freePort();

    let mongod;
    let server;
    try {
        // ---- 1. throwaway mongod ----
        mongod = spawn(
            'mongod',
            ['--dbpath', dbPath, '--port', String(mongoPort), '--bind_ip', '127.0.0.1'],
            { stdio: 'ignore' }
        );

        const mongoUri = `mongodb://127.0.0.1:${mongoPort}/ezoflife_test`;

        await waitFor(
            () => new Promise(resolve => {
                const sock = net.connect(mongoPort, '127.0.0.1');
                sock.on('connect', () => { sock.destroy(); resolve(true); });
                sock.on('error', () => { sock.destroy(); resolve(false); });
            }),
            { label: 'mongod to accept connections' }
        );

        // ---- 2. the real server, pointed at the throwaway db ----
        server = spawn('node', ['server.js'], {
            cwd: BACKEND_ROOT,
            env: {
                ...process.env,
                NODE_ENV: 'test',
                SHIPROCKET_ENABLED: 'false',
                WHATSAPP_ENABLED: 'false',
                RAZORPAY_KEY_ID: 'rzp_test_isolated',
                RAZORPAY_KEY_SECRET: 'isolated_test_secret_key',
                SIGNZY_API_KEY: '',
                SIGNZY_BASE_URL: '',
                // Never use workspace SMTP credentials in local API regressions.
                EMAIL_HOST: '127.0.0.1',
                EMAIL_PORT: '9',
                EMAIL_USER: '',
                EMAIL_PASS: '',
                MONGODB_URI: mongoUri,
                PORT: String(appPort),
                // Deterministic secret so tests can mint their own tokens.
                JWT_SECRET: process.env.JWT_SECRET || 'test_secret_key',
                ...extraEnv
            },
            // Set ROUTE_LOG=<file> to record every request the suite makes (morgan
            // output), which is how endpoint coverage is measured.
            stdio: process.env.ROUTE_LOG ? ['ignore', 'pipe', 'pipe'] : (silent ? 'ignore' : 'inherit')
        });

        if (process.env.ROUTE_LOG) {
            const sink = createWriteStream(process.env.ROUTE_LOG, { flags: 'a' });
            server.stdout?.pipe(sink);
            server.stderr?.pipe(sink);
        }

        const baseUrl = `http://127.0.0.1:${appPort}`;

        await waitFor(
            async () => {
                const res = await fetch(`${baseUrl}/api/faqs`, { signal: AbortSignal.timeout(2000) });
                return res.status < 500;
            },
            { label: 'server to respond' }
        );

        // Tests that mint the standard admin token must back it with a real active
        // account now that authentication rejects nonexistent/deleted identities.
        const fixtureDb = await mongoose.createConnection(mongoUri).asPromise();
        try {
            await fixtureDb.collection('users').updateOne(
                { _id: new mongoose.Types.ObjectId('6a7d56c980a151d5ad8b17d0') },
                { $setOnInsert: { role: 'Admin', status: 'approved', phone: '9990009999', displayName: 'Fixture Admin', adminAccessType: 'Read/Write' } },
                { upsert: true }
            );
        } finally { await fixtureDb.close(); }

        const stop = async () => {
            server.kill('SIGKILL');
            mongod.kill('SIGKILL');
            await new Promise(r => setTimeout(r, 400));
            try { rmSync(dbPath, { recursive: true, force: true }); } catch { /* best effort */ }
        };

        return { baseUrl, mongoUri, stop };
    } catch (error) {
        // A bootstrap timeout must not leave test children running.
        server?.kill('SIGKILL');
        mongod?.kill('SIGKILL');
        await new Promise(resolve => setTimeout(resolve, 400));
        try { rmSync(dbPath, { recursive: true, force: true }); } catch { /* best effort */ }
        throw error;
    }
};

/** Small fetch wrapper returning { status, body } with JSON parsed when possible. */
export const api = async (baseUrl, path, { method = 'GET', body, token } = {}) => {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000)
    });

    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, body: parsed };
};
