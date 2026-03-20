import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { MovieService } from '../../../core/services/movie.service';
import { CreateReviewRequest, Movie } from '../../../core/models/movie.models';
import { ScrollRevealDirective } from '../../../core/directives/scroll-reveal.directive';

interface MovieReview {
    id?: number;
    rating: number;
    content: string;
    created_at?: string;
}

interface MovieSummaryPayload {
    summary_text?: string;
}

interface MovieDetailData extends Movie {
    reviews?: MovieReview[];
    review_summary?: MovieSummaryPayload | null;
}

interface AiSummaryResponse {
    ok: boolean;
    summary: string | null;
    error: string | null;
}

interface AiSummaryRequest {
    movie_title: string;
    tmdb_id: number;
    reviews: Array<Pick<MovieReview, 'rating' | 'content'>>;
}

@Component({
    selector: 'app-movie-detail',
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule, ScrollRevealDirective],
    templateUrl: './movie-detail.component.html',
    styleUrls: ['./movie-detail.component.css']
})
export class MovieDetailComponent {
    private readonly route = inject(ActivatedRoute);
    private readonly movieService = inject(MovieService);
    private readonly http = inject(HttpClient);
    // Temporary direct worker endpoint until summary generation is routed through gateway/core.
    private readonly aiSummaryUrl = 'http://localhost:8002/summarize';

    // Signals for movie, loading, and error
    readonly movie = signal<Movie | null>(null);
    readonly loading = signal<boolean>(true);
    readonly error = signal<string | null>(null);
    readonly aiSummary = signal<string | null>(null);
    readonly aiSummaryLoading = signal<boolean>(false);
    readonly aiSummaryError = signal<string | null>(null);
    readonly reviewComposerOpen = signal<boolean>(false);
    readonly reviewComposerRating = signal<number>(4);
    readonly reviewComposerContent = signal<string>('');
    readonly reviewComposerError = signal<string | null>(null);
    readonly reviewComposerSubmitting = signal<boolean>(false);

    readonly displayReviews = computed(() => {
        const current = this.movie() as MovieDetailData | null;
        const reviews = current?.reviews;
        if (reviews && reviews.length > 0) {
            return reviews;
        }
        return [];
    });

    // Derived signal: related movies based on primary genre
    readonly relatedMovies = computed(() => {
        const current = this.movie();
        if (!current) return [];
        const primaryGenre = current.genre[0];
        return this.movieService.movies()
            .filter(m => m.id !== current.id && m.genre.includes(primaryGenre))
            .slice(0, 10);
    });

    constructor() {
        // React to route param changes
        this.route.paramMap.subscribe(params => {
            const tmdbId = params.get('tmdbId') ?? params.get('uuid');
            if (!tmdbId) {
                this.error.set('Invalid movie ID');
                this.loading.set(false);
                return;
            }
            this.fetchMovie(tmdbId);
        });
    }

    private fetchMovie(tmdbId: string): void {
        this.loading.set(true);
        this.error.set(null);
        this.aiSummary.set(null);
        this.aiSummaryError.set(null);
        this.aiSummaryLoading.set(false);
        this.reviewComposerOpen.set(false);
        this.reviewComposerError.set(null);
        this.reviewComposerRating.set(4);
        this.reviewComposerContent.set('');
        this.reviewComposerSubmitting.set(false);

        this.movieService.getMovieByTmdbId(tmdbId, true).subscribe({
            next: (movie: Movie) => {
                this.movie.set(movie);
                this.setInitialSummary(movie);
                this.loading.set(false);
            },
            error: (err: any) => {
                if (err instanceof HttpErrorResponse && err.status === 404) {
                    this.error.set('Movie not found. It might have been removed or the link is broken.');
                } else {
                    this.error.set('Failed to load movie details. Please try again later.');
                }
                this.loading.set(false);
                console.error('MovieDetailComponent error:', err);
            }
        });
    }

