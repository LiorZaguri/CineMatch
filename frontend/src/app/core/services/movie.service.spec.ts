import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { MovieService } from './movie.service';
import {
    CreateReviewRequest,
    MovieCatalogResponse,
    RawMovieDashboardResponse,
    ReviewResponse,
    TmdbMovie,
    TmdbMovieListResponse
} from '../models/movie.models';

describe('MovieService', () => {
    let service: MovieService;
    let httpTestingController: HttpTestingController;

    const createTmdbMovie = (id: number, title: string): TmdbMovie => ({
        id,
        title,
        original_language: 'en',
        original_title: title,
        overview: `${title} overview`,
        poster_path: `/poster-${id}.jpg`,
        backdrop_path: `/backdrop-${id}.jpg`,
        release_date: '2024-01-01',
        vote_average: 8.1,
    });

    const createMovieList = (...movies: TmdbMovie[]): TmdbMovieListResponse => ({
        page: 1,
        results: movies,
        total_pages: 1,
        total_results: movies.length,
    });

    const dashboardResponse: RawMovieDashboardResponse = {
        now_playing: [createTmdbMovie(1, 'Now Playing')],
        popular: [createTmdbMovie(2, 'Popular Pick')],
        upcoming: [createTmdbMovie(3, 'Coming Soon')],
        top_rated: [createTmdbMovie(4, 'Top Rated')],
        errors: [],
    };

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                MovieService,
                provideHttpClient(),
                provideHttpClientTesting(),
            ],
        });
        service = TestBed.inject(MovieService);
        httpTestingController = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpTestingController.verify();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('refreshMovies should load dashboard sources and map movie state', () => {
        let received: MovieCatalogResponse | undefined;

        service.refreshMovies().subscribe((catalog) => {
            received = catalog;
        });

        httpTestingController.expectOne('/CineMatch/movies/dashboard/').flush(dashboardResponse);
        httpTestingController.expectOne('/CineMatch/movies/popular/?page=1').flush(createMovieList(createTmdbMovie(20, 'Popular Live')));
        httpTestingController.expectOne('/CineMatch/movies/now-playing/?page=1').flush(createMovieList(createTmdbMovie(10, 'Now Live')));
        httpTestingController.expectOne('/CineMatch/movies/upcoming/?page=1').flush(createMovieList(createTmdbMovie(30, 'Upcoming Live')));
        httpTestingController.expectOne('/CineMatch/movies/top-rated/?page=1').flush(createMovieList(createTmdbMovie(40, 'Top Live')));

        expect(received).toBeDefined();
        expect(received?.movies.length).toBe(4);
        expect(received?.dashboard.now_playing[0].title).toBe('Now Live');
        expect(received?.dashboard.popular[0].title).toBe('Popular Live');
        expect(service.movies().map((movie) => movie.id)).toEqual([10, 20, 30, 40]);
        expect(service.loading()).toBe(false);
    });

    it('getMovies should return cached catalog when movies and dashboard are already loaded', () => {
        (service as any)._movies.set([
            {
                id: 11,
                title: 'Cached Movie',
                description: 'Cached overview',
                posterUrl: 'cached.jpg',
                releaseDate: '2024-01-01',
                rating: 7.4,
                genre: [],
                director: 'CineMatch',
                cast: [],
                durationMinutes: 0,
            },
        ]);
        (service as any)._dashboard.set({
            now_playing: [],
            popular: [],
            upcoming: [],
            top_rated: [],
            errors: [],
        });

        let received: MovieCatalogResponse | undefined;
        service.getMovies().subscribe((catalog) => {
            received = catalog;
        });

        expect(received?.movies.length).toBe(1);
        expect(received?.dashboard.errors).toEqual([]);
        httpTestingController.expectNone('/CineMatch/movies/dashboard/');
    });

    it('getMovieByTmdbId should fetch detail from gateway movie route', () => {
        let receivedTitle = '';

        service.getMovieByTmdbId('1523145').subscribe((movie) => {
            receivedTitle = movie.title;
            expect(movie.tmdb_id).toBe(1523145);
            expect(movie.reviews).toEqual([{ rating: 9, content: 'Great', created_at: '2026-03-20T00:00:00Z' }]);
        });

        const req = httpTestingController.expectOne('/CineMatch/movies/1523145/');
        expect(req.request.method).toBe('GET');
        req.flush({
            ...createTmdbMovie(1523145, 'Detail Movie'),
            reviews: [{ rating: 9, content: 'Great', created_at: '2026-03-20T00:00:00Z' }],
        });

        expect(receivedTitle).toBe('Detail Movie');
    });

    it('getMovieByUUID should remain a compatibility alias to TMDB detail fetch', () => {
        service.getMovieByUUID('44').subscribe((movie) => {
            expect(movie.id).toBe(44);
        });

        httpTestingController.expectOne('/CineMatch/movies/44/').flush(createTmdbMovie(44, 'Alias Detail'));
    });

    it('createReview should post to the gateway review route', () => {
        const payload: CreateReviewRequest = {
            tmdb_id: 44,
            rating: 8,
            content: 'Very solid movie experience.',
        };
        let received: ReviewResponse | undefined;

        service.createReview(payload).subscribe((response) => {
            received = response;
        });

        const req = httpTestingController.expectOne('/CineMatch/movies/review/');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(payload);

        req.flush({
            id: 7,
            tmdb_id: 44,
            rating: 8,
            content: 'Very solid movie experience.',
            created_at: '2026-03-20T00:00:00Z',
        });

        expect(received?.id).toBe(7);
    });
});
