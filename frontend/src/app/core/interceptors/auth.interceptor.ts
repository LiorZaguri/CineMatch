import { inject } from '@angular/core';
import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const url = req.url.toLowerCase();
  const isPresignedUpload = url.includes('x-amz-algorithm=') || url.includes('x-amz-signature=');

  if (!token || isPresignedUpload) {
    return next(req);
  }

  const authenticatedReq = req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });

  return next(authenticatedReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        auth.logout();
        void router.navigate(['/login'], { queryParams: { reason: 'session-expired' } });
      }

      return throwError(() => err);
    }),
  );
};
