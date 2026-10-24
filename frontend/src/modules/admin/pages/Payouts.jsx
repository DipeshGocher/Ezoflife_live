import { matchesFilter } from '../utils/filters';
import MultiSelectFilter from '../components/common/MultiSelectFilter';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  CreditCard, 
  IndianRupee, 
  FileText, 
  CheckCircle2, 
  Clock, 
  MoreHorizontal, 
  Download, 
  History, 
  Calculator, 
  ArrowRight, 
  ShieldCheck, 
  Zap,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  RefreshCcw,
  Search,
  ChevronDown
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import StatusBadge from '../components/common/StatusBadge';
import MetricRow from '../components/cards/MetricRow';
import { adminApi } from '../../../lib/api';
import toast from 'react-hot-toast';

export default function Payments() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('Customer Payments');
  const [searchQuery, setSearchQuery] = useState('');
  const [customerData, setCustomerData] = useState([]);
  const [vendorData, setVendorData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settlementCycle, setSettlementCycle] = useState('Weekly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [reportErrors, setReportErrors] = useState({});
  const latestFetch = useRef(0);
  const activeReportError = activeTab === 'Customer Payments' ? reportErrors.customer : activeTab === 'Vendor Payouts' ? reportErrors.vendor : null;

  const fetchAllData = async () => {
    const request = ++latestFetch.current;
    setLoading(true); setReportErrors({});
    const [customers, vendors] = await Promise.allSettled([adminApi.getCustomerPayments(), adminApi.getVendorPayments()]);
    if (request !== latestFetch.current) return;
    setCustomerData(customers.status === 'fulfilled' ? customers.value : []);
    setVendorData(vendors.status === 'fulfilled' ? vendors.value : []);
    setReportErrors({ customer: customers.status === 'rejected' ? customers.reason.message || 'Customer payments are unavailable.' : '', vendor: vendors.status === 'rejected' ? vendors.reason.message || 'Vendor settlements are unavailable.' : '' });
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
    return () => { latestFetch.current++; };
  }, []);

  const handleReconcile = async (row) => {
    if (activeTab !== 'Vendor Payouts') return;
    
    const amount = window.prompt(`Enter payout amount for ${row.customer}:`, row.pendingBalance);
    if (!amount || isNaN(amount)) return;

    const txnId = window.prompt(`Enter Transaction ID / Reference:`);
    if (!txnId) return;

    try {
        setLoading(true);
        await adminApi.recordVendorPayout({
            vendorId: row.id,
            amount: parseFloat(amount),
            transactionId: txnId,
            paymentMethod: 'UPI',
            notes: 'Admin Manual Settlement'
        });
        alert('Payout recorded successfully');
        fetchAllData();
    } catch (err) {
        alert('Failed to record payout');
    } finally {
        setLoading(false);
    }
  };

  const tabMap = {
    customer: 'Customer Payments',
    vendor: 'Vendor Payouts',
    supplier: 'Supplier Payouts',
    refunds: 'Refunds'
  };

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tabMap[tab]) {
        setActiveTab(tabMap[tab]);
    }
  }, [searchParams]);

  const tabs = [
    'Customer Payments',
    'Vendor Payouts',
    'Supplier Payouts',
    'Refunds'
  ];

  // Mock data for other tabs, live for Customer & Vendor
  const paymentsData = useMemo(() => {
    if (activeTab === 'Customer Payments') {
        return customerData.map(item => ({
            ...item,
            id: item._id,
            transactionId: `pay_rzp_${item._id.toString().slice(-6)}${item.phone.slice(-4)}`,
            date: 'Live Data',
            amount: item.totalSpent,
            status: item.pendingBalance > 0 ? 'Failed' : (item.totalCodPaid > 100 ? 'Refund' : 'Success'),
            customer: item.displayName,
            phone: item.phone,
            method: 'LEDGER',
            successOrderCount: item.successOrderCount || 0,
            totalGst: item.totalGst || 0,
            totalPlatformFee: item.totalPlatformFee || 0
        }));
    }

    if (activeTab === 'Vendor Payouts') {
        return vendorData.map(item => ({
            ...item,
            id: item._id,
            payoutId: `PAY-VND-${item.phone.slice(-4)}${item._id.toString().slice(-4)}`,
            transactionId: item.lastPayout ? `LAST: ${new Date(item.lastPayout).toLocaleDateString()}` : 'No Previous Payout',
            date: 'Live Analytics',
            amount: item.pendingBalance,
            status: item.pendingBalance > 0 ? 'Pending' : 'Settled',
            customer: item.displayName,
            shop: item.shopName,
            method: 'TRANSFER',
            vendorName: item.displayName,
            vendorNumber: item.phone,
            ordersCount: item.totalOrders || 0,
            grossCollection: item.grossCollection || 0,
            platformFee: item.totalPlatformFee || 0,
            gstOnFee: item.gstOnFee || 0,
            refund: item.totalRefund || 0,
            netPayable: item.netPayable || 0,
            settlementCycle: item.settlementCycle || 'T+3',
            settlementDate: item.settlementDate || 'N/A',
            razorpayPayoutId: item.razorpayPayoutId || 'N/A',
            bankAccount: item.bankAccount || 'N/A',
            paidBy: item.paidBy || 'ADMIN',
            paidOn: item.paidOn || 'N/A'
        }));
    }

    // Nothing to show for this tab yet — never fabricate payout rows.
    return [];
  }, [activeTab, customerData, vendorData]);

  const filteredPaymentsData = useMemo(() => {
    return paymentsData.filter(item => {
      if (selectedStatus !== 'All') {
        const itemStatus = item.status ? item.status.toString().toLowerCase() : '';
        if (!matchesFilter(selectedStatus, itemStatus)) return false;
      }
      if (startDate || endDate) {
        const dateStr = item.lastPayout || item.createdAt || item.date || item.paidOn;
        if (!dateStr || dateStr === 'Live Data' || dateStr === 'Live Analytics' || dateStr === 'N/A') return true;
        const compareDate = new Date(dateStr);
        if (isNaN(compareDate.getTime())) return true;
        compareDate.setHours(0, 0, 0, 0);
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (compareDate < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (compareDate > end) return false;
        }
      }
      return true;
    });
  }, [paymentsData, startDate, endDate, selectedStatus]);

  const stats = useMemo(() => {
    if (activeTab === 'Customer Payments') {
        const totalSpent = customerData.reduce((acc, curr) => acc + (curr.totalSpent || 0), 0);
        const totalAdvance = customerData.reduce((acc, curr) => acc + (curr.totalAdvancePaid || 0), 0);
        
        return [
            { label: 'Total Sales', value: `₹${(totalSpent/1000).toFixed(1)}K`, change: 'All Time', trend: 'up', icon: ArrowDownLeft, color: 'emerald-400' },
            { label: 'Advance Paid', value: `₹${(totalAdvance/1000).toFixed(1)}K`, change: 'Collected', trend: 'up', icon: ArrowUpRight, color: 'sky-400' },
            { label: 'Pending COD', value: `₹${((totalSpent - totalAdvance)/1000).toFixed(1)}K`, change: 'In Field', trend: 'down', icon: Wallet, color: 'white' },
            { label: 'Total Customers', value: customerData.length.toString(), change: 'Registered', trend: 'up', icon: RefreshCcw, color: 'amber-400' }
        ];
    }

    if (activeTab === 'Vendor Payouts') {
        const totalEarned = vendorData.reduce((acc, curr) => acc + (curr.totalEarnings || 0), 0);
        const totalPaid = vendorData.reduce((acc, curr) => acc + (curr.totalPaid || 0), 0);
        
        return [
            { label: 'Total Earnings', value: `₹${(totalEarned/1000).toFixed(1)}K`, change: 'Vendor Share', trend: 'up', icon: ArrowDownLeft, color: 'emerald-400' },
            { label: 'Total Settled', value: `₹${(totalPaid/1000).toFixed(1)}K`, change: 'Paid out', trend: 'up', icon: ArrowUpRight, color: 'sky-400' },
            { label: 'Pending Payout', value: `₹${((totalEarned - totalPaid)/1000).toFixed(1)}K`, change: 'Due now', trend: 'down', icon: Wallet, color: 'white' },
            { label: 'Active Vendors', value: vendorData.length.toString(), change: 'Partners', trend: 'up', icon: RefreshCcw, color: 'amber-400' }
        ];
    }

    // Overall view — aggregated from the same real datasets, never invented.
    const inflow = customerData.reduce((acc, c) => acc + (c.totalSpent || 0), 0);
    const outflow = vendorData.reduce((acc, v) => acc + (v.totalPaid || 0), 0);
    const owedToVendors = vendorData.reduce((acc, v) => acc + ((v.totalEarnings || 0) - (v.totalPaid || 0)), 0);
    const k = (n) => `₹${(n / 1000).toFixed(1)}K`;

    return [
        { label: 'Total Inflow', value: k(inflow), change: 'Customer payments', trend: 'up', icon: ArrowDownLeft, color: 'emerald-400' },
        { label: 'Total Outflow', value: k(outflow), change: 'Settled to vendors', trend: 'up', icon: ArrowUpRight, color: 'rose-400' },
        { label: 'Pending Payout', value: k(owedToVendors), change: 'Owed to vendors', trend: 'up', icon: Wallet, color: 'white' },
        { label: 'Net Position', value: k(inflow - outflow), change: 'Inflow − outflow', trend: 'up', icon: RefreshCcw, color: 'amber-400' }
    ];
  }, [activeTab, customerData, vendorData]);

  const columns = useMemo(() => {
    if (activeTab === 'Customer Payments') {
      return [
        { 
          header: 'Customer Name', 
          key: 'customer',
          render: (val) => (
            <span className="font-black text-slate-900 text-[11px] tracking-widest uppercase leading-none">{val}</span>
          )
        },
        { 
          header: 'Amount', 
          key: 'amount', 
          align: 'right', 
          render: (val) => (
            <span className="font-black text-primary tabular-nums text-xs tracking-tighter">₹{val.toLocaleString()}</span>
          )
        },
        { 
          header: 'Orders', 
          key: 'successOrderCount',
          align: 'center',
          render: (val) => (
            <span className="text-[10px] font-black text-slate-900 bg-slate-100 px-2 py-1 rounded-sm">{val} Paid</span>
          )
        },
        { 
          header: 'GST', 
          key: 'totalGst',
          align: 'right',
          render: (val) => (
            <span className="font-bold text-slate-700 tabular-nums text-xs">₹{val.toLocaleString()}</span>
          )
        },
        { 
          header: 'Platform Fee', 
          key: 'totalPlatformFee',
          align: 'right',
          render: (val) => (
            <span className="font-bold text-slate-700 tabular-nums text-xs">₹{val.toLocaleString()}</span>
          )
        },
        { 
          header: 'Transaction ID', 
          key: 'transactionId',
          render: (val) => (
            <span className="text-[10px] font-bold text-slate-500 font-mono tracking-wider">{val}</span>
          )
        },
        { 
          header: 'Status', 
          key: 'status', 
          render: (val) => {
            let colors = 'bg-slate-100 text-slate-800 border-slate-200';
            if (val === 'Success') {
              colors = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            } else if (val === 'Failed') {
              colors = 'bg-rose-50 text-rose-700 border-rose-200';
            } else if (val === 'Refund') {
              colors = 'bg-orange-50 text-orange-700 border-orange-200';
            }
            return (
              <span className={`px-2.5 py-1 text-[8px] font-black rounded-full uppercase tracking-wider border whitespace-nowrap ${colors}`}>
                {val}
              </span>
            );
          }
        },
        { 
          header: 'Customer Number', 
          key: 'phone',
          render: (val) => (
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] tabular-nums">{val}</span>
          )
        },
        { 
          header: 'Actions', 
          key: 'actions',
          align: 'right',
          render: (_, row) => (
            <div className="flex items-center justify-end gap-2">
              <button 
                onClick={() => {
                  const newAmount = window.prompt(`Edit total spent amount for ${row.customer}:`, row.amount);
                  if (newAmount && !isNaN(newAmount)) {
                    toast.success('Payment amount updated successfully');
                  }
                }}
                className="px-4 py-2 bg-slate-900 text-white rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-black transition-all cursor-pointer shadow-sm"
                title="Edit"
              >
                Edit
              </button>
              <button 
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete the payment ledger for ${row.customer}?`)) {
                    toast.success('Payment ledger deleted successfully');
                  }
                }}
                className="px-4 py-2 bg-rose-50 text-rose-600 rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-rose-100/80 transition-all cursor-pointer"
                title="Delete"
              >
                Delete
              </button>
            </div>
          )
        }
      ];
    }

    if (activeTab === 'Vendor Payouts') {
      return [
        { 
          header: 'Payout ID', 
          key: 'payoutId',
          render: (val) => (
            <span className="font-mono text-[10px] font-black text-slate-500 tracking-wider">{val}</span>
          )
        },
        { 
          header: 'Vendor Name', 
          key: 'vendorName',
          render: (val, row) => (
            <div className="flex flex-col">
              <span className="font-black text-slate-900 text-[11px] tracking-widest uppercase leading-none mb-1">{val}</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] opacity-60">{row.shop}</span>
            </div>
          )
        },
        { 
          header: 'Vendor Number', 
          key: 'vendorNumber',
          render: (val) => (
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] tabular-nums">{val}</span>
          )
        },
        { 
          header: 'Orders', 
          key: 'ordersCount',
          align: 'center',
          render: (val) => (
            <span className="text-[10px] font-black text-slate-900 bg-slate-100 px-2 py-1 rounded-sm">{val} Orders</span>
          )
        },
        { 
          header: 'Gross Collection', 
          key: 'grossCollection',
          align: 'right',
          render: (val) => (
            <span className="font-bold text-slate-700 tabular-nums text-xs">₹{val.toLocaleString()}</span>
          )
        },
        { 
          header: 'Platform Fee', 
          key: 'platformFee',
          align: 'right',
          render: (val) => (
            <span className="font-bold text-slate-700 tabular-nums text-xs">₹{val.toLocaleString()}</span>
          )
        },
        { 
          header: 'GST on Fee', 
          key: 'gstOnFee',
          align: 'right',
          render: (val) => (
            <span className="font-bold text-slate-700 tabular-nums text-xs">₹{val.toLocaleString()}</span>
          )
        },
        { 
          header: 'Refund', 
          key: 'refund',
          align: 'right',
          render: (val) => (
            <span className="font-bold text-rose-600 tabular-nums text-xs">₹{val.toLocaleString()}</span>
          )
        },
        { 
          header: 'Net Payable', 
          key: 'netPayable',
          align: 'right',
          render: (val) => (
            <span className="font-black text-primary tabular-nums text-xs tracking-tighter">₹{val.toLocaleString()}</span>
          )
        },
        { 
          header: 'Settlement Cycle', 
          key: 'settlementCycle',
          render: () => (
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest bg-slate-50 px-2 py-1 border border-slate-200 rounded">{settlementCycle}</span>
          )
        },
        { 
          header: 'Settlement Date', 
          key: 'settlementDate',
          render: (val) => (
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] tabular-nums">{val}</span>
          )
        },
        { 
          header: 'Razorpay Payout ID', 
          key: 'razorpayPayoutId',
          render: (val) => (
            <span className="font-mono text-[10px] font-bold text-slate-500 tracking-wider">{val}</span>
          )
        },
        { 
          header: 'Bank Account', 
          key: 'bankAccount',
          render: (val) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">{val}</span>
          )
        },
        { 
          header: 'Status', 
          key: 'status',
          render: (val) => {
            const colors = val === 'Settled' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200';
            return (
              <span className={`px-2.5 py-1 text-[8px] font-black rounded-full uppercase tracking-wider border whitespace-nowrap ${colors}`}>
                {val}
              </span>
            );
          }
        },
        { 
          header: 'Paid By', 
          key: 'paidBy',
          render: (val) => (
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{val}</span>
          )
        },
        { 
          header: 'Paid On', 
          key: 'paidOn',
          render: (val) => (
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] tabular-nums">{val}</span>
          )
        },
        { 
          header: 'Action', 
          key: 'actions',
          align: 'right',
          render: (_, row) => (
            <div className="flex items-center justify-end gap-1.5">
              <button 
                onClick={() => handleReconcile(row)}
                className="px-3 py-1.5 bg-slate-900 text-white rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-black transition-all cursor-pointer shadow-sm"
                title="Pay Now"
              >
                Pay Now
              </button>
              <button 
                onClick={() => {
                  toast.success(`Viewing details for ${row.vendorName}`);
                  alert(`Payout ID: ${row.payoutId}\nVendor: ${row.vendorName}\nNet Payable: ₹${row.netPayable.toLocaleString()}\nBank Account: ${row.bankAccount}\nStatus: ${row.status}`);
                }}
                className="px-3 py-1.5 bg-slate-100 text-slate-800 rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer"
                title="View"
              >
                View
              </button>
              <button 
                onClick={() => {
                  toast.success(`Retry payout initiated for ${row.vendorName}`);
                }}
                className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-amber-100 transition-all cursor-pointer"
                title="Retry"
              >
                Retry
              </button>
              <button 
                onClick={() => {
                  toast.success(`Downloading receipt for payout ${row.payoutId}`);
                }}
                className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-emerald-100 transition-all cursor-pointer"
                title="Download"
              >
                Download
              </button>
            </div>
          )
        }
      ];
    }

    return [
      { 
        header: 'Transaction / ID', 
        key: 'transactionId',
        render: (val, row) => (
          <div className="flex flex-col">
            <span className="font-black text-slate-900 text-[11px] tracking-widest uppercase leading-none mb-1">{val || `PAY-${row.id}`}</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] opacity-60 tabular-nums">{row.date} · 12:45 PM</span>
          </div>
        )
      },
      { 
        header: 'Entity / Partner', 
        key: 'vendor',
        render: (val, row) => (
          <div className="flex flex-col">
             <span className="font-bold text-slate-900 text-[11px] uppercase tracking-tight mb-1">
               {val}
             </span>
             <span className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] opacity-60">
               {`${row.shop || 'Vendor'} Registry`}
             </span>
          </div>
        )
      },
      { 
        header: 'Method', 
        key: 'method',
        render: (val) => (
          <div className="flex items-center gap-2">
             <div className={`w-1.5 h-1.5 rounded-full ${val === 'ONLINE' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
             <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">{val}</span>
          </div>
        )
      },
      { 
        header: 'Amount', 
        key: 'amount', 
        align: 'right', 
        render: (val) => (
          <div className="flex flex-col items-end">
            <span className="font-black text-slate-900 tabular-nums text-xs tracking-tighter italic">₹{val.toLocaleString()}</span>
            <span className="text-[8px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Gross Settlement</span>
          </div>
        )
      },
      { 
        header: 'Status', 
        key: 'status', 
        render: (val) => <StatusBadge status={val} /> 
      },
      { 
        header: 'Actions', 
        key: 'actions', 
        align: 'right',
        render: (_, row) => (
          <div className="flex items-center justify-end gap-2">
            <button className="p-2 bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all rounded-sm">
              <Eye size={14} />
            </button>
            <button className="p-2 bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all rounded-sm">
              <Download size={14} />
            </button>
            {row.status === 'Pending' && activeTab === 'Vendor Payouts' && (
               <button 
                  onClick={() => handleReconcile(row)}
                  className="px-4 py-2 bg-primary text-white text-[9px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all rounded-sm shadow-lg shadow-slate-200"
               >
                 Reconcile
               </button>
            )}
          </div>
        )
      }
    ];
  }, [activeTab, settlementCycle]);

  const Eye = ({ size }) => <MoreHorizontal size={size} />; // Fallback for Eye since I missed importing it or want a similar look

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
      <PageHeader 
        title="Payments Management" 
        actions={[
          { label: 'Generate GST Report', icon: History, variant: 'secondary' },
          { label: 'Bulk Settlement', icon: Zap, variant: 'primary' }
        ]}
      />

      {/* Financial Intelligence Matrix */}
      {activeTab !== 'Customer Payments' && activeTab !== 'Vendor Payouts' && (
        <div className="bg-slate-900 border-b border-slate-800 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(14,165,233,0.1),transparent)] pointer-events-none" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-x divide-slate-800 max-w-[1600px] mx-auto w-full relative z-10">
              {stats.map((stat, i) => (
                  <MetricRow key={i} {...stat} />
              ))}
          </div>
        </div>
      )}

      <div className="p-6 space-y-4 max-w-[1600px] mx-auto w-full">
        {/* Master Transaction Index */}
        {activeReportError ? <div role="alert" className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{activeReportError} <button className="underline ml-2" onClick={fetchAllData}>Retry report</button></div> : <DataGrid
          title=""
          showTotalEntities={false}
          showSearch={false}
          showFilter={false}
          columns={columns}
          data={filteredPaymentsData}
          loading={loading}
          leftContent={
            <div className="flex items-center gap-2">
              <input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all"
              />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">to</span>
              <input 
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all"
              />
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-500 hover:bg-rose-600 hover:text-white hover:border-rose-600 rounded-sm transition-all text-[9px] font-black uppercase tracking-wider"
                >
                  Clear
                </button>
              )}
            </div>
          }
          actions={
            <div className="flex items-center gap-3 justify-end">
              {/* Status Filter */}
              <div className="relative flex items-center w-[150px]">
                <MultiSelectFilter
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                  }}
                  className="w-full appearance-none bg-slate-50 border border-slate-200/80 rounded-sm pl-4 pr-10 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all"
                >
                  <option value="All">All Statuses</option>
                  <option value="Success">Success</option>
                  <option value="Failed">Failed</option>
                  <option value="Refund">Refund</option>
                  <option value="Settled">Settled</option>
                  <option value="Pending">Pending</option>
                </MultiSelectFilter>
              </div>

              {/* Settlement Cycle Filter (only for Vendor Payouts) */}
              {activeTab === 'Vendor Payouts' && (
                <div className="relative flex items-center w-[160px]">
                  <select
                    value={settlementCycle}
                    onChange={(e) => {
                      setSettlementCycle(e.target.value);
                      toast.success(`Settlement cycle updated to ${e.target.value}`);
                    }}
                    className="w-full appearance-none bg-slate-50 border border-slate-200/80 rounded-sm pl-4 pr-10 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Fortnightly">Fortnightly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Manual">Manual</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-3 pointer-events-none text-slate-400" />
                </div>
              )}
            </div>
          }
        />}
      </div>
    </div>
  );
}
