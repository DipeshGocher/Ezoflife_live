import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, IndianRupee, Bike, AlertCircle, RefreshCw, RotateCcw, CheckCircle2 } from 'lucide-react';
import DashboardCharts from './DashboardCharts';
import DashboardSuppliers from './DashboardSuppliers';
import { FinancialOverview, PartnersAndTimeline } from './DashboardOverview';
import styles from './Dashboard.module.css';
import MultiSelectFilter from '../components/common/MultiSelectFilter';
import { filterValues } from '../utils/filters';
import { dashboardApi } from '../../../lib/api';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);
const fieldClass = styles.field;
const unique = values => [...new Set(values)].sort();
const emptyGeography = { states: [], stateCityMap: {}, cityPincodeMap: {}, geofenceMap: {} };
const initialFilters = { channel: 'All', state: '', city: '', pincode: '', geofence: '', timeRange: 'Last 7 Days', startDate: '', endDate: '' };
function Metric({ title, value, icon: Icon, children }) {
    return <section className={styles.metric}><div className={styles.metricTop}><h2>{title}</h2><span className={styles.metricIcon}><Icon size={16} /></span></div><p className={styles.metricValue}>{value}</p><p className={styles.metricHint}>{children}</p></section>;
}
function AlertQueue({ title, queue }) {
    return <section className={styles.panel}>
        <div className={styles.queueHeader}><AlertCircle size={15} /><h2 aria-label={title}>{title}</h2><span className={styles.badge}>{queue.total}</span></div>
        {!queue.total ? <p className={styles.emptyQueue}><CheckCircle2 size={17} />No overdue orders.</p> : <div style={{ overflowX: 'auto' }}><table className={styles.queueTable}><thead><tr><th>Order</th><th>Deadline (IST)</th><th>Overdue</th></tr></thead><tbody>{queue.items.map(item => <tr key={item.key}><td><Link to={`/admin/orders/${item.orderId}`}>{item.orderNumber || item.orderId}</Link></td><td>{new Date(item.dueAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td><td>{item.overdueHours.toFixed(1)} h</td></tr>)}</tbody></table></div>}
        {queue.total > 0 && <p className={styles.queueFooter}>Page {queue.page} of {queue.pages} · {queue.total} total</p>}
    </section>;
}
export default function Dashboard() {
    const [filters, setFilters] = useState(initialFilters);
    const [page, setPage] = useState(1);
    const [geography, setGeography] = useState(emptyGeography);
    const [filterError, setFilterError] = useState('');
    const [report, setReport] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const activeRequest = useRef(null);
    const generation = useRef(0);
    const key = JSON.stringify({ ...filters, page });
    const incomplete = filters.timeRange === 'Custom Range' && (!filters.startDate || !filters.endDate);
    const loadFilters = useCallback(async () => {
        try {
            const response = await dashboardApi.getFilters();
            if (!response?.success || !response.data) throw new Error('Location filters are unavailable.');
            setGeography({ ...emptyGeography, ...response.data }); setFilterError('');
        } catch (failure) { setFilterError(failure.message || 'Location filters are unavailable.'); }
    }, []);
    useEffect(() => { loadFilters(); }, [loadFilters]);
    const refresh = useCallback(async () => {
        if (incomplete) return;
        const requestId = ++generation.current;
        activeRequest.current?.abort();
        const controller = new AbortController(); activeRequest.current = controller;
        let timedOut = false;
        const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
        setLoading(true); setError('');
        try {
            const response = await dashboardApi.getAnalytics({ ...JSON.parse(key), view: 'operational' }, { signal: controller.signal });
            if (requestId !== generation.current) return;
            if (!response?.success || !response.data?.activeOrders || !response.data?.gmv || !response.data?.ridersOnTrips || !response.data?.delayedPickups || !response.data?.unpaidDeliveries) throw new Error('Dashboard metrics are unavailable');
            const pages = Math.max(response.data.delayedPickups.pages, response.data.unpaidDeliveries.pages);
            if (JSON.parse(key).page > pages) setPage(pages);
            setReport({ ...response, key });
        } catch (failure) {
            if (requestId !== generation.current || (controller.signal.aborted && !timedOut)) return;
            setReport(null); setError(timedOut ? 'Dashboard request timed out. Please retry.' : failure.message || 'Dashboard metrics are unavailable');
        } finally { window.clearTimeout(timeout); if (requestId === generation.current) { setLoading(false); activeRequest.current = null; } }
    }, [key, incomplete]);
    const cancelRequest = useCallback(() => { ++generation.current; activeRequest.current?.abort(); activeRequest.current = null; }, []);
    useEffect(() => {
        refresh();
        const poll = () => { if (document.visibilityState === 'visible' && !activeRequest.current) { refresh(); loadFilters(); } };
        const timer = window.setInterval(poll, 60000);
        document.addEventListener('visibilitychange', poll);
        return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', poll); cancelRequest(); };
    }, [refresh, cancelRequest, loadFilters]);
    const change = (name, value) => {
        setPage(1);
        setFilters(previous => ({ ...previous, [name]: value, ...(name === 'state' ? { city: '', pincode: '', geofence: '' } : name === 'city' ? { pincode: '', geofence: '' } : {}) }));
    };
    const choices = useMemo(() => {
        const cities = filterValues(filters.state).length ? unique(filterValues(filters.state).flatMap(state => geography.stateCityMap[state] || [])) : unique([...Object.values(geography.stateCityMap).flat(), ...Object.keys(geography.cityPincodeMap), ...Object.keys(geography.geofenceMap)]);
        const selectedCities = filterValues(filters.city).length ? filterValues(filters.city) : cities;
        return { state: geography.states, city: cities, pincode: unique(selectedCities.flatMap(city => geography.cityPincodeMap[city] || [])), geofence: unique(selectedCities.flatMap(city => geography.geofenceMap[city] || [])) };
    }, [filters.state, filters.city, geography]);
    const current = !incomplete && report?.key === key ? report : null;
    const data = current?.data;
    const maxPage = data ? Math.max(data.delayedPickups.pages, data.unpaidDeliveries.pages) : page;
    const periodLabel = filters.timeRange === 'Custom Range' ? `${filters.startDate} – ${filters.endDate}` : filters.timeRange;
    const attention = data ? data.delayedPickups.total + data.unpaidDeliveries.total : 0;
    return <div className={styles.dashboard}>
        <header className={styles.header}>
            <div><h1>Dashboard</h1><p className={styles.subtitle}>Orders, revenue and fulfilment at a glance.</p></div>
            <div className={styles.actions}><button type="button" onClick={() => { setPage(1); setFilters(initialFilters); }} className={styles.button}><RotateCcw size={13} />Reset filters</button><button type="button" onClick={refresh} disabled={loading || incomplete} className={`${styles.button} ${styles.primary}`}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />Refresh</button></div>
        </header>
        <div className={styles.filters}>
            <label className={styles.filter}><span>Channel</span><select aria-label="Channel" className={fieldClass} value={filters.channel} onChange={event => change('channel', event.target.value)}>{['All', 'B2C', 'B2B'].map(value => <option key={value}>{value}</option>)}</select></label>
            {['state', 'city', 'pincode', 'geofence'].map(name => <div className={styles.filter} key={name}><span>{name}</span><MultiSelectFilter aria-label={`All ${name === 'city' ? 'cities' : `${name}s`}`} value={filters[name]} onChange={event => change(name, event.target.value)} className={fieldClass}><option value="">All {name === 'city' ? 'cities' : `${name}s`}</option>{choices[name].map(value => <option key={value} value={value}>{value}</option>)}</MultiSelectFilter></div>)}
            <label className={styles.filter}><span>Date range</span><select aria-label="Gross Merchandise Value period" className={fieldClass} value={filters.timeRange} onChange={event => change('timeRange', event.target.value)}>{['Today', 'Last 7 Days', 'Last 30 Days', 'Year-to-Date', 'Custom Range'].map(value => <option key={value}>{value}</option>)}</select></label>
            {filters.timeRange === 'Custom Range' && <div className={styles.customDates}><input aria-label="Start date" type="date" className={fieldClass} value={filters.startDate} onChange={event => change('startDate', event.target.value)} /><input aria-label="End date" type="date" className={fieldClass} value={filters.endDate} onChange={event => change('endDate', event.target.value)} /></div>}
        </div>
        {filterError && <p className={styles.message}>{filterError} <button className="underline" onClick={loadFilters}>Retry location filters</button></p>}
        {incomplete && <p className={styles.message}>Select both dates to update the report.</p>}
        {error && <div role="alert" className={`${styles.message} ${styles.error}`}>{error} <button onClick={refresh} className="ml-3 font-semibold underline">Retry dashboard</button></div>}
        {loading && !data && <p role="status" className={styles.update}>Updating dashboard…</p>}
        {data && <>
            {current.scope?.type === 'assigned_service_areas' && <p className={styles.message}>Accounts, orders and support reflect your assigned service areas: {current.scope.areas.join(', ')}. Unlocated records are excluded.</p>}
            <div className={styles.update}><span>Current workload · all booking dates</span><span title={new Date(current.measuredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}><i className={styles.statusDot} />{loading ? 'Updating…' : `Updated ${new Date(current.measuredAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`} · auto-refresh every minute</span></div>
            <div className={styles.metrics}>
                <Metric title="Active orders" value={data.activeOrders.total} icon={ShoppingBag}>{data.activeOrders.b2c} B2C · {data.activeOrders.b2b} B2B</Metric>
                <Metric title="Gross Merchandise Value today" value={money(data.gmv.today)} icon={IndianRupee}>Booked value since midnight, India time</Metric>
                <Metric title="Recorded riders on trips" value={filters.channel === 'B2B' ? '—' : data.ridersOnTrips.count} icon={Bike}>{filters.channel === 'B2B' ? 'Rider data unavailable for B2B' : `${data.ridersOnTrips.recordedTrips} active trips${data.ridersOnTrips.unidentifiedTrips ? ` · ${data.ridersOnTrips.unidentifiedTrips} rider unknown` : ''}`}</Metric>
                <Metric title="Needs attention" value={attention} icon={AlertCircle}>{data.delayedPickups.total} pickup{data.delayedPickups.total === 1 ? '' : 's'} · {data.unpaidDeliveries.total} unpaid {data.unpaidDeliveries.total === 1 ? 'delivery' : 'deliveries'}</Metric>
            </div>
            <FinancialOverview transactions={data.transactions} financials={data.financialOverview} periodLabel={periodLabel} />
            <DashboardCharts charts={data.charts} selectedTotal={data.gmv.selectedPeriod} activeTotal={data.activeOrders.total} periodLabel={periodLabel} />
            <DashboardSuppliers data={data.supplierOverview} periodLabel={periodLabel} onShowAll={() => change('channel', 'All')} />
            <PartnersAndTimeline partners={data.partnersAndClients} timeline={data.orderTimeline} periodLabel={periodLabel} />
            <div className={styles.queues}><AlertQueue title="Delayed pickups · over 2 hours" queue={data.delayedPickups} /><AlertQueue title="Unpaid deliveries · over 2 hours" queue={data.unpaidDeliveries} /></div>
            {maxPage > 1 && <nav aria-label="Alert pages" className={styles.pagination}><button className={styles.button} disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {maxPage}</span><button className={styles.button} disabled={page >= maxPage || loading} onClick={() => setPage(value => value + 1)}>Next</button></nav>}
            <details className={styles.notes}><summary>About these numbers</summary><div className={styles.notesContent}>
                <p>Gross Merchandise Value is booked order value, not cash collected. Cancelled orders and unpaid B2B drafts are excluded. The period filter applies to transaction values, the financial overview and the order timeline; active orders and alerts include all booking dates.</p>
                <p>Rider counts use stored B2C assignments, not live GPS availability. {data.ridersOnTrips.unidentifiedTrips} trips have no recorded rider identity.</p>
                <p>{data.geographyBasis}</p>
                <p>Alerts cover B2C orders. Unpaid-delivery alerts require a delivery timestamp, pending payment and a positive balance.{data.coverage && <> {data.coverage.unpaidDeliveriesWithoutTimestamp} pending deliveries lack a delivery timestamp.</>}</p>
            </div></details>
        </>}
    </div>;
}
