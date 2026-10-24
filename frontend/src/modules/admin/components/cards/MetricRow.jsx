import React from 'react';
import { cn } from '@/lib/utils';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

export default function MetricRow({
    label,
    value,
    change,
    trend,
    icon: Icon,
    currency,
    sparklineData = []
}) {
    const isUp = trend === 'up';

    return (
        <div className="flex flex-col py-3 px-5 hover:bg-slate-50 transition-colors h-full justify-center min-w-0 border-r border-slate-100 last:border-r-0">
            {/* Top row: Label */}
            <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                    {Icon && <Icon size={12} className="text-slate-400 shrink-0" />}
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">
                        {label || 'Metric Entity'}
                    </span>
                </div>
                {change && (
                    <span className={`text-[10px] font-bold uppercase tabular-nums tracking-widest px-1.5 py-0.5 rounded-sm border ${isUp ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                        {isUp ? '↑' : '↓'} {change}
                    </span>
                )}
            </div>

            {/* Bottom row: Value */}
            <div className="flex items-end justify-between gap-3 min-w-0 flex-1">
                <div className="flex items-baseline gap-1 min-w-0 overflow-hidden">
                    <span className="text-lg font-bold text-slate-900 tabular-nums tracking-tight truncate leading-none mb-1">
                        {value ?? '0'}
                    </span>
                    {currency && <span className="text-[10px] font-bold text-slate-400 shrink-0 uppercase tracking-widest mb-1.5 opacity-60 tabular-nums">{currency}</span>}
                </div>
                
                {/* Mini sparkline: only drawn from real series data, never a placeholder shape */}
                {sparklineData.length > 1 && (
                <div className="h-8 w-20 opacity-30 hover:opacity-100 transition-opacity">
                    <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparklineData}>
                        <defs>
                        <linearGradient id={`color-${label}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity={0.8}/>
                            <stop offset="95%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity={0}/>
                        </linearGradient>
                        </defs>
                        <Area 
                            type="monotone" 
                            dataKey="value" 
                            stroke={isUp ? '#10b981' : '#ef4444'} 
                            fill={`url(#color-${label})`} 
                            strokeWidth={2}
                        />
                    </AreaChart>
                    </ResponsiveContainer>
                </div>
                )}
            </div>
        </div>
    );
}
