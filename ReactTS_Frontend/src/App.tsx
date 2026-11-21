import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { createQueryClient } from './lib/query-client'
import { routes } from './routes'
import { ThemeController } from './theme/ThemeController'

export function App() {
  const [router] = useState(() => createBrowserRouter(routes))
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeController />
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
