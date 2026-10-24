import { randomUUID } from 'node:crypto';
import AdminAuditEvent from '../models/AdminAuditEvent.js';

// Deliberate allowlist: never serialize request bodies, credentials, financial
// details, document links, messages, configuration values or response payloads.
export const auditAccountSnapshot = value => value ? Object.fromEntries(
    ['role', 'status', 'isBlocked', 'onboardingStage', 'tier'].filter(key => value[key] !== undefined).map(key => [key, value[key]])
) : { exists: false };

export const beginAdminAudit = async (req, res) => {
    if (req.auditOperation || req.account?.role !== 'Admin' || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const path = (req.originalUrl || req.url).split('?')[0].slice(0, 300);
    const targetId = path.match(/[a-f\d]{24}/i)?.[0] || '';
    const base = { operationId: randomUUID(), actorId: req.admin.id, method: req.method, path, targetId };
    // If the intent cannot be persisted, the mutation must not start.
    try { await AdminAuditEvent.create({ ...base, outcome: 'Requested' }); }
    catch (error) { error.code = 'AUDIT_UNAVAILABLE'; throw error; }
    req.auditOperation = base.operationId;
    res.setHeader('X-Audit-Operation-Id', base.operationId);
    let finishing = false;
    const complete = async (statusCode, outcome) => {
        if (finishing) return;
        finishing = true;
        await AdminAuditEvent.create({ ...base, outcome, statusCode, before: req.auditBefore, after: req.auditAfter });
    };
    const json = res.json.bind(res);
    res.json = body => {
        const status = res.statusCode;
        const outcome = status < 400 ? 'Succeeded' : [401, 403].includes(status) ? 'Denied' : 'Failed';
        // Keep the existing business response when completion recording fails:
        // the persisted intent remains evidence for reconciliation, and a
        // completed financial action must not be retried as if it never ran.
        complete(status, outcome).catch(error => {
            res.setHeader('X-Audit-Status', 'pending');
            console.error('Audit completion pending:', base.operationId, error.message);
        }).finally(() => json(body));
        return res;
    };
    res.once('finish', () => { if (!finishing) complete(res.statusCode, res.statusCode < 400 ? 'Succeeded' : 'Failed').catch(error => console.error('Audit completion pending:', base.operationId, error.message)); });
    res.once('close', () => { if (!res.writableFinished && !finishing) complete(res.statusCode, 'Aborted').catch(error => console.error('Audit completion pending:', base.operationId, error.message)); });
};
