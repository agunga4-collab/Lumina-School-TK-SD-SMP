import type { User, UnitType } from '../types';

/**
 * Returns the correct home/dashboard route for a logged-in user based on their profile and active unit.
 */
export function getDashboardRoute(profile: User | null, activeUnit: UnitType | null): string {
  if (!profile) return '/login';

  // If pending or disabled, let standard route guards handle it (via AuthGuard / LoginPage redirects)
  if (profile.status === 'pending') return '/pending';

  // Junior High student goes to student dashboard
  if (profile.role === 'STUDENT' && activeUnit === 'JUNIOR_HIGH') {
    return '/student/dashboard';
  }

  // Fallback / standard landing route
  return '/';
}
