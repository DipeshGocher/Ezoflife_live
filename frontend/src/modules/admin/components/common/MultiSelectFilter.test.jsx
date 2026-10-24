import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MultiSelectFilter from './MultiSelectFilter';
import { matchesFilter } from '../../utils/filters';
import FilterSearchParams from '../../../../lib/FilterSearchParams';

function FilterTable() {
    const [statuses, setStatuses] = useState('');
    const rows = [{ name: 'First', status: 'Active' }, { name: 'Second', status: 'Pending' }, { name: 'Third', status: 'Blocked' }];
    return <>
        <MultiSelectFilter value={statuses} onChange={event => setStatuses(event.target.value)} className="rounded-sm bg-slate-50">
            <option value="">All statuses</option>
            {['Active', 'Pending', 'Blocked'].map(status => <option key={status} value={status}>{status}</option>)}
        </MultiSelectFilter>
        <ul>{rows.filter(row => matchesFilter(statuses, row.status)).map(row => <li key={row.name}>{row.name}</li>)}</ul>
        <button>Outside</button>
    </>;
}

test('combines selections, retains checked options while searching, and clears back to all records', async () => {
    const user = userEvent.setup();
    render(<FilterTable />);
    const trigger = screen.getByRole('button', { name: 'All statuses' });
    expect(trigger).toHaveClass('rounded-sm', 'bg-slate-50');
    await user.click(trigger);
    await user.click(screen.getByRole('checkbox', { name: 'Active', exact: true }));
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('checkbox', { name: 'Pending', exact: true }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(trigger).toHaveTextContent('(2)');
    const search = screen.getByRole('searchbox');
    await user.type(search, 'Block');
    expect(screen.queryByRole('checkbox', { name: 'Active', exact: true })).not.toBeInTheDocument();
    await user.clear(search);
    expect(screen.getByRole('checkbox', { name: 'Active', exact: true })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Active', exact: true }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Second')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'All statuses' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: 'All statuses' })).toBeChecked();
});

test('supports keyboard dismissal, outside clicks and removing the last selection', async () => {
    const user = userEvent.setup();
    render(<FilterTable />);
    const trigger = screen.getByRole('button', { name: 'All statuses' });
    await user.click(trigger);
    const active = screen.getByRole('checkbox', { name: 'Active', exact: true });
    await user.click(active);
    await user.click(active);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('serializes selections without splitting punctuation and preserves ordinary query parameters', () => {
    const values = ['A, B & Co.', 'C++ (East)'];
    const params = new FilterSearchParams({ brandName: values, page: 2 });
    params.append('status', ['Active', 'Pending']);
    params.set('city', ['Indore', 'Pune']);
    const decoded = new URLSearchParams(params.toString());
    expect(JSON.parse(decoded.get('brandName'))).toEqual(values);
    expect(decoded.get('page')).toBe('2');
    expect(JSON.parse(decoded.get('status'))).toEqual(['Active', 'Pending']);
    expect(JSON.parse(decoded.get('city'))).toEqual(['Indore', 'Pune']);
    expect(new FilterSearchParams('?page=3').get('page')).toBe('3');
});
