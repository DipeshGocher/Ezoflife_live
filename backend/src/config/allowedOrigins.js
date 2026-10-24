/**
 * Frontend origins allowed by CORS (FRONTEND_URL may be a comma-separated list).
 * A function, not a constant: server.js loads .env after imports are evaluated.
 */
const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://ezoflife-six.vercel.app'
];

export const getAllowedOrigins = () => {
    const envOrigins = (process.env.FRONTEND_URL || '')
        .split(',')
        .map(o => o.trim().replace(/\/$/, ''))
        .filter(Boolean);
    return Array.from(new Set([...envOrigins, ...defaultOrigins]));
};
