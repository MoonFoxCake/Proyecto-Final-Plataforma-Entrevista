import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { LoginPage } from '../pages/auth/LoginPage.jsx';
import { RegisterPage } from '../pages/auth/RegisterPage.jsx';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage.jsx';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage.jsx';
import { DashboardPage } from '../pages/DashboardPage.jsx';
import { AdminDashboardPage } from '../pages/AdminDashboardPage.jsx';
import { CandidateDashboardPage } from '../pages/CandidateDashboardPage.jsx';
import { CompanyDashboardPage } from '../pages/CompanyDashboardPage.jsx';
import { EventDetailPage } from '../pages/EventDetailPage.jsx';
import { NewEventPage } from '../pages/NewEventPage.jsx';
import { EvaluationAccessPage } from '../pages/EvaluationAccessPage.jsx';
import { CandidateResultPage } from '../pages/CandidateResultPage.jsx';
import { RequireAuth } from './RequireAuth.jsx';
import { RequireRole } from './RequireRole.jsx';
import { useAuth } from '../hooks/useAuth';
import { ROLES } from '../utils/constants.js';

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
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route path='/evaluation/access' element={<EvaluationAccessPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<DashboardPage />} />

          <Route element={<RequireRole allowedRoles={[ROLES.ADMIN]} />}>
            <Route path="/admin-dashboard" element={<AdminDashboardPage />} />
          </Route>

          <Route element={<RequireRole allowedRoles={[ROLES.CANDIDATE]} />}>
            <Route path="/candidate-dashboard" element={<CandidateDashboardPage />} />
          </Route>

          <Route element={<RequireRole allowedRoles={[ROLES.COMPANY]} />}>
            <Route path='/company/events/new' element={<NewEventPage />} />
            <Route path='/company/events/:eventId' element={<EventDetailPage />} />
            <Route path='/company/events/:eventId/candidates/:candidateId/result' element={<CandidateResultPage />} />
            <Route path="/company-dashboard" element={<CompanyDashboardPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
