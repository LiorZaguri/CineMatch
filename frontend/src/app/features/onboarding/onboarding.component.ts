import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
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
import { MovieSeedCardComponent } from './components/movie-seed-card/movie-seed-card.component';
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

const MOVIE_SEEDS: OnboardingMovieCard[] = [
  {
    id: 1,
    title: 'Prisoners',
    year: 2013,
    metadata: 'Dark thriller',
    summary: 'Slow-burn tension and moral dread.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/uhviyknTT5cEQXbn6vWIqfM4vGm.jpg',
  },
  {
    id: 2,
    title: 'Blade Runner 2049',
    year: 2017,
    metadata: 'Visual sci-fi',
    summary: 'Atmospheric scale and meditative sci-fi.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
  },
  {
    id: 3,
    title: 'Parasite',
    year: 2019,
    metadata: 'Dark satire',
    summary: 'Class tension with sharp tonal shifts.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
  },
  {
    id: 4,
    title: 'Whiplash',
    year: 2014,
    metadata: 'Obsession drama',
    summary: 'Intensity, craft, and emotional impact.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/7fn624j5lj3xTme2SgiLCeuedmO.jpg',
  },
  {
    id: 5,
    title: 'Arrival',
    year: 2016,
    metadata: 'Thoughtful sci-fi',
    summary: 'Emotion-led science fiction with restraint.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg',
  },
  {
    id: 6,
    title: 'Zodiac',
    year: 2007,
    metadata: 'Procedural thriller',
    summary: 'Methodical investigation and dread.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/6YmeO4pB7XTh8P8F960O1uA14JO.jpg',
  },
  {
    id: 7,
    title: 'Black Swan',
    year: 2010,
    metadata: 'Psychological',
    summary: 'Identity fracture and artistic obsession.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/8iIabM9w35hIpDH4NB2woftQNa2.jpg',
  },
  {
    id: 8,
    title: 'The Grand Budapest Hotel',
    year: 2014,
    metadata: 'Stylized comedy',
    summary: 'Precise visual worldbuilding and wit.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg',
  },
  {
    id: 9,
    title: 'Moonlight',
    year: 2016,
    metadata: 'Intimate drama',
    summary: 'Tender, character-led storytelling.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/rcICfiL9fvwRjoWHxW8cjbVhKCG.jpg',
  },
  {
    id: 10,
    title: 'Mad Max: Fury Road',
    year: 2015,
    metadata: 'Adrenaline action',
    summary: 'Pure momentum and tactile action design.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/hA2ple9q4qnwxp3hKVNhroipsir.jpg',
  },
  {
    id: 11,
    title: 'Memories of Murder',
    year: 2003,
    metadata: 'Crime mystery',
    summary: 'Uneasy crime storytelling with humanity.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/edZ25O6tY6ZktUjKHuN9fGgM4sE.jpg',
  },
  {
    id: 12,
    title: 'Her',
    year: 2013,
    metadata: 'Romantic sci-fi',
    summary: 'Melancholic futurism and emotional texture.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/eCOtqtfvn7mxGl6nfmq4b1exJRc.jpg',
  },
  {
    id: 13,
    title: 'In the Mood for Love',
    year: 2000,
    metadata: 'Romantic longing',
    summary: 'Elegant restraint and visual sensuality.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/iYypPT4bhqXfq1b6EnmxvRt6b2Y.jpg',
  },
  {
    id: 14,
    title: 'The Dark Knight',
    year: 2008,
    metadata: 'Epic crime',
    summary: 'High-stakes spectacle with psychological weight.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
  },
  {
    id: 15,
    title: 'Spirited Away',
    year: 2001,
    metadata: 'Fantastical animation',
    summary: 'Wonder, mystery, and emotional warmth.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
  },
  {
    id: 16,
    title: 'Ex Machina',
    year: 2014,
    metadata: 'Minimalist sci-fi',
    summary: 'Controlled suspense and clean design.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/dmJW8IAKHKxFNiUnoDR7JfsK7Rp.jpg',
  },
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
    title: 'What genres do you want more of?',
    description: 'Choose the genres that should pull recommendations toward your taste.',
  },
  {
    label: 'Negative signal',
    title: 'What should we dial down?',
    description: 'Leave it empty if you want the first version to stay broad.',
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

const MOVIE_SEED_LOOKUP = MOVIE_SEEDS.reduce<Record<number, OnboardingMovieCard>>(
  (lookup, movie) => ({ ...lookup, [movie.id]: movie }),
  {},
);

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
  imports: [CommonModule, FormsModule, MovieSeedCardComponent],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.css',
})
export class OnboardingComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly movieService = inject(MovieService);
  protected readonly onboarding = inject(OnboardingService);
  private readonly userPreferences = inject(UserPreferenceService);
  private searchSubscription: Subscription | null = null;

  protected readonly currentStep = signal(0);
  protected readonly isSavingPreferences = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly movieSearch = signal('');
  protected readonly isMovieSearchLoading = signal(false);
  protected readonly movieSearchResults = signal<OnboardingMovieCard[]>([]);
  protected readonly selectedMovieCache = signal<Record<number, OnboardingMovieCard>>({
    ...MOVIE_SEED_LOOKUP,
  });
  protected readonly steps = [
    'Choose favorites',
    'Shape your taste',
    'Tell us what to avoid',
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

  protected readonly selectedMovieCount = computed(() => this.draft().selectedMovieIds.length);
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
    const remoteResults = this.movieSearchResults();
    if (query && remoteResults.length > 0) {
      return remoteResults.slice(0, 5);
    }

    if (!query) {
      return MOVIE_SEEDS.slice(0, 5);
    }

    return MOVIE_SEEDS.filter((movie) =>
      `${movie.title} ${movie.year ?? ''} ${movie.metadata ?? ''} ${movie.summary ?? ''}`
        .toLowerCase()
        .includes(query),
    ).slice(0, 5);
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
    if (step === 3) {
      return draft.moodTags.length > 0;
    }
    return true;
  });

  protected readonly activeStepMeta = computed(() => this.stepMeta[this.currentStep()]);

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
      this.movieSearchResults.set([]);
      return;
    }

    this.isMovieSearchLoading.set(true);
    this.searchSubscription = this.movieService.searchMovies(trimmedValue).subscribe({
      next: (movies) => {
        if (this.movieSearch().trim() !== trimmedValue) {
          return;
        }
        const movieCards = movies.slice(0, 5).map((movie) => this.toMovieSeed(movie));
        this.cacheMovies(movieCards);
        this.movieSearchResults.set(movieCards);
        this.isMovieSearchLoading.set(false);
      },
      error: () => {
        if (this.movieSearch().trim() !== trimmedValue) {
          return;
        }
        this.movieSearchResults.set([]);
        this.isMovieSearchLoading.set(false);
      },
    });
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
  }

  protected nextStep(): void {
    if (!this.canContinue()) {
      return;
    }

    if (this.currentStep() < this.steps.length - 1) {
      this.currentStep.update((step) => step + 1);
    }
  }

  protected previousStep(): void {
    if (this.currentStep() > 0) {
      this.currentStep.update((step) => step - 1);
    }
  }

  protected skipForNow(): void {
    this.persistPreferences('skipped');
  }

  protected finishSetup(): void {
    this.persistPreferences('completed');
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
  }

  private toMovieSeed(movie: Movie): OnboardingMovieCard {
    const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;
    return {
      id: movie.id,
      title: movie.title,
      year: year && Number.isFinite(year) ? year : null,
      rating: movie.rating ?? null,
      genre: movie.genre[0] ?? null,
      metadata: movie.genre[0] ?? null,
      summary: movie.description || 'No synopsis available yet.',
      posterUrl: movie.posterUrl || null,
    };
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
