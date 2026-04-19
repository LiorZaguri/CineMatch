import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { MovieListComponent } from './movie-list.component';
import { MovieService } from '../../../core/services/movie.service';
import { Movie, MovieDashboardResponse } from '../../../core/models/movie.models';
import { OnboardingService } from '../../../core/services/onboarding.service';
import { UserPreferenceService } from '../../../core/services/user-preference.service';

describe('MovieListComponent', () => {
  let component: MovieListComponent;
  let fixture: ComponentFixture<MovieListComponent>;

  const movieA: Movie = {
    id: 1,
    title: 'Movie 1',
    description: 'Desc 1',
    posterUrl: 'img1.jpg',
    backdropUrl: 'backdrop1.jpg',
    releaseDate: '2024-01-01',
    rating: 8,
    genre: ['Action'],
    director: 'Dir 1',
    cast: [
      {
        id: 1,
        known_for_department: 'Acting',
        name: 'Cast 1',
        character: 'Lead',
        order: 0,
      },
    ],
    durationMinutes: 120,
  };

  const movieB: Movie = {
    id: 2,
    title: 'Movie 2',
    description: 'Desc 2',
    posterUrl: 'img2.jpg',
    backdropUrl: 'backdrop2.jpg',
    releaseDate: '2023-01-01',
    rating: 7.5,
    genre: ['Comedy'],
    director: 'Dir 2',
    cast: [
      {
        id: 2,
        known_for_department: 'Acting',
        name: 'Cast 2',
        character: 'Lead',
        order: 0,
      },
    ],
    durationMinutes: 90,
  };

  const moviesSignal = signal<Movie[]>([]);
  const dashboardSignal = signal<MovieDashboardResponse | null>(null);
  const loadingSignal = signal<boolean>(false);
  const errorSignal = signal<string | null>(null);
  const nowPlayingSignal = signal<Movie[]>([]);
  const popularSignal = signal<Movie[]>([]);
  const upcomingSignal = signal<Movie[]>([]);
  const topRatedSignal = signal<Movie[]>([]);
  const recommendationsSignal = signal<Movie[]>([]);
  const recommendationsLoadingSignal = signal<boolean>(false);
  const recommendationsErrorSignal = signal<string | null>(null);

  const mockMovieService = {
    movies: moviesSignal.asReadonly(),
    dashboard: dashboardSignal.asReadonly(),
    loading: loadingSignal.asReadonly(),
    error: errorSignal.asReadonly(),
    nowPlaying: nowPlayingSignal.asReadonly(),
    popular: popularSignal.asReadonly(),
    upcoming: upcomingSignal.asReadonly(),
    topRated: topRatedSignal.asReadonly(),
    recommendations: recommendationsSignal.asReadonly(),
    recommendationsLoading: recommendationsLoadingSignal.asReadonly(),
    recommendationsError: recommendationsErrorSignal.asReadonly(),
    getMovies: vi.fn().mockReturnValue(of(undefined)),
    getPersonalizedRecommendations: vi.fn().mockReturnValue(of(undefined)),
  };

  const mockOnboardingService = {
    isSkipped: signal(false).asReadonly(),
    reset: vi.fn(),
  };

  const mockUserPreferenceService = {
    getMyPreferences: vi.fn().mockReturnValue(
      of({
        id: 1,
        user_id: 'user-1',
        discovery_mode: 'best mix',
        languages: [],
        runtime: null,
        eras: [],
        chosen_movies: [],
        liked_genres: [],
        disliked_genres: [],
        moods: [],
      }),
    ),
  };

  beforeEach(async () => {
    moviesSignal.set([]);
    dashboardSignal.set(null);
    loadingSignal.set(false);
    errorSignal.set(null);
    nowPlayingSignal.set([]);
    popularSignal.set([]);
    upcomingSignal.set([]);
    topRatedSignal.set([]);
    recommendationsSignal.set([]);
    recommendationsLoadingSignal.set(false);
    recommendationsErrorSignal.set(null);
    mockMovieService.getMovies.mockClear();
    mockMovieService.getPersonalizedRecommendations.mockClear();
    mockOnboardingService.reset.mockClear();
    mockUserPreferenceService.getMyPreferences.mockClear();
    mockUserPreferenceService.getMyPreferences.mockReturnValue(
      of({
        id: 1,
        user_id: 'user-1',
        discovery_mode: 'best mix',
        languages: [],
        runtime: null,
        eras: [],
        chosen_movies: [],
        liked_genres: [],
        disliked_genres: [],
        moods: [],
      }),
    );

    await TestBed.configureTestingModule({
      imports: [MovieListComponent],
      providers: [
        provideRouter([]),
        { provide: MovieService, useValue: mockMovieService },
        { provide: OnboardingService, useValue: mockOnboardingService },
        { provide: UserPreferenceService, useValue: mockUserPreferenceService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MovieListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should request a forced movie refresh on init', () => {
    fixture.detectChanges();
    expect(mockMovieService.getMovies).toHaveBeenCalledWith(true);
    expect(mockMovieService.getPersonalizedRecommendations).toHaveBeenCalledWith(true);
  });

  it('should display loading overlay when loading is true', () => {
    loadingSignal.set(true);
    fixture.detectChanges();

    const loader = fixture.debugElement.query(By.css('.loading-overlay'));
    expect(loader).toBeTruthy();
    expect(loader.nativeElement.textContent).toContain('Curating your experience');
  });

  it('should render hero and sections when dashboard movie data exists', () => {
    const dashboard: MovieDashboardResponse = {
      now_playing: [movieA],
      popular: [movieB],
      upcoming: [movieA],
      top_rated: [movieB],
      errors: [],
    };

    moviesSignal.set([movieA, movieB]);
    dashboardSignal.set(dashboard);
    nowPlayingSignal.set(dashboard.now_playing);
    popularSignal.set(dashboard.popular);
    upcomingSignal.set(dashboard.upcoming);
    topRatedSignal.set(dashboard.top_rated);
    recommendationsSignal.set([movieB]);

    fixture.detectChanges();

    expect(
      fixture.debugElement.query(By.css('.hero-section h1')).nativeElement.textContent,
    ).toContain('Movie 1');
    expect(
      fixture.debugElement.query(By.css('.recommendations-row .poster-card h4')).nativeElement
        .textContent,
    ).toContain('Movie 2');
    expect(fixture.nativeElement.textContent).toContain('Now Playing');
    expect(fixture.nativeElement.textContent).toContain('Popular Right Now');
    expect(fixture.nativeElement.textContent).toContain('Coming Soon');
    expect(fixture.nativeElement.textContent).toContain('Top Rated');
  });

  it('should display empty state when no movies are available', () => {
    fixture.detectChanges();

    const emptyState = fixture.debugElement.query(By.css('.empty-state'));
    expect(emptyState).toBeTruthy();
    expect(emptyState.nativeElement.textContent).toContain('No movies found');
  });

  it('should display error state when an error is present', () => {
    errorSignal.set('Test Error');
    fixture.detectChanges();

    const errorState = fixture.debugElement.query(By.css('.error-container'));
    expect(errorState).toBeTruthy();
    expect(errorState.nativeElement.textContent).toContain('Test Error');
  });
});
