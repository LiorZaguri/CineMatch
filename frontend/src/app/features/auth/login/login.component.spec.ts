import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';
import { provideHttpClient } from '@angular/common/http';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createAuthServiceMock() {
  return {
    token: signal<string | null>(null),
    isAuthenticated: signal(false),
    currentUser: signal(null),
    login: () => {
      throw new Error('Should not call login in these tests');
    },
    logout: () => undefined,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent, ReactiveFormsModule],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        { provide: AuthService, useValue: createAuthServiceMock() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should have the submit button disabled while isLoading() is true', async () => {
    // Set loading state to true
    (component.isLoading as ReturnType<typeof signal<boolean>>).set(true);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('#login-submit');
    expect(button.disabled).toBe(true);
  });

  it('should have the submit button enabled when isLoading() is false and form is valid-ish', async () => {
    // isLoading is false by default
    (component.isLoading as ReturnType<typeof signal<boolean>>).set(false);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('#login-submit');
    expect(button.disabled).toBe(false);
  });

  it('should display a spinner element when isLoading() is true', () => {
    (component.isLoading as ReturnType<typeof signal<boolean>>).set(true);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('#login-submit');
    expect(button.textContent).toContain('Signing in');
  });

  it('should NOT display a spinner when isLoading() is false', () => {
    (component.isLoading as ReturnType<typeof signal<boolean>>).set(false);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('#login-submit');
    expect(button.textContent).toContain('Sign In');
  });

  it('should show a session expired message when redirected after token expiration', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [LoginComponent, ReactiveFormsModule],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ reason: 'session-expired' }),
            },
          },
        },
        { provide: AuthService, useValue: createAuthServiceMock() },
      ],
    }).compileComponents();

    const expiredFixture = TestBed.createComponent(LoginComponent);
    expiredFixture.detectChanges();

    const banner: HTMLElement = expiredFixture.nativeElement.querySelector('.error-banner');
    expect(banner.textContent).toContain('Your session expired. Please sign in again.');
  });
});
