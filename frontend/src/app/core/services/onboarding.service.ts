import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { DiscoveryMode, OnboardingDraft } from '../models/onboarding.models';

const STORAGE_KEY_PREFIX = 'cm_onboarding_draft';

function createEmptyDraft(): OnboardingDraft {
  return {
    selectedMovieIds: [],
    favoriteGenres: [],
    avoidedGenres: [],
    moodTags: [],
    preferredLanguages: [],
    runtimePreset: null,
    eraPreferences: [],
    discoveryMode: null,
    status: 'pending',
    updatedAt: null,
  };
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly auth = inject(AuthService);
  private readonly _draft = signal<OnboardingDraft>(createEmptyDraft());

  readonly draft = this._draft.asReadonly();
  readonly hasFinished = computed(() => this._draft().status !== 'pending');
  readonly isCompleted = computed(() => this._draft().status === 'completed');
  readonly isSkipped = computed(() => this._draft().status === 'skipped');

  constructor() {
    effect(
      () => {
        const userId = this.auth.currentUser()?.id ?? null;
        this._draft.set(this.loadDraft(userId));
      },
      { allowSignalWrites: true },
    );
  }

  refreshForCurrentUser(): OnboardingDraft {
    const userId = this.auth.currentUser()?.id ?? null;
    const draft = this.loadDraft(userId);
    this._draft.set(draft);
    return draft;
  }

  toggleMovie(movieId: number): void {
    const draft = this._draft();
    const alreadySelected = draft.selectedMovieIds.includes(movieId);
    const selectedMovieIds = alreadySelected
      ? draft.selectedMovieIds.filter((id) => id !== movieId)
      : [...draft.selectedMovieIds, movieId];

    this.saveDraft({
      ...draft,
      selectedMovieIds,
      status: 'pending',
    });
  }

  toggleFavoriteGenre(genre: string): void {
    this.toggleValue('favoriteGenres', genre);
  }

  toggleAvoidedGenre(genre: string): void {
    this.toggleValue('avoidedGenres', genre);
  }

  toggleMoodTag(tag: string): void {
    this.toggleValue('moodTags', tag);
  }

  toggleLanguage(language: string): void {
    this.toggleValue('preferredLanguages', language);
  }

  toggleEraPreference(era: string): void {
    this.toggleValue('eraPreferences', era);
  }

  setRuntimePreset(runtimePreset: string | null): void {
    this.saveDraft({
      ...this._draft(),
      runtimePreset,
      status: 'pending',
    });
  }

  setDiscoveryMode(discoveryMode: DiscoveryMode): void {
    this.saveDraft({
      ...this._draft(),
      discoveryMode,
      status: 'pending',
    });
  }

  complete(): void {
    this.saveDraft({
      ...this._draft(),
      status: 'completed',
    });
  }

  skip(): void {
    this.saveDraft({
      ...this._draft(),
      status: 'skipped',
    });
  }

  reset(): void {
    this.saveDraft(createEmptyDraft());
  }

  private toggleValue(
    field:
      | 'favoriteGenres'
      | 'avoidedGenres'
      | 'moodTags'
      | 'preferredLanguages'
      | 'eraPreferences',
    value: string,
  ): void {
    const draft = this._draft();
    const collection = draft[field];
    const nextCollection = collection.includes(value)
      ? collection.filter((item) => item !== value)
      : [...collection, value];

    this.saveDraft({
      ...draft,
      [field]: nextCollection,
      status: 'pending',
    });
  }

  private saveDraft(draft: OnboardingDraft): void {
    const hydratedDraft: OnboardingDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
    };
    this._draft.set(hydratedDraft);

    const key = this.getStorageKey(this.auth.currentUser()?.id ?? null);
    if (!key) {
      return;
    }

    localStorage.setItem(key, JSON.stringify(hydratedDraft));
  }

  private loadDraft(userId: string | null): OnboardingDraft {
    const key = this.getStorageKey(userId);
    if (!key) {
      return createEmptyDraft();
    }

    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return createEmptyDraft();
      }

      const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
      return {
        ...createEmptyDraft(),
        ...parsed,
        selectedMovieIds: Array.isArray(parsed.selectedMovieIds) ? parsed.selectedMovieIds : [],
        favoriteGenres: Array.isArray(parsed.favoriteGenres) ? parsed.favoriteGenres : [],
        avoidedGenres: Array.isArray(parsed.avoidedGenres) ? parsed.avoidedGenres : [],
        moodTags: Array.isArray(parsed.moodTags) ? parsed.moodTags : [],
        preferredLanguages: Array.isArray(parsed.preferredLanguages)
          ? parsed.preferredLanguages
          : [],
        eraPreferences: Array.isArray(parsed.eraPreferences) ? parsed.eraPreferences : [],
      };
    } catch {
      return createEmptyDraft();
    }
  }

  private getStorageKey(userId: string | null): string | null {
    return userId ? `${STORAGE_KEY_PREFIX}:${userId}` : null;
  }
}
