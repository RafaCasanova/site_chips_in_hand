import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SiteSessionService } from './site-session.service';

export const authenticatedGuard: CanActivateFn = () => {
  const session = inject(SiteSessionService);
  const router = inject(Router);
  return session.ensureValidated().then((authenticated) => {
    if (!authenticated)
      return router.createUrlTree(['/login'], {
        queryParams: session.status() === 'unavailable' ? { reason: 'session-check' } : {},
      });
    if (!session.hasCompanies())
      return router.createUrlTree(['/register'], { queryParams: { clinic: 'required' } });
    return true;
  });
};
