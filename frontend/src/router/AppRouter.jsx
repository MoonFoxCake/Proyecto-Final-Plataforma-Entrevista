import { RequirePermission } from './RequirePermission.jsx';
import { RESULTS_PERMISSIONS } from '../utils/adminPermissions.js';

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { LandingPage } from '../pages/LandingPage.jsx';
import { PlanSelectionPage } from '../pages/PlanSelectionPage.jsx';

import { LoginPage } from '../pages/auth/LoginPage.jsx';
import { RegisterPage } from '../pages/auth/RegisterPage.jsx';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage.jsx';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage.jsx';

import { DashboardPage } from '../pages/DashboardPage.jsx';
import { AdminDashboardPage } from '../pages/AdminDashboardPage.jsx';
import { AdminProcessDetailPage } from '../pages/AdminProcessDetailPage.jsx';
import { AdminParticipantReviewPage } from '../pages/AdminParticipantReviewPage.jsx';

import { CandidateDashboardPage } from '../pages/CandidateDashboardPage.jsx';
import { CompanyDashboardPage } from '../pages/CompanyDashboardPage.jsx';

import { EventLayout } from '../pages/event/EventLayout.jsx';
import { EventSummaryTab } from '../pages/event/EventSummaryTab.jsx';
import { EventCandidatesTab } from '../pages/event/EventCandidatesTab.jsx';
import { EventOnsiteTab } from '../pages/event/EventOnsiteTab.jsx';
import { EventResultsTab } from '../pages/event/EventResultsTab.jsx';

import { NewEventPage } from '../pages/NewEventPage.jsx';
import { OnsiteAccessPage } from '../pages/OnsiteAccessPage.jsx';
import { EvaluationAccessPage } from '../pages/EvaluationAccessPage.jsx';

import { AdminMacrocasePreviewPage } from '../pages/AdminMacrocasePreviewPage.jsx';

import { RequireAuth } from './RequireAuth.jsx';
import { RequireRole } from './RequireRole.jsx';

import { ROLES } from '../utils/constants.js';

/**
 * Top-level router.
 *
 * Public routes:
 * Landing, authentication and subscription plans.
 *
 * Protected routes:
 * Dashboard and role-specific areas.
 */
export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/planes" element={<PlanSelectionPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Public access routes */}
        <Route
          path="/evaluation/access"
          element={<EvaluationAccessPage />}
        />
        <Route
          path="/presencial"
          element={<OnsiteAccessPage />}
        />

        {/* Authenticated routes */}
        <Route element={<RequireAuth />}>

          <Route
            path="/dashboard"
            element={<DashboardPage />}
          />

          {/* Admin */}
          <Route element={<RequireRole allowedRoles={[ROLES.ADMIN]} />}>
            <Route
              path="/admin-dashboard"
              element={<AdminDashboardPage />}
            />

            {/* Resultados: a process with its anonymous participants, their answers and the PDF of each phase. */}
            <Route element={<RequirePermission permissions={RESULTS_PERMISSIONS} />}>
            <Route
              path="/admin/processes/:eventId"
              element={<AdminProcessDetailPage />}
            />
            <Route
              path="/admin/processes/:eventId/participants/:anonymousId"
              element={<AdminParticipantReviewPage />}
            />
            </Route>

            <Route element={<RequirePermission permissions={['macrocases.manage']} />}>
            <Route
              path="/admin/macrocases/:macrocaseId/preview"
              element={<AdminMacrocasePreviewPage />}
            />
            </Route>
          </Route>

          {/* Candidate */}
          <Route element={<RequireRole allowedRoles={[ROLES.CANDIDATE]} />}>
            <Route
              path="/candidate-dashboard"
              element={<CandidateDashboardPage />}
            />
          </Route>

          {/* Company */}
          <Route element={<RequireRole allowedRoles={[ROLES.COMPANY]} />}>

            <Route
              path="/company/events/new"
              element={<NewEventPage />}
            />

            {/* Event with nested tabs */}
            <Route
              path="/company/events/:eventId"
              element={<EventLayout />}
            >
              <Route
                index
                element={<EventSummaryTab />}
              />

              <Route
                path="candidatos"
                element={<EventCandidatesTab />}
              />

              <Route
                path="presencial"
                element={<EventOnsiteTab />}
              />

              <Route
                path="resultados"
                element={<EventResultsTab />}
              />

              {/* Former applicator URL redirects to the Apply stage */}
              <Route
                path="onsite"
                element={
                  <Navigate
                    to="../presencial?etapa=aplicar"
                    replace
                  />
                }
              />
            </Route>

            <Route
              path="/company-dashboard"
              element={<CompanyDashboardPage />}
            />

          </Route>
        </Route>

      </Routes>
    </BrowserRouter>
  );
}


