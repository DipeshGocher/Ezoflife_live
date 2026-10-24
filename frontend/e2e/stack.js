/**
 * Boots the whole stack for E2E: throwaway mongod → real backend → Vite dev server.
 *
 * Isolation is the point. The backend is started with MONGODB_URI pointing at a
 * local ephemeral mongod, so E2E runs never read or write the Atlas cluster.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, unlinkSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { createRequire } from 'node:module';

const FRONTEND_ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));
const BACKEND_ROOT = join(FRONTEND_ROOT, '..', 'backend');
const mongoose = createRequire(join(BACKEND_ROOT, 'package.json'))('mongoose');
const STATE_FILE = join(tmpdir(), 'ezoflife-e2e-state.json');

const waitFor = async (check, { timeoutMs = 90_000, intervalMs = 400, label = 'service' } = {}) => {
    const started = Date.now();
    for (;;) {
        try { if (await check()) return; } catch { /* not ready */ }
        if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
        await new Promise(r => setTimeout(r, intervalMs));
    }
};

const tcpOpen = port => new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1');
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => { s.destroy(); resolve(false); });
});

export const startStack = async () => {
    const dbPath = mkdtempSync(join(tmpdir(), 'ezoflife-e2e-db-'));
    // Fixed ports: Playwright reads baseURL from config at load time, before
    // globalSetup runs, so the web port must be known up front.
    const mongoPort = Number(process.env.E2E_MONGO_PORT || 27099);
    const apiPort = Number(process.env.E2E_API_PORT || 5099);
    const webPort = Number(process.env.E2E_WEB_PORT || 5199);

    for (const port of [mongoPort, apiPort, webPort]) {
        if (await tcpOpen(port)) { rmSync(dbPath, { recursive: true, force: true }); throw new Error(`E2E port ${port} is already occupied; refusing to reuse an existing service.`); }
    }
    let mongod, backend, web;
    try {
    // 1. throwaway database
    mongod = spawn('mongod',
        ['--dbpath', dbPath, '--port', String(mongoPort), '--bind_ip', '127.0.0.1'],
        { stdio: 'ignore' });
    await waitFor(() => tcpOpen(mongoPort), { label: 'mongod' });

    const fixtureDb = await mongoose.createConnection(`mongodb://127.0.0.1:${mongoPort}/ezoflife_e2e`).asPromise();
    try {
        await fixtureDb.collection('users').updateOne({ _id: new mongoose.Types.ObjectId('6a7d56c980a151d5ad8b17d0') }, { $setOnInsert: { role: 'Admin', status: 'approved', phone: '9990009999', displayName: 'Fixture Admin', adminAccessType: 'Read/Write' } }, { upsert: true });
    } finally { await fixtureDb.close(); }

    // 2. real backend, pointed at the throwaway database
    backend = spawn('node', ['server.js'], {
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
            EMAIL_HOST: '127.0.0.1',
            EMAIL_PORT: '9',
            EMAIL_USER: '',
            EMAIL_PASS: '',
            MONGODB_URI: `mongodb://127.0.0.1:${mongoPort}/ezoflife_e2e`,
            PORT: String(apiPort),
            FRONTEND_URL: `http://127.0.0.1:${webPort}`,
            JWT_SECRET: process.env.JWT_SECRET || 'e2e_secret_key'
        },
        // ROUTE_LOG=<file> records every request for endpoint-coverage runs.
        stdio: process.env.ROUTE_LOG ? ['ignore', 'pipe', 'pipe'] : 'ignore'
    });
    if (process.env.ROUTE_LOG) {
        const sink = createWriteStream(process.env.ROUTE_LOG, { flags: 'a' });
        backend.stdout?.pipe(sink); backend.stderr?.pipe(sink);
    }
    await waitFor(async () => {
        const r = await fetch(`http://127.0.0.1:${apiPort}/api/faqs`, { signal: AbortSignal.timeout(3000) });
        return r.status < 500;
    }, { label: 'backend' });

    // 3. Vite dev server, pointed at the test backend
    web = spawn(process.execPath, [join(FRONTEND_ROOT, 'node_modules/vite/bin/vite.js'), ...(process.env.E2E_PRODUCTION_BUILD === 'true' ? ['preview', '--outDir', process.env.E2E_BUILD_DIR || 'dist'] : []), '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'], {
        cwd: FRONTEND_ROOT,
        env: { ...process.env, VITE_API_URL: `http://127.0.0.1:${apiPort}/api` },
        stdio: 'ignore'
    });
    await waitFor(async () => {
        const r = await fetch(`http://127.0.0.1:${webPort}/`, { signal: AbortSignal.timeout(3000) });
        return r.ok;
    }, { label: 'vite dev server', timeoutMs: 120_000 });

    const state = {
        pids: { mongod: mongod.pid, backend: backend.pid, web: web.pid },
        dbPath,
        baseUrl: `http://127.0.0.1:${webPort}`,
        apiUrl: `http://127.0.0.1:${apiPort}/api`
    };
    writeFileSync(STATE_FILE, JSON.stringify(state));
    return state;
    } catch (error) {
        for (const child of [web, backend, mongod]) child?.kill('SIGKILL');
        rmSync(dbPath, { recursive: true, force: true });
        throw error;
    }
};

export const stopStack = () => {
    if (!existsSync(STATE_FILE)) return;
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    for (const pid of Object.values(state.pids)) {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    try { rmSync(state.dbPath, { recursive: true, force: true }); } catch { /* best effort */ }
    try { unlinkSync(STATE_FILE); } catch { /* best effort */ }
};

export const readState = () => JSON.parse(readFileSync(STATE_FILE, 'utf8'));
