import { inject } from '@angular/core';
import { type HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
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

  return next(authenticatedReq);
};
