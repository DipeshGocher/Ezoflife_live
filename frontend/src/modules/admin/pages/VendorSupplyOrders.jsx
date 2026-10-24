import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import { b2bOrderApi } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import FilterField from "../components/common/FilterLabel";

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const ruleText = (rule) => {
    if (!rule || rule.type === 'NONE') return null;
    const base = rule.type === 'FLAT' ? `₹${rule.value}/order` : `${rule.value}%`;
    return `${base} · ${rule.source === 'ZONE' ? 'zone' : 'global'}`;
};

const FEE_STATUS = {
    PAID: { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    PENDING: { label: 'Unpaid', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    NOT_APPLICABLE: { label: 'No Fee', cls: 'bg-slate-50 text-slate-500 border-slate-200' }
};

// Orders placed before per-order fee tracking have no platformFeeStatus.
const feeStatusOf = (o) => {
    if (o.platformFeeStatus) return o.platformFeeStatus;
    if (!(o.platformFee > 0)) return 'NOT_APPLICABLE';
    return o.status === 'PENDING_PAYMENT' ? 'PENDING' : 'PAID';
};

export default function VendorSupplyOrders() {
    const [orders, setOrders] = useState([]);
    const [summary, setSummary] = useState({ count: 0, collectedFees: 0, pendingFees: 0, goodsValue: 0 });
    const [loading, setLoading] = useState(true);
    const [feeFilter, setFeeFilter] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await b2bOrderApi.getAdminAllOrders();
            setOrders(data.orders || []);
            setSummary(data.summary || {});
        } catch (err) {
            toast.error(err.message || 'Failed to load vendor supply orders');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const visibleOrders = useMemo(
        () => (feeFilter ? orders.filter(o => feeStatusOf(o) === feeFilter) : orders),
        [orders, feeFilter]
    );

    const columns = useMemo(() => [
        {
            header: 'Order',
            key: 'b2bOrderId',
            render: (val, row) => (
                <div className="flex flex-col">
                    <span className="font-black text-slate-900 text-[11px] tracking-wider">{val || row._id?.slice(-8).toUpperCase()}</span>
                    <span className="text-[9px] text-slate-400 font-bold">{new Date(row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
            )
        },
        {
            header: 'Vendor',
            key: 'vendor',
            render: (val, row) => (
                <div className="flex flex-col">
                    <span className="font-bold text-slate-800 text-[11px] uppercase">{val?.shopDetails?.name || val?.displayName || row.vendorSnapshot?.displayName || '—'}</span>
                    <span className="text-[9px] text-slate-400 font-bold tabular-nums">{val?.phone || row.vendorSnapshot?.phone || ''}</span>
                </div>
            )
        },
        {
            header: 'Supplier',
            key: 'supplier',
            render: (val, row) => (
                <div className="flex flex-col">
                    <span className="font-bold text-slate-800 text-[11px] uppercase">{val?.supplierDetails?.businessName || val?.displayName || row.supplierSnapshot?.displayName || 'Unassigned'}</span>
                    <span className="text-[9px] text-slate-400 font-bold tabular-nums">{val?.phone || row.supplierSnapshot?.phone || ''}</span>
                </div>
            )
        },
        {
            header: 'Items',
            key: 'items',
            render: (val) => (
                <span className="text-[11px] font-bold text-slate-600 tabular-nums">{Array.isArray(val) ? val.length : 0}</span>
            )
        },
        {
            header: 'Goods Value',
            key: 'totalAmount',
            render: (val) => <span className="font-bold text-slate-900 tabular-nums text-[11px]">{inr(val)}</span>
        },
        {
            header: 'Platform Fee',
            key: 'platformFee',
            render: (val, row) => {
                const status = FEE_STATUS[feeStatusOf(row)];
                const rule = ruleText(row.platformFeeRule);
                return (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 tabular-nums text-[11px]">{val > 0 ? inr(val) : '—'}</span>
                            <span className={`px-1.5 py-0.5 rounded-sm border text-[8px] font-black uppercase tracking-wider ${status.cls}`}>{status.label}</span>
                        </div>
                        {rule && <span className="text-[9px] text-slate-400 font-bold">{rule}</span>}
                    </div>
                );
            }
        },
        {
            header: 'Order Status',
            key: 'status',
            render: (val) => (
                <span className="px-2 py-0.5 rounded-sm bg-slate-100 border border-slate-200 text-[9px] font-black uppercase tracking-wider text-slate-700 whitespace-nowrap">
                    {String(val || '').replace(/_/g, ' ')}
                </span>
            )
        }
    ], []);

    const cards = [
        { label: 'Platform Fees Collected', value: inr(summary.collectedFees) },
        { label: 'Platform Fees Unpaid', value: inr(summary.pendingFees) },
        { label: 'Goods Value', value: inr(summary.goodsValue) },
        { label: 'Orders', value: summary.count || 0 }
    ];

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader
                title="Vendor Supply Orders"
                actions={[{ label: 'Refresh', icon: RefreshCw, onClick: load }]}
            />

            <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto w-full">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {cards.map(c => (
                        <div key={c.label} className="bg-white border border-slate-200 rounded-sm p-5">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{c.label}</p>
                            <p className="text-xl font-black text-slate-900 tabular-nums mt-2">{c.value}</p>
                        </div>
                    ))}
                </div>

                <DataGrid
                    title=""
                    columns={columns}
                    data={visibleOrders}
                    loading={loading}
                    showFilter={false}
                    actions={
                        <FilterField label="Platform fee" info="Fee Paid = the vendor paid Spinzyt's platform fee. Fee Unpaid = awaiting the fee payment. No Fee = no platform fee applied to the order.">
                        <select
                            value={feeFilter}
                            onChange={e => setFeeFilter(e.target.value)}
                            aria-label="Filter by platform fee status"
                            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none uppercase tracking-wider cursor-pointer"
                        >
                            <option value="">All Fee Status</option>
                            <option value="PAID">Fee Paid</option>
                            <option value="PENDING">Fee Unpaid</option>
                            <option value="NOT_APPLICABLE">No Fee</option>
                        </select>
                        </FilterField>
                    }
                />
            </div>
        </div>
    );
}
