import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { Movie } from '../../core/models/movie.models';
import {
  UpdateUserPreferenceRequest,
  UserPreferenceDiscoveryMode,
  UserPreferenceEra,
  UserPreferenceGenre,
  UserPreferenceLanguage,
  UserPreferenceProfile,
  UserPreferenceRuntime,
} from '../../core/models/user-preference.models';
import { MovieService } from '../../core/services/movie.service';
import { UserPreferenceService } from '../../core/services/user-preference.service';
import { MovieSeedCardComponent } from '../onboarding/components/movie-seed-card/movie-seed-card.component';
import { OnboardingMovieCard } from '../onboarding/movie-card.models';

interface Option<T extends string = string> {
  label: string;
  value: T;
  caption?: string;
}

type FeedbackState = {
  type: 'success' | 'error';
  message: string;
};

const GENRE_OPTIONS: Option<UserPreferenceGenre>[] = [
  { label: 'Thriller', value: 'Thriller' },
  { label: 'Drama', value: 'Drama' },
  { label: 'Sci-fi', value: 'Sci-fi' },
  { label: 'Crime', value: 'Crime' },
  { label: 'Mystery', value: 'Mystery' },
  { label: 'Comedy', value: 'Comedy' },
  { label: 'Romance', value: 'Romance' },
  { label: 'Horror', value: 'Horror' },
  { label: 'Animation', value: 'Animation' },
  { label: 'Fantasy', value: 'Fantasy' },
  { label: 'Documentary', value: 'Documentary' },
  { label: 'Action', value: 'Action' },
];

const MOOD_OPTIONS: Option[] = [
  { label: 'Dark & tense', value: 'Dark & tense' },
  { label: 'Mind-bending', value: 'Mind-bending' },
  { label: 'Emotionally heavy', value: 'Emotionally heavy' },
  { label: 'Visually stunning', value: 'Visually stunning' },
  { label: 'Fun & easy', value: 'Fun & easy' },
  { label: 'Fast-paced', value: 'Fast-paced' },
];

const DISCOVERY_OPTIONS: Option<UserPreferenceDiscoveryMode>[] = [
  {
    label: 'Mainstream confidence',
    value: 'mainstream confident',
    caption: 'Safer, higher-consensus recommendations.',
  },
  {
    label: 'Hidden gems',
    value: 'hidden gems',
    caption: 'Less obvious picks with more discovery.',
  },
  { label: 'Best mix', value: 'best mix', caption: 'Balance reliable picks with surprises.' },
];

const LANGUAGE_OPTIONS: Option<UserPreferenceLanguage>[] = [
  { label: 'English', value: 'English' },
  { label: 'Korean', value: 'Korean' },
  { label: 'Japanese', value: 'Japanese' },
  { label: 'French', value: 'French' },
  { label: 'Spanish', value: 'Spanish' },
  { label: 'Open to anything', value: 'Open to anything' },
];

const RUNTIME_OPTIONS: Option<UserPreferenceRuntime>[] = [
  { label: 'Under 100 min', value: '100', caption: 'Tight and efficient.' },
  { label: '100-140 min', value: '100-140', caption: 'Balanced feature length.' },
  { label: '140+ min', value: '140+', caption: 'Epic scale is fine.' },
  { label: 'No preference', value: 'No preference', caption: 'Runtime is not a factor.' },
];

const ERA_OPTIONS: Option<UserPreferenceEra>[] = [
  { label: '1970s', value: '1970' },
  { label: '1980s', value: '1980' },
  { label: '1990s', value: '1990' },
  { label: '2000s', value: '2000' },
  { label: '2010s', value: '2010' },
  { label: '2020s', value: '2020' },
];

@Component({
  selector: 'app-preferences',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MovieSeedCardComponent],
  templateUrl: './preferences.component.html',
  styleUrl: './preferences.component.css',
})
export class PreferencesComponent implements OnInit, OnDestroy {
  private readonly preferences = inject(UserPreferenceService);
  private readonly movieService = inject(MovieService);
  private searchSubscription: Subscription | null = null;
  private hydrateSubscription: Subscription | null = null;

