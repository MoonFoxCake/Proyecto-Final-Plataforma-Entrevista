import { createContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from '../services/authService';

/**
 * @typedef {object} AuthContextValue
 * @property {import('firebase/auth').User|null} user
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
 * `{ user, role, loading }` via {@link AuthContext}. `role` is read from
 * the ID token's custom claims (see `AuthService.assignRole` on the
 * backend), not from Firestore, so it's available without an extra API
 * call and stays in sync whenever the token refreshes.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      const tokenResult = await firebaseUser.getIdTokenResult();
      setUser(firebaseUser);
      setRole(tokenResult.claims.role ?? null);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>{children}</AuthContext.Provider>
  );
}
