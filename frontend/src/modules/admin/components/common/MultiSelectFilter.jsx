import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { filterValues } from '../../utils/filters';

/** Reuses the existing select's options, styling and change handler. */
export default function MultiSelectFilter({ value, onChange, children, className = '', disabled, emptyLabel, 'aria-label': ariaLabel }) {
    const options = React.Children.toArray(children).filter(React.isValidElement);
    const allOption = options.find(option => ['', 'All', 'all'].includes(String(option.props.value ?? option.props.children)));
    const emptyValue = allOption?.props.value ?? 'All';
    const label = ariaLabel || allOption?.props.children || 'Filter';
    const choices = options.filter(option => option !== allOption);
    const selected = filterValues(value);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [position, setPosition] = useState({});
    const trigger = useRef(null);
    const popup = useRef(null);
    const id = useId();
    const close = () => { setOpen(false); setSearch(''); };
    const change = next => onChange({ target: { value: next.length ? next : emptyValue } });

    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const rect = trigger.current.getBoundingClientRect();
            const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 16);
            const below = window.innerHeight - rect.bottom;
            setPosition({ width, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
                ...(below >= 240 ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
                maxHeight: Math.max(120, Math.min(320, (below >= 240 ? below : rect.top) - 12)) });
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const outside = event => {
            if (!trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) close();
        };
        const keyboard = event => {
            if (event.key === 'Escape') { close(); trigger.current?.focus(); }
            if (event.key === 'Tab' && !popup.current?.contains(event.target)) close();
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', keyboard);
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); };
    }, [open]);

    const selectedLabels = choices.filter(option => selected.includes(String(option.props.value ?? option.props.children)))
        .map(option => option.props.children);
    const summary = selected.length ? (selected.length === 1 ? selectedLabels[0] || selected[0] : `${label} (${selected.length})`) : (emptyLabel || label);
    return <>
        <button ref={trigger} type="button" disabled={disabled} aria-label={String(label)} aria-expanded={open}
            aria-controls={open ? id : undefined} aria-haspopup="dialog" title={selected.length ? selected.join(', ') : String(label)}
            onClick={() => { if (open) close(); else setOpen(true); }}
            className={`${className.replace(/\bpr-10\b/g, 'pr-3')} inline-flex items-center justify-between gap-2 text-left disabled:opacity-50`}>
            <span className="truncate">{summary}</span><ChevronDown size={12} className="shrink-0 text-slate-400" />
        </button>
        {open && createPortal(<div ref={popup} id={id} role="dialog" aria-label={String(label)} style={{ ...position, zIndex: 10000 }}
            onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) close(); }}
            className="fixed flex flex-col rounded-sm border border-slate-200 bg-white shadow-lg text-left text-[10px] font-bold text-slate-800">
            <div className="border-b border-slate-100 p-1.5">
                <input autoFocus type="search" value={search} onChange={event => setSearch(event.target.value)}
                    aria-label={`Search ${label}`} placeholder="Search options..."
                    className="w-full rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 outline-none focus:border-slate-400" />
            </div>
            <div className="overflow-y-auto py-1">
                <label className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50">
                    <input type="checkbox" checked={!selected.length} onChange={() => change([])} className="accent-slate-900" />{emptyLabel || label}
                </label>
                {choices.filter(option => String(option.props.children).toLowerCase().includes(search.toLowerCase())).map(option => {
                    const optionValue = String(option.props.value ?? option.props.children);
                    return <label key={optionValue} className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50">
                        <input type="checkbox" checked={selected.includes(optionValue)} disabled={option.props.disabled}
                            onChange={() => change(selected.includes(optionValue) ? selected.filter(item => item !== optionValue) : [...selected, optionValue])}
                            className="shrink-0 accent-slate-900" /><span>{option.props.children}</span>
                    </label>;
                })}
                {!choices.some(option => String(option.props.children).toLowerCase().includes(search.toLowerCase())) &&
                    <p className="px-3 py-2 text-slate-400">No options found</p>}
            </div>
        </div>, document.body)}
    </>;
}
