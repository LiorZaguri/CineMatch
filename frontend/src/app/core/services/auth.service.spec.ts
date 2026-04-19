import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function configureTestingModule(): void {
    TestBed.configureTestingModule({
      providers: [AuthService, provideHttpClient(), provideHttpClientTesting()],
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

  it('should update currentUser and localStorage after a profile update', () => {
    configureTestingModule();

    service.updateProfile({ displayName: 'Updated User' }).subscribe();

    const req = httpMock.expectOne('/CineMatch/auth/me');
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

    const req = httpMock.expectOne('/CineMatch/auth/me/onboarding-status');
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

    const req = httpMock.expectOne('/CineMatch/auth/change-password');
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

    const req = httpMock.expectOne('/CineMatch/auth/me');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ password: 'Password123!' });

    req.flush(null);

    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(localStorage.getItem('cm_access_token')).toBeNull();
    expect(localStorage.getItem('cm_user')).toBeNull();
  });
});
