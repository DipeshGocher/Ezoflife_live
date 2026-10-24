/**
 * Turn real customer feedback into "top positive" / "critical" tags.
 *
 * Tags come only from what customers actually wrote (comment text) and the
 * category they picked; nothing is shown when there is no matching feedback.
 * Shared by the admin dashboard and the vendor Business Insights page.
 */
export const KNOWN_FEEDBACK_TAGS = [
    'Crisp Folding', 'Fresh Fragrance', 'On-Time Delivery', 'Friendly Rider',
    'Polite Rider', 'Excellent Wash', 'Fast Service', 'Neat Packaging',
    'Late Pickup', 'Damp Clothes', 'High Delivery Fee', 'Delayed Response',
    'Improper Crease', 'Rude Rider', 'Missing Clothes', 'Poor Wash'
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TAG_PATTERNS = KNOWN_FEEDBACK_TAGS.map(tag => [tag, new RegExp(escapeRegex(tag), 'i')]);

/**
 * @param {Array<{rating:number, comment?:string, category?:string}>} feedbacks
 * @param {number} limit
 * @returns {{ positive: string[], critical: string[] }}
 */
export const extractFeedbackTags = (feedbacks, limit = 5) => {
    const pos = {};
    const crit = {};

    for (const f of feedbacks || []) {
        const text = `${f.comment || ''} ${f.category || ''}`;
        if (!text.trim()) continue;
        const bucket = f.rating >= 4 ? pos : crit;

        for (const [tag, re] of TAG_PATTERNS) {
            if (re.test(text)) bucket[tag] = (bucket[tag] || 0) + 1;
        }
        if (f.category && f.category !== 'Other' && f.category !== 'order') {
            const catTag = `${f.category} ${f.rating >= 4 ? 'Quality' : 'Issue'}`;
            bucket[catTag] = (bucket[catTag] || 0) + 1;
        }
    }

    const top = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, limit);
    return { positive: top(pos), critical: top(crit) };
};
