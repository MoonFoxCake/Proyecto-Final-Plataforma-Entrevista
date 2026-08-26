import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { LoginPage } from '../pages/auth/LoginPage.jsx';
import { RegisterPage } from '../pages/auth/RegisterPage.jsx';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage.jsx';
import { DashboardPage } from '../pages/DashboardPage.jsx';
import { RequireAuth } from './RequireAuth.jsx';
import { useAuth } from '../hooks/useAuth';

/** Sends `/` to the dashboard if already signed in, to `/login` otherwise. */
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

/**
 * Top-level router.
 *
 * Only the auth pages and a placeholder dashboard exist so far. As new
 * areas (admin/client/candidate) are built, their routes go here, each
 * wrapped in a role guard.
 */
export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
