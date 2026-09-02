import { createContext, useEffect, useState } from 'react';
import { getProfile, logout, onAuthStateChanged } from '../services/authService';

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
    let unsubscribe;
    let active = true;

    const initialize = async () => {
      await logout();
      if (!active) return;

      unsubscribe = onAuthStateChanged(async (firebaseUser) => {
        if (!firebaseUser) {
          setUser(null);
          setRole(null);
          setLoading(false);
          return;
        }

        try {
          const profile = await getProfile();
          setUser(firebaseUser);
          setRole(profile?.role ?? null);
        } catch (error) {
          console.error('No se pudo cargar el perfil del usuario:', error);
          setUser(firebaseUser);
          setRole(null);
        } finally {
          setLoading(false);
        }
      });
    };

    initialize();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>{children}</AuthContext.Provider>
  );
}
