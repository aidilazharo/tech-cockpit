import { useSearchParams } from 'react-router'

/** List filters and paging kept in the URL, so a filtered list can be shared and survives a reload. */
export function useListParams<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams()
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ''])) as Record<K, string>
  const page = Math.max(1, Number(params.get('page')) || 1)
  const set = (changes: Partial<Record<K | 'page', string>>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes) as [string, string][]) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }
  const filtered = keys.some((key) => values[key] !== '')
  return { values, page, set, clear: () => setParams({}, { replace: true }), filtered }
}
