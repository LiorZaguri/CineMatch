export interface MovieReview {
    id?: number;
    rating: number;
    content: string;
    created_at?: string;
    author_details?: {
        name?: string | null;
        username?: string | null;
        rating?: number | null;
        avatar_path?: string | null;
        avatar_url?: string | null;
        user_id?: string | null;
        source?: 'tmdb' | 'local' | string | null;
    };
}

export interface StreamingService {
    name: string;
    logo_path?: string | null;
}

export interface CastMember {
    id: number;
    known_for_department: string;
    name: string;
    profile_path?: string | null;
    character: string;
    order: number;
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
    cast: CastMember[];
    durationMinutes: number;
    backdropUrl?: string;
    trailer?: string;
    streaming_services?: StreamingService[];
    country_code?: string;
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
    runtime?: number | null;
    title: string;
    vote_average: number;
    trailer?: string | null;
    streaming_services?: StreamingService[];
    country_code?: string;
    reviews?: MovieReview[];
    summary?: string | null;
    cast?: CastMember[];
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

export interface UpdateReviewRequest {
    rating: number;
    content: string;
}

export interface ReviewResponse {
    id: number;
    tmdb_id: number;
    rating: number;
    content: string;
    created_at: string;
    author_details?: MovieReview['author_details'];
}

export interface ReviewSummaryResponse {
    tmdb_id: number;
    summary: string;
}

export interface AIMovieSearchRequest {
    prompt: string;
    page?: number;
}

export interface AIMovieSearchSuccessResponse {
    status: 'success';
    fallback_used: false;
    movies: TmdbMovie[];
}

export interface AIMovieSearchFallbackResponse {
    status: 'fallback';
    fallback_used: true;
    original_prompt: string;
    error_detail: string;
}

export type AIMovieSearchResponse =
    | AIMovieSearchSuccessResponse
    | AIMovieSearchFallbackResponse;
