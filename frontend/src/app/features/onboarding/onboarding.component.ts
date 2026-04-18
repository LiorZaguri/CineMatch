import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DiscoveryMode } from '../../core/models/onboarding.models';
import { Movie } from '../../core/models/movie.models';
import {
  UpdateUserPreferenceRequest,
  UserPreferenceDiscoveryMode,
  UserPreferenceEra,
  UserPreferenceGenre,
  UserPreferenceLanguage,
  UserPreferenceRuntime,
} from '../../core/models/user-preference.models';
import { MovieService } from '../../core/services/movie.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { UserPreferenceService } from '../../core/services/user-preference.service';
import { OnboardingMovieCard } from './movie-card.models';

interface OptionPill {
  label: string;
  value: string;
  caption?: string;
}

interface StepMeta {
  label: string;
  title: string;
  description: string;
}

type MovieSort = 'popular' | 'recent' | 'az';

const SORT_OPTIONS: { label: string; value: MovieSort }[] = [
  { label: 'Popular', value: 'popular' },
  { label: 'Recent', value: 'recent' },
  { label: 'A–Z', value: 'az' },
];

const FAVORITE_GENRES: OptionPill[] = [
  { label: 'Thriller', value: 'thriller' },
  { label: 'Drama', value: 'drama' },
  { label: 'Sci-fi', value: 'sci-fi' },
  { label: 'Crime', value: 'crime' },
  { label: 'Mystery', value: 'mystery' },
  { label: 'Comedy', value: 'comedy' },
  { label: 'Romance', value: 'romance' },
  { label: 'Horror', value: 'horror' },
  { label: 'Animation', value: 'animation' },
  { label: 'Fantasy', value: 'fantasy' },
  { label: 'Documentary', value: 'documentary' },
  { label: 'Action', value: 'action' },
];

const MOOD_OPTIONS: OptionPill[] = [
  { label: 'Dark & tense', value: 'dark_and_tense', caption: 'Slow-burn pressure and dread.' },
  {
    label: 'Mind-bending',
    value: 'mind_bending',
    caption: 'Ambitious ideas and layered plotting.',
  },
  {
    label: 'Emotionally heavy',
    value: 'emotional',
    caption: 'Character-driven stories with weight.',
  },
  {
    label: 'Visually stunning',
    value: 'visual',
    caption: 'Movies that feel meticulously designed.',
  },
  { label: 'Fun & easy', value: 'light_and_fun', caption: 'Low friction, high enjoyment.' },
  { label: 'Fast-paced', value: 'fast_paced', caption: 'Momentum, tension, and propulsion.' },
];

const LANGUAGE_OPTIONS: OptionPill[] = [
  { label: 'English', value: 'en' },
  { label: 'Korean', value: 'ko' },
  { label: 'Japanese', value: 'ja' },
  { label: 'French', value: 'fr' },
  { label: 'Spanish', value: 'es' },
  { label: 'Open to anything', value: 'any' },
];

const ERA_OPTIONS: OptionPill[] = [
  { label: '1970s', value: '1970s' },
  { label: '1980s', value: '1980s' },
  { label: '1990s', value: '1990s' },
  { label: '2000s', value: '2000s' },
  { label: '2010s', value: '2010s' },
  { label: '2020s', value: '2020s' },
];

const RUNTIME_OPTIONS: OptionPill[] = [
  { label: 'Under 100 min', value: 'under_100', caption: 'Tight and efficient.' },
  { label: '100-140 min', value: '100_140', caption: 'Balanced feature length.' },
  { label: '140+ min', value: '140_plus', caption: 'Epic scale is fine.' },
  { label: 'No preference', value: 'any', caption: 'Runtime is not a factor.' },
];

const DISCOVERY_OPTIONS: { label: string; value: DiscoveryMode; caption: string }[] = [
  {
    label: 'Mainstream confidence',
    value: 'mainstream',
    caption: 'Safer, higher-consensus picks.',
  },
  { label: 'Hidden gems', value: 'hidden_gems', caption: 'Less obvious, more exploratory.' },
  { label: 'Best mix', value: 'mix', caption: 'Blend safe bets with discovery.' },
];

const STEP_META: StepMeta[] = [
  {
    label: 'Cold start',
    title: 'Pick at least five movies you love.',
    description: 'Start with strong favorites so the first recommendation pass has real signal.',
  },
  {
    label: 'Signal shaping',
    title: 'What should CineMatch lean into or avoid?',
    description: 'Pick the genres you want more of and anything you usually skip.',
  },
  {
    label: 'Session mood',
    title: 'How do you usually want movies to feel?',
    description: 'Pick the moods that match your instinctive viewing habits.',
  },
  {
    label: 'Defaults',
    title: 'Set your starting preferences.',
    description: 'These are soft preferences for the first recommendation pass.',
  },
];

