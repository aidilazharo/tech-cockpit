/** Page numbers to show: first, last, and the current page with its neighbours. */
export function pageItems(page: number, pageCount: number): (number | 'gap')[] {
  const count = Math.max(1, pageCount)
  const wanted = new Set([1, count, page - 1, page, page + 1].filter((n) => n >= 1 && n <= count))
  const sorted = [...wanted].sort((a, b) => a - b)
  const items: (number | 'gap')[] = []
  sorted.forEach((n, index) => {
    if (index > 0 && n - sorted[index - 1] > 1) items.push('gap')
    items.push(n)
  })
  return items
}
