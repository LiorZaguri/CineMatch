import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { MovieListComponent } from './movie-list.component';
import { MovieService } from '../../../core/services/movie.service';
import { Movie, MovieDashboardResponse } from '../../../core/models/movie.models';

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
        cast: ['Cast 1'],
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
        cast: ['Cast 2'],
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

    const mockMovieService = {
        movies: moviesSignal.asReadonly(),
        dashboard: dashboardSignal.asReadonly(),
        loading: loadingSignal.asReadonly(),
        error: errorSignal.asReadonly(),
        nowPlaying: nowPlayingSignal.asReadonly(),
        popular: popularSignal.asReadonly(),
        upcoming: upcomingSignal.asReadonly(),
        topRated: topRatedSignal.asReadonly(),
        getMovies: vi.fn().mockReturnValue({ subscribe: () => {} }),
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
        mockMovieService.getMovies.mockClear();

        await TestBed.configureTestingModule({
            imports: [MovieListComponent],
            providers: [
                provideRouter([]),
                { provide: MovieService, useValue: mockMovieService },
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

        fixture.detectChanges();

        expect(fixture.debugElement.query(By.css('.hero-section h1')).nativeElement.textContent).toContain('Movie 1');
        expect(fixture.debugElement.query(By.css('.poster-card h4')).nativeElement.textContent).toContain('Movie 2');
        expect(fixture.debugElement.query(By.css('.critics-card span')).nativeElement.textContent).toContain('Movie 1');
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
