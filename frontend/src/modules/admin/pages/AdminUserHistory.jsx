import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi, ticketApi } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';

export default function AdminUserHistory() {
    const { id } = useParams();
    return <UserHistory key={id} id={id} />;
}

function UserHistory({ id }) {
    const [filter, setFilter] = useState({ section: 'orders', page: 1, limit: 20 });
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const [ticketId, setTicketId] = useState(null);
    const [ticket, setTicket] = useState(null);
    const [ticketError, setTicketError] = useState('');
    useEffect(() => {
        let current = true;
        setResult(null); setLoading(true); setError(''); setTicketId(null);
        adminApi.getUserHistory(id, filter).then(data => { if (current) setResult(data); })
            .catch(error => { if (current) setError(error.message || 'Unable to load user history.'); })
            .finally(() => { if (current) setLoading(false); });
        return () => { current = false; };
    }, [id, filter, retry]);
    useEffect(() => {
        let current = true;
        setTicket(null); setTicketError('');
        if (ticketId) ticketApi.getTicketDetails(ticketId).then(data => { if (current) setTicket(data); })
            .catch(error => { if (current) setTicketError(error.message || 'Unable to load conversation.'); });
        return () => { current = false; };
    }, [ticketId, id]);
    const section = filter.section;
    return <div className="min-h-screen bg-slate-50/50">
        <PageHeader title="User History" />
        <div className="p-6 space-y-4">
            <Link to="/admin/users" className="text-xs text-blue-700">Back to users</Link>
            {result && <div><h2 className="text-lg font-bold text-slate-900">{result.user.displayName || 'Unnamed account'}</h2><p className="text-xs text-slate-500">{result.user.role} · {result.user.isBlocked ? 'Blocked' : result.user.status}</p></div>}
            <div className="flex gap-2">{['orders', 'tickets'].map(value => <button key={value} aria-pressed={section === value} onClick={() => { setResult(null); setTicketId(null); setLoading(true); setFilter({ section: value, page: 1, limit: 20 }); }} className={`rounded px-4 py-2 text-xs border ${section === value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border-slate-200'}`}>{value === 'orders' ? 'Order history' : 'Support history'}</button>)}</div>
            <p className="text-xs text-slate-500">Showing recorded history within your permissions. Orders include this account’s customer, vendor and rider activity; support includes its own conversations.</p>
            {loading && <p role="status">Loading history…</p>}
            {error && <div role="alert" className="text-sm text-red-700">{error} <button onClick={() => setRetry(value => value + 1)} className="underline">Retry</button></div>}
            {!loading && !error && <>
                <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
                    <table className="w-full text-xs text-left"><thead className="bg-slate-50 text-slate-500"><tr>{['Record', 'Created', 'Status', section === 'orders' ? 'Recorded total' : 'Category', 'Details'].map(title => <th key={title} className="p-3">{title}</th>)}</tr></thead>
                        <tbody>{result?.data?.map(record => <tr key={record._id} className="border-t border-slate-100"><td className="p-3 font-bold">{section === 'orders' ? record.orderId || record._id : record.subject}</td><td className="p-3">{new Date(record.createdAt).toLocaleString()}</td><td className="p-3">{record.status}</td><td className="p-3">{section === 'orders' ? (record.totalAmount != null && Number.isFinite(Number(record.totalAmount)) ? `₹${Number(record.totalAmount).toFixed(2)}` : 'Not recorded') : record.category}</td><td className="p-3">{section === 'orders' ? <Link to={`/admin/orders/${record._id}`} className="text-blue-700 underline">View order</Link> : <button onClick={() => setTicketId(record._id)} className="text-blue-700 underline">Read conversation</button>}</td></tr>)}</tbody>
                    </table>
                    {!result?.data?.length && <p className="p-6 text-sm text-slate-500">No {section} recorded within your permissions.</p>}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600"><span>{result?.pagination.total || 0} records · Page {filter.page} of {Math.max(1, result?.pagination.totalPages || 0)}</span><div className="flex gap-2"><button disabled={filter.page <= 1} onClick={() => setFilter(previous => ({ ...previous, page: previous.page - 1 }))} className="border rounded px-3 py-2 disabled:opacity-40">Previous</button><button disabled={!result || filter.page >= result.pagination.totalPages} onClick={() => setFilter(previous => ({ ...previous, page: previous.page + 1 }))} className="border rounded px-3 py-2 disabled:opacity-40">Next</button></div></div>
            </>}
            {ticketId && <section aria-label="Recorded support conversation" className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
                <button onClick={() => setTicketId(null)} className="text-xs underline">Close conversation</button>
                {ticketError ? <p role="alert" className="text-red-700 text-sm">{ticketError}</p> : !ticket ? <p role="status">Loading conversation…</p> : <><h3 className="font-bold">{ticket.subject}</h3><p className="text-xs text-slate-500">{ticket.status} · {ticket.category}</p><p className="text-sm whitespace-pre-wrap">{ticket.description}</p>{ticket.messages?.map(message => <div key={message._id} className="border-t border-slate-100 pt-2"><p className="text-xs text-slate-500">{message.senderRole} · {new Date(message.createdAt).toLocaleString()}</p><p className="text-sm whitespace-pre-wrap">{message.message}</p>{message.attachments?.map((attachment, index) => /^https?:\/\//i.test(attachment.url || '') && <a key={index} href={attachment.url} target="_blank" rel="noreferrer" className="block text-xs text-blue-700 underline">View attachment {index + 1}</a>)}</div>)}</>}
            </section>}
        </div>
    </div>;
}
