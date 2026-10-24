import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldAlert, MailCheck, CheckCircle } from 'lucide-react';
import { BASE_URL } from '../../../lib/api';

/**
 * Landing page for the emailed admin invitation. The token is read once and
 * removed from the address bar straight away, so refreshing or revisiting this
 * page never shows the invite again; the email link must be opened instead.
 */
export default function AdminAcceptInvite() {
    const navigate = useNavigate();
    // Read in the initializer so it survives the URL being stripped below
    const [token] = useState(() => new URLSearchParams(window.location.search).get('token'));
    const [state, setState] = useState(token ? 'loading' : 'no-token');
    const [invite, setInvite] = useState(null);
    const [error, setError] = useState('');
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        if (window.location.search) {
            window.history.replaceState(null, '', window.location.pathname);
        }
        if (!token) return;

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${BASE_URL}/auth/admin-invite?token=${encodeURIComponent(token)}`);
                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (!res.ok) {
                    setError(data.message || 'This invitation link is not valid.');
                    setState(res.status === 410 ? 'already-accepted' : 'error');
                    return;
                }
                setInvite(data);
                setState('ready');
            } catch {
                if (!cancelled) {
                    setError('Could not load the invitation. Check your connection and open the link from your email again.');
                    setState('error');
                }
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    const accept = async () => {
        setAccepting(true);
        try {
            const res = await fetch(`${BASE_URL}/auth/admin-invite/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.message || 'Could not accept the invitation.');
                setState(res.status === 410 ? 'already-accepted' : 'error');
                return;
            }
            setState('accepted');
        } catch {
            setError('Could not accept the invitation. Please try again.');
        } finally {
            setAccepting(false);
        }
    };

    const goToLogin = () => navigate('/admin/login', { replace: true });

    if (state === 'loading') {
        return (
            <Shell>
                <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin mx-auto mb-4" />
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 text-center">Loading invitation…</p>
            </Shell>
        );
    }

    if (state === 'accepted' || state === 'already-accepted') {
        return (
            <Shell>
                <Icon tone="success"><CheckCircle size={26} /></Icon>
                <h2 className="text-xl font-black tracking-tight text-slate-950 text-center">
                    {state === 'accepted' ? 'Invitation accepted' : 'Already accepted'}
                </h2>
                <p className="text-xs font-bold text-slate-500 text-center mt-2 leading-relaxed">
                    {state === 'accepted'
                        ? `You can now log in to the Spinzyt admin panel as ${invite?.adminRole} with your mobile number${invite?.phone ? ` (${invite.phone})` : ''}.`
                        : 'This invitation has already been accepted. Log in with your registered mobile number.'}
                </p>
                <PrimaryButton onClick={goToLogin}>Go to Login</PrimaryButton>
            </Shell>
        );
    }

    if (state === 'ready') {
        return (
            <Shell>
                <Icon><MailCheck size={24} /></Icon>
                <h2 className="text-xl font-black tracking-tight text-slate-950 text-center">You're invited</h2>
                <p className="text-xs font-bold text-slate-500 text-center mt-2 leading-relaxed">
                    Hi {invite.displayName}, you are invited to join Spinzyt as{' '}
                    <span className="text-slate-900">{invite.adminRole}</span>. Accept this invitation to log in.
                </p>
                <dl className="mt-6 space-y-2 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs">
                    <Row label="Email" value={invite.email} />
                    <Row label="Mobile" value={invite.phone} />
                    <Row label="Role" value={invite.adminRole} />
                </dl>
                {error && <p className="text-xs font-bold text-red-600 text-center mt-4">{error}</p>}
                <PrimaryButton onClick={accept} disabled={accepting}>
                    {accepting ? 'Accepting…' : 'Accept Invitation'}
                </PrimaryButton>
                <p className="text-[10px] font-bold text-slate-400 text-center mt-4">
                    This page can't be refreshed. If you leave it, open the link from your email again.
                </p>
            </Shell>
        );
    }

    // no-token (refreshed / revisited) or error
    return (
        <Shell>
            <Icon tone="error"><ShieldAlert size={26} /></Icon>
            <h2 className="text-xl font-black tracking-tight text-slate-950 text-center">Invitation unavailable</h2>
            <p className="text-xs font-bold text-slate-500 text-center mt-2 leading-relaxed">
                {state === 'no-token'
                    ? 'This page can only be opened from the invitation link in your email. Open the link from your email again, or ask your admin to resend it.'
                    : error}
            </p>
            <PrimaryButton onClick={goToLogin}>Back to Login</PrimaryButton>
        </Shell>
    );
}

const Shell = ({ children }) => (
    <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-6 text-slate-900">
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-2xl"
        >
            {children}
        </motion.div>
    </div>
);

const Icon = ({ tone, children }) => {
    const tones = {
        success: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        error: 'bg-red-50 text-red-500 border-red-100',
    };
    return (
        <div className={`w-14 h-14 rounded-3xl flex items-center justify-center border mx-auto mb-5 ${tones[tone] || 'bg-slate-900 text-white border-slate-800'}`}>
            {children}
        </div>
    );
};

const Row = ({ label, value }) => (
    <div className="flex justify-between gap-4">
        <dt className="font-black uppercase tracking-widest text-[9px] text-slate-400">{label}</dt>
        <dd className="font-bold text-slate-800 text-right break-all">{value}</dd>
    </div>
);

const PrimaryButton = ({ children, ...props }) => (
    <button
        type="button"
        {...props}
        className="w-full mt-6 bg-slate-950 hover:bg-black text-white py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all cursor-pointer disabled:opacity-50"
    >
        {children}
    </button>
);
