export type OnboardingStatus = 'pending' | 'completed' | 'skipped';

export type DiscoveryMode = 'mainstream' | 'hidden_gems' | 'mix';

export interface OnboardingDraft {
  selectedMovieIds: number[];
  favoriteGenres: string[];
  avoidedGenres: string[];
  moodTags: string[];
  preferredLanguages: string[];
  runtimePreset: string | null;
  eraPreferences: string[];
  discoveryMode: DiscoveryMode | null;
  status: OnboardingStatus;
  updatedAt: string | null;
}
