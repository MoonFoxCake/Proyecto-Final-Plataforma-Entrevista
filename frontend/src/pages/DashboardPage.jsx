import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROLES } from '../utils/constants.js';

/**
 * Sends an authenticated user to the dashboard that matches their Firebase
 * custom-claim role.
 */
export function DashboardPage() {
  const { role } = useAuth();

  const dashboardByRole = {
    [ROLES.ADMIN]: '/admin-dashboard',
    [ROLES.CLIENT]: '/company-dashboard',
    [ROLES.CANDIDATE]: '/candidate-dashboard',
  };

  return <Navigate to={dashboardByRole[role] || '/login'} replace />;
}
