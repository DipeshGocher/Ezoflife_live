import React, { useState, useEffect, useMemo } from 'react';
import { orderApi } from '../../../lib/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, LabelList, PieChart, Pie, Cell, Legend } from 'recharts';
import { CustomCalendar, EmptyChartNote } from '../components/InsightsCalendar';

/** Feedback tags taken from real customer reviews. */
const TagList = ({ tags, tone, loading }) => {
  const cls = tone === 'positive'
    ? 'bg-emerald-50/60 text-emerald-700 border-emerald-100/40'
    : 'bg-rose-50/60 text-rose-700 border-rose-100/40';
  if (!tags || tags.length === 0) {
    return (
      <p className="text-[10px] font-bold text-slate-400">
        {loading ? 'Loading…' : 'No matching customer feedback in this period'}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(tag => (
        <span key={tag} className={`px-2.5 py-1 rounded-xl text-[10px] font-black border ${cls}`}>{tag}</span>
      ))}
    </div>
  );
};

const VendorReports = () => {
  const navigate = useNavigate();
  const [selectedFilter, setSelectedFilter] = useState('current_month'); // 'current_month', '3_months', '6_months'
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showRevenueGraph, setShowRevenueGraph] = useState(false);
  const [showProfitGraph, setShowProfitGraph] = useState(false);
  const [showAovGraph, setShowAovGraph] = useState(false);
  const [showStatusGraph, setShowStatusGraph] = useState(false);
  const [selectedSector, setSelectedSector] = useState(null);
  const [showGstLedger, setShowGstLedger] = useState(false);
  const [gstFilter, setGstFilter] = useState('all');
  const [showB2bGstGraph, setShowB2bGstGraph] = useState(false);
  const [showB2cGstGraph, setShowB2cGstGraph] = useState(false);

  // ---- Real data: every figure on this page comes from /orders/vendor/insights ----
  const [insights, setInsights] = useState(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(true);

  // Selected period -> from/to (YYYY-MM-DD). A complete custom range wins over presets.
  const range = useMemo(() => {
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    if (startDate && endDate) return { from: startDate, to: endDate, custom: true };
    const from = new Date(today);
    if (selectedFilter === '3_months') from.setMonth(from.getMonth() - 3);
    else if (selectedFilter === '6_months') from.setMonth(from.getMonth() - 6);
    else from.setDate(1); // current month
    return { from: ymd(from), to: ymd(today), custom: false };
  }, [selectedFilter, startDate, endDate]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingInsights(true);
    orderApi.getVendorInsights({ from: range.from, to: range.to })
      .then((data) => { if (!cancelled) setInsights(data); })
      .catch((err) => {
        console.error('Failed to load business insights:', err);
        if (!cancelled) toast.error(err.message || 'Could not load report data');
      })
      .finally(() => { if (!cancelled) setIsLoadingInsights(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  const kpis = insights?.kpis;
  // Status chart: share of orders per status group (percent), with counts
  const statusData = useMemo(
    () => (insights?.statusBreakdown || []).map(st => ({ name: st.name, value: st.percent, count: st.count })),
    [insights]
  );
  const emptyNote = isLoadingInsights ? 'Loading…' : 'No data for this period';
  const feedback = insights?.feedback;
  const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  // While loading show a placeholder, never a sample value
  const show = (value) => (isLoadingInsights && !insights ? '…' : value);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const cardVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { type: 'spring', stiffness: 100, damping: 15 }
    }
  };

  // GST ledger for the selected period (from the insights endpoint)
  const gstLedger = useMemo(() => (insights?.ledger || []).map(row => ({
    ...row,
    date: row.date
      ? new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—'
  })), [insights]);

  const filteredLedger = gstLedger.filter(row => {
    if (gstFilter === 'b2b') return row.type === 'B2B';
    if (gstFilter === 'b2c') return row.type === 'B2C';
    return true;
  });

  const handleExportGst = () => {
    const headers = ['Invoice No', 'Date', 'Client Name', 'Type', 'GSTIN', 'Taxable Value (INR)', 'GST Rate (%)', 'GST Amount (INR)', 'Total Amount (INR)'];
    const csvRows = [
      headers.join(','),
      ...gstLedger.map(row => [
        row.invoiceNo,
        row.date,
        `"${row.client}"`,
        row.type,
        row.gstin,
        row.taxable.toFixed(2),
        row.rate,
        row.gst.toFixed(2),
        row.total.toFixed(2)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `GST_Tax_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen pb-32 font-body text-slate-800">
      <main className="max-w-md mx-auto px-5 pt-0">
        
        {/* Header */}
        <header className="mb-6 flex items-center gap-3.5 -mt-4">
          <button 
            onClick={() => navigate('/vendor/more')}
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
            
            {/* Left side: Preset Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowDropdown(!showDropdown);
                  setIsCustomOpen(false);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 text-slate-800 transition-colors"
              >
                <span className="material-symbols-outlined text-base text-slate-500">calendar_today</span>
                <span className="text-xs font-bold tracking-tight">
                  {range.custom && `${range.from} → ${range.to}`}
                  {!range.custom && selectedFilter === 'current_month' && 'Current Month'}
                  {!range.custom && selectedFilter === '3_months' && 'Last 3 Months'}
                  {!range.custom && selectedFilter === '6_months' && 'Last 6 Months'}
                </span>
                <span className="material-symbols-outlined text-xs text-slate-400">keyboard_arrow_down</span>
              </button>

              {/* Floating Dropdown Menu */}
              <AnimatePresence>
                {showDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowDropdown(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute left-0 mt-2 w-48 bg-white border border-slate-100 rounded-2xl shadow-xl z-20 overflow-hidden"
                    >
                      {[
                        { id: 'current_month', label: 'Current Month' },
                        { id: '3_months', label: 'Last 3 Months' },
                        { id: '6_months', label: 'Last 6 Months' }
                      ].map((item) => (
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
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Right side: Custom range toggle */}
            <button
              onClick={() => {
                setIsCustomOpen(!isCustomOpen);
                setShowDropdown(false);
              }}
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

          {/* Collapsible Date Inputs */}
          <AnimatePresence>
            {isCustomOpen && (
              <motion.div
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
                    onChangeRange={(start, end) => {
                      setStartDate(start || '');
                      setEndDate(end || '');
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Macro KPIs Grid */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-4 mt-8"
        >
          {/* Row 1: Revenue & Net Profit Cards */}
          <div className="grid grid-cols-2 gap-4">
            
            {/* Card 1: Total Revenue Generated */}
            <motion.div 
              variants={cardVariants}
              className="bg-white p-5 rounded-[2.2rem] text-slate-900 shadow-sm border border-black/5 flex flex-col justify-between h-36 relative"
            >
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-tight">
                  Total Revenue Generated
                </span>
                <button 
                  onClick={() => setShowRevenueGraph(true)}
                  className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-700 hover:text-black transition-colors border border-slate-100 shrink-0"
                >
                  <span className="material-symbols-outlined text-base">show_chart</span>
                </button>
              </div>
              <h4 className="text-3xl font-black text-slate-950 tracking-tighter leading-none mt-auto">
                {show(money(kpis?.revenue))}
              </h4>
            </motion.div>

            {/* Card 2: Estimated Net Profit */}
            <motion.div 
              variants={cardVariants}
              className="bg-white p-5 rounded-[2.2rem] text-slate-900 shadow-sm border border-black/5 flex flex-col justify-between h-36 relative"
            >
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-tight">
                  Net Earnings
                </span>
                <button 
                  onClick={() => setShowProfitGraph(true)}
                  className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-700 hover:text-black transition-colors border border-slate-100 shrink-0"
                >
                  <span className="material-symbols-outlined text-base">bar_chart</span>
                </button>
              </div>
              <h4 className="text-3xl font-black text-slate-950 tracking-tighter leading-none mt-auto">
                {show(money(kpis?.netEarnings))}
              </h4>
            </motion.div>

          </div>

          {/* Row 2: AOV & Orders */}
          <div className="grid grid-cols-2 gap-4">
            
            {/* Card 3: Average Order Value */}
            <motion.div 
              variants={cardVariants}
              className="bg-white p-5 rounded-[2.2rem] border border-black/5 shadow-sm flex flex-col justify-between h-36 relative"
            >
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-tight">
                  Average Order Value
                </span>
                <button 
                  onClick={() => setShowAovGraph(true)}
                  className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-700 hover:text-black transition-colors border border-slate-100 shrink-0"
                >
                  <span className="material-symbols-outlined text-base">show_chart</span>
                </button>
              </div>
              <h4 className="text-3xl font-black text-slate-950 tracking-tighter leading-none mt-auto">
                {show(money(kpis?.aov))}
              </h4>
            </motion.div>

            {/* Card 4: Success Rate */}
            <motion.div 
              variants={cardVariants}
              className="bg-white p-5 rounded-[2.2rem] border border-black/5 shadow-sm flex flex-col justify-between h-36 relative"
            >
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-tight">
                  Success Rate
                </span>
                <button 
                  onClick={() => setShowStatusGraph(true)}
                  className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-700 hover:text-black transition-colors border border-slate-100 shrink-0"
                >
                  <span className="material-symbols-outlined text-base">analytics</span>
                </button>
              </div>
              
              <h4 className="text-3xl font-black text-slate-950 tracking-tighter leading-none mt-auto">
                {show(kpis?.successRate == null ? '—' : `${kpis.successRate}%`)}
              </h4>
            </motion.div>

          </div>

          {/* GST & Tax Reports Card */}
          <motion.div
            variants={cardVariants}
            className="bg-white p-6 rounded-[2.2rem] border border-black/5 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-tight">
                GST Compliance & Tax Ledger
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowB2bGstGraph(true)}
                  className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-700 hover:text-black transition-colors border border-slate-100 shrink-0"
                  title="B2B Clients Graph"
                >
                  <span className="material-symbols-outlined text-base">business</span>
                </button>
                <button 
                  onClick={() => setShowB2cGstGraph(true)}
                  className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-700 hover:text-black transition-colors border border-slate-100 shrink-0"
                  title="B2C Orders Graph"
                >
                  <span className="material-symbols-outlined text-base">shopping_bag</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/30">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Taxable Value</span>
                <span className="text-xl font-black text-slate-950 mt-1 block">{show(money(insights?.gst?.taxable))}</span>
              </div>
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/30">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Total GST</span>
                <span className="text-xl font-black text-slate-950 mt-1 block">{show(money(insights?.gst?.gst))}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => setShowGstLedger(true)}
                className="flex items-center justify-center gap-1.5 py-3 bg-slate-50 hover:bg-slate-100 active:scale-98 rounded-2xl border border-slate-100 text-slate-700 hover:text-black text-xs font-black transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm font-bold">table_rows</span>
                View Ledger
              </button>
              <button
                onClick={handleExportGst}
                className="flex items-center justify-center gap-1.5 py-3 bg-black hover:bg-slate-900 active:scale-98 rounded-2xl text-white text-xs font-black transition-all shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                Export CSV
              </button>
            </div>
          </motion.div>

          {/* Customer Sentiment & Reviews Card */}
          <motion.div
            variants={cardVariants}
            className="bg-white p-6 rounded-[2.2rem] border border-black/5 shadow-sm space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-tight">
                  Customer Sentiment & Reviews
                </span>
                <span className="text-xs font-bold text-slate-500 mt-0.5">
                  Satisfaction & Feedback Analytics
                </span>
              </div>
              <div className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-xl border border-amber-100/50 shrink-0">
                <span className="material-symbols-outlined text-xs font-bold animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                <span className="text-xs font-black">{show(feedback?.average ?? '—')}</span>
              </div>
            </div>

            {/* Average Rating Trend Graph */}
            <div className="space-y-2">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Average Rating Trend</span>
              <div className="h-28 w-full relative">
                {!feedback?.count && <EmptyChartNote text={isLoadingInsights ? 'Loading…' : 'No customer ratings in this period'} />}
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={feedback?.trend || []} margin={{ top: 10, bottom: 5, left: -25, right: 10 }}>
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 8, fontWeight: 900 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[1, 5]} tick={{ fill: '#94a3b8', fontSize: 8, fontWeight: 900 }} axisLine={false} tickLine={false} />
                    <Line 
                      type="monotone" 
                      dataKey="rating" 
                      connectNulls
                      stroke="#000000" 
                      strokeWidth={2} 
                      dot={{ r: 3.5, stroke: '#000000', strokeWidth: 1.5, fill: '#ffffff' }}
                      activeDot={{ r: 5, stroke: '#000000', strokeWidth: 2, fill: '#ffffff' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Positive & Critical Tags Sections */}
            <div className="space-y-4 pt-2 border-t border-slate-100/80">
              {/* Positive Attributes */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <span className="material-symbols-outlined text-sm font-bold">sentiment_satisfied</span>
                  <span className="text-[9px] font-black uppercase tracking-wider">Top Positive Attributes</span>
                </div>
                <TagList tags={feedback?.positive} tone="positive" loading={isLoadingInsights} />
              </div>

              {/* Critical Areas */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-rose-600">
                  <span className="material-symbols-outlined text-sm font-bold">sentiment_dissatisfied</span>
                  <span className="text-[9px] font-black uppercase tracking-wider">Critical Improvement Areas</span>
                </div>
                <TagList tags={feedback?.critical} tone="critical" loading={isLoadingInsights} />
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Revenue Graph Modal */}
        <AnimatePresence>
          {showRevenueGraph && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowRevenueGraph(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.4 }}
                className="bg-white rounded-[2.2rem] border border-black/5 shadow-2xl p-6 w-full max-w-sm relative z-10 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Trend Analysis</span>
                    <h3 className="text-base font-black text-slate-950 uppercase tracking-tight">Total Revenue Generated</h3>
                  </div>
                  <button 
                    onClick={() => setShowRevenueGraph(false)}
                    className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm font-bold">close</span>
                  </button>
                </div>

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

                <div className="text-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Total Revenue</span>
                  <span className="text-xl font-black text-slate-950 mt-0.5 block">{show(money(kpis?.revenue))}</span>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Profit Graph Modal */}
        <AnimatePresence>
          {showProfitGraph && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowProfitGraph(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.4 }}
                className="bg-white rounded-[2.2rem] border border-black/5 shadow-2xl p-6 w-full max-w-sm relative z-10 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Over Selected Period</span>
                    <h3 className="text-base font-black text-slate-950 uppercase tracking-tight">Net Earnings</h3>
                  </div>
                  <button 
                    onClick={() => setShowProfitGraph(false)}
                    className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm font-bold">close</span>
                  </button>
                </div>

                <div className="h-48 w-full relative">
                  {!kpis?.billableOrders && <EmptyChartNote text={emptyNote} />}
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={insights?.trend || []} margin={{ top: 15, bottom: 5, left: 5, right: 5 }}>
                      <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 8, fontWeight: 900 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <Bar 
                        dataKey="earnings"
                        fill="#000000" 
                        radius={[4, 4, 0, 0]}
                        barSize={12}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="text-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Net Earnings</span>
                  <span className="text-xl font-black text-slate-950 mt-0.5 block">{show(money(kpis?.netEarnings))}</span>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* AOV Graph Modal */}
        <AnimatePresence>
          {showAovGraph && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAovGraph(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.4 }}
                className="bg-white rounded-[2.2rem] border border-black/5 shadow-2xl p-6 w-full max-w-sm relative z-10 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Category breakdown</span>
                    <h3 className="text-base font-black text-slate-950 uppercase tracking-tight">Average Order Value</h3>
                  </div>
                  <button 
                    onClick={() => setShowAovGraph(false)}
                    className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm font-bold">close</span>
                  </button>
                </div>

                <div className="h-56 w-full relative">
                  {!insights?.serviceAov?.length && <EmptyChartNote text={emptyNote} />}
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={insights?.serviceAov || []}
                      margin={{ top: 10, right: 35, left: 5, bottom: 5 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#475569', fontSize: 10, fontWeight: 700 }}
                        width={110}
                      />
                      <Bar 
                        dataKey="avg"
                        fill="#000000" 
                        radius={[0, 4, 4, 0]}
                        barSize={12}
                      >
                        <LabelList dataKey="avg" position="right" formatter={(v) => `₹${v}`} style={{ fontSize: 9, fontWeight: 900, fill: '#0f172a' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="text-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Average AOV</span>
                  <span className="text-xl font-black text-slate-950 mt-0.5 block">{show(money(kpis?.aov))}</span>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Status Graph Modal */}
        <AnimatePresence>
          {showStatusGraph && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setShowStatusGraph(false);
                  setSelectedSector(null);
                }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.4 }}
                className="bg-white rounded-[2.2rem] border border-black/5 shadow-2xl p-6 w-full max-w-sm relative z-10 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Order Mix Breakdown</span>
                    <h3 className="text-base font-black text-slate-950 uppercase tracking-tight">Order Statuses</h3>
                  </div>
                  <button 
                    onClick={() => {
                      setShowStatusGraph(false);
                      setSelectedSector(null);
                    }}
                    className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm font-bold">close</span>
                  </button>
                </div>

                <div className="h-64 w-full relative flex items-center justify-center">
                  {/* Donut hole overlay text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-4">
                    {selectedSector ? (
                      <>
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider text-center max-w-[80px] truncate leading-tight">
                          {selectedSector.name}
                        </span>
                        <span className="text-lg font-black text-slate-950 leading-none mt-1">
                          {selectedSector.value}%
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Success</span>
                        <span className="text-lg font-black text-slate-950 leading-none mt-1">{kpis?.successRate == null ? '—' : `${kpis.successRate}%`}</span>
                      </>
                    )}
                  </div>

                  {statusData.length === 0 && <EmptyChartNote text={emptyNote} />}
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                        onClick={(data) => {
                          setSelectedSector(data);
                        }}
                      >
                        {statusData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={['#000000', '#1e293b', '#475569', '#64748b', '#94a3b8', '#cbd5e1'][index]} 
                            className="cursor-pointer outline-none"
                            stroke={selectedSector?.name === entry.name ? '#000000' : 'none'}
                            strokeWidth={selectedSector?.name === entry.name ? 2.5 : 0}
                          />
                        ))}
                      </Pie>
                      <Legend 
                        verticalAlign="bottom" 
                        height={48}
                        iconType="circle"
                        iconSize={6}
                        formatter={(value) => <span className="text-[9px] font-black text-slate-600 uppercase tracking-tight">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="text-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100 relative">
                  {selectedSector ? (
                    <>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Selected Status</span>
                      <span className="text-xl font-black text-slate-950 mt-0.5 block">{selectedSector.name}: {selectedSector.value}%</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSector(null);
                        }}
                        className="absolute right-3.5 top-3.5 text-[8px] font-black text-slate-400 hover:text-black uppercase tracking-wider transition-colors"
                      >
                        Reset
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Total Orders</span>
                      <span className="text-xl font-black text-slate-950 mt-0.5 block">{show(kpis?.totalOrders ?? 0)}</span>
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* GST Ledger Modal */}
        <AnimatePresence>
          {showGstLedger && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setShowGstLedger(false);
                  setGstFilter('all');
                }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.4 }}
                className="bg-white rounded-[2.2rem] border border-black/5 shadow-2xl p-6 w-full max-w-lg relative z-10 space-y-4 max-h-[85vh] flex flex-col"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tax Accounting</span>
                    <h3 className="text-base font-black text-slate-950 uppercase tracking-tight">GST Tax Ledger</h3>
                  </div>
                  <button 
                    onClick={() => {
                      setShowGstLedger(false);
                      setGstFilter('all');
                    }}
                    className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm font-bold">close</span>
                  </button>
                </div>

                {/* Filters */}
                <div className="flex gap-2 shrink-0">
                  {['all', 'b2b', 'b2c'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setGstFilter(f)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-tight transition-all border ${
                        gstFilter === f 
                          ? 'bg-black border-black text-white' 
                          : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100 hover:border-slate-200'
                      }`}
                    >
                      {f === 'all' && 'All Invoices'}
                      {f === 'b2b' && 'B2B Only'}
                      {f === 'b2c' && 'B2C Only'}
                    </button>
                  ))}
                </div>

                {/* Table container */}
                <div className="overflow-y-auto flex-1 -mx-2 px-2 py-1">
                  <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 tracking-wider">Invoice / Date</th>
                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 tracking-wider">Client Details</th>
                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 tracking-wider text-right">Taxable (₹)</th>
                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 tracking-wider text-right">GST (₹)</th>
                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 tracking-wider text-right">Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLedger.length > 0 ? (
                          filteredLedger.map((row, idx) => (
                            <tr key={idx} className="border-b border-slate-100/60 hover:bg-slate-50/50 last:border-0 transition-colors">
                              <td className="p-3">
                                <span className="block text-xs font-black text-slate-900">{row.invoiceNo}</span>
                                <span className="block text-[8px] font-bold text-slate-400 mt-0.5">{row.date}</span>
                              </td>
                              <td className="p-3">
                                <span className="block text-xs font-bold text-slate-800">{row.client}</span>
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider mt-1 ${
                                  row.type === 'B2B' 
                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                    : 'bg-slate-100 text-slate-400'
                                }`}>
                                  {row.type}
                                </span>
                                {row.type === 'B2B' && (
                                  <span className="block text-[8px] font-bold text-slate-500 mt-1 font-mono">{row.gstin}</span>
                                )}
                              </td>
                              <td className="p-3 text-right text-xs font-bold text-slate-700">₹{row.taxable.toFixed(2)}</td>
                              <td className="p-3 text-right text-xs font-bold text-slate-500">₹{row.gst.toFixed(2)} <span className="text-[8px] text-slate-400">({row.rate}%)</span></td>
                              <td className="p-3 text-right text-xs font-black text-slate-900">₹{row.total.toFixed(2)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="5" className="p-8 text-center text-xs font-bold text-slate-400">
                              No records found for this filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer totals */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between shrink-0">
                  <div className="text-left">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Filtered Total</span>
                    <span className="text-sm font-black text-slate-900 mt-0.5 block">
                      {filteredLedger.length} Invoices
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Total Taxable Value</span>
                    <span className="text-base font-black text-slate-950 mt-0.5 block">
                      ₹{filteredLedger.reduce((sum, r) => sum + r.taxable, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* B2B GST Graph Modal */}
        <AnimatePresence>
          {showB2bGstGraph && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowB2bGstGraph(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.4 }}
                className="bg-white rounded-[2.2rem] border border-black/5 shadow-2xl p-6 w-full max-w-sm relative z-10 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">GST B2B Revenue Analysis</span>
                    <h3 className="text-base font-black text-slate-950 uppercase tracking-tight">B2B Clients</h3>
                  </div>
                  <button 
                    onClick={() => setShowB2bGstGraph(false)}
                    className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm font-bold">close</span>
                  </button>
                </div>

                <div className="h-56 w-full relative">
                  {!insights?.b2bClients?.length && <EmptyChartNote text={emptyNote} />}
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={insights?.b2bClients || []}
                      margin={{ top: 10, right: 45, left: 5, bottom: 5 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#475569', fontSize: 10, fontWeight: 700 }}
                        width={100}
                      />
                      <Bar 
                        dataKey="taxable"
                        fill="#000000" 
                        radius={[0, 4, 4, 0]}
                        barSize={12}
                      >
                        <LabelList dataKey="taxable" position="right" formatter={(v) => `₹${v}`} style={{ fontSize: 9, fontWeight: 900, fill: '#0f172a' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="text-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">B2B Taxable Total</span>
                  <span className="text-xl font-black text-slate-955 mt-0.5 block">{show(money(insights?.gst?.b2bTaxable))}</span>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* B2C GST Graph Modal */}
        <AnimatePresence>
          {showB2cGstGraph && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowB2cGstGraph(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.4 }}
                className="bg-white rounded-[2.2rem] border border-black/5 shadow-2xl p-6 w-full max-w-sm relative z-10 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">GST B2C Revenue Analysis</span>
                    <h3 className="text-base font-black text-slate-950 uppercase tracking-tight">B2C Orders</h3>
                  </div>
                  <button 
                    onClick={() => setShowB2cGstGraph(false)}
                    className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm font-bold">close</span>
                  </button>
                </div>

                <div className="h-56 w-full relative">
                  {!insights?.gst?.b2cOrders && <EmptyChartNote text={emptyNote} />}
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={insights?.b2cMonthly || []} margin={{ top: 15, bottom: 5, left: 5, right: 5 }}>
                      <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <Bar dataKey="orders" fill="#000000" radius={[4, 4, 0, 0]} name="B2C Orders" barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="text-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Total B2C Orders</span>
                  <span className="text-xl font-black text-slate-955 mt-0.5 block">{show(`${insights?.gst?.b2cOrders ?? 0} Orders`)}</span>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

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

export default VendorReports;
