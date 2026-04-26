import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerMock: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    service.logout();
    localStorage.clear();
    vi.useRealTimers();
  });

  function configureTestingModule(): void {
    routerMock = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerMock },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  function createTokenWithFutureExp(): string {
    const payload = btoa(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    return `header.${payload}.signature`;
  }

  function createTokenWithExp(exp: number): string {
    const payload = btoa(JSON.stringify({ exp }));
    return `header.${payload}.signature`;
  }

  it('should update currentUser and localStorage after a profile update', () => {
    configureTestingModule();

    service.updateProfile({ displayName: 'Updated User' }).subscribe();

    const req = httpMock.expectOne('/api/auth/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'Updated User' });

    req.flush({
      user: {
        id: 'user-1',
        email: 'user@mail.com',
        displayName: 'Updated User',
        avatarUrl: null,
        onboardingStatus: 'pending',
      },
    });

    expect(service.currentUser()).toEqual({
      id: 'user-1',
      email: 'user@mail.com',
      displayName: 'Updated User',
      avatarUrl: null,
      onboardingStatus: 'pending',
    });
    expect(JSON.parse(localStorage.getItem('cm_user') ?? '{}')).toEqual({
      id: 'user-1',
      email: 'user@mail.com',
      displayName: 'Updated User',
      avatarUrl: null,
      onboardingStatus: 'pending',
    });
  });

  it('should update currentUser and localStorage after onboarding status changes', () => {
    configureTestingModule();

    service.updateOnboardingStatus('completed').subscribe();

    const req = httpMock.expectOne('/api/auth/me/onboarding-status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ onboardingStatus: 'completed' });

    req.flush({
      user: {
        id: 'user-1',
        email: 'user@mail.com',
        displayName: 'Updated User',
        avatarUrl: null,
        onboardingStatus: 'completed',
      },
    });

    expect(service.currentUser()).toEqual({
      id: 'user-1',
      email: 'user@mail.com',
      displayName: 'Updated User',
      avatarUrl: null,
      onboardingStatus: 'completed',
    });
    expect(JSON.parse(localStorage.getItem('cm_user') ?? '{}')).toEqual({
      id: 'user-1',
      email: 'user@mail.com',
      displayName: 'Updated User',
      avatarUrl: null,
      onboardingStatus: 'completed',
    });
  });

  it('should post the old and new passwords to the change-password endpoint', () => {
    configureTestingModule();

    service
      .changePassword({ oldPassword: 'OldPassword123!', newPassword: 'NewPassword123!' })
      .subscribe();

    const req = httpMock.expectOne('/api/auth/change-password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      oldPassword: 'OldPassword123!',
      newPassword: 'NewPassword123!',
    });

    req.flush(null);
  });

  it('should clear auth state after deleting the account', () => {
    localStorage.setItem('cm_access_token', createTokenWithFutureExp());
    localStorage.setItem(
      'cm_user',
      JSON.stringify({
        id: 'user-1',
        email: 'user@mail.com',
        displayName: 'Delete Me',
        avatarUrl: null,
        onboardingStatus: 'pending',
      }),
    );

    configureTestingModule();

    expect(service.isAuthenticated()).toBe(true);

    service.deleteAccount({ password: 'Password123!' }).subscribe();

    const req = httpMock.expectOne('/api/auth/me');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ password: 'Password123!' });

    req.flush(null);

    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(localStorage.getItem('cm_access_token')).toBeNull();
    expect(localStorage.getItem('cm_user')).toBeNull();
  });

  it('should automatically expire the session and redirect when the token reaches its expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));

    localStorage.setItem('cm_access_token', createTokenWithExp(Math.floor(Date.now() / 1000) + 10));
    localStorage.setItem(
      'cm_user',
      JSON.stringify({
        id: 'user-1',
        email: 'user@mail.com',
        displayName: 'Expiring User',
        avatarUrl: null,
        onboardingStatus: 'pending',
      }),
    );

    configureTestingModule();

    expect(service.isAuthenticated()).toBe(true);

    vi.advanceTimersByTime(5001);

    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(localStorage.getItem('cm_access_token')).toBeNull();
    expect(localStorage.getItem('cm_user')).toBeNull();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'session-expired' },
    });
  });
});
