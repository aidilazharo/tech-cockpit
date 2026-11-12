import React, { useEffect, useState } from 'react';

export interface Task { id: number; title: string; status: string }

export function App() {
  const [rows, setRows] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  async function reload() {
    const response = await fetch('/api/tasks');
    if (!response.ok) throw new Error('Unable to fetch tasks');
    setRows(await response.json() as Task[]);
  }

  useEffect(() => {
    void reload().catch((cause: unknown) => setError(String(cause)));
  }, []);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!response.ok) throw new Error('Unable to create task');
      setTitle('');
      setError('');
      await reload();
    } catch (cause) {
      setError(String(cause));
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: '3rem auto', fontFamily: 'system-ui' }}>
      <h1>ATGV React + SQLite</h1>
      <p>API: <a href="/api/docs">Swagger documentation</a> · <a href="/api/health">API health</a></p>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={(event) => void add(event)}>
        <label htmlFor="task-title">New task</label>{' '}
        <input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <button type="submit">Add task</button>
      </form>
      <ul>{rows.map((task) => <li key={task.id}>{task.title} ({task.status})</li>)}</ul>
    </main>
  );
}
