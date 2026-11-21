import { useOutletContext } from 'react-router'
import type { Me } from './auth-store'

/** The signed-in user, for pages under the protected layout. */
export function useMe(): Me {
  return useOutletContext<Me>()
}
