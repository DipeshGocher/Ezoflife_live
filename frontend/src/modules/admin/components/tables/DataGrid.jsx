import React from 'react';
import { cn } from '@/lib/utils';
import { MoreHorizontal, ArrowUpDown, ChevronRight, Search, Download } from 'lucide-react';
import FilterField from '../common/FilterLabel';

export default function DataGrid({
    columns = [],
    data = [],
    onRowClick,
    onAction,
    title,
    actions,
    density = 'compact', // compact, standard
    stickyHeader = true,
    loading = false,
    pagination,
    onPageChange,
    showSearch = true,
    searchLabel = 'Search this page',
    searchInfo = 'Shows only the rows on this page that contain the text you type, in any column. It does not search other pages — use the filters above the table for that.',
    showHeader = true,
    onDownload,
    minWidth = '800px',
    maxHeight,
    showTotalEntities = true,
    leftContent
}) {
    const [searchTerm, setSearchTerm] = React.useState('');

    const filteredData = React.useMemo(() => {
        if (!searchTerm) return data;
        const lowerSearch = searchTerm.toLowerCase();
        return data.filter(row => {
            return Object.keys(row).some(key => {
                const val = row[key];
                if (val === null || val === undefined) return false;
                if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
                    if (key === 'isActive') {
                        const statusStr = val ? 'active' : 'inactive';
                        return statusStr.includes(lowerSearch);
                    }
                    return String(val).toLowerCase().includes(lowerSearch);
                }
                return false;
            });
        });
    }, [data, searchTerm]);

    return (
        <div className="w-full bg-white border border-slate-200 flex flex-col rounded-sm">
            {/* Grid Header Strip */}
            {showHeader && (
                <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white z-20">
                    <div className="flex items-center flex-wrap gap-3">
                        {title && <div className="w-1.5 h-6 bg-slate-900 rounded-sm" />}
                        {title && (
                            <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-[0.2em] leading-none mb-1">
                                {title}
                            </h3>
                        )}
                        {showTotalEntities && (
                            <span className="px-2 py-0.5 bg-slate-50 border border-slate-100 text-slate-400 text-[10px] font-bold tabular-nums tracking-widest leading-none">
                                {pagination ? pagination.total : data.length} TOTAL ENTITIES
                            </span>
                        )}
                        {leftContent}
                    </div>
                    <div className="flex items-end flex-wrap gap-2 w-full sm:w-auto">
                        {showSearch && (
                            <FilterField label={searchLabel} info={searchInfo} className="lg:flex hidden">
                                <div className="relative group">
                                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-all" />
                                    <input
                                         type="text"
                                         value={searchTerm}
                                         onChange={(e) => setSearchTerm(e.target.value)}
                                         placeholder="Type to filter rows..."
                                         aria-label={searchLabel}
                                         className="pl-8 pr-4 py-1.5 bg-slate-50 border border-slate-100 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-300 transition-all outline-none w-48"
                                    />
                                </div>
                            </FilterField>
                        )}
                        {actions}
                        {onDownload && (
                            <>
                                <div className="h-4 w-px bg-slate-100 mx-1" />
                                <button onClick={onDownload} className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-900 rounded-sm" title="Download Excel/CSV">
                                    <Download size={14} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Main Table Engine */}
            <div 
                className="overflow-x-auto overflow-y-auto relative z-10"
                style={maxHeight ? { maxHeight } : undefined}
            >
                <table className="w-full border-collapse text-left" style={{ minWidth }}>
                    <thead className={cn(
                        "bg-slate-50/50 border-b border-slate-200",
                        stickyHeader && "sticky top-0 z-20"
                    )}>
                        <tr>
                            {columns.map((col, idx) => (
                                <th
                                    key={idx}
                                    className={cn(
                                        "text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] transition-all whitespace-nowrap",
                                        density === 'compact' ? "px-5 py-3" : "px-5 py-4",
                                        col.align === 'right' ? "text-right" : col.align === 'center' ? "text-center" : "text-left",
                                        col.sticky && "sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]"
                                    )}
                                    style={{ width: col.width }}
                                >
                                    <div className={cn(
                                        "flex items-center gap-1.5 group cursor-pointer hover:text-slate-900",
                                        col.align === 'center' && "justify-center",
                                        col.align === 'right' && "justify-end"
                                    )}>
                                        {col.header}
                                        {col.sortable && <ArrowUpDown size={10} className="text-slate-300 group-hover:text-slate-500" />}
                                    </div>
                                </th>
                            ))}
                            {onAction && <th className="px-5 py-3 w-10 border-b border-slate-200 bg-slate-50/50"></th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, rowIndex) => (
                                <tr key={rowIndex} className="animate-pulse border-b border-slate-100">
                                    {columns.map((col, colIndex) => (
                                        <td 
                                            key={colIndex} 
                                            className={cn(
                                                "text-[12px] font-medium text-slate-700 tabular-nums tracking-tight",
                                                col.wrap ? "whitespace-normal" : "whitespace-nowrap",
                                                density === 'compact' ? "px-5 py-2.5" : "px-5 py-3.5",
                                                col.align === 'right' ? "text-right" : col.align === 'center' ? "text-center" : "text-left",
                                                col.sticky && "sticky left-0 bg-white z-10"
                                            )}
                                        >
                                            <div 
                                                className={cn(
                                                    "h-3 bg-slate-200 rounded-md",
                                                    colIndex % 3 === 0 ? "w-24" : colIndex % 3 === 1 ? "w-32" : "w-16",
                                                    col.align === 'center' && "mx-auto",
                                                    col.align === 'right' && "ml-auto"
                                                )}
                                            />
                                        </td>
                                    ))}
                                    {onAction && (
                                        <td className="px-5 py-3 text-right">
                                            <div className="h-6 w-6 bg-slate-200 rounded-sm ml-auto" />
                                        </td>
                                    )}
                                </tr>
                            ))
                        ) : filteredData.length > 0 ? (
                            filteredData.map((row, rowIdx) => (
                                <tr
                                    key={rowIdx}
                                    onClick={() => onRowClick?.(row)}
                                    className={cn(
                                        "group hover:bg-slate-50 transition-all border-b border-transparent hover:border-slate-200/50",
                                        onRowClick && "cursor-pointer"
                                    )}
                                >
                                    {columns.map((col, colIdx) => (
                                        <td
                                            key={colIdx}
                                            className={cn(
                                                "text-[12px] font-medium text-slate-700 tabular-nums tracking-tight",
                                                col.wrap ? "whitespace-normal" : "whitespace-nowrap",
                                                density === 'compact' ? "px-5 py-2.5" : "px-5 py-3.5",
                                                col.align === 'right' ? "text-right" : col.align === 'center' ? "text-center" : "text-left",
                                                col.sticky && "sticky left-0 bg-white group-hover:bg-slate-50 z-10"
                                            )}
                                        >
                                            {col.render ? col.render(row[col.key], row) : row[col.key]}
                                        </td>
                                    ))}
                                    {onAction && (
                                        <td className="px-5 py-3 text-right">
                                            <button className="p-1.5 rounded-sm text-slate-300 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-all" onClick={(e) => { e.stopPropagation(); onAction?.(row); }}>
                                                <MoreHorizontal size={14} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length + (onAction ? 1 : 0)} className="px-4 py-16 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest opacity-60">
                                    No Data Available
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination / Aggregation Intelligence */}
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end transition-colors hover:bg-slate-100/30">
                <div className="flex items-center gap-1">
                    <button 
                        disabled={!pagination || pagination.page <= 1 || loading}
                        onClick={() => onPageChange?.(pagination.page - 1)}
                        className="p-1 px-3 border border-slate-200 text-[9px] font-bold uppercase tracking-widest rounded-sm bg-white hover:bg-slate-950 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        Prev
                    </button>
                    <span className="px-4 text-[9px] font-black text-slate-900 tracking-widest tabular-nums bg-slate-200/50 h-6 flex items-center rounded-sm whitespace-nowrap">
                        PG {String(pagination?.page || 1).padStart(2, '0')} / {String(pagination?.totalPages || 1).padStart(2, '0')}
                    </span>
                    <button 
                        disabled={!pagination || pagination.page >= pagination?.totalPages || loading}
                        onClick={() => onPageChange?.(pagination.page + 1)}
                        className="p-1 px-3 border border-slate-200 text-[9px] font-bold uppercase tracking-widest rounded-sm bg-white hover:bg-slate-950 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
