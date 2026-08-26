import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

/**
 * Exposes `{ user, role, loading }` from {@link AuthContext}.
 *
 * @returns {{ user: object|null, role: string|null, loading: boolean }}
 */
export function useAuth() {
  return useContext(AuthContext);
}
