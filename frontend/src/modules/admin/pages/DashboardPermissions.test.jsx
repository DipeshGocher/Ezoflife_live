import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { dashboardApi, adminApi } from '../../../lib/api';
import { scopedAnalytics } from '../../../test/fixtures/adminAnalytics';
vi.mock('../../../lib/api', () => ({ dashboardApi: { getAnalytics: vi.fn(), getFilters: vi.fn() }, adminApi: { getSidebarCounts: vi.fn() } }));
vi.mock('recharts', () => {
    const Container = ({ children }) => <div>{children}</div>; const Empty = () => null;
    return { ResponsiveContainer: Container, LineChart: Container, AreaChart: Container, BarChart: Container, PieChart: Container, ScatterChart: Container, Line: Empty, Area: Empty, Bar: Empty, Pie: Empty, Cell: Empty, Scatter: Empty, XAxis: Empty, YAxis: Empty, CartesianGrid: Empty, Tooltip: Empty, Legend: Empty };
});
beforeEach(() => {
    dashboardApi.getAnalytics.mockReset();
    dashboardApi.getFilters.mockResolvedValue({ success: true, data: { states: [], stateCityMap: {}, cityPincodeMap: {}, geofenceMap: {} } });
    adminApi.getSidebarCounts.mockResolvedValue({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
describe('dashboard permission outcomes', () => {
    it('shows a failed report explicitly and retries into scoped metrics', async () => {
        dashboardApi.getAnalytics.mockRejectedValueOnce(new Error('Scope could not be verified')).mockResolvedValueOnce(scopedAnalytics);
        render(<MemoryRouter><Dashboard /></MemoryRouter>);
        expect(await screen.findByRole('alert')).toHaveTextContent('Scope could not be verified');
        fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }));
        expect(await screen.findByText(/Accounts, orders and support reflect your assigned service areas/)).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    it('does not interpret an invalid success payload as zero-valued analytics', async () => {
        dashboardApi.getAnalytics.mockResolvedValue({ success: false });
        render(<MemoryRouter><Dashboard /></MemoryRouter>);
        expect(await screen.findByRole('alert')).toHaveTextContent('Dashboard metrics are unavailable');
    });
});

it('waits for both custom dates without replacing the filter form with an error', async () => {
    dashboardApi.getAnalytics.mockResolvedValue(scopedAnalytics);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await screen.findByText(/Accounts, orders and support reflect/);
    const range = screen.getByDisplayValue('Last 7 Days');
    fireEvent.change(range, { target: { value: 'Custom Range' } });
    expect(await screen.findByText(/Select both dates to update the report/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(dashboardApi.getAnalytics).toHaveBeenCalledTimes(1);
});


it('polls with the currently selected filters and removes the extra analytics tabs', async () => {
    let poll;
    const interval = vi.spyOn(window, 'setInterval').mockImplementation(callback => { poll = callback; return 1; });
    dashboardApi.getAnalytics.mockResolvedValue(scopedAnalytics);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Active orders' });
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'B2C' } });
    await waitFor(() => expect(dashboardApi.getAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ channel: 'B2C' }), expect.anything()));
    await screen.findByRole('heading', { name: 'Active orders' });
    await act(async () => { await poll(); });
    expect(dashboardApi.getAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ channel: 'B2C', view: 'operational' }), expect.anything());
    expect(screen.queryByText('Financial Intel')).not.toBeInTheDocument();
    expect(screen.queryByText('Partners & Clients')).not.toBeInTheDocument();
    expect(screen.queryByText(/Labor Exchange Pipeline|Labour Management|Labor Management|Talent Requisition/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delayed pickups · over 2 hours' })).toBeInTheDocument();
    interval.mockRestore();
});

it('does not let an older filter response overwrite the latest selection', async () => {
    let resolveOld;
    dashboardApi.getAnalytics.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(scopedAnalytics);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'B2C' } });
    await screen.findByRole('heading', { name: 'Active orders' });
    await act(async () => resolveOld({ ...scopedAnalytics, data: { ...scopedAnalytics.data, activeOrders: { total: 999, b2c: 999, b2b: 0 } } }));
    expect(screen.queryByText('999')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Channel')).toHaveValue('B2C');
});

it('keeps filters available after refresh fails and requires a new successful result', async () => {
    dashboardApi.getAnalytics.mockResolvedValueOnce(scopedAnalytics).mockRejectedValueOnce(new Error('Unavailable now'));
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Active orders' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable now');
    expect(screen.queryByRole('heading', { name: 'Active orders' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Channel')).toBeInTheDocument();
});
