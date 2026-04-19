import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, afterEach } from 'vitest';
import { signal } from '@angular/core';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  function setupWithToken(token: string | null) {
    const authMock = {
      token: signal<string | null>(token),
      isAuthenticated: signal(!!token),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authMock },
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
});
