import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, LabelList, PieChart, Pie, Cell, Legend } from 'recharts';
import toast from 'react-hot-toast';
import { b2bOrderApi } from '../../../lib/api';
import { CustomCalendar, EmptyChartNote } from '../../vendor/components/InsightsCalendar';

const PRESETS = [
  { id: 'current_month', label: 'Current Month' },
  { id: '3_months', label: 'Last 3 Months' },
  { id: '6_months', label: 'Last 6 Months' }
];
const STATUS_COLORS = ['#000000', '#1e293b', '#475569', '#64748b', '#94a3b8', '#cbd5e1'];
const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 100, damping: 15 } }
};

/** White KPI tile with a chart button, same as the vendor Business Insights cards. */
const KpiCard = ({ label, value, icon, onOpen, note }) => (
  <Motion.div
    variants={cardVariants}
    className="bg-white p-5 rounded-[2.2rem] text-slate-900 shadow-sm border border-black/5 flex flex-col justify-between h-36 relative"
  >
    <div className="flex items-start justify-between gap-2">
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-tight">{label}</span>
      {onOpen && (
        <button
          onClick={onOpen}
          className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-700 hover:text-black transition-colors border border-slate-100 shrink-0"
        >
          <span className="material-symbols-outlined text-base">{icon}</span>
        </button>
      )}
    </div>
    <div className="mt-auto">
      <h4 className="text-3xl font-black text-slate-950 tracking-tighter leading-none truncate">{value}</h4>
      {note && <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-1.5 leading-tight">{note}</p>}
    </div>
  </Motion.div>
);

const ChartModal = ({ open, onClose, eyebrow, title, footerLabel, footerValue, children }) => (
  <AnimatePresence>
    {open && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />
        <Motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', duration: 0.4 }}
          className="bg-white rounded-[2.2rem] border border-black/5 shadow-2xl p-6 w-full max-w-sm relative z-10 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{eyebrow}</span>
              <h3 className="text-base font-black text-slate-950 uppercase tracking-tight">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
            >
              <span className="material-symbols-outlined text-sm font-bold">close</span>
            </button>
          </div>
          {children}
          <div className="text-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">{footerLabel}</span>
            <span className="text-xl font-black text-slate-950 mt-0.5 block">{footerValue}</span>
          </div>
        </Motion.div>
      </div>
    )}
  </AnimatePresence>
);

