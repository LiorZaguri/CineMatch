import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MovieService } from '../../../core/services/movie.service';
import { Movie } from '../../../core/models/movie.models';
import { ScrollRevealDirective } from '../../../core/directives/scroll-reveal.directive';
import { OnboardingService } from '../../../core/services/onboarding.service';
import { UserPreferenceService } from '../../../core/services/user-preference.service';
import { UserPreferenceProfile } from '../../../core/models/user-preference.models';

interface MovieSection {
  key: string;
  title: string;
  description: string;
  movies: Movie[];
}

@Component({
  selector: 'app-movie-list',
  standalone: true,
  imports: [CommonModule, RouterLink, ScrollRevealDirective],
  templateUrl: './movie-list.component.html',
  styleUrls: ['./movie-list.component.css'],
})
export class MovieListComponent implements OnInit, OnDestroy {
  private readonly movieService = inject(MovieService);
  private readonly onboarding = inject(OnboardingService);
  private readonly router = inject(Router);
  private readonly userPreferenceService = inject(UserPreferenceService);
  private carouselTimer: ReturnType<typeof setInterval> | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private heroPaused = false;
  private readonly slideDelayMs = 4500;
  private readonly fadeDurationMs = 450;

  readonly movies = this.movieService.movies;
  readonly dashboard = this.movieService.dashboard;
  readonly loading = this.movieService.loading;
  readonly error = this.movieService.error;
  readonly recommendationsLoading = this.movieService.recommendationsLoading;
  readonly recommendationsError = this.movieService.recommendationsError;
  readonly heroIndex = signal(0);
  readonly isHeroFading = signal(false);
  readonly tasteProfile = signal<UserPreferenceProfile | null>(null);
  readonly tasteProfileLoading = signal(false);
  readonly tasteProfileMissing = signal(false);
  @ViewChild('recommendationsRow') private recommendationsRow?: ElementRef<HTMLDivElement>;

  readonly heroMovies = this.movieService.nowPlaying;
  readonly heroMovie = computed(() => {
    const heroes = this.heroMovies();
    if (heroes.length === 0) {
      return null;
    }

    return heroes[this.heroIndex() % heroes.length];
  });
  readonly recommendedMovies = computed(() => this.movieService.recommendations().slice(0, 20));
  readonly hasTasteSignals = computed(() => {
    const profile = this.tasteProfile();

    return Boolean(
      profile &&
        (profile.chosen_movies.length > 0 ||
          profile.liked_genres.length > 0 ||
          profile.moods.length > 0 ||
          profile.eras.length > 0 ||
          profile.languages.length > 0 ||
          profile.runtime),
    );
  });
  readonly shouldPromptForTasteSetup = computed(
    () =>
      !this.tasteProfileLoading() &&
      (this.tasteProfileMissing() || (this.onboarding.isSkipped() && !this.hasTasteSignals())),
  );
  readonly topMatches = computed(() => this.movieService.topRated().slice(0, 6));
  readonly upcomingMovies = computed(() => this.movieService.upcoming().slice(0, 8));
  readonly dashboardSections = computed<MovieSection[]>(() =>
    [
      {
        key: 'now-playing',
        title: 'Now Playing',
        description: 'Movies that are in theaters and trending now.',
        movies: this.movieService.nowPlaying().slice(0, 10),
      },
      {
        key: 'popular',
        title: 'Popular Right Now',
        description: 'The titles getting the most attention across the catalog.',
        movies: this.movieService.popular().slice(0, 10),
      },
      {
        key: 'upcoming',
        title: 'Coming Soon',
        description: 'Upcoming releases worth keeping an eye on.',
        movies: this.movieService.upcoming().slice(0, 10),
      },
      {
        key: 'top-rated',
        title: 'Top Rated',
        description: 'Critically loved movies with the strongest scores.',
        movies: this.movieService.topRated().slice(0, 10),
      },
    ].filter((section) => section.movies.length > 0),
  );

  ngOnInit(): void {
    this.loadMovies();
    this.loadTasteProfile();
    this.startHeroCarousel();
  }

  ngOnDestroy(): void {
    this.stopHeroCarousel();
  }

  retry(): void {
    this.loadMovies();
  }

  getYear(movie: Movie): string {
    if (!movie.releaseDate) {
      return 'TBA';
    }
    const year = new Date(movie.releaseDate).getFullYear();
    return Number.isFinite(year) ? year.toString() : 'TBA';
  }

  getGenres(movie: Movie): string {
    const genres = movie.genre
      .map((genre) => genre?.trim())
      .filter((genre): genre is string => !!genre);

    return genres.length > 0 ? genres.slice(0, 2).join(' • ') : 'Uncategorized';
  }

  getScore(movie: Movie): string {
    return Number.isFinite(movie.rating) ? movie.rating.toFixed(1) : '0.0';
  }

  getMatchScore(movie: Movie, index: number): number {
    if (typeof movie.aiMatchScore === 'number' && Number.isFinite(movie.aiMatchScore)) {
      return Math.round(Math.max(0, Math.min(movie.aiMatchScore, 100)));
    }

    return Math.max(72, 96 - index);
  }

  scrollRecommendations(direction: 'left' | 'right'): void {
    this.scrollRow(this.recommendationsRow?.nativeElement, direction);
  }

  scrollRow(row: HTMLDivElement | undefined, direction: 'left' | 'right'): void {
    if (!row) {
      return;
    }

    const scrollAmount = Math.max(row.clientWidth * 0.8, 260);
    row.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }

  startTasteSetup(): void {
    this.onboarding.reset();
    this.router.navigate(['/onboarding']);
  }

  private loadMovies(): void {
    this.movieService.getMovies(true).subscribe({
      error: (err) => {
        console.error('Failed to load movies:', err);
      },
    });
    this.movieService.getPersonalizedRecommendations(true).subscribe({
      error: (err) => {
        console.error('Failed to load recommendations:', err);
      },
    });
  }

  private loadTasteProfile(): void {
    this.tasteProfileLoading.set(true);
    this.tasteProfileMissing.set(false);

    this.userPreferenceService.getMyPreferences().subscribe({
      next: (profile) => {
        this.tasteProfile.set(profile);
        this.tasteProfileLoading.set(false);
      },
      error: () => {
        this.tasteProfile.set(null);
        this.tasteProfileMissing.set(true);
        this.tasteProfileLoading.set(false);
      },
    });
  }

  private startHeroCarousel(): void {
    this.stopHeroCarousel();

    this.carouselTimer = setInterval(() => {
      this.advanceHero();
    }, this.slideDelayMs);
  }

  private stopHeroCarousel(): void {
    if (this.carouselTimer) {
      clearInterval(this.carouselTimer);
      this.carouselTimer = null;
    }

    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  pauseHeroCarousel(): void {
    this.heroPaused = true;
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
      this.isHeroFading.set(false);
    }
  }

  resumeHeroCarousel(): void {
    this.heroPaused = false;
  }

  private advanceHero(): void {
    const heroes = this.heroMovies();
    if (this.heroPaused || heroes.length < 2 || this.isHeroFading()) {
      return;
    }

    this.isHeroFading.set(true);
    this.fadeTimer = setTimeout(() => {
      this.heroIndex.update((index) => (index + 1) % heroes.length);
      this.isHeroFading.set(false);
    }, this.fadeDurationMs);
  }
}
