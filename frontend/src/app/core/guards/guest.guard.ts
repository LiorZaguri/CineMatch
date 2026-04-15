import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OnboardingService } from '../services/onboarding.service';

/**
 * Prevents authenticated users from accessing "guest" routes (e.g., login, register).
 * Redirects them into the onboarding or post-onboarding flow instead.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const onboarding = inject(OnboardingService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return true;
  }

  const draft = onboarding.refreshForCurrentUser();
  return router.createUrlTree([draft.status === 'pending' ? '/onboarding' : '/movies']);
};
