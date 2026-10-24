import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ticketApi } from '../../../lib/api';
export default function TicketEvidence({ ticketId }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true; setData(null); setError('');
    ticketApi.getEvidence(ticketId).then(result => { if (current) setData(result); }).catch(err => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [ticketId, retry]);
  const photos = (urls, label) => <div className="flex gap-2 flex-wrap">{urls.map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`${label} ${index + 1}`} className="w-24 h-24 object-cover rounded-sm border" /></a>)}</div>;
  return <section className="border p-4 bg-white rounded-sm space-y-3 text-xs"><h3 className="font-bold">Recorded evidence & custody</h3>
    {error && <p role="alert" className="text-red-700">{error} <button className="underline" onClick={() => setRetry(value => value + 1)}>Retry evidence</button></p>}
    {!data && !error && <p role="status">Loading evidence…</p>}
    {data && <>{data.order && <Link className="underline" to={`/admin/orders/${data.order._id}`}>Open {data.order.orderNumber}</Link>}<p className="text-slate-500">{data.limitation}</p>
      <h4 className="font-bold">Customer booking photos</h4>{data.bookingPhotos.length ? photos(data.bookingPhotos, 'Booking photo') : <p>No booking photos recorded.</p>}
      {data.itemPhotos.map((item, index) => <div key={index}><h4>{item.name}</h4>{photos(item.photos, item.name)}</div>)}
      <ol className="space-y-1">{data.custody.map((event, index) => <li key={index}>{event.phase}: {event.verified ? `Verified ${event.verifiedAt ? new Date(event.verifiedAt).toLocaleString() : '(time not recorded)'}` : 'Not verified'}</li>)}</ol>
    </>}
  </section>;
}
