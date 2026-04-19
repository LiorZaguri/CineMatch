import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { signal } from '@angular/core';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal AuthService mock — TestBed is reconfigured per describe block */
function createAuthServiceMock(authenticated: boolean) {
  return {
    isAuthenticated: signal(authenticated),
    token: signal<string | null>(authenticated ? 'mock-token' : null),
  };
}

/** Calls the functional guard inside Angular's injection context */
function runGuard() {
  return TestBed.runInInjectionContext(() =>
    authGuard(
      {} as never, // ActivatedRouteSnapshot — unused by this guard
      {} as never, // RouterStateSnapshot — unused by this guard
    ),
  );
}

// ── Tests: authenticated user ─────────────────────────────────────────────────

describe('authGuard – authenticated user', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: createAuthServiceMock(true) },
        {
          provide: Router,
          useValue: { createUrlTree: (c: string[]) => c as unknown as UrlTree },
        },
      ],
    });
  });

  it('should return true when the user is authenticated', () => {
    const result = runGuard();
    expect(result).toBe(true);
  });
});

// ── Tests: unauthenticated user ───────────────────────────────────────────────

describe('authGuard – unauthenticated user', () => {
  let capturedRedirect: string[] | null;

  beforeEach(() => {
    capturedRedirect = null;

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: createAuthServiceMock(false) },
        {
          provide: Router,
          useValue: {
            createUrlTree: (commands: string[]) => {
              capturedRedirect = commands;
              return commands as unknown as UrlTree;
            },
          },
        },
      ],
    });
  });

  it('should NOT return true when the user is unauthenticated', () => {
    const result = runGuard();
    expect(result).not.toBe(true);
  });

  it('should redirect to /login specifically', () => {
    runGuard();
    expect(capturedRedirect).toEqual(['/login']);
  });
});
