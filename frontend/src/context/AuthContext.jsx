import { createContext, useCallback, useEffect, useState } from 'react';
import { getProfile, onAuthStateChanged } from '../services/authService';

export const AuthContext = createContext({ user: null, role: null, profile: null, loading: true, refreshProfile: async () => {} });
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshProfile = useCallback(async () => {
    const next = await getProfile();
    setProfile(next);
    return next;
  }, []);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      if (!active) return;
      const current = ++sequence;
      setLoading(true);
      if (!firebaseUser) { setUser(null); setProfile(null); setLoading(false); return; }
      try {
        const next = await getProfile();
        if (active && current === sequence) { setUser(firebaseUser); setProfile(next); }
      } catch { if (active && current === sequence) { setUser(null); setProfile(null); } }
      finally { if (active && current === sequence) setLoading(false); }
    });
    return () => { active = false; unsubscribe?.(); };
  }, []);
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    const refresh = async () => {
      try { const next = await getProfile(); if (active) setProfile(next); }
      catch (error) { if (active && [401, 403, 404].includes(error.response?.status)) { setProfile(null); setUser(null); } }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(refresh, 60000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisibility); };
  }, [user]);
  return <AuthContext.Provider value={{ user, role: profile?.role || null, profile, loading, refreshProfile }}>{children}</AuthContext.Provider>;
}