  readonly genreOptions = GENRE_OPTIONS;
  readonly moodOptions = MOOD_OPTIONS;
  readonly discoveryOptions = DISCOVERY_OPTIONS;
  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly runtimeOptions = RUNTIME_OPTIONS;
  readonly eraOptions = ERA_OPTIONS;

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isSearching = signal(false);
  readonly feedback = signal<FeedbackState | null>(null);
  readonly searchQuery = signal('');
  readonly searchResults = signal<OnboardingMovieCard[]>([]);
  readonly selectedMovies = signal<Record<number, OnboardingMovieCard>>({});

  readonly selectedMovieIds = signal<number[]>([]);
  readonly likedGenres = signal<UserPreferenceGenre[]>([]);
  readonly dislikedGenres = signal<UserPreferenceGenre[]>([]);
  readonly moods = signal<string[]>([]);
  readonly discoveryMode = signal<UserPreferenceDiscoveryMode>('best mix');
  readonly languages = signal<UserPreferenceLanguage[]>([]);
  readonly runtime = signal<UserPreferenceRuntime | null>(null);
  readonly eras = signal<UserPreferenceEra[]>([]);

  ngOnInit(): void {
    this.loadPreferences();
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    this.hydrateSubscription?.unsubscribe();
  }

  loadPreferences(): void {
    this.isLoading.set(true);
    this.feedback.set(null);

    this.preferences
      .getMyPreferences()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (profile) => this.applyProfile(profile),
        error: () => {
          this.feedback.set({
            type: 'error',
            message: 'Unable to load your taste profile right now.',
          });
        },
      });
  }

  setMovieSearch(value: string): void {
    this.searchQuery.set(value);
    const query = value.trim();

    this.searchSubscription?.unsubscribe();
    this.searchSubscription = null;

    if (query.length < 2) {
      this.searchResults.set([]);
      this.isSearching.set(false);
      return;
    }

    this.isSearching.set(true);
    this.searchSubscription = this.movieService.searchMovies(query).subscribe({
      next: (movies) => {
        if (this.searchQuery().trim() !== query) {
          return;
        }
        this.searchResults.set(movies.slice(0, 5).map((movie) => this.toMovieCard(movie)));
        this.isSearching.set(false);
      },
      error: () => {
        if (this.searchQuery().trim() !== query) {
          return;
        }
        this.searchResults.set([]);
        this.isSearching.set(false);
      },
    });
  }

  toggleMovie(movieId: number): void {
    if (this.selectedMovieIds().includes(movieId)) {
      this.removeMovie(movieId);
      return;
    }

    const movie = this.searchResults().find((result) => result.id === movieId);
    if (movie) {
      this.selectedMovies.update((movies) => ({ ...movies, [movie.id]: movie }));
    }
    this.selectedMovieIds.update((ids) => [...ids, movieId]);
  }

  removeMovie(movieId: number): void {
    this.selectedMovieIds.update((ids) => ids.filter((id) => id !== movieId));
  }

  isMovieSelected(movieId: number): boolean {
    return this.selectedMovieIds().includes(movieId);
  }

  toggleLikedGenre(value: UserPreferenceGenre): void {
    this.toggleArrayValue(this.likedGenres, value);
    if (this.dislikedGenres().includes(value)) {
      this.toggleArrayValue(this.dislikedGenres, value);
    }
  }

  toggleDislikedGenre(value: UserPreferenceGenre): void {
    this.toggleArrayValue(this.dislikedGenres, value);
    if (this.likedGenres().includes(value)) {
      this.toggleArrayValue(this.likedGenres, value);
    }
  }

  toggleMood(value: string): void {
    this.toggleArrayValue(this.moods, value);
  }

  toggleLanguage(value: UserPreferenceLanguage): void {
    if (value === 'Open to anything') {
      this.languages.set(this.languages().includes(value) ? [] : [value]);
      return;
    }

    this.languages.update((languages) => {
      const withoutOpen = languages.filter((language) => language !== 'Open to anything');
      return withoutOpen.includes(value)
        ? withoutOpen.filter((language) => language !== value)
        : [...withoutOpen, value];
    });
  }

  toggleEra(value: UserPreferenceEra): void {
    this.toggleArrayValue(this.eras, value);
  }

  savePreferences(): void {
    if (this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    this.feedback.set(null);

    this.preferences
      .updatePreferences(this.toUpdatePayload())
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (profile) => {
          this.applyProfile(profile, false);
          this.feedback.set({ type: 'success', message: 'Taste profile updated.' });
        },
        error: () => {
          this.feedback.set({
            type: 'error',
            message: 'Unable to save your preferences. Please check the selections and try again.',
          });
        },
      });
  }

  getSelectedMovieCards(): OnboardingMovieCard[] {
    const cache = this.selectedMovies();
    return this.selectedMovieIds().map(
      (movieId) =>
        cache[movieId] ?? {
          id: movieId,
          title: `Movie #${movieId}`,
          summary: 'Saved to your taste profile.',
          posterUrl: null,
        },
    );
  }

  private applyProfile(profile: UserPreferenceProfile, hydrateMovies = true): void {
    const movieIds = profile.chosen_movies.map((movie) => movie.tmdb_id);
    this.selectedMovieIds.set(movieIds);
    this.likedGenres.set(profile.liked_genres.map((genre) => genre.name));
    this.dislikedGenres.set(profile.disliked_genres.map((genre) => genre.name));
    this.moods.set(profile.moods.map((mood) => mood.name));
    this.discoveryMode.set(profile.discovery_mode ?? 'best mix');
    this.languages.set(profile.languages ?? []);
    this.runtime.set(profile.runtime ?? null);
    this.eras.set(profile.eras ?? []);

    if (hydrateMovies) {
      this.hydrateSelectedMovies(movieIds);
    }
  }

  private hydrateSelectedMovies(movieIds: number[]): void {
    this.hydrateSubscription?.unsubscribe();

    if (movieIds.length === 0) {
      this.selectedMovies.set({});
      return;
    }

    this.hydrateSubscription = forkJoin(
      movieIds.map((movieId) =>
        this.movieService.getMovieByTmdbId(String(movieId)).pipe(catchError(() => of(null))),
      ),
    ).subscribe((movies) => {
      const cache: Record<number, OnboardingMovieCard> = {};
      for (const movie of movies) {
        if (movie) {
          cache[movie.id] = this.toMovieCard(movie);
        }
      }
      this.selectedMovies.set(cache);
    });
  }

  private toUpdatePayload(): UpdateUserPreferenceRequest {
    return {
      discovery_mode: this.discoveryMode(),
      languages: this.languages(),
      runtime: this.runtime(),
      eras: this.eras(),
      chosen_movies: this.selectedMovieIds().map((tmdbId) => ({ tmdb_id: tmdbId })),
      liked_genres: this.likedGenres().map((name) => ({ name })),
      disliked_genres: this.dislikedGenres().map((name) => ({ name })),
      moods: this.moods().map((name) => ({ name })),
    };
  }

  private toMovieCard(movie: Movie): OnboardingMovieCard {
    const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;
    return {
      id: movie.id,
      title: movie.title,
      year: year && Number.isFinite(year) ? year : null,
      rating: movie.rating ?? null,
      metadata: movie.genre[0] ?? null,
      summary: movie.description || 'No synopsis available yet.',
      posterUrl: movie.posterUrl || null,
    };
  }

  private toggleArrayValue<T>(
    target: { update: (fn: (values: T[]) => T[]) => void },
    value: T,
  ): void {
    target.update((values) =>
      values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
    );
  }
}
