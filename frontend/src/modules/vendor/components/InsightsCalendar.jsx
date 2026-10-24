import React, { useState } from 'react';

/** Start/end date range picker shared by the vendor and supplier Business Insights pages. */
export const CustomCalendar = ({ startDate, endDate, onChangeRange }) => {
  const [activeTab, setActiveTab] = useState('start'); // 'start' or 'end'
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayIndex = getFirstDayOfMonth(year, month);
  const daysInPrevMonth = getDaysInMonth(year, month - 1);

  const prevMonthDays = [];
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    prevMonthDays.push({
      day: daysInPrevMonth - i,
      month: month === 0 ? 11 : month - 1,
      year: month === 0 ? year - 1 : year,
      isCurrentMonth: false
    });
  }

  const currentMonthDays = [];
  for (let i = 1; i <= daysInMonth; i++) {
    currentMonthDays.push({
      day: i,
      month: month,
      year: year,
      isCurrentMonth: true
    });
  }

  const totalDays = [...prevMonthDays, ...currentMonthDays];
  const remainingCells = 42 - totalDays.length;
  for (let i = 1; i <= remainingCells; i++) {
    totalDays.push({
      day: i,
      month: month === 11 ? 0 : month + 1,
      year: month === 11 ? year + 1 : year,
      isCurrentMonth: false
    });
  }

  const handleDayClick = (cell) => {
    const yearStr = cell.year.toString();
    const monthStr = (cell.month + 1).toString().padStart(2, '0');
    const dayStr = cell.day.toString().padStart(2, '0');
    const clickedDateStr = `${yearStr}-${monthStr}-${dayStr}`;

    const clickedDate = new Date(cell.year, cell.month, cell.day);

    if (activeTab === 'start') {
      onChangeRange(clickedDateStr, endDate);
      setActiveTab('end');
      if (endDate && new Date(endDate) < clickedDate) {
        onChangeRange(clickedDateStr, '');
      }
    } else {
      onChangeRange(startDate, clickedDateStr);
    }
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const formatDateString = (dateStr) => {
    if (!dateStr) return 'Select Date';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="w-full bg-white rounded-2xl p-1.5 space-y-4">
      {/* Tab Selectors (Start vs End) */}
      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100">
        <button
          onClick={() => setActiveTab('start')}
          className={`py-2 px-3 rounded-lg text-left transition-all flex flex-col ${
            activeTab === 'start'
              ? 'bg-white text-black shadow-sm'
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <span className="text-[8px] font-black uppercase tracking-wider">Start Date</span>
          <span className="text-xs font-bold truncate mt-0.5">
            {startDate ? formatDateString(startDate) : 'Select Start'}
          </span>
        </button>
        <button
          disabled={!startDate}
          onClick={() => setActiveTab('end')}
          className={`py-2 px-3 rounded-lg text-left transition-all flex flex-col ${
            activeTab === 'end'
              ? 'bg-white text-black shadow-sm'
              : 'text-slate-400 hover:text-slate-700 disabled:opacity-55 disabled:cursor-not-allowed'
          }`}
        >
          <span className="text-[8px] font-black uppercase tracking-wider">End Date</span>
          <span className="text-xs font-bold truncate mt-0.5">
            {endDate ? formatDateString(endDate) : 'Select End'}
          </span>
        </button>
      </div>

      {/* Calendar Grid Container */}
      <div className="space-y-3 p-1">
        {/* Calendar Month Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <button
            onClick={prevMonth}
            className="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <span className="material-symbols-outlined text-xs">chevron_left</span>
          </button>
          <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider">
            {monthNames[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <span className="material-symbols-outlined text-xs">chevron_right</span>
          </button>
        </div>

        {/* Weekdays */}
        <div className="grid grid-cols-7 text-center">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
            <span key={day} className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{day}</span>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {totalDays.map((cell, idx) => {
            const dateObj = new Date(cell.year, cell.month, cell.day);
            const dateStr = dateObj.toISOString().split('T')[0];

            const isStart = startDate && dateStr === startDate;
            const isEnd = endDate && dateStr === endDate;
            const isInRange = startDate && endDate && dateObj > new Date(startDate) && dateObj < new Date(endDate);

            const isBeforeStart = activeTab === 'end' && startDate && dateObj < new Date(startDate);
            const isSelectable = !isBeforeStart;

            let btnClass = "text-[10px] font-bold py-1.5 rounded-lg transition-colors ";
            if (isStart || isEnd) {
              btnClass += "bg-black text-white";
            } else if (isInRange) {
              btnClass += "bg-slate-100 text-slate-900";
            } else if (isBeforeStart) {
              btnClass += "text-slate-200 cursor-not-allowed";
            } else if (cell.isCurrentMonth) {
              btnClass += "text-slate-800 hover:bg-slate-50";
            } else {
              btnClass += "text-slate-300 hover:bg-slate-50";
            }

            return (
              <button
                key={idx}
                disabled={!isSelectable}
                onClick={() => handleDayClick(cell)}
                className={btnClass}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};


/** Shown over a chart area when the selected period has no data for it. */
export const EmptyChartNote = ({ text }) => (
  <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-white/90 px-3 py-1.5 rounded-xl">
      {text}
    </span>
  </div>
);
