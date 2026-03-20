export interface MovieReview {
    id?: number;
    rating: number;
    content: string;
    created_at?: string;
}

export interface Movie {
    id: number;
    tmdb_id?: number;
    title: string;
    description: string;
    posterUrl: string;
    releaseDate: string;
    rating: number;
    genre: string[];
    director: string;
    cast: string[];
    durationMinutes: number;
    backdropUrl?: string;
    reviews?: MovieReview[];
    review_summary?: {
        summary_text?: string;
    } | null;
}

export interface TmdbMovie {
    id: number;
    original_language: string;
    original_title: string;
    overview: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    release_date?: string | null;
    title: string;
    vote_average: number;
    reviews?: MovieReview[];
    review_summary?: {
        summary_text?: string;
    } | null;
}

export interface TmdbMovieListResponse {
    page: number;
    results: TmdbMovie[];
    total_pages: number;
    total_results: number;
}

export interface MovieDashboardResponse {
    now_playing: Movie[];
    popular: Movie[];
    upcoming: Movie[];
    top_rated: Movie[];
    errors: string[];
}

export interface RawMovieDashboardResponse {
    now_playing: TmdbMovie[];
    popular: TmdbMovie[];
    upcoming: TmdbMovie[];
    top_rated: TmdbMovie[];
    errors: string[];
}

export interface MovieCatalogResponse {
    movies: Movie[];
    total: number;
    dashboard: MovieDashboardResponse;
}

export interface CreateReviewRequest {
    tmdb_id: number;
    rating: number;
    content: string;
}

export interface ReviewResponse {
    id: number;
    tmdb_id: number;
    rating: number;
    content: string;
    created_at: string;
}
