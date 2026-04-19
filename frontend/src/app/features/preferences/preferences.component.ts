import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Image,
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  MoonStar,
  Popcorn,
  Search,
  Sparkles,
  X,
  Zap,
} from 'lucide-angular';
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
import { OnboardingService } from '../../core/services/onboarding.service';
import { UserPreferenceService } from '../../core/services/user-preference.service';
import { OnboardingMovieCard } from '../onboarding/movie-card.models';

interface Option<T extends string = string> {
  label: string;
  value: T;
  caption?: string;
}

interface MoodOption extends Option {
  icon: string;
}

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

interface PreferenceSnapshot {
  chosen_movies: number[];
  liked_genres: UserPreferenceGenre[];
  disliked_genres: UserPreferenceGenre[];
  moods: string[];
  discovery_mode: UserPreferenceDiscoveryMode;
  languages: UserPreferenceLanguage[];
  runtime: UserPreferenceRuntime | null;
  eras: UserPreferenceEra[];
}

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

const MOOD_OPTIONS: MoodOption[] = [
  {
    label: 'Dark & tense',
    value: 'Dark & tense',
    caption: 'Psychological, gritty, unsettling',
    icon: 'moon-star',
  },
  {
    label: 'Mind-bending',
    value: 'Mind-bending',
    caption: 'Non-linear, twists, complex',
    icon: 'sparkles',
  },
  {
    label: 'Emotionally heavy',
    value: 'Emotionally heavy',
    caption: 'Moving, tearjerker, meaningful',
    icon: 'droplets',
  },
  {
    label: 'Visually stunning',
    value: 'Visually stunning',
    caption: 'Cinematography-forward, beautiful',
    icon: 'image',
  },
  {
    label: 'Fun & easy',
    value: 'Fun & easy',
    caption: 'Light, entertaining, feel-good',
    icon: 'popcorn',
  },
  {
    label: 'Fast-paced',
    value: 'Fast-paced',
    caption: 'Tense, action-driven, high-energy',
    icon: 'zap',
  },
];

