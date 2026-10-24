import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Small "i" button that explains what a filter does.
 *
 * Opens on hover, keyboard focus or tap (touch screens have no hover). The
 * explanation is rendered in a portal with fixed positioning so a scrolling
 * table or an overflow-hidden toolbar can never clip it.
 */
export function InfoTip({ text, className }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const buttonRef = useRef(null);
    const tipId = useId();

    const place = useCallback(() => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return;
        const width = 240;
        const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
        const below = rect.bottom + 8;
        // Flip above the icon when there is no room below.
        const top = below + 120 > window.innerHeight ? Math.max(8, rect.top - 8) : below;
        setPos({ left, top, width, above: top < rect.top });
    }, []);

    const show = () => { place(); setOpen(true); };
    const hide = () => setOpen(false);

    useEffect(() => {
        if (!open) return undefined;
        const close = (e) => {
            if (e.type === 'keydown' && e.key !== 'Escape') return;
            if (e.type === 'pointerdown' && buttonRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        window.addEventListener('keydown', close);
        window.addEventListener('pointerdown', close);
        return () => {
            window.removeEventListener('scroll', hide, true);
            window.removeEventListener('resize', hide);
            window.removeEventListener('keydown', close);
            window.removeEventListener('pointerdown', close);
        };
    }, [open]);

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={`What does this filter do? ${text}`}
                aria-describedby={open ? tipId : undefined}
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); open ? hide() : show(); }}
                className={cn(
                    'inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-slate-400 hover:text-slate-900 focus:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 shrink-0',
                    className
                )}
            >
                <Info size={11} strokeWidth={2.5} />
            </button>
            {open && pos && createPortal(
                <div
                    id={tipId}
                    role="tooltip"
                    style={{
                        position: 'fixed',
                        left: pos.left,
                        top: pos.top,
                        width: pos.width,
                        transform: pos.above ? 'translateY(-100%)' : undefined
                    }}
                    className="z-[1000] rounded-md bg-slate-900 px-3 py-2 text-[11px] font-medium leading-snug text-white shadow-xl normal-case tracking-normal pointer-events-none"
                >
                    {text}
                </div>,
                document.body
            )}
        </>
    );
}

/** Visible filter name plus the "i" explanation. */
export function FilterLabel({ label, info, htmlFor, className }) {
    return (
        <div className={cn('flex items-center gap-1 leading-none', className)}>
            <label
                htmlFor={htmlFor}
                className="text-[9px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap"
            >
                {label}
            </label>
            {info && <InfoTip text={info} />}
        </div>
    );
}

/** A filter control with its label (and "i") above it. */
export default function FilterField({ label, info, htmlFor, className, children }) {
    return (
        <div className={cn('flex flex-col gap-1 min-w-0', className)}>
            <FilterLabel label={label} info={info} htmlFor={htmlFor} />
            {children}
        </div>
    );
}
