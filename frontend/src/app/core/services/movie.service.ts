import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
    AIMovieSearchRequest,
    AIMovieSearchResponse,
    Movie,
    MovieCatalogResponse,
    MovieDashboardResponse,
    RawMovieDashboardResponse,
    CreateReviewRequest,
    ReviewResponse,
    ReviewSummaryResponse,
    TmdbMovie,
    TmdbMovieListResponse
} from '../models/movie.models';

@Injectable({
    providedIn: 'root',
})
export class MovieService {
    private readonly http = inject(HttpClient);
    private readonly gatewayMovieUrl = `${environment.apiUrl}/movies`;
    private readonly imageBaseUrl = 'https://image.tmdb.org/t/p';

    private readonly _movies = signal<Movie[]>([]);
    private readonly _dashboard = signal<MovieDashboardResponse | null>(null);
    private readonly _loading = signal<boolean>(false);
    private readonly _error = signal<string | null>(null);

    readonly movies = computed(() => this._movies());
    readonly dashboard = computed(() => this._dashboard());
    readonly loading = computed(() => this._loading());
    readonly error = computed(() => this._error());
    readonly nowPlaying = computed(() => this._dashboard()?.now_playing ?? []);
    readonly popular = computed(() => this._dashboard()?.popular ?? []);
    readonly upcoming = computed(() => this._dashboard()?.upcoming ?? []);
    readonly topRated = computed(() => this._dashboard()?.top_rated ?? []);

    getMovies(forceRefresh = false): Observable<MovieCatalogResponse> {
        if (!forceRefresh && this._movies().length > 0 && this._dashboard()) {
            return this.createCatalogResponse();
        }

        if (this._loading()) {
            return this.createCatalogResponse();
        }

        return this.refreshMovies();
    }

    refreshMovies(): Observable<MovieCatalogResponse> {
        this._loading.set(true);
        this._error.set(null);

        return forkJoin({
            dashboard: this.http.get<RawMovieDashboardResponse>(`${this.gatewayMovieUrl}/dashboard/`),
            popular: this.http.get<TmdbMovieListResponse>(`${this.gatewayMovieUrl}/popular/?page=1`),
            nowPlaying: this.http.get<TmdbMovieListResponse>(`${this.gatewayMovieUrl}/now-playing/?page=1`),
            upcoming: this.http.get<TmdbMovieListResponse>(`${this.gatewayMovieUrl}/upcoming/?page=1`),
            topRated: this.http.get<TmdbMovieListResponse>(`${this.gatewayMovieUrl}/top-rated/?page=1`)
        }).pipe(
            map(({ dashboard, popular, nowPlaying, upcoming, topRated }) => {
                const catalog = {
                    dashboard: {
                        now_playing: this.mapMovies(nowPlaying.results.length > 0 ? nowPlaying.results : dashboard.now_playing),
                        popular: this.mapMovies(popular.results.length > 0 ? popular.results : dashboard.popular),
                        upcoming: this.mapMovies(upcoming.results.length > 0 ? upcoming.results : dashboard.upcoming),
                        top_rated: this.mapMovies(topRated.results.length > 0 ? topRated.results : dashboard.top_rated),
                        errors: dashboard.errors ?? []
                    }
                } as MovieCatalogResponse;

                catalog.movies = this.dedupeMovies([
                    ...catalog.dashboard.now_playing,
                    ...catalog.dashboard.popular,
                    ...catalog.dashboard.upcoming,
                    ...catalog.dashboard.top_rated
                ]);
                catalog.total = catalog.movies.length;
                return catalog;
            }),
            tap((catalog) => {
                this._dashboard.set(catalog.dashboard);
                this._movies.set(catalog.movies);
                this._loading.set(false);
                this._error.set(catalog.movies.length === 0 ? 'No movies are available right now.' : null);
            }),
            catchError((err) => {
                this._movies.set([]);
                this._dashboard.set(null);
                this._loading.set(false);
                this._error.set('Failed to load movies. Please try again later.');
                return throwError(() => err);
            })
        );
    }

    getMovieByTmdbId(tmdbId: string, forceRefresh = false): Observable<Movie> {
        const cachedMovie = !forceRefresh ? this.getMovieFromState(tmdbId) : undefined;
        if (cachedMovie) {
            return this.http.get<TmdbMovie & { reviews?: unknown[] }>(`${this.gatewayMovieUrl}/${cachedMovie.id}/`).pipe(
                map((movie) => this.mapMovie(movie))
            );
        }

        return this.http.get<TmdbMovie & { reviews?: unknown[] }>(`${this.gatewayMovieUrl}/${tmdbId}/`).pipe(
            map((movie) => this.mapMovie(movie))
        );
    }

    getMovieByUUID(uuid: string, forceRefresh = false): Observable<Movie> {
        return this.getMovieByTmdbId(uuid, forceRefresh);
    }

    createReview(payload: CreateReviewRequest): Observable<ReviewResponse> {
        return this.http.post<ReviewResponse>(`${this.gatewayMovieUrl}/review/`, payload);
    }

    getMovieSummary(tmdbId: number): Observable<ReviewSummaryResponse> {
        return this.http.get<ReviewSummaryResponse>(`${this.gatewayMovieUrl}/ai/${tmdbId}/summary/`);
    }

    aiSearch(payload: AIMovieSearchRequest): Observable<AIMovieSearchResponse> {
        return this.http.post<AIMovieSearchResponse>(`${this.gatewayMovieUrl}/ai/search`, payload);
    }

    getMovieFromState(idOrUuid: string): Movie | undefined {
        return this._movies().find((movie) => String(movie.id) === idOrUuid);
    }

    private createCatalogResponse(): Observable<MovieCatalogResponse> {
        return new Observable<MovieCatalogResponse>((subscriber) => {
            const dashboard = this._dashboard();
            subscriber.next({
                movies: this._movies(),
                total: this._movies().length,
                dashboard: dashboard ?? {
                    now_playing: [],
                    popular: [],
                    upcoming: [],
                    top_rated: [],
                    errors: []
                }
            });
            subscriber.complete();
        });
    }

    private mapMovies(movies: TmdbMovie[]): Movie[] {
        return movies.map((movie) => this.mapMovie(movie));
    }

    private mapMovie(movie: TmdbMovie): Movie {
        return {
            id: movie.id,
            title: movie.title,
            description: movie.overview || 'No synopsis available yet.',
            posterUrl: this.buildImageUrl(movie.poster_path, 'w780'),
            backdropUrl: this.buildImageUrl(movie.backdrop_path ?? movie.poster_path, 'w1280'),
            releaseDate: movie.release_date || '',
            rating: movie.vote_average ?? 0,
            genre: [],
            director: 'CineMatch',
            cast: [],
            durationMinutes: 0,
            tmdb_id: movie.id,
            reviews: 'reviews' in movie && Array.isArray(movie.reviews) ? movie.reviews : undefined,
            review_summary: movie.review_summary ?? (movie.summary ? { summary_text: movie.summary } : null)
        };
    }

    private buildImageUrl(path: string | null | undefined, size: string): string {
        if (!path) {
            return '';
        }
        return `${this.imageBaseUrl}/${size}${path}`;
    }

    private dedupeMovies(movies: Movie[]): Movie[] {
        const seen = new Set<number>();
        return movies.filter((movie) => {
            if (seen.has(movie.id)) {
                return false;
            }
            seen.add(movie.id);
            return true;
        });
    }
}