const DISCOVERY_OPTIONS: Option<UserPreferenceDiscoveryMode>[] = [
  { label: 'Best mix', value: 'best mix', caption: 'Balance reliable picks with surprises.' },
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
  { label: 'No preference', value: 'No preference', caption: 'Runtime is not a factor.' },
  { label: 'Under 100 min', value: '100', caption: 'Tight and efficient.' },
  { label: '100-140 min', value: '100-140', caption: 'Balanced feature length.' },
  { label: '140+ min', value: '140+', caption: 'Epic scale is fine.' },
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
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        ArrowLeft,
        Check,
        ChevronLeft,
        ChevronRight,
        Droplets,
        Image,
        MoonStar,
        Popcorn,
        Search,
        Sparkles,
        X,
        Zap,
      }),
    },
  ],
  templateUrl: './preferences.component.html',
  styleUrl: './preferences.component.css',
})
export class PreferencesComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('selectedMoviesRail') private selectedMoviesRail?: ElementRef<HTMLDivElement>;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly onboarding = inject(OnboardingService);
  private readonly preferences = inject(UserPreferenceService);
  private readonly movieService = inject(MovieService);
  private animationFrameId: number | null = null;
  private searchSubscription: Subscription | null = null;
  private hydrateSubscription: Subscription | null = null;
  private feedbackTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly cleanupFns: (() => void)[] = [];

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
  readonly runtime = signal<UserPreferenceRuntime>('No preference');
  readonly eras = signal<UserPreferenceEra[]>([]);
  readonly initialSnapshot = signal<PreferenceSnapshot | null>(null);
  readonly canScrollSelectedLeft = signal(false);
  readonly canScrollSelectedRight = signal(false);

  private readonly selectedRailEffect = effect(() => {
    this.selectedMovieCards();
    queueMicrotask(() => this.syncSelectedMoviesRail());
  });

  readonly selectedMovieCards = computed(() =>
    this.selectedMovieIds().map(
      (movieId) =>
        this.selectedMovies()[movieId] ?? {
          id: movieId,
          title: `Movie #${movieId}`,
          summary: 'Saved to your taste profile.',
          posterUrl: null,
          year: null,
        },
    ),
  );

  readonly visibleSearchResults = computed(() =>
    this.searchResults()
      .filter((movie) => !this.selectedMovieIds().includes(movie.id))
      .slice(0, 5),
  );

  readonly completionPercent = computed(() => {
    let score = 0;
    const selectedCount = this.selectedMovieIds().length;

    score += Math.min(selectedCount, 3) * 10;

    if (this.likedGenres().length >= 2) score += 20;
    if (this.dislikedGenres().length >= 1) score += 10;
    if (this.moods().length >= 2) score += 20;
    if (this.languages().length >= 1) score += 10;
    if (this.eras().length >= 1) score += 10;

    return Math.min(score, 100);
  });

  readonly hasUnsavedChanges = computed(() => {
    const initial = this.initialSnapshot();
    if (!initial) return false;

    return JSON.stringify(initial) !== JSON.stringify(this.currentSnapshot());
  });

  ngOnInit(): void {
    this.loadPreferences();
  }

  ngAfterViewInit(): void {
    const root = this.host.nativeElement;
    const cursor = root.querySelector('#cursor') as HTMLElement | null;
    const ring = root.querySelector('#cursorRing') as HTMLElement | null;

    if (!cursor || !ring) {
      return;
    }

    let mouseX = 0;
    let mouseY = 0;
    let ringX = 0;
    let ringY = 0;

    const onMouseMove = (event: MouseEvent) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      cursor.style.left = `${mouseX}px`;
      cursor.style.top = `${mouseY}px`;
    };

    const animateRing = () => {
      ringX += (mouseX - ringX) * 0.12;
      ringY += (mouseY - ringY) * 0.12;
      ring.style.left = `${ringX}px`;
      ring.style.top = `${ringY}px`;
      this.animationFrameId = window.requestAnimationFrame(animateRing);
    };

    document.addEventListener('mousemove', onMouseMove);
    this.cleanupFns.push(() => document.removeEventListener('mousemove', onMouseMove));
    window.addEventListener('resize', this.syncSelectedMoviesRail);
    this.cleanupFns.push(() => window.removeEventListener('resize', this.syncSelectedMoviesRail));

    const hoverTargets = root.querySelectorAll(
      'a, button, input, select, textarea',
    ) as NodeListOf<HTMLElement>;

    hoverTargets.forEach((element) => {
      const onEnter = () => {
        cursor.style.width = '20px';
        cursor.style.height = '20px';
        ring.style.width = '56px';
        ring.style.height = '56px';
      };

      const onLeave = () => {
        cursor.style.width = '10px';
        cursor.style.height = '10px';
        ring.style.width = '36px';
        ring.style.height = '36px';
      };

      element.addEventListener('mouseenter', onEnter);
      element.addEventListener('mouseleave', onLeave);

      this.cleanupFns.push(() => {
        element.removeEventListener('mouseenter', onEnter);
        element.removeEventListener('mouseleave', onLeave);
      });
    });

    animateRing();
    queueMicrotask(() => this.syncSelectedMoviesRail());
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    this.hydrateSubscription?.unsubscribe();
    if (this.feedbackTimeout) {
      clearTimeout(this.feedbackTimeout);
    }

    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns.length = 0;

    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  scrollSelectedMovies(direction: 'left' | 'right'): void {
    const rail = this.selectedMoviesRail?.nativeElement;
    if (!rail) {
      return;
    }

    const offset = Math.max(rail.clientWidth * 0.72, 160);
    rail.scrollBy({
      left: direction === 'right' ? offset : -offset,
      behavior: 'smooth',
    });
  }

  onSelectedMoviesScroll(): void {
    this.syncSelectedMoviesRail();
  }

  private readonly syncSelectedMoviesRail = () => {
    const rail = this.selectedMoviesRail?.nativeElement;
    if (!rail) {
      this.canScrollSelectedLeft.set(false);
      this.canScrollSelectedRight.set(false);
      return;
    }

    const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
    this.canScrollSelectedLeft.set(rail.scrollLeft > 4);
    this.canScrollSelectedRight.set(maxScrollLeft - rail.scrollLeft > 4);
  };

  loadPreferences(): void {
    this.isLoading.set(true);
    this.feedback.set(null);

    this.preferences
      .getMyPreferences()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (profile) => this.applyProfile(profile),
        error: () => {
          this.setFeedback({
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
        this.searchResults.set(movies.map((movie) => this.toMovieCard(movie)));
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

  addMovie(movie: OnboardingMovieCard): void {
    if (this.selectedMovieIds().includes(movie.id)) {
      return;
    }

    this.selectedMovies.update((movies) => ({ ...movies, [movie.id]: movie }));
    this.selectedMovieIds.update((ids) => [...ids, movie.id]);
    this.searchQuery.set('');
    this.searchResults.set([]);
  }

  removeMovie(movieId: number): void {
    this.selectedMovieIds.update((ids) => ids.filter((id) => id !== movieId));
  }

  toggleLikedGenre(value: UserPreferenceGenre): void {
    this.toggleArrayValue(this.likedGenres, value);
    if (this.dislikedGenres().includes(value)) {
      this.dislikedGenres.update((values) => values.filter((item) => item !== value));
    }
  }

  toggleDislikedGenre(value: UserPreferenceGenre): void {
    this.toggleArrayValue(this.dislikedGenres, value);
    if (this.likedGenres().includes(value)) {
      this.likedGenres.update((values) => values.filter((item) => item !== value));
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
          this.onboarding.complete();
          this.setFeedback({ type: 'success', message: 'Preferences saved' }, 3000);
        },
        error: () => {
          this.setFeedback({
            type: 'error',
            message: 'Unable to save your preferences. Please check the selections and try again.',
          });
        },
      });
  }
  private applyProfile(profile: UserPreferenceProfile, hydrateMovies = true): void {
    const movieIds = profile.chosen_movies.map((movie) => movie.tmdb_id);
    this.selectedMovieIds.set(movieIds);
    this.likedGenres.set(profile.liked_genres.map((genre) => genre.name));
    this.dislikedGenres.set(profile.disliked_genres.map((genre) => genre.name));
    this.moods.set(profile.moods.map((mood) => mood.name));
    this.discoveryMode.set(profile.discovery_mode ?? 'best mix');
    this.languages.set(profile.languages ?? []);
    this.runtime.set(profile.runtime ?? 'No preference');
    this.eras.set(profile.eras ?? []);
    this.initialSnapshot.set(this.currentSnapshot());

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

  private currentSnapshot(): PreferenceSnapshot {
    return {
      chosen_movies: [...this.selectedMovieIds()],
      liked_genres: [...this.likedGenres()],
      disliked_genres: [...this.dislikedGenres()],
      moods: [...this.moods()],
      discovery_mode: this.discoveryMode(),
      languages: [...this.languages()],
      runtime: this.runtime(),
      eras: [...this.eras()],
    };
  }

  private setFeedback(feedback: FeedbackState | null, timeoutMs?: number): void {
    if (this.feedbackTimeout) {
      clearTimeout(this.feedbackTimeout);
      this.feedbackTimeout = null;
    }

    this.feedback.set(feedback);

    if (feedback && timeoutMs) {
      this.feedbackTimeout = setTimeout(() => {
        this.feedback.set(null);
        this.feedbackTimeout = null;
      }, timeoutMs);
    }
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
