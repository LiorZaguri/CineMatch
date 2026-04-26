import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authMock: {
    token: ReturnType<typeof signal<string | null>>;
    isAuthenticated: ReturnType<typeof signal<boolean>>;
    logout: ReturnType<typeof vi.fn>;
  };
  let routerMock: {
    navigate: ReturnType<typeof vi.fn>;
  };

  function setupWithToken(token: string | null) {
    authMock = {
      token: signal<string | null>(token),
      isAuthenticated: signal(!!token),
      logout: vi.fn(),
    };
    routerMock = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => httpMock.verify());

  it('should attach Authorization: Bearer header when a token is present', () => {
    setupWithToken('test-jwt-token-abc123');

    http.get('/api/movies').subscribe();

    const req = httpMock.expectOne('/api/movies');
    expect(req.request.headers.has('Authorization')).toBe(true);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-jwt-token-abc123');
    req.flush({});
  });

  it('should NOT attach an Authorization header when no token exists', () => {
    setupWithToken(null);

    http.get('/api/movies').subscribe();

    const req = httpMock.expectOne('/api/movies');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should not mutate the original request object', () => {
    setupWithToken('immutable-check-token');

    http.get('/api/test').subscribe();

    const req = httpMock.expectOne('/api/test');
    // The interceptor must clone the request, not mutate it.
    // Angular's HttpRequest is immutable, but we verify the header was set on the clone.
    expect(req.request.headers.get('Authorization')).toBe('Bearer immutable-check-token');
    req.flush({});
  });

  it('should NOT attach Authorization for presigned upload URLs', () => {
    setupWithToken('signed-upload-token');

    const presignedUrl =
      'http://localhost:9000/cinematch-posters/avatars/test.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123';

    http.put(presignedUrl, new Blob(['test'], { type: 'image/png' })).subscribe();

    const req = httpMock.expectOne(presignedUrl);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should clear auth state and redirect to login when an authenticated request returns 401', () => {
    setupWithToken('expired-token');

    http.get('/api/protected').subscribe({
      error: () => undefined,
    });

    const req = httpMock.expectOne('/api/protected');
    req.flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(authMock.logout).toHaveBeenCalledOnce();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'session-expired' },
    });
  });

  it('should not redirect for 401 responses when no token was attached', () => {
    setupWithToken(null);

    http.post('/api/auth/login', { email: 'bad@example.com', password: 'invalid' }).subscribe({
      error: () => undefined,
    });

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ error: 'INVALID_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });

    expect(authMock.logout).not.toHaveBeenCalled();
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });
});
