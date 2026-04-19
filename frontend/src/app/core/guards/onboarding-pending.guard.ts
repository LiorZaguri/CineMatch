import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const onboardingPendingGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if ((auth.currentUser()?.onboardingStatus ?? 'pending') === 'pending') {
    return true;
  }

  return router.createUrlTree(['/movies']);
};
