import { BASE_URL } from '../../../lib/api';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Download, ArrowDownLeft, ArrowUpRight, Wallet, RefreshCcw, ChevronDown, IndianRupee, X } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import MetricRow from '../components/cards/MetricRow';
import { adminApi, b2bOrderApi } from '../../../lib/api';
import toast from 'react-hot-toast';
import FilterField from "../components/common/FilterLabel";

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const CYCLES = ['Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Manual'];

const TABS = {
  customer: 'Customer Payments',
  vendor: 'Vendor Payouts',
  supplier: 'Supplier Payouts',
  refunds: 'Refunds'
};

const StatusPill = ({ value }) => {
  const tone = {
    Settled: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Released: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Pending: 'bg-amber-50 text-amber-700 border-amber-200',
    Outstanding: 'bg-amber-50 text-amber-700 border-amber-200',
    Held: 'bg-sky-50 text-sky-700 border-sky-200',
    Refunded: 'bg-rose-50 text-rose-700 border-rose-200'
  }[value] || 'bg-slate-100 text-slate-700 border-slate-200';
  return <span className={`px-2.5 py-1 text-[8px] font-black rounded-full uppercase tracking-wider border whitespace-nowrap ${tone}`}>{value}</span>;
};

const downloadCsv = (filename, header, rows) => {
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Payments. Every row and total comes from the database:
 *   Customer Payments  -> /admin/customer-payments (orders, cancelled excluded)
 *   Vendor Payouts     -> /admin/vendor-payments + recorded Payout history
 *   Supplier Payouts   -> paid supply orders held in escrow (/b2b-orders/admin/escrow)
 *   Refunds            -> /admin/refunds
 */
// What the date range and status filters mean on each Payments tab.
const DATE_FILTER_HELP = {
  customer: { name: 'Last order', field: "customer's most recent order date" },
  vendor: { name: 'Last payout', field: "vendor's most recent payout date" },
  supplier: { name: 'Updated', field: 'supply order last-updated date' },
  refunds: { name: 'Refunded', field: 'refund date' }
};
const STATUS_FILTER_HELP = {
  customer: 'Outstanding = the customer still owes money on their orders. Settled = nothing left to pay.',
  vendor: 'Pending = the vendor is owed money not yet paid out. Settled = fully paid out.',
  supplier: 'Held = paid by the vendor and held by Spinzyt, not yet released to the supplier. Released = paid out to the supplier.'
};

export default function Payments() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabKey = TABS[searchParams.get('tab')] ? searchParams.get('tab') : 'customer';
  const activeTab = TABS[tabKey];

  const [customerData, setCustomerData] = useState([]);
  const [vendorData, setVendorData] = useState([]);
  const [supplierData, setSupplierData] = useState([]);
  const [refundData, setRefundData] = useState({ summary: {}, refunds: [] });
  const [loading, setLoading] = useState(true);
  const [settlementCycle, setSettlementCycle] = useState('Weekly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', transactionId: '', paymentMethod: 'UPI' });
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState([]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [c, v, sup, ref] = await Promise.all([
        adminApi.getCustomerPayments(),
        adminApi.getVendorPayments(),
        b2bOrderApi.getAdminEscrowOrders(),
        adminApi.getRefunds()
      ]);
      setCustomerData(Array.isArray(c) ? c : []);
      setVendorData(Array.isArray(v) ? v : []);
      // Only delivered supply orders are payable to suppliers
      setSupplierData((Array.isArray(sup) ? sup : []).filter(o => ['DELIVERED', 'Delivered', 'SETTLED', 'Settled'].includes(o.status)));
      setRefundData(ref || { summary: {}, refunds: [] });
      const cycle = (Array.isArray(v) ? v : []).find(x => CYCLES.includes(x.settlementCycle))?.settlementCycle;
      if (cycle) setSettlementCycle(cycle);
    } catch (err) {
      console.error('Error fetching payment data:', err);
      toast.error('Could not load payment data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);
  useEffect(() => { setSelectedStatus('All'); }, [tabKey]);

  const saveSettlementCycle = async (cycle) => {
    const previous = settlementCycle;
    setSettlementCycle(cycle);
    try {
      const res = await adminApi.updateConfig('vendor_settlement_cycle', cycle);
      if (!res || res.message === 'Error updating config') throw new Error('Save failed');
      toast.success(`Settlement cycle set to ${cycle}`);
      fetchAllData(); // settlement dates depend on the cycle
    } catch {
      setSettlementCycle(previous);
      toast.error('Could not save settlement cycle');
    }
  };

  const openPay = (row) => {
    setPayTarget(row);
    setPayForm({ amount: String(Math.max(0, Math.round((row.pendingBalance || 0) * 100) / 100)), transactionId: '', paymentMethod: 'UPI' });
  };

  const submitPayout = async (e) => {
    e.preventDefault();
    const amount = Number(payForm.amount);
    if (!(amount > 0)) return toast.error('Enter an amount greater than 0');
    if (!payForm.transactionId.trim()) return toast.error('Enter the bank / UPI transaction reference');
    try {
      const res = await adminApi.recordVendorPayout({
        vendorId: payTarget._id,
        amount,
        transactionId: payForm.transactionId.trim(),
        paymentMethod: payForm.paymentMethod,
        notes: 'Admin manual settlement'
      });
      if (!res?.payout) throw new Error(res?.message || 'Failed to record payout');
      toast.success('Payout recorded');
      setPayTarget(null);
      fetchAllData();
    } catch (err) {
      toast.error(err.message || 'Failed to record payout');
    }
  };

  const openHistory = async (row) => {
    setHistoryFor(row);
    setHistory([]);
    try {
      setHistory(await adminApi.getVendorPayoutHistoryAdmin(row._id));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const releaseSupplier = async (row) => {
    if (!window.confirm(`Release ${inr(row.totalAmount)} held for order ${row.b2bOrderId} to the supplier? This cannot be undone.`)) return;
    try {
      const res = await b2bOrderApi.releasePayment(row._id);
      if (!res?.order) throw new Error(res?.message || 'Release failed');
      toast.success('Funds released to supplier');
      fetchAllData();
    } catch (err) {
      toast.error(err.message || 'Release failed');
    }
  };

  // ---- Rows per tab (all fields straight from the API) ----
  const rows = useMemo(() => {
    if (tabKey === 'customer') {
      return customerData.map(c => ({
        ...c,
        id: c._id,
        status: c.pendingBalance > 0 ? 'Outstanding' : 'Settled',
        date: c.lastOrderAt
      }));
    }
    if (tabKey === 'vendor') {
      return vendorData.map(v => ({ ...v, id: v._id, date: v.lastPayout }));
    }
    if (tabKey === 'supplier') {
      return supplierData.map(o => ({
        ...o,
        id: o._id,
        status: o.escrowStatus,
        date: o.updatedAt
      }));
    }
    return (refundData.refunds || []).map(r => ({ ...r, status: 'Refunded', date: r.refundedAt }));
  }, [tabKey, customerData, vendorData, supplierData, refundData]);

  const statusOptions = {
    customer: ['Outstanding', 'Settled'],
    vendor: ['Pending', 'Settled'],
    supplier: ['Held', 'Released'],
    refunds: []
  }[tabKey];

  const filteredRows = useMemo(() => rows.filter(r => {
    if (selectedStatus !== 'All' && r.status !== selectedStatus) return false;
    if (startDate || endDate) {
      if (!r.date) return false;
      const d = new Date(r.date);
      if (startDate && d < new Date(`${startDate}T00:00:00`)) return false;
      if (endDate && d > new Date(`${endDate}T23:59:59.999`)) return false;
    }
    return true;
  }), [rows, selectedStatus, startDate, endDate]);

  // ---- Headline figures per tab ----
  const stats = useMemo(() => {
    const sum = (list, f) => list.reduce((acc, x) => acc + (Number(f(x)) || 0), 0);
    if (tabKey === 'customer') return [
      { label: 'Total Billed', value: inr(sum(customerData, c => c.totalSpent)), icon: ArrowDownLeft },
      { label: 'Paid Online (Advance)', value: inr(sum(customerData, c => c.totalAdvancePaid)), icon: ArrowUpRight },
      { label: 'Outstanding', value: inr(sum(customerData, c => c.pendingBalance)), icon: Wallet },
      { label: 'Paying Customers', value: String(customerData.filter(c => c.totalOrders > 0).length), icon: RefreshCcw }
    ];
    if (tabKey === 'vendor') return [
      { label: 'Vendor Earnings', value: inr(sum(vendorData, v => v.totalEarnings)), icon: ArrowDownLeft },
      { label: 'Paid Out', value: inr(sum(vendorData, v => v.totalPaid)), icon: ArrowUpRight },
      { label: 'Owed to Vendors', value: inr(sum(vendorData, v => Math.max(0, v.pendingBalance))), icon: Wallet },
      { label: 'Vendors Awaiting Payout', value: String(vendorData.filter(v => v.pendingBalance > 0).length), icon: RefreshCcw }
    ];
    if (tabKey === 'supplier') {
      const held = supplierData.filter(o => o.escrowStatus === 'Held');
      return [
        { label: 'Held in Escrow', value: inr(sum(held, o => o.totalAmount)), icon: Wallet },
        { label: 'Orders Awaiting Release', value: String(held.length), icon: RefreshCcw },
        { label: 'Released to Suppliers', value: inr(sum(supplierData.filter(o => o.escrowStatus === 'Released'), o => o.totalAmount)), icon: ArrowUpRight },
        { label: 'Platform Fees on These', value: inr(sum(supplierData, o => o.platformFee)), icon: IndianRupee }
      ];
    }
    const s = refundData.summary || {};
    return [
      { label: 'Refunds', value: String(s.count || 0), icon: RefreshCcw },
      { label: 'Total Refunded', value: inr(s.total), icon: ArrowUpRight },
      { label: 'To Customer Wallets', value: inr(s.toWallet), icon: Wallet },
      { label: 'Online (Gateway)', value: inr(s.online), icon: ArrowDownLeft }
    ];
  }, [tabKey, customerData, vendorData, supplierData, refundData]);

  // ---- Columns per tab ----
  const columns = useMemo(() => {
    const money = (key, label, cls = 'text-slate-700') => ({
      header: label, key, align: 'right',
      render: (val) => <span className={`font-bold tabular-nums text-xs ${cls}`}>{inr(val)}</span>
    });
    const nameCell = (label, key, sub) => ({
      header: label, key,
      render: (val, row) => (
        <div className="flex flex-col">
          <span className="font-black text-slate-900 text-[11px] tracking-wider uppercase leading-none mb-1">{val || '—'}</span>
          {sub && <span className="text-[9px] text-slate-400 font-bold tabular-nums">{sub(row)}</span>}
        </div>
      )
    });

    if (tabKey === 'customer') return [
      nameCell('Customer', 'displayName', r => r.phone),
      { header: 'Orders', key: 'totalOrders', align: 'center', render: (v, r) => <span className="text-[10px] font-black text-slate-900">{v}{r.cancelledOrders ? <span className="text-slate-400"> (+{r.cancelledOrders} cancelled)</span> : ''}</span> },
      money('totalSpent', 'Billed', 'text-slate-900'),
      money('totalAdvancePaid', 'Paid Online'),
      money('totalCodPaid', 'Collected on Delivery'),
      money('pendingBalance', 'Outstanding', 'text-amber-700'),
      money('totalGst', 'GST'),
      money('totalPlatformFee', 'Platform Fee'),
      { header: 'Last Payment Ref', key: 'lastPaymentId', render: v => <span className="text-[10px] font-mono text-slate-500">{v || '—'}</span> },
      { header: 'Last Order', key: 'lastOrderAt', render: v => <span className="text-[10px] text-slate-500 tabular-nums">{fmtDate(v)}</span> },
      { header: 'Status', key: 'status', render: v => <StatusPill value={v} /> }
    ];

    if (tabKey === 'vendor') return [
      nameCell('Vendor', 'displayName', r => `${r.shopName && r.shopName !== 'N/A' ? `${r.shopName} · ` : ''}${r.phone}`),
      { header: 'Delivered Orders', key: 'totalOrders', align: 'center', render: v => <span className="text-[10px] font-black">{v}</span> },
      money('grossCollection', 'Gross Collection'),
      money('totalPlatformFee', 'Platform Fee'),
      money('gstOnFee', 'GST on Fee'),
      money('totalRefund', 'Refunded', 'text-rose-600'),
      money('totalEarnings', 'Earnings', 'text-slate-900'),
      money('totalPaid', 'Paid Out'),
      money('pendingBalance', 'Due', 'text-amber-700'),
      money('pendingRouteAmount', 'Routing', 'text-blue-700'),
      money('bankPendingAmount', 'Bank Settlement Pending', 'text-blue-700'),
      { header: 'Next Settlement', key: 'settlementDate', render: (v, r) => <span className="text-[10px] text-slate-500 tabular-nums">{r.settlementCycle === 'Archived' ? 'Archived' : v ? fmtDate(v) : (r.pendingBalance > 0 ? 'Manual' : '—')}</span> },
      { header: 'Razorpay Route', key: 'razorpayLinkedAccountId', render: (value, row) => <button className="text-xs text-blue-700 underline" onClick={async () => {
        const account = window.prompt('Vendor Razorpay linked account ID', value || '');
        if (!account) return;
        try {
          const response = await fetch(`${BASE_URL}/admin/vendor-payments/account/${row._id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message);
          toast.success('Linked account saved'); fetchAllData();
        } catch (error) { toast.error(error.message); }
      }}>{value || 'Configure linked account'}</button> },
      { header: 'Bank Account', key: 'bankAccount', render: v => <span className="text-[10px] text-slate-600 font-bold">{v || <span className="text-slate-400">Not added</span>}</span> },
      { header: 'Last Payout', key: 'lastPayout', render: (v, r) => <span className="text-[10px] text-slate-500">{v ? `${fmtDate(v)}${r.razorpayPayoutId && r.razorpayPayoutId !== 'N/A' ? ` · ${r.razorpayPayoutId}` : ''}` : '—'}</span> },
      { header: 'Status', key: 'status', render: v => <StatusPill value={v} /> },
      {
        header: 'Actions', key: 'actions', align: 'right',
        render: (_, row) => (
          <div className="flex items-center justify-end gap-1.5">
            {!row.isExVendor && row.pendingBalance > 0 && !String(row._id).startsWith('ex_') && (
              <button onClick={() => openPay(row)} className="px-3 py-1.5 bg-slate-900 text-white rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-black">
                Record Payout
              </button>
            )}
            {!String(row._id).startsWith('ex_') && (
              <button onClick={() => openHistory(row)} className="px-3 py-1.5 bg-slate-100 text-slate-800 rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-slate-200">
                History
              </button>
            )}
          </div>
        )
      }
    ];

    if (tabKey === 'supplier') return [
      { header: 'Order', key: 'b2bOrderId', render: (v, r) => <div className="flex flex-col"><span className="font-black text-[11px] tracking-wider">{v}</span><span className="text-[9px] text-slate-400">{fmtDate(r.updatedAt)}</span></div> },
      { header: 'Vendor (Payer)', key: 'vendor', render: (v, r) => <span className="text-[11px] font-bold uppercase">{v?.shopDetails?.name || v?.displayName || r.vendorSnapshot?.displayName || '—'}</span> },
      { header: 'Supplier (Payee)', key: 'supplier', render: (v, r) => <div className="flex flex-col"><span className="text-[11px] font-bold uppercase">{v?.supplierDetails?.businessName || v?.displayName || r.supplierSnapshot?.displayName || '—'}</span><span className="text-[9px] text-slate-400 tabular-nums">{v?.phone || ''}</span></div> },
      money('totalAmount', 'Order Value', 'text-slate-900'),
      money('platformFee', 'Platform Fee'),
      { header: 'Order Status', key: 'status', render: (_, r) => <span className="text-[9px] font-black uppercase text-slate-600">{String(r.status || '').replace(/_/g, ' ')}</span> },
      { header: 'Escrow', key: 'escrowStatus', render: v => <StatusPill value={v} /> },
      {
        header: 'Actions', key: 'actions', align: 'right',
        render: (_, row) => row.escrowStatus === 'Held' && ['DELIVERED', 'Delivered'].includes(row.status) ? (
          <button onClick={() => releaseSupplier(row)} className="px-3 py-1.5 bg-slate-900 text-white rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-black">
            Release to Supplier
          </button>
        ) : <span className="text-[9px] font-black uppercase text-emerald-600">Released</span>
      }
    ];

    return [
      { header: 'Type', key: 'kind', render: v => <span className="text-[9px] font-black uppercase text-slate-500">{v}</span> },
      { header: 'Order', key: 'reference', render: v => <span className="font-black text-[11px] tracking-wider">{v || '—'}</span> },
      { header: 'Refunded To', key: 'party', render: v => <span className="text-[11px] font-bold uppercase">{v}</span> },
      { header: 'Vendor / Supplier', key: 'counterparty', render: v => <span className="text-[11px] text-slate-600 uppercase">{v}</span> },
      money('amount', 'Amount', 'text-rose-600'),
      money('walletRefund', 'To Wallet'),
      money('onlineRefund', 'Online'),
      { header: 'Payment Ref', key: 'paymentReference', render: v => <span className="text-[10px] font-mono text-slate-500">{v || '—'}</span> },
      { header: 'Refunded On', key: 'refundedAt', render: v => <span className="text-[10px] text-slate-500 tabular-nums">{fmtDate(v)}</span> }
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);

  const handleExport = () => {
    const visible = columns.filter(c => c.key !== 'actions');
    const plain = (row, key) => {
      const v = row[key];
      if (v && typeof v === 'object') return v.shopDetails?.name || v.supplierDetails?.businessName || v.displayName || '';
      return v ?? '';
    };
    downloadCsv(
      `${activeTab.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`,
      visible.map(c => c.header),
      filteredRows.map(r => visible.map(c => plain(r, c.key)))
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
      <PageHeader
        title="Payments"
        actions={[{ label: 'Export CSV', icon: Download, variant: 'primary', onClick: handleExport }]}
      />

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {Object.entries(TABS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => navigate(`/admin/payments?tab=${key}`)}
              className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 whitespace-nowrap transition-colors ${key === tabKey ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-x divide-slate-100 max-w-[1600px] mx-auto w-full border-t border-slate-100">
          {stats.map(stat => <MetricRow key={stat.label} {...stat} value={loading ? '…' : stat.value} />)}
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto w-full">
        <DataGrid
          title=""
          showTotalEntities={false}
          showFilter={false}
          columns={columns}
          data={filteredRows}
          loading={loading}
          leftContent={
            <div className="flex items-end gap-2 flex-wrap">
              <FilterField label={`${DATE_FILTER_HELP[tabKey].name} from`} info={`Shows only rows whose ${DATE_FILTER_HELP[tabKey].field} is on or after this date.`}>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label={`${DATE_FILTER_HELP[tabKey].name} from`}
                  className="bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase text-slate-800 outline-none" />
              </FilterField>
              <FilterField label={`${DATE_FILTER_HELP[tabKey].name} to`} info={`Shows only rows whose ${DATE_FILTER_HELP[tabKey].field} is on or before this date (whole day included).`}>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label={`${DATE_FILTER_HELP[tabKey].name} to`}
                  className="bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase text-slate-800 outline-none" />
              </FilterField>
              {(startDate || endDate) && (
                <button onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-500 rounded-sm text-[9px] font-black uppercase">
                  Clear
                </button>
              )}
            </div>
          }
          actions={
            <div className="flex items-end gap-3 justify-end">
              {statusOptions.length > 0 && (
                <FilterField label="Status" info={STATUS_FILTER_HELP[tabKey]}>
                <div className="relative flex items-center w-[150px]">
                  <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} aria-label="Status"
                    className="w-full appearance-none bg-slate-50 border border-slate-200/80 rounded-sm pl-4 pr-10 py-1.5 text-[10px] font-bold uppercase text-slate-800 outline-none cursor-pointer">
                    <option value="All">All Statuses</option>
                    {statusOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 pointer-events-none text-slate-400" />
                </div>
                </FilterField>
              )}
              {tabKey === 'vendor' && (
                <FilterField label="Settlement cycle (setting)" info="Not a filter: this changes how often vendors are paid (it is saved immediately) and is used to show each vendor's next settlement date.">
                <div className="relative flex items-center w-[180px]">
                  <select value={settlementCycle} onChange={(e) => saveSettlementCycle(e.target.value)} aria-label="Settlement cycle"
                    className="w-full appearance-none bg-slate-50 border border-slate-200/80 rounded-sm pl-4 pr-10 py-1.5 text-[10px] font-bold uppercase text-slate-800 outline-none cursor-pointer">
                    {CYCLES.map(c => <option key={c} value={c}>Cycle: {c}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 pointer-events-none text-slate-400" />
                </div>
                </FilterField>
              )}
            </div>
          }
        />
      </div>

      {/* Record payout */}
      {payTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setPayTarget(null)} />
          <form onSubmit={submitPayout} className="relative bg-white w-full max-w-md rounded-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest">Record Payout · {payTarget.displayName}</h3>
              <button type="button" onClick={() => setPayTarget(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <p className="text-[11px] text-slate-500">Due: <b>{inr(payTarget.pendingBalance)}</b>{payTarget.bankAccount ? ` · ${payTarget.bankAccount}` : ' · No bank account on file'}. Record a transfer you have already made.</p>
            <label className="block text-[10px] font-black uppercase text-slate-500">Amount (₹)
              <input type="number" min="0.01" step="0.01" required value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-sm px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-slate-900" />
            </label>
            <label className="block text-[10px] font-black uppercase text-slate-500">Transaction reference
              <input type="text" required value={payForm.transactionId} onChange={e => setPayForm({ ...payForm, transactionId: e.target.value })}
                placeholder="UTR / UPI reference" className="mt-1 w-full border border-slate-200 rounded-sm px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-slate-900" />
            </label>
            <label className="block text-[10px] font-black uppercase text-slate-500">Method
              <select value={payForm.paymentMethod} onChange={e => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-sm px-3 py-2 text-sm font-bold text-slate-900 outline-none">
                {['UPI', 'Bank Transfer', 'Cash', 'Cheque'].map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
            <button type="submit" className="w-full py-3 bg-slate-900 text-white rounded-sm text-[10px] font-black uppercase tracking-widest">Save Payout</button>
          </form>
        </div>
      )}

      {/* Payout history */}
      {historyFor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setHistoryFor(null)} />
          <div className="relative bg-white w-full max-w-lg rounded-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest">Payout History · {historyFor.displayName}</h3>
              <button type="button" onClick={() => setHistoryFor(null)} aria-label="Close"><X size={16} /></button>
            </div>
            {history.length === 0 ? (
              <p className="text-[11px] text-slate-400 font-bold py-6 text-center">No payouts recorded yet.</p>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="text-[9px] font-black uppercase text-slate-400 text-left border-b border-slate-100">
                  <tr><th className="py-2">Date</th><th>Reference</th><th>Method</th><th className="text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {history.map(p => (
                    <tr key={p._id}>
                      <td className="py-2 tabular-nums">{fmtDate(p.paidAt)}</td>
                      <td className="font-mono text-[10px]">{p.transactionId}</td>
                      <td>{p.paymentMethod}</td>
                      <td className="text-right font-bold tabular-nums">{inr(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
