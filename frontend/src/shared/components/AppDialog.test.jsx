import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppDialog from './AppDialog';
import { appDialog, useAppDialogStore } from '../stores/appDialogStore';

beforeEach(() => useAppDialogStore.setState({ queue: [] }));

describe('in-app dialogs', () => {
  it('shows an alert until acknowledged and restores focus and scrolling', async () => {
    render(<><button>Open notice</button><AppDialog /></>);
    const opener = screen.getByRole('button', { name: 'Open notice' });
    opener.focus();
    const next = vi.fn();
    let result;
    act(() => { result = appDialog.alert('Order accepted. Pickup requested.').then(next); });
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Order accepted. Pickup requested.');
    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    expect(next).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await result;
    expect(next).toHaveBeenCalledWith(undefined);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it.each(['Cancel', 'Escape'])('cancels a destructive action with %s', async (action) => {
    render(<AppDialog />);
    const remove = vi.fn();
    let task;
    act(() => { task = (async () => { if (await appDialog.confirm('Delete this order?')) remove(); })(); });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    if (action === 'Escape') fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    else fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await task;
    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits for Confirm before running the action', async () => {
    render(<AppDialog />);
    const remove = vi.fn();
    let task;
    act(() => { task = (async () => { if (await appDialog.confirm('Delete this service?')) remove(); })(); });
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await task;
    expect(remove).toHaveBeenCalledOnce();
  });

  it('traps keyboard focus between the dialog controls', () => {
    render(<AppDialog />);
    act(() => { void appDialog.confirm('Continue?'); });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.click(cancel);
  });

  it('keeps concurrent dialogs in order and resolves each separately', async () => {
    render(<AppDialog />);
    let first, second;
    act(() => { first = appDialog.alert('First notice'); second = appDialog.confirm('Second question'); });
    expect(screen.queryByText('Second question')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await expect(first).resolves.toBeUndefined();
    expect(screen.getByRole('dialog')).toHaveTextContent('Second question');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await expect(second).resolves.toBe(true);
  });

  it('returns edited input, preserving the supplied default value', async () => {
    render(<AppDialog />);
    let result;
    act(() => { result = appDialog.prompt('Vendor linked account', 'acc_original'); });
    const input = screen.getByRole('textbox', { name: 'Your response' });
    expect(input).toHaveValue('acc_original');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'acc_updated' } });
    fireEvent.submit(input.closest('form'));
    await expect(result).resolves.toBe('acc_updated');
  });

  it('returns null when an input popup is cancelled', async () => {
    render(<AppDialog />);
    let result;
    act(() => { result = appDialog.prompt('Update status', 'PROCESSING'); });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    await expect(result).resolves.toBeNull();
  });
});
