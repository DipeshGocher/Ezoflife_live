import User from '../models/User.js';

const onboardingReview = new Set(['INITIAL_REVIEW', 'SERVICE_SELECTION', 'FINAL_REVIEW']);

// Load current account state rather than trusting stale role/status claims.
export const loadSessionAccount = async decoded => {
    if (!decoded?.id) return null;
    const account = await User.findById(decoded.id).select('role status isBlocked onboardingStage adminAccessType geofenceRestrictions adminRole adminPermissions');
    if (!account || account.isBlocked) return null;
    // Application rejection is distinct from an explicit policy block: a
    // customer awaiting vendor review must still be able to contact support.
    const rejectedApplication = account.role === 'Customer' && onboardingReview.has(account.onboardingStage);
    if (account.status === 'rejected' && !rejectedApplication) return null;
    if (account.role === 'Admin' && (decoded.role !== 'Admin' || account.status !== 'approved')) return null;
    return account;
};

export const isReadOnlyMutation = (account, method) => account.role === 'Admin' &&
    account.adminAccessType === 'Read-Only' && !['GET', 'HEAD', 'OPTIONS'].includes(method);
