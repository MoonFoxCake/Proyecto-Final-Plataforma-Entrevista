import { createContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from '../services/authService';

/**
 * @typedef {object} AuthContextValue
 * @property {object|null} user
 * @property {string|null} role
 * @property {boolean} loading
 */

/** @type {import('react').Context<AuthContextValue>} */
export const AuthContext = createContext({
  user: null,
  role: null,
  loading: true,
});

/**
 * Wraps the app, subscribing to Firebase auth state and exposing
 * `{ user, role, loading }` via {@link AuthContext}.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: subscribe via onAuthStateChanged, read the role from custom
    // claims on the Firebase user, and update state accordingly.
    // const unsubscribe = onAuthStateChanged((firebaseUser) => { ... });
    // return unsubscribe;
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>{children}</AuthContext.Provider>
  );
}