const SupplierInsights = () => {
  const navigate = useNavigate();
  const [selectedFilter, setSelectedFilter] = useState('current_month');
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [openChart, setOpenChart] = useState(null); // 'revenue' | 'net' | 'products' | 'status'

  // ---- Real data: every figure on this page comes from /b2b-orders/supplier/insights ----
  const [insights, setInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Selected period -> from/to (YYYY-MM-DD). A complete custom range wins over presets.
  const range = useMemo(() => {
    const today = new Date();
    if (startDate && endDate) return { from: startDate, to: endDate, custom: true };
    const from = new Date(today);
    if (selectedFilter === '3_months') from.setMonth(from.getMonth() - 3);
    else if (selectedFilter === '6_months') from.setMonth(from.getMonth() - 6);
    else from.setDate(1);
    return { from: ymd(from), to: ymd(today), custom: false };
  }, [selectedFilter, startDate, endDate]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    b2bOrderApi.getSupplierInsights({ from: range.from, to: range.to })
      .then((data) => { if (!cancelled) setInsights(data); })
      .catch((err) => {
        console.error('Supplier insights error:', err);
        if (!cancelled) toast.error(err.message || 'Could not load business insights');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  const kpis = insights?.kpis;
  const statusData = useMemo(
    () => (insights?.statusBreakdown || []).map(st => ({ name: st.name, value: st.percent, count: st.count })),
    [insights]
  );
  const emptyNote = isLoading ? 'Loading…' : 'No data for this period';
  // While loading show a placeholder, never a sample value
  const show = (value) => (isLoading && !insights ? '…' : value);
  const completion = kpis?.completionRate == null ? '—' : `${kpis.completionRate}%`;
  const profitKnown = kpis?.profitCoverageComplete !== false;
  const closeChart = () => setOpenChart(null);

  return (
    <div className="min-h-screen pb-32 font-body text-slate-800">
      <main className="max-w-md mx-auto px-5 pt-0">

        {/* Header */}
        <header className="mb-6 flex items-center gap-3.5 -mt-4">
          <button
            onClick={() => navigate('/supplier/more')}
            className="w-10 h-10 bg-white rounded-2xl border border-black/5 shadow-sm flex items-center justify-center text-slate-800 hover:text-black transition-all active:scale-95 shrink-0"
          >
            <span className="material-symbols-outlined text-lg font-bold">arrow_back</span>
          </button>
          <h2 className="text-xl font-black tracking-tight text-slate-950 uppercase leading-none">
            Business Insights
          </h2>
        </header>

        {/* Date Selector Row */}
        <section className="mb-6">
          <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-black/5 shadow-sm relative">
            <div className="relative">
              <button
                onClick={() => { setShowDropdown(!showDropdown); setIsCustomOpen(false); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 text-slate-800 transition-colors"
              >
                <span className="material-symbols-outlined text-base text-slate-500">calendar_today</span>
                <span className="text-xs font-bold tracking-tight">
                  {range.custom ? `${range.from} → ${range.to}` : PRESETS.find(p => p.id === selectedFilter)?.label}
                </span>
                <span className="material-symbols-outlined text-xs text-slate-400">keyboard_arrow_down</span>
              </button>

              <AnimatePresence>
                {showDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                    <Motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute left-0 mt-2 w-48 bg-white border border-slate-100 rounded-2xl shadow-xl z-20 overflow-hidden"
                    >
                      {PRESETS.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setSelectedFilter(item.id);
                            setStartDate('');
                            setEndDate('');
                            setShowDropdown(false);
                            setIsCustomOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3 text-xs font-bold tracking-tight transition-colors hover:bg-slate-50 ${
                            !range.custom && selectedFilter === item.id ? 'text-black bg-slate-50/50' : 'text-slate-600'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </Motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={() => { setIsCustomOpen(!isCustomOpen); setShowDropdown(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-all ${
                isCustomOpen
                  ? 'bg-black border-black text-white shadow-sm'
                  : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="material-symbols-outlined text-base">edit_calendar</span>
              <span className="text-xs font-bold tracking-tight">Custom Range</span>
            </button>
          </div>

          <AnimatePresence>
            {isCustomOpen && (
              <Motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="bg-white border border-black/5 p-4 rounded-2xl mt-2 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Select Date Range</span>
                    <button
                      onClick={() => setIsCustomOpen(false)}
                      className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm font-bold">close</span>
                    </button>
                  </div>
                  <CustomCalendar
                    startDate={startDate}
                    endDate={endDate}
                    onChangeRange={(start, end) => { setStartDate(start || ''); setEndDate(end || ''); }}
                  />
                </div>
              </Motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Macro KPIs */}
        <Motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } }}
          className="space-y-4 mt-8"
        >
          <div className="grid grid-cols-2 gap-4">
            <KpiCard label="Total Revenue Generated" value={show(money(kpis?.grossRevenue))} icon="show_chart" onOpen={() => setOpenChart('revenue')} />
            <KpiCard label="Net Sales (excl. GST)" value={show(money(kpis?.netSales))} icon="bar_chart" onOpen={() => setOpenChart('net')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <KpiCard label="Average Order Value" value={show(money(kpis?.averageOrderValue))} icon="inventory_2" onOpen={() => setOpenChart('products')} />
            <KpiCard label="Completion Rate" value={show(completion)} icon="analytics" onOpen={() => setOpenChart('status')} />
          </div>

          {/* Payments & Settlement */}
          <Motion.div variants={cardVariants} className="bg-white p-6 rounded-[2.2rem] border border-black/5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-tight">Payments & Settlement</span>
              <button
                onClick={() => navigate('/supplier/wallet')}
                className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-700 hover:text-black transition-colors border border-slate-100 shrink-0"
                title="Open Wallet"
              >
                <span className="material-symbols-outlined text-base">account_balance_wallet</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/30">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Receivable</span>
                <span className="text-xl font-black text-slate-950 mt-1 block">{show(money(kpis?.receivable))}</span>
                <span className="text-[8px] font-bold text-slate-400 block mt-0.5">Delivered, not settled</span>
              </div>
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/30">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Settled</span>
                <span className="text-xl font-black text-slate-950 mt-1 block">{show(money(kpis?.released))}</span>
                <span className="text-[8px] font-bold text-slate-400 block mt-0.5">Paid out to you</span>
              </div>
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/30">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">In Pipeline</span>
                <span className="text-xl font-black text-slate-950 mt-1 block">{show(money(kpis?.inPipeline))}</span>
                <span className="text-[8px] font-bold text-slate-400 block mt-0.5">Accepted, not delivered</span>
              </div>
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/30">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Est. Gross Profit</span>
                <span className="text-xl font-black text-slate-950 mt-1 block">{show(profitKnown ? money(kpis?.estimatedGrossProfit) : '—')}</span>
                {profitKnown ? (
                  <span className="text-[8px] font-bold text-slate-400 block mt-0.5">Net sales − unit costs</span>
                ) : (
                  <button onClick={() => navigate('/supplier/my-supplies')} className="text-[8px] font-black text-black underline block mt-0.5 text-left">
                    Set unit costs in My Supplies
                  </button>
                )}
              </div>
            </div>
          </Motion.div>

          {/* GST & Tax */}
          <Motion.div variants={cardVariants} className="bg-white p-6 rounded-[2.2rem] border border-black/5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-tight">GST & Tax Summary</span>
              <span className="text-[10px] font-black text-slate-500">{show(`${kpis?.unitsSold ?? 0} units`)}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/30">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Taxable Value</span>
                <span className="text-xl font-black text-slate-950 mt-1 block">{show(money(kpis?.netSales))}</span>
              </div>
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/30">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">GST Collected</span>
                <span className="text-xl font-black text-slate-950 mt-1 block">{show(money(kpis?.gstCollected))}</span>
              </div>
            </div>
            {kpis?.deliveryCharges > 0 && (
              <p className="text-[9px] font-bold text-slate-400">Revenue also includes {money(kpis.deliveryCharges)} in delivery charges.</p>
            )}
          </Motion.div>

          {/* Recent Orders */}
          <Motion.div variants={cardVariants} className="bg-white p-6 rounded-[2.2rem] border border-black/5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-tight">Recent Orders</span>
              <span className="text-[10px] font-black text-slate-500">{show(`${kpis?.totalOrders ?? 0} in period`)}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {(insights?.recentOrders || []).map(order => (
                <div key={order.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">{order.vendor}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      {order.id} · {new Date(order.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black text-slate-950">{money(order.total)}</p>
                    <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 mt-0.5">{order.status}</p>
                  </div>
                </div>
              ))}
              {!insights?.recentOrders?.length && (
                <p className="py-8 text-center text-xs font-bold text-slate-400">
                  {isLoading ? 'Loading…' : 'No orders in this period'}
                </p>
              )}
            </div>
          </Motion.div>
        </Motion.div>

        {/* Revenue trend */}
        <ChartModal
          open={openChart === 'revenue'}
          onClose={closeChart}
          eyebrow="Trend Analysis"
          title="Total Revenue Generated"
          footerLabel="Total Revenue"
          footerValue={show(money(kpis?.grossRevenue))}
        >
          <div className="h-48 w-full relative">
            {!kpis?.billableOrders && <EmptyChartNote text={emptyNote} />}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={insights?.trend || []} margin={{ top: 15, bottom: 15, left: 10, right: 10 }}>
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 8, fontWeight: 900 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <Line
                  type="linear"
                  dataKey="revenue"
                  stroke="#000000"
                  strokeWidth={2}
                  dot={{ r: 4.5, stroke: '#000000', strokeWidth: 2, fill: '#ffffff' }}
                  activeDot={{ r: 6, stroke: '#000000', strokeWidth: 2, fill: '#ffffff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartModal>

        {/* Net sales trend */}
        <ChartModal
          open={openChart === 'net'}
          onClose={closeChart}
          eyebrow="Over Selected Period"
          title="Net Sales (excl. GST)"
          footerLabel="Net Sales"
          footerValue={show(money(kpis?.netSales))}
        >
          <div className="h-48 w-full relative">
            {!kpis?.billableOrders && <EmptyChartNote text={emptyNote} />}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights?.trend || []} margin={{ top: 15, bottom: 5, left: 5, right: 5 }}>
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 8, fontWeight: 900 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <Bar dataKey="netSales" fill="#000000" radius={[4, 4, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartModal>

        {/* Top products */}
        <ChartModal
          open={openChart === 'products'}
          onClose={closeChart}
          eyebrow="Product breakdown"
          title="Top Products by Sales"
          footerLabel="Average Order Value"
          footerValue={show(money(kpis?.averageOrderValue))}
        >
          <div className="h-56 w-full relative">
            {!insights?.topProducts?.length && <EmptyChartNote text={emptyNote} />}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={insights?.topProducts || []} margin={{ top: 10, right: 55, left: 5, bottom: 5 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 10, fontWeight: 700 }}
                  width={110}
                />
                <Bar dataKey="revenue" fill="#000000" radius={[0, 4, 4, 0]} barSize={12}>
                  <LabelList dataKey="revenue" position="right" formatter={money} style={{ fontSize: 9, fontWeight: 900, fill: '#0f172a' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartModal>

        {/* Order statuses */}
        <ChartModal
          open={openChart === 'status'}
          onClose={closeChart}
          eyebrow="Order Mix Breakdown"
          title="Order Statuses"
          footerLabel="Total Orders"
          footerValue={show(kpis?.totalOrders ?? 0)}
        >
          <div className="h-64 w-full relative flex items-center justify-center">
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-12">
              <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Completed</span>
              <span className="text-lg font-black text-slate-950 leading-none mt-1">{completion}</span>
            </div>
            {statusData.length === 0 && <EmptyChartNote text={emptyNote} />}
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={3} dataKey="value">
                  {statusData.map((entry, index) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[index % STATUS_COLORS.length]} className="outline-none" />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  height={48}
                  iconType="circle"
                  iconSize={6}
                  formatter={(value, entry) => (
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-tight">
                      {value} ({entry.payload?.count})
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartModal>

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em]">
            SPINZYT ANALYTICS ENGINE
          </p>
        </footer>

      </main>
    </div>
  );
};

export default SupplierInsights;