const GENRE_TO_API: Record<string, UserPreferenceGenre> = {
  thriller: 'Thriller',
  drama: 'Drama',
  'sci-fi': 'Sci-fi',
  crime: 'Crime',
  mystery: 'Mystery',
  comedy: 'Comedy',
  romance: 'Romance',
  horror: 'Horror',
  animation: 'Animation',
  fantasy: 'Fantasy',
  documentary: 'Documentary',
  action: 'Action',
};

const LANGUAGE_TO_API: Record<string, UserPreferenceLanguage> = {
  en: 'English',
  ko: 'Korean',
  ja: 'Japanese',
  fr: 'French',
  es: 'Spanish',
  any: 'Open to anything',
};

const RUNTIME_TO_API: Record<string, UserPreferenceRuntime> = {
  under_100: '100',
  '100_140': '100-140',
  '140_plus': '140+',
  any: 'No preference',
};

const DISCOVERY_TO_API: Record<DiscoveryMode, UserPreferenceDiscoveryMode> = {
  mainstream: 'mainstream confident',
  hidden_gems: 'hidden gems',
  mix: 'best mix',
};

const MOOD_TO_API: Record<string, string> = MOOD_OPTIONS.reduce<Record<string, string>>(
  (lookup, mood) => ({ ...lookup, [mood.value]: mood.label }),
  {},
);

