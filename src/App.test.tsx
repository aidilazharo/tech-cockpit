import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { App } from './App';

const fetchStub = vi.fn();
beforeEach(() => {
  fetchStub.mockReset();
  fetchStub.mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal('fetch', fetchStub);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Task interface', () => {
  it('shows an accessible form and loads tasks', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /ATGV React/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /New task/i })).toBeInTheDocument();
    await waitFor(() => expect(fetchStub).toHaveBeenCalledWith('/api/tasks'));
  });

  it('submits a non-empty task', async () => {
    render(<App />);
    await userEvent.type(screen.getByRole('textbox', { name: /New task/i }), 'Example task');
    await userEvent.click(screen.getByRole('button', { name: /Add task/i }));
    await waitFor(() => expect(fetchStub).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ title: 'Example task' }),
    })));
  });
});