    generateAiSummary(): void {
        const currentMovie = this.movie() as MovieDetailData | null;
        if (!currentMovie || this.aiSummaryLoading()) {
            return;
        }

        const tmdbId = this.resolveTmdbId(currentMovie);
        if (!tmdbId) {
            this.aiSummaryError.set('This movie cannot be summarized right now.');
            return;
        }

        const reviews = this.displayReviews().map(review => ({
            rating: review.rating,
            content: review.content
        }));

        if (reviews.length === 0) {
            this.aiSummaryError.set('No reviews are available yet for AI summarization.');
            return;
        }

        this.aiSummaryLoading.set(true);
        this.aiSummaryError.set(null);

        this.requestAiSummary({
            movie_title: currentMovie.title,
            tmdb_id: tmdbId,
            reviews
        }).subscribe({
            next: (response) => {
                if (response.ok && response.summary) {
                    this.aiSummary.set(response.summary);
                    this.aiSummaryError.set(null);
                } else {
                    this.aiSummaryError.set('Failed to generate AI summary. Please try again.');
                }
                this.aiSummaryLoading.set(false);
            },
            error: () => {
                this.aiSummaryError.set('Failed to generate AI summary. Please try again.');
                this.aiSummaryLoading.set(false);
            }
        });
    }

    openReviewComposer(): void {
        this.reviewComposerOpen.set(true);
        this.reviewComposerError.set(null);
    }

    cancelReviewComposer(): void {
        if (this.reviewComposerSubmitting()) {
            return;
        }
        this.reviewComposerOpen.set(false);
        this.reviewComposerError.set(null);
        this.reviewComposerRating.set(4);
        this.reviewComposerContent.set('');
    }

    submitReview(): void {
        const content = this.reviewComposerContent().trim();
        const rating = this.reviewComposerRating();

        if (!content) {
            this.reviewComposerError.set('Please write a short review before submitting.');
            return;
        }

        if (rating < 1 || rating > 10) {
            this.reviewComposerError.set('Please choose a rating between 1 and 10.');
            return;
        }

        const currentMovie = this.movie();
        if (!currentMovie) {
            this.reviewComposerError.set('Movie details are not available yet.');
            return;
        }

        const tmdbId = this.resolveTmdbId(currentMovie);
        if (!tmdbId) {
            this.reviewComposerError.set('This movie cannot be reviewed right now.');
            return;
        }

        this.reviewComposerError.set(null);
        this.reviewComposerSubmitting.set(true);

        const payload: CreateReviewRequest = {
            tmdb_id: tmdbId,
            rating,
            content
        };

        this.movieService.createReview(payload).pipe(
            finalize(() => this.reviewComposerSubmitting.set(false))
        ).subscribe({
            next: (review) => {
                const detail = this.movie() as MovieDetailData | null;
                if (!detail) {
                    this.cancelReviewComposer();
                    return;
                }

                this.movie.set({
                    ...detail,
                    reviews: [
                        {
                            id: review.id,
                            rating: review.rating,
                            content: review.content,
                            created_at: review.created_at
                        },
                        ...(detail.reviews ?? [])
                    ]
                });
                this.cancelReviewComposer();
            },
            error: (err: HttpErrorResponse) => {
                const detailMessage = typeof err.error?.detail === 'string' ? err.error.detail : null;
                this.reviewComposerError.set(detailMessage || 'Failed to submit review. Please try again.');
            }
        });
    }

    setReviewComposerRating(rating: number): void {
        this.reviewComposerRating.set(rating);
    }

    autoResizeReviewComposer(event: Event): void {
        const textarea = event.target as HTMLTextAreaElement | null;
        if (!textarea) {
            return;
        }

        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 260)}px`;
    }

    starsForReview(rating: number): number[] {
        return Array.from({ length: Math.max(1, Math.min(5, Math.round(rating / 2))) }, (_, index) => index);
    }

    private setInitialSummary(movie: Movie): void {
        const detail = movie as MovieDetailData;
        const summary = detail.review_summary?.summary_text?.trim();
        this.aiSummary.set(summary || null);
    }

    private requestAiSummary(payload: AiSummaryRequest) {
        return this.http.post<AiSummaryResponse>(this.aiSummaryUrl, payload);
    }

    private resolveTmdbId(movie: Movie): number | null {
        const movieWithIds = movie as Movie & { tmdb_id?: number; id: string | number };
        if (typeof movieWithIds.tmdb_id === 'number' && Number.isFinite(movieWithIds.tmdb_id)) {
            return movieWithIds.tmdb_id;
        }

        if (typeof movieWithIds.id === 'number' && Number.isFinite(movieWithIds.id)) {
            return movieWithIds.id;
        }

        return null;
    }
}
