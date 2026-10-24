import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './Dashboard.module.css';
const currency = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const compact = value => value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : value >= 1000 ? `₹${(value / 1000).toFixed(1)}k` : `₹${value}`;
const labelFor = (value, granularity, full = false) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...(full ? { day: 'numeric', month: 'short', year: 'numeric', ...(granularity === 'hour' ? { hour: 'numeric', minute: '2-digit' } : {}) } : granularity === 'hour' ? { hour: 'numeric' } : granularity === 'year' ? { year: 'numeric' } : granularity === 'month' ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }) });
function GmvTooltip({ active, payload, granularity }) {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    return <div className={styles.tooltip}><p>{labelFor(point.at, granularity, true)} · {point.orders} orders</p><strong>{currency(point.amount)}</strong></div>;
}
export default function DashboardCharts({ charts, selectedTotal, activeTotal, periodLabel }) {
    const trend = charts?.gmvTrend;
    const stages = charts?.activeStages;
    return <div className={styles.charts}>
        <section className={styles.panel} aria-label="Gross Merchandise Value trend chart">
            <div className={styles.panelHeader}><div><h2>Gross Merchandise Value trend</h2><p>{periodLabel} · booked order value</p><div className={styles.trendTotal}>{currency(selectedTotal)}</div></div><div className={styles.chartLegend}><span><i style={{ background: '#7181dc' }} />Booked value</span></div></div>
            {trend?.points?.length ? <><div className={styles.chart} role="img" aria-label={`Booked Gross Merchandise Value trend, ${trend.points.length} ${trend.granularity} buckets, total ${currency(selectedTotal)}`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend.points} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}><CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="3 4" /><XAxis dataKey="at" tickFormatter={value => labelFor(value, trend.granularity)} axisLine={false} tickLine={false} tick={{ fill: '#94a0b2', fontSize: 10 }} minTickGap={30} tickMargin={12} /><YAxis width={54} tickFormatter={compact} axisLine={false} tickLine={false} tick={{ fill: '#94a0b2', fontSize: 10 }} domain={[0, 'auto']} /><Tooltip content={<GmvTooltip granularity={trend.granularity} />} /><Area type="linear" dataKey="amount" stroke="#7181dc" fill="#eef0fd" strokeWidth={2.5} activeDot={{ r: 4, strokeWidth: 3, stroke: '#fff' }} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>{!trend.points.some(point => point.orders > 0) && <p className={styles.emptyChart}>No booked orders in this period. Try a wider date range.</p>}</> : <div className={styles.emptyQueue}>Trend data is unavailable. Please refresh.</div>}
            <p className={styles.chartFoot}>India time · excludes cancelled orders and B2B drafts</p>
        </section>
        <section className={styles.panel} aria-label="Active order breakdown chart">
            <div className={styles.panelHeader}><div><h2>Active order breakdown</h2><p>{activeTotal} orders · all booking dates</p></div><div className={styles.chartLegend}><span><i style={{ background: '#7181dc' }} />B2C</span><span><i style={{ background: '#72b5a7' }} />B2B</span></div></div>
            {stages?.length ? <><div className={styles.chart} role="img" aria-label={`Active workload by stage, ${activeTotal} orders`}><ResponsiveContainer width="100%" height="100%"><BarChart data={stages} margin={{ top: 25, right: 12, bottom: 0, left: -12 }} barSize={18}><CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="3 4" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a0b2', fontSize: 10 }} tickMargin={12} interval={0} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#94a0b2', fontSize: 10 }} /><Tooltip cursor={{ fill: '#f6f8fb' }} contentStyle={{ borderRadius: 7, border: '1px solid #e4e9f1', fontSize: 11 }} /><Bar dataKey="b2c" name="B2C" fill="#7181dc" radius={[3, 3, 0, 0]} isAnimationActive={false} /><Bar dataKey="b2b" name="B2B" fill="#72b5a7" radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>{activeTotal === 0 && <p className={styles.emptyChart}>No active orders right now.</p>}</> : <div className={styles.emptyQueue}>Order breakdown is unavailable. Please refresh.</div>}
            <p className={styles.chartFoot}>Current status counts · completed and cancelled orders excluded</p>
        </section>
    </div>;
}
