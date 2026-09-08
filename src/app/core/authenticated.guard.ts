import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SiteSessionService } from './site-session.service';

export const authenticatedGuard: CanActivateFn = () => {
  const session = inject(SiteSessionService);
  return session.session() ? true : inject(Router).createUrlTree(['/login']);
};
