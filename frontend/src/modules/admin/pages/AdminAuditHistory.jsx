import { useEffect, useState } from 'react';
import { adminApi } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';
import MultiSelectFilter from '../components/common/MultiSelectFilter';

export default function AdminAuditHistory() {
    const [filters, setFilters] = useState({ page: 1, limit: 25, outcome: 'All', search: '' });
    const [draft, setDraft] = useState('');
    const [refresh, setRefresh] = useState(0);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        let current = true;
        setLoading(true); setResult(null); setError('');
        const query = { ...filters };
        if (query.outcome === 'All') delete query.outcome;
        adminApi.getAuditEvents(query).then(data => { if (current) setResult(data); })
            .catch(error => { if (current) setError(error.message || 'Unable to load audit history.'); })
            .finally(() => { if (current) setLoading(false); });
        return () => { current = false; };
    }, [filters, refresh]);
    const pagination = result?.pagination;
    return <div className="min-h-screen bg-slate-50/50">
        <PageHeader title="Audit History" />
        <div className="p-6 space-y-4">
            <p className="text-xs text-slate-500">Admin action attempts and outcomes. Requested records log an attempt; only Succeeded records confirm a successful response. Times are shown in your local timezone.</p>
            {result?.visibility === 'own' && <p className="text-xs text-slate-600">Showing your own audit history within your admin permissions.</p>}
            <form onSubmit={event => { event.preventDefault(); setFilters(previous => ({ ...previous, search: draft.trim(), page: 1 })); }} className="flex flex-wrap gap-3 items-center bg-white p-3 border border-slate-200 rounded-md">
                <input aria-label="Search audit history" type="search" placeholder="Search action path or operation ID" value={draft} onChange={event => setDraft(event.target.value)} className="border border-slate-200 rounded px-3 py-2 text-xs w-72" />
                <button type="submit" className="px-3 py-2 bg-slate-900 text-white text-xs rounded">Search</button>
                <MultiSelectFilter aria-label="Audit outcome" value={filters.outcome} onChange={event => setFilters(previous => ({ ...previous, outcome: event.target.value, page: 1 }))} className="border border-slate-200 rounded px-3 py-2 text-xs">
                    <option value="All">All outcomes</option>
                    {['Requested', 'Succeeded', 'Denied', 'Failed', 'Aborted'].map(outcome => <option key={outcome} value={outcome}>{outcome}</option>)}
                </MultiSelectFilter>
                <button type="button" onClick={() => setRefresh(value => value + 1)} className="px-3 py-2 text-xs border border-slate-200 rounded">Refresh</button>
            </form>
            {loading && <p role="status" className="text-sm text-slate-500">Loading audit history…</p>}
            {error && <div role="alert" className="text-sm text-red-700">{error} <button onClick={() => setRefresh(value => value + 1)} className="underline">Retry</button></div>}
            {!loading && !error && <>
                <div className="overflow-x-auto bg-white border border-slate-200 rounded-md">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase"><tr>{['Time', 'Actor ID', 'Action', 'Outcome', 'Details'].map(title => <th key={title} className="p-3 font-bold">{title}</th>)}</tr></thead>
                        <tbody>{result?.data?.map(event => <tr key={event._id} className="border-t border-slate-100 align-top">
                            <td className="p-3 whitespace-nowrap">{new Date(event.createdAt).toLocaleString()}</td>
                            <td className="p-3 font-mono">{event.actorId}</td>
                            <td className="p-3"><span className="font-bold">{event.method}</span> {event.path}</td>
                            <td className="p-3">{event.outcome}{event.statusCode ? ` (${event.statusCode})` : ''}</td>
                            <td className="p-3"><details><summary className="cursor-pointer">View details</summary><div className="mt-2 space-y-1 min-w-60">
                                <p>Operation ID: <span className="font-mono">{event.operationId}</span></p>
                                {event.targetId && <p>Target ID: <span className="font-mono">{event.targetId}</span></p>}
                                {event.before && <p>Before: <code>{JSON.stringify(event.before)}</code></p>}
                                {event.after && <p>After: <code>{JSON.stringify(event.after)}</code></p>}
                            </div></details></td>
                        </tr>)}</tbody>
                    </table>
                    {!result?.data?.length && <p className="p-6 text-sm text-slate-500">No audit events match these filters.</p>}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>{pagination?.total || 0} events · Page {pagination?.page || filters.page} of {Math.max(1, pagination?.totalPages || 0)}</span>
                    <div className="flex gap-2">
                        <button disabled={filters.page <= 1} onClick={() => setFilters(previous => ({ ...previous, page: previous.page - 1 }))} className="border rounded px-3 py-2 disabled:opacity-40">Previous</button>
                        <button disabled={!pagination || filters.page >= pagination.totalPages} onClick={() => setFilters(previous => ({ ...previous, page: previous.page + 1 }))} className="border rounded px-3 py-2 disabled:opacity-40">Next</button>
                    </div>
                </div>
            </>}
        </div>
    </div>;
}
