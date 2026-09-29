import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SiteSessionService } from './site-session.service';

export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SiteSessionService);
  const router = inject(Router);
  const accessToken = session.session()?.accessToken;
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        accessToken &&
        request.headers.get('Authorization') === `Bearer ${accessToken}` &&
        session.session()?.accessToken === accessToken
      ) {
        session.clear();
        void router.navigate(['/login'], { queryParams: { reason: 'expired' } });
      }
      return throwError(() => error);
    }),
  );
};