const ERA_TO_API: Record<string, UserPreferenceEra> = {
  '1970s': '1970',
  '1980s': '1980',
  '1990s': '1990',
  '2000s': '2000',
  '2010s': '2010',
  '2020s': '2020',
};

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.css',
})
export class OnboardingComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly movieService = inject(MovieService);
  protected readonly onboarding = inject(OnboardingService);
  private readonly userPreferences = inject(UserPreferenceService);
  private catalogSubscription: Subscription | null = null;
  private searchSubscription: Subscription | null = null;

  protected readonly currentStep = signal(0);
  protected readonly isSavingPreferences = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly movieSearch = signal('');
  protected readonly isMovieSearchLoading = signal(false);
  protected readonly activeSort = signal<MovieSort>('popular');
  protected readonly cursorX = signal(0);
  protected readonly cursorY = signal(0);
  protected readonly catalogMovieSeeds = signal<OnboardingMovieCard[]>([]);
  protected readonly apiMovieSeeds = signal<OnboardingMovieCard[]>([]);
  protected readonly selectedMovieCache = signal<Record<number, OnboardingMovieCard>>({});
  protected readonly steps = [
    'Choose favorites',
    'Shape your taste',
    'Define your mood',
    'Set your defaults',
  ] as const;
  protected readonly stepMeta = STEP_META;

  protected readonly draft = this.onboarding.draft;
  protected readonly favoriteGenres = FAVORITE_GENRES;
  protected readonly moodOptions = MOOD_OPTIONS;
  protected readonly languageOptions = LANGUAGE_OPTIONS;
  protected readonly eraOptions = ERA_OPTIONS;
  protected readonly runtimeOptions = RUNTIME_OPTIONS;
  protected readonly discoveryOptions = DISCOVERY_OPTIONS;
  protected readonly sortOptions = SORT_OPTIONS;

  protected readonly selectedMovieCount = computed(() => this.draft().selectedMovieIds.length);
  protected readonly selectionProgress = computed(() =>
    Math.min(100, (this.selectedMovieCount() / 5) * 100),
  );
  protected readonly selectionHint = computed(() => {
    const count = this.selectedMovieCount();
    if (count === 0) {
      return 'Pick at least 5 to continue';
    }
    if (count < 5) {
      return `${5 - count} more to go`;
    }
    return 'Great taste! You can pick more.';
  });
  protected readonly selectedMovieCards = computed(() => {
    const cache = this.selectedMovieCache();
    return this.draft().selectedMovieIds.map(
      (movieId) =>
        cache[movieId] ?? {
          id: movieId,
          title: `Movie #${movieId}`,
          summary: 'Selected from a previous search.',
          posterUrl: null,
        },
    );
  });
  protected readonly filteredMovieSeeds = computed(() => {
    const query = this.movieSearch().trim().toLowerCase();
    const filteredMovies = this.apiMovieSeeds().filter(
      (movie) => !query || `${movie.title} ${movie.year ?? ''}`.toLowerCase().includes(query),
    );

    return [...filteredMovies].sort((a, b) => {
      if (this.activeSort() === 'recent') {
        return (b.year ?? 0) - (a.year ?? 0);
      }
      if (this.activeSort() === 'az') {
        return a.title.localeCompare(b.title);
      }
      return (a.rank ?? 999) - (b.rank ?? 999);
    });
  });

  protected readonly canContinue = computed(() => {
    const step = this.currentStep();
    const draft = this.draft();

    if (step === 0) {
      return draft.selectedMovieIds.length >= 5;
    }
    if (step === 1) {
      return draft.favoriteGenres.length > 0;
    }
    if (step === 2) {
      return draft.moodTags.length > 0;
    }
    return true;
  });

  protected readonly activeStepMeta = computed(() => this.stepMeta[this.currentStep()]);

  ngOnInit(): void {
    this.catalogSubscription = this.movieService.getMovies().subscribe({
      next: (catalog) => {
        const movies = [
          ...catalog.dashboard.popular,
          ...catalog.dashboard.now_playing,
          ...catalog.dashboard.top_rated,
          ...catalog.dashboard.upcoming,
        ];
        const movieCards = this.toMovieCards(movies);
        this.catalogMovieSeeds.set(movieCards);
        this.apiMovieSeeds.set(movieCards);
        this.cacheMovies(movieCards);
      },
      error: () => {
        this.catalogMovieSeeds.set([]);
        this.apiMovieSeeds.set([]);
      },
    });
  }

  ngOnDestroy(): void {
    this.catalogSubscription?.unsubscribe();
    this.searchSubscription?.unsubscribe();
  }

  protected isMovieSelected(movieId: number): boolean {
    return this.draft().selectedMovieIds.includes(movieId);
  }

  protected hasSelection(
    field:
      | 'favoriteGenres'
      | 'avoidedGenres'
      | 'moodTags'
      | 'preferredLanguages'
      | 'eraPreferences',
    value: string,
  ): boolean {
    return this.draft()[field].includes(value);
  }

  protected setMovieSearch(value: string): void {
    this.movieSearch.set(value);
    const trimmedValue = value.trim();

    this.searchSubscription?.unsubscribe();
    this.searchSubscription = null;

    if (trimmedValue.length < 2) {
      this.isMovieSearchLoading.set(false);
      this.apiMovieSeeds.set(this.catalogMovieSeeds());
      return;
    }

    this.isMovieSearchLoading.set(true);
    this.searchSubscription = this.movieService.searchMovies(trimmedValue, 1, 48).subscribe({
      next: (movies) => {
        if (this.movieSearch().trim() !== trimmedValue) {
          return;
        }
        const movieCards = this.toMovieCards(movies, 48);
        this.apiMovieSeeds.set(movieCards);
        this.cacheMovies(movieCards);
        this.isMovieSearchLoading.set(false);
      },
      error: () => {
        if (this.movieSearch().trim() !== trimmedValue) {
          return;
        }
        this.isMovieSearchLoading.set(false);
      },
    });
  }

  protected setSort(value: MovieSort): void {
    this.activeSort.set(value);
  }

  protected moveCursor(event: MouseEvent): void {
    this.cursorX.set(event.clientX);
    this.cursorY.set(event.clientY);
  }

  protected toggleMovie(movieId: number): void {
    this.onboarding.toggleMovie(movieId);
  }

  protected removeSelectedMovie(movieId: number): void {
    if (this.isMovieSelected(movieId)) {
      this.onboarding.toggleMovie(movieId);
    }
  }

  protected toggleFavoriteGenre(value: string): void {
    this.onboarding.toggleFavoriteGenre(value);
  }

  protected toggleAvoidedGenre(value: string): void {
    this.onboarding.toggleAvoidedGenre(value);
  }

  protected toggleMood(value: string): void {
    this.onboarding.toggleMoodTag(value);
  }

  protected toggleLanguage(value: string): void {
    if (value === 'any') {
      const current = this.draft().preferredLanguages;
      if (current.length !== 1 || current[0] !== 'any') {
        current.forEach((language) => this.onboarding.toggleLanguage(language));
        this.onboarding.toggleLanguage('any');
      }
      return;
    }

    if (this.draft().preferredLanguages.includes('any')) {
      this.onboarding.toggleLanguage('any');
    }
    this.onboarding.toggleLanguage(value);
  }

  protected toggleEra(value: string): void {
    this.onboarding.toggleEraPreference(value);
  }

  protected selectRuntime(value: string): void {
    this.onboarding.setRuntimePreset(this.draft().runtimePreset === value ? null : value);
  }

  protected selectDiscoveryMode(value: DiscoveryMode): void {
    this.onboarding.setDiscoveryMode(value);
  }

  protected goToStep(stepIndex: number): void {
    if (stepIndex < 0 || stepIndex >= this.steps.length) {
      return;
    }

    this.currentStep.set(stepIndex);
    this.scrollToStepTop();
  }

  protected nextStep(): void {
    if (!this.canContinue()) {
      return;
    }

    if (this.currentStep() < this.steps.length - 1) {
      this.currentStep.update((step) => step + 1);
      this.scrollToStepTop();
    }
  }

  protected previousStep(): void {
    if (this.currentStep() > 0) {
      this.currentStep.update((step) => step - 1);
      this.scrollToStepTop();
    }
  }

  protected skipForNow(): void {
    this.persistPreferences('skipped');
  }

  protected finishSetup(): void {
    this.persistPreferences('completed');
  }

  private toMovieCards(movies: Movie[], maxResults = 24): OnboardingMovieCard[] {
    const seen = new Set<number>();
    return movies
      .filter((movie) => {
        if (seen.has(movie.id)) {
          return false;
        }
        seen.add(movie.id);
        return true;
      })
      .slice(0, maxResults)
      .map((movie, index) => this.toMovieCard(movie, index));
  }

  private toMovieCard(movie: Movie, index: number): OnboardingMovieCard {
    const genreTags = movie.genre.flatMap((genre) => this.toFilterGenres(genre));
    return {
      id: movie.id,
      title: movie.title,
      year: this.getReleaseYear(movie.releaseDate),
      rating: movie.rating,
      genre: movie.genre[0] ?? null,
      metadata: movie.genre[0] ?? null,
      summary: movie.description,
      posterUrl: movie.posterUrl || null,
      genres: [...new Set(genreTags)],
      bg: `bg-${String.fromCharCode(97 + (index % 9))}`,
      rank: index + 1,
    };
  }

  private getReleaseYear(releaseDate: string): number | null {
    const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
    return year && Number.isFinite(year) ? year : null;
  }

  private toFilterGenres(genre: string): string[] {
    const normalizedGenre = genre.toLowerCase();
    const tags = [normalizedGenre];

    if (['thriller', 'horror', 'crime', 'mystery'].includes(normalizedGenre)) {
      tags.push('dark');
    }
    if (['sci-fi', 'mystery'].includes(normalizedGenre)) {
      tags.push('mind-bending');
    }
    if (['drama', 'romance'].includes(normalizedGenre)) {
      tags.push('emotional');
    }
    if (normalizedGenre === 'comedy') {
      tags.push('funny');
    }

    return tags;
  }

  private cacheMovies(movies: OnboardingMovieCard[]): void {
    this.selectedMovieCache.update((cache) => {
      const nextCache = { ...cache };
      for (const movie of movies) {
        nextCache[movie.id] = movie;
      }
      return nextCache;
    });
  }

  private scrollToStepTop(): void {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    });
  }

  private persistPreferences(status: 'completed' | 'skipped'): void {
    if (this.isSavingPreferences()) {
      return;
    }

    this.isSavingPreferences.set(true);
    this.saveError.set(null);

    this.userPreferences.updatePreferences(this.toUserPreferencePayload()).subscribe({
      next: () => {
        if (status === 'completed') {
          this.onboarding.complete();
        } else {
          this.onboarding.skip();
        }
        this.isSavingPreferences.set(false);
        this.router.navigate(['/movies']);
      },
      error: () => {
        this.isSavingPreferences.set(false);
        this.saveError.set('Unable to save your preferences. Please try again.');
      },
    });
  }

  private toUserPreferencePayload(): UpdateUserPreferenceRequest {
    const draft = this.draft();
    return {
      discovery_mode: draft.discoveryMode ? DISCOVERY_TO_API[draft.discoveryMode] : 'best mix',
      languages: draft.preferredLanguages
        .map((language) => LANGUAGE_TO_API[language])
        .filter((language): language is UserPreferenceLanguage => Boolean(language)),
      runtime: draft.runtimePreset ? RUNTIME_TO_API[draft.runtimePreset] : null,
      eras: draft.eraPreferences
        .map((era) => ERA_TO_API[era])
        .filter((era): era is UserPreferenceEra => Boolean(era)),
      chosen_movies: draft.selectedMovieIds.map((tmdbId) => ({ tmdb_id: tmdbId })),
      liked_genres: draft.favoriteGenres
        .map((genre) => GENRE_TO_API[genre])
        .filter((genre): genre is UserPreferenceGenre => Boolean(genre))
        .map((name) => ({ name })),
      disliked_genres: draft.avoidedGenres
        .map((genre) => GENRE_TO_API[genre])
        .filter((genre): genre is UserPreferenceGenre => Boolean(genre))
        .map((name) => ({ name })),
      moods: draft.moodTags.map((mood) => ({ name: MOOD_TO_API[mood] ?? mood })),
    };
  }
}
