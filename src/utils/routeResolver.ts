import type { User, UnitType } from '../types';

/**
 * Returns the correct home/dashboard route for a logged-in user based on their profile and active unit.
 */
export function getDashboardRoute(profile: User | null, activeUnit: UnitType | null): string {
  if (!profile) return '/login';

  // If pending or disabled, let standard route guards handle it (via AuthGuard / LoginPage redirects)
  if (profile.status === 'pending') return '/pending';

  // Unit-scoped Secretary default routes
  if (profile.role === 'SECRETARY_KINDY') {
    return '/kindy/dashboard';
  }
  if (profile.role === 'SECRETARY_ELEM') {
    return '/elementary/dashboard';
  }
  if (profile.role === 'SECRETARY_JH') {
    return '/';
  }

  // Junior High, Kindergarten, and Elementary students go to student dashboard
  if (profile.role === 'STUDENT' && (activeUnit === 'JUNIOR_HIGH' || activeUnit === 'KINDERGARTEN' || activeUnit === 'ELEMENTARY')) {
    return '/student/dashboard';
  }

  // Kindergarten teacher/staff roles go to the Kindergarten dashboard
  const kindyTeacherRoles = ['TEACHER', 'HOMEROOM_TEACHER', 'kindergarten_subject_teacher', 'BK_MENTOR'];
  if (kindyTeacherRoles.includes(profile.role) && activeUnit === 'KINDERGARTEN') {
    return '/kindy/dashboard';
  }

  // Fallback / standard landing route
  return '/';
}
