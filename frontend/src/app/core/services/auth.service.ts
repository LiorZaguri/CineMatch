import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, map, switchMap, throwError, timeout } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type {
  AuthResponse,
  AuthOnboardingStatus,
  AuthUser,
  AvatarUploadResponse,
  ChangePasswordRequest,
  DeleteAccountRequest,
  LoginRequest,
  RegisterRequest,
  UpdateOnboardingStatusRequest,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from '../models/auth.models';

const TOKEN_KEY = 'cm_access_token';
const API_BASE = `${environment.apiUrl}/auth`;
interface JwtPayload {
  exp?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  // ── State ──────────────────────────────────────────────────────────────────
  private readonly _token = signal<string | null>(this.loadValidToken());
  private readonly _user = signal<AuthUser | null>(this.loadUser());

  /** Read-only token for the interceptor */
  readonly token = this._token.asReadonly();

  /** Derived boolean — components and guard use this */
  readonly isAuthenticated = computed(() => !!this._token());

  readonly currentUser = this._user.asReadonly();

  // ── Auth Actions ───────────────────────────────────────────────────────────

  login(req: LoginRequest) {
    return this.http.post<AuthResponse>(`${API_BASE}/login`, req).pipe(
      timeout(8000),
      tap((res) => this.validateAuthResponse(res)),
      tap((res) => this.handleAuthResponse(res)),
      catchError((err) => this.toAuthError(err, 'Login failed. Please try again.')),
    );
  }

  register(req: RegisterRequest) {
    return this.http.post<AuthResponse>(`${API_BASE}/register`, req).pipe(
      timeout(8000),
      tap((res) => this.validateAuthResponse(res)),
      tap((res) => this.handleAuthResponse(res)),
      catchError((err) => this.toAuthError(err, 'Registration failed. Please try again.')),
    );
  }

  updateProfile(req: UpdateProfileRequest) {
    return this.http
      .patch<UpdateProfileResponse>(`${API_BASE}/me`, req)
      .pipe(tap((res) => this.persistUser(this.toAuthUser(res.user))));
  }

  updateOnboardingStatus(onboardingStatus: AuthOnboardingStatus) {
    const req: UpdateOnboardingStatusRequest = { onboardingStatus };
    return this.http
      .patch<UpdateProfileResponse>(`${API_BASE}/me/onboarding-status`, req)
      .pipe(tap((res) => this.persistUser(this.toAuthUser(res.user))));
  }

  getAvatarUploadUrl(contentType: string) {
    return this.http
      .get<AvatarUploadResponse>(`${API_BASE}/me/avatar/upload-url`, {
        params: {
          contentType,
        },
      })
      .pipe(timeout(8000));
  }

  confirmAvatarUpload(fileKey: string) {
    return this.http
      .post<UpdateProfileResponse>(`${API_BASE}/me/avatar/confirm`, { fileKey })
      .pipe(tap((res) => this.persistUser(this.toAuthUser(res.user))));
  }

  uploadAvatar(file: File) {
    const contentType = file.type || 'image/jpeg';

    return this.getAvatarUploadUrl(contentType).pipe(
      switchMap((upload) =>
        this.http
          .put(upload.uploadUrl, file, {
            headers: new HttpHeaders({ 'Content-Type': contentType }),
            observe: 'response',
          })
          .pipe(map(() => upload.fileKey)),
      ),
      switchMap((fileKey) => this.confirmAvatarUpload(fileKey)),
    );
  }

  changePassword(req: ChangePasswordRequest) {
    return this.http.post<void>(`${API_BASE}/change-password`, req);
  }

  deleteAccount(req: DeleteAccountRequest) {
    return this.http.delete<void>(`${API_BASE}/me`, { body: req }).pipe(tap(() => this.logout()));
  }

  logout(): void {
    this._token.set(null);
    this._user.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('cm_user');
  }

  private loadUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem('cm_user');
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<AuthUser>;
      if (!parsed.id || !parsed.email || !parsed.displayName) {
        return null;
      }

      return {
        id: parsed.id,
        email: parsed.email,
        displayName: parsed.displayName,
        avatarUrl: parsed.avatarUrl ?? null,
        onboardingStatus: parsed.onboardingStatus ?? 'pending',
      };
    } catch {
      return null;
    }
  }

  private loadValidToken(): string | null {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      return null;
    }

    if (this.isTokenExpired(token)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('cm_user');
      return null;
    }

    return token;
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /** Adapter: maps raw API response → internal domain model */
  private handleAuthResponse(res: AuthResponse): void {
    this._token.set(res.accessToken);
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    this.persistUser(this.toAuthUser(res.user));
  }

  private persistUser(user: AuthUser): void {
    this._user.set(user);
    localStorage.setItem('cm_user', JSON.stringify(user));
  }

  private validateAuthResponse(res: AuthResponse): void {
    if (!res?.accessToken || !res?.user?.id || !res?.user?.email || !res?.user?.displayName) {
      throw new Error('Invalid authentication response.');
    }
  }

  private toAuthError(err: unknown, fallbackMessage: string) {
    const error = err as { error?: { message?: string } } | Error;
    const message =
      (error as { error?: { message?: string } })?.error?.message ??
      (error as Error)?.message ??
      fallbackMessage;
    return throwError(() => new Error(message));
  }

  private toAuthUser(user: AuthResponse['user']): AuthUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      onboardingStatus: user.onboardingStatus,
    };
  }

  private isTokenExpired(token: string): boolean {
    try {
      const payload = this.decodeJwtPayload(token);
      if (!payload.exp) {
        return false;
      }

      const now = Math.floor(Date.now() / 1000);
      return payload.exp <= now;
    } catch {
      return true;
    }
  }

  private decodeJwtPayload(token: string): JwtPayload {
    const [, payload] = token.split('.');
    if (!payload) {
      throw new Error('Invalid JWT');
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as JwtPayload;
  }
}
