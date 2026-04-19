import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Prevents authenticated users from accessing "guest" routes (e.g., login, register).
 * Redirects them into the onboarding or post-onboarding flow instead.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree([
    (auth.currentUser()?.onboardingStatus ?? 'pending') === 'pending' ? '/onboarding' : '/movies',
  ]);
};
