import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import styles from './Dashboard.module.css';
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);
const colors = ['#7181dc', '#72b5a7', '#dcb67b'];
const time = value => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const statusLabels = { ORDER_BOOKED: 'Order booked', ORDER_CREATED: 'Supply order created', PICKUP_ASSIGNED: 'Pickup assigned', RIDER_ARRIVING: 'Rider arriving', IN_TRANSIT: 'In transit to vendor', RECEIVED_BY_VENDOR: 'Received by vendor', PROCESSING: 'Processing started', READY_FOR_DISPATCH: 'Ready for dispatch', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };
export function FinancialOverview({ transactions, financials, periodLabel }) {
    return <section className={`${styles.panel} ${styles.finances}`} aria-label="Financial overview">
        <div className={styles.panelHeader}><div><h2>Financial overview</h2><p>{periodLabel} · orders booked in this period</p></div><span className={styles.sectionTag}>Recorded order figures</span></div>
        {transactions && financials ? <>
            <div className={styles.transactionRow}><div><h3>Combined transaction value</h3><strong>{money(transactions.total)}</strong><p>Customer orders + vendor supply orders</p></div>
                <div className={styles.transactionSplit}><div><span><i style={{ background: colors[0] }} />Customer orders</span><strong>{money(transactions.customerValue)}</strong><small>{transactions.customerOrders} orders</small></div><div><span><i style={{ background: colors[1] }} />Vendor supply orders</span><strong>{money(transactions.supplyValue)}</strong><small>{transactions.supplyOrders} orders</small></div></div>
            </div>
            <div className={styles.financeGrid}>
                {[['Paid order value', financials.paidOrderValue, 'Orders currently marked paid'], ['Customer balances due', financials.customerOutstanding, 'Recorded outstanding amount'], ['Pending supply payments', financials.supplyPendingValue, 'Supply orders marked pending'], ['Recorded platform fees', financials.platformFees, 'Fees stored on eligible orders']].map(([label, value, hint]) => <div key={label}><h3>{label}</h3><strong>{money(value)}</strong><p>{hint}</p></div>)}
            </div>
            <div className={styles.financeFoot}><span>Orders marked refunded: <strong>{financials.refundMarkedOrders}</strong> · order value <strong>{money(financials.refundMarkedValue)}</strong></span><span>Booked values and payment labels do not establish bank receipts, refunds or net profit.</span></div>
        </> : <p className={styles.emptyQueue}>Financial figures are unavailable. Please refresh.</p>}
    </section>;
}
function TypeList({ title, rows }) {
    return <div className={styles.typeGroup}><h3>{title}</h3>{rows.length ? rows.map(row => <div key={row.name}><span>{row.name}</span><strong>{row.count}</strong></div>) : <p>No accounts in this group.</p>}</div>;
}
export function PartnersAndTimeline({ partners, timeline, periodLabel }) {
    const groups = partners ? [{ name: 'Clients', value: partners.clients }, { name: 'Vendors', value: partners.vendors }, { name: 'Suppliers', value: partners.suppliers }] : [];
    return <div className={styles.overviewGrid}>
        <section className={styles.panel} aria-label="Partners and clients">
            <div className={styles.panelHeader}><div><h2>Partners and clients</h2><p>Current registered accounts · selected channel and locations</p></div></div>
            {partners ? <><div className={styles.partnersSummary}><div className={styles.partnerChart} role="img" aria-label={`${partners.clients} clients, ${partners.vendors} vendors, ${partners.suppliers} suppliers`}>
                {partners.total ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={groups} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="92%" paddingAngle={3} stroke="none" isAnimationActive={false}>{groups.map((group, index) => <Cell key={group.name} fill={colors[index]} />)}</Pie><Tooltip contentStyle={{ fontSize: 11, borderRadius: 7 }} /></PieChart></ResponsiveContainer> : <div className={styles.noPartners}>0 accounts</div>}
                {partners.total > 0 && <div className={styles.donutTotal}><strong>{partners.total}</strong><span>accounts</span></div>}
            </div><div className={styles.partnerLegend}>{groups.map((group, index) => <div key={group.name}><i style={{ background: colors[index] }} /><span>{group.name}</span><strong>{group.value}</strong></div>)}</div></div>
                <div className={styles.types}><TypeList title="Client types" rows={partners.clientTypes} /><TypeList title="Vendor business types" rows={partners.vendorTypes} /><TypeList title="Supplier types" rows={partners.supplierTypes} /></div>
            </> : <p className={styles.emptyQueue}>Partner figures are unavailable. Please refresh.</p>}
        </section>
        <section className={styles.panel} aria-label="Order timeline">
            <div className={styles.panelHeader}><div><h2>Order timeline</h2><p>{periodLabel} · recent recorded events</p></div>{timeline && <span className={styles.sectionTag}>{timeline.total} events</span>}</div>
            {timeline?.items?.length ? <ol className={styles.timeline}>{timeline.items.map(event => <li key={event.key}><i /><div><div className={styles.eventTitle}>{event.channel === 'customer' ? <Link to={`/admin/orders/${event.orderId}`}>{event.orderNumber}</Link> : <strong>{event.orderNumber}</strong>}<time dateTime={event.at}>{time(event.at)}</time></div><p>{statusLabels[event.status] || event.status.toLowerCase().replaceAll('_', ' ')}<span>{event.channel === 'customer' ? 'Customer order' : 'Vendor supply order'}</span></p></div></li>)}</ol> : <p className={styles.emptyQueue}>{timeline ? 'No recorded order events in this period.' : 'Order events are unavailable. Please refresh.'}</p>}
            <p className={styles.chartFoot}>Latest 12 events. Supply orders show creation only; delivery milestones are not timestamped.</p>
        </section>
    </div>;
}
