import React, { useEffect, useState } from 'react';
import { ticketApi } from '../../../lib/api';

export default function TicketAssignment({ ticket, onUpdated }) {
  const [staff, setStaff] = useState([]);
  const [assignee, setAssignee] = useState(ticket.assignedTo?._id || ticket.assignedTo || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let current = true;
    ticketApi.getSupportStaff().then(data => { if (current) setStaff(data); }).catch(err => { if (current) setError(err.message); });
    return () => { current = false; };
  }, []);
  const save = async () => {
    setSaving(true); setError('');
    try {
      await ticketApi.assignTicket(ticket._id, { assignedTo: assignee || null, expectedVersion: ticket.assignmentVersion || 0, reason });
      setReason('');
      await onUpdated();
    } catch (err) { setError(err.message || 'Unable to assign ticket.'); }
    finally { setSaving(false); }
  };
  return <div className="px-6 py-3 border-b border-slate-100 bg-white text-xs space-y-2">
    <p className="font-bold">Owner: {ticket.assignedTo?.displayName || 'Unassigned'}</p>
    {!['Resolved', 'Closed'].includes(ticket.status) && <div className="flex gap-2 flex-wrap">
      <label>Assign to <select aria-label="Ticket owner" value={assignee} onChange={event => setAssignee(event.target.value)} className="ml-2 border border-slate-200 rounded-sm p-2">
        <option value="">Unassigned</option>
        {staff.map(user => <option key={user._id} value={user._id}>{user.displayName} ({user.workload} open)</option>)}
      </select></label>
      <input aria-label="Assignment reason" maxLength={1000} placeholder="Assignment reason" value={reason} onChange={event => setReason(event.target.value)} className="border border-slate-200 rounded-sm p-2" />
      <button disabled={saving || !reason.trim()} onClick={save} className="bg-slate-900 text-white px-3 py-2 rounded-sm disabled:opacity-50">{saving ? 'Saving…' : 'Save assignment'}</button>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {ticket.assignmentHistory?.length > 0 && <details><summary>Ownership history</summary><ol className="space-y-1 mt-2">{ticket.assignmentHistory.map((entry, index) => <li key={entry._id || index}>{new Date(entry.at).toLocaleString()} · {entry.actor?.displayName || 'Admin'}: {entry.from?.displayName || 'Unassigned'} → {entry.to?.displayName || 'Unassigned'} · {entry.reason}</li>)}</ol></details>}
  </div>;
}
