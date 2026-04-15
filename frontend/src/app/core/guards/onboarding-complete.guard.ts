import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OnboardingService } from '../services/onboarding.service';

export const onboardingCompleteGuard: CanActivateFn = () => {
  const onboarding = inject(OnboardingService);
  const router = inject(Router);

  onboarding.refreshForCurrentUser();

  if (onboarding.hasFinished()) {
    return true;
  }

  return router.createUrlTree(['/onboarding']);
};
