// ── API DTOs ──────────────────────────────────────────────────────────────────
// These represent the exact shapes sent/received over the wire.
// Components should never use these directly — use AuthUser instead.

export type AuthOnboardingStatus = 'pending' | 'completed' | 'skipped';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  avatarUrl?: string | null;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface UpdateOnboardingStatusRequest {
  onboardingStatus: AuthOnboardingStatus;
}

export interface DeleteAccountRequest {
  password: string;
}

/** Raw API response shape – adapter in AuthService maps this to AuthUser */
export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    onboardingStatus: AuthOnboardingStatus;
  };
}

export interface UpdateProfileResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    onboardingStatus: AuthOnboardingStatus;
  };
}

// ── Internal Domain Model ─────────────────────────────────────────────────────
// Decoupled from the raw API shape; components consume this.

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  onboardingStatus: AuthOnboardingStatus;
}

export interface AvatarUploadResponse {
  uploadUrl: string;
  fileKey: string;
  publicUrl: string;
}
