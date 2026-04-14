import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { MovieService } from '../../../core/services/movie.service';
import { CreateReviewRequest, Movie, MovieReview, StreamingService } from '../../../core/models/movie.models';
import { ScrollRevealDirective } from '../../../core/directives/scroll-reveal.directive';

interface MovieSummaryPayload {
    summary_text?: string;
}

interface MovieDetailData extends Movie {
    reviews?: MovieReview[];
    review_summary?: MovieSummaryPayload | null;
}

@Component({
    selector: 'app-movie-detail',
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule, ScrollRevealDirective],
    templateUrl: './movie-detail.component.html',
    styleUrls: ['./movie-detail.component.css']
})
export class MovieDetailComponent {
    readonly reviewsPerPage = 5;
    private readonly reviewPreviewLength = 280;
    private readonly tmdbAvatarBaseUrl = 'https://image.tmdb.org/t/p/w185';
    private readonly reviewExternalLinkPattern = /\b(?:https?:\/\/\S+|www\.\S+|(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|tv|app|dev|info|biz|me|gg|xyz)(?:\/\S*)?)/gi;
    private readonly reviewBadWordsPattern = /\b(?:asshole|bastard|bitch|bullshit|cunt|dick|douchebag|fuck|fucker|fucking|motherfucker|piss(?:ed)?\s*off|shit|slut|whore)\b/i;
    private readonly route = inject(ActivatedRoute);
    private readonly movieService = inject(MovieService);
    private readonly authService = inject(AuthService);

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
    readonly expandedReviews = signal<Record<string, boolean>>({});
    readonly reviewPage = signal<number>(1);
    readonly reviewEditingId = signal<number | null>(null);
    readonly reviewEditRating = signal<number>(4);
    readonly reviewEditContent = signal<string>('');
    readonly reviewEditError = signal<string | null>(null);
    readonly reviewEditSubmitting = signal<boolean>(false);
    private readonly regionNames =
        typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
            ? new Intl.DisplayNames(['en'], { type: 'region' })
            : null;

    readonly displayReviews = computed(() => {
        const current = this.movie() as MovieDetailData | null;
        const reviews = current?.reviews;
        if (reviews && reviews.length > 0) {
            return reviews;
        }
        return [];
    });

    readonly totalReviewPages = computed(() => Math.max(1, Math.ceil(this.displayReviews().length / this.reviewsPerPage)));

    readonly paginatedReviews = computed(() => {
        const startIndex = (this.reviewPage() - 1) * this.reviewsPerPage;
        return this.displayReviews().slice(startIndex, startIndex + this.reviewsPerPage);
    });

    readonly streamingServices = computed(() => {
        const current = this.movie() as MovieDetailData | null;
        return current?.streaming_services ?? [];
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

    getCountryLabel(countryCode?: string | null): string {
        const normalizedCode = countryCode?.trim().toUpperCase();
        if (!normalizedCode) {
            return 'your region';
        }

        return this.regionNames?.of(normalizedCode) ?? normalizedCode;
    }

    trackStreamingService(_index: number, service: StreamingService): string {
        return service.name;
    }

    nextReviewPage(): void {
        this.reviewPage.update((page) => Math.min(page + 1, this.totalReviewPages()));
    }

    previousReviewPage(): void {
        this.reviewPage.update((page) => Math.max(page - 1, 1));
    }

    getReviewAuthorName(review: MovieReview): string {
        if (review.author_details?.source === 'local') {
            return review.author_details.name?.trim() || 'CineMatch User';
        }

        return review.author_details?.name?.trim()
            || review.author_details?.username?.trim()
            || 'TMDB Reviewer';
    }

    getReviewSourceLabel(review: MovieReview): string {
        return review.author_details?.source === 'local' ? 'CineMatch user' : 'TMDB review';
    }

    isLocalReview(review: MovieReview): boolean {
        return review.author_details?.source === 'local';
    }

    getReviewRating(review: MovieReview): number {
        const topLevelRating = typeof review.rating === 'number' ? review.rating : null;
        if (topLevelRating !== null && Number.isFinite(topLevelRating)) {
            return this.normalizeReviewRating(topLevelRating);
        }

        const authorRating = typeof review.author_details?.rating === 'number' ? review.author_details.rating : null;
        if (authorRating !== null && Number.isFinite(authorRating)) {
            return this.normalizeReviewRating(authorRating);
        }

        return 0;
    }

    canEditReview(review: MovieReview): boolean {
        const currentUserId = this.authService.currentUser()?.id;
        return !!currentUserId
            && this.isLocalReview(review)
            && review.author_details?.user_id === currentUserId
            && typeof review.id === 'number';
    }

    isEditingReview(review: MovieReview): boolean {
        return typeof review.id === 'number' && this.reviewEditingId() === review.id;
    }

    openEditReview(review: MovieReview): void {
        if (!this.canEditReview(review) || typeof review.id !== 'number') {
            return;
        }

        this.reviewEditingId.set(review.id);
        this.reviewEditRating.set(Math.max(1, Math.min(10, Math.round(this.getReviewRating(review)))));
        this.reviewEditContent.set(review.content);
        this.reviewEditError.set(null);
    }

    cancelEditReview(force = false): void {
        if (!force && this.reviewEditSubmitting()) {
            return;
        }

        this.reviewEditingId.set(null);
        this.reviewEditRating.set(4);
        this.reviewEditContent.set('');
        this.reviewEditError.set(null);
    }

    saveEditedReview(review: MovieReview): void {
        if (!this.canEditReview(review) || typeof review.id !== 'number') {
            return;
        }

        const rawContent = this.reviewEditContent().trim();
        const content = this.sanitizeReviewContent(rawContent);
        const rating = this.reviewEditRating();

        if (!content) {
            this.reviewEditError.set('Please write a short review before saving.');
            return;
        }

        if (content.length < 10) {
            this.reviewEditError.set('Please write at least 10 characters after removing links.');
            return;
        }

        if (this.reviewBadWordsPattern.test(content)) {
            this.reviewEditError.set('Please remove inappropriate language from your review.');
            return;
        }

        if (rating < 1 || rating > 10) {
            this.reviewEditError.set('Please choose a rating between 1 and 10.');
            return;
        }

        if (content !== rawContent) {
            this.reviewEditContent.set(content);
        }

        this.reviewEditError.set(null);
        this.reviewEditSubmitting.set(true);

        this.movieService.updateReview(review.id, { rating, content }).pipe(
            finalize(() => this.reviewEditSubmitting.set(false))
        ).subscribe({
            next: (updatedReview) => {
                const detail = this.movie() as MovieDetailData | null;
                if (!detail?.reviews) {
                    this.cancelEditReview();
                    return;
                }

                this.movie.set({
                    ...detail,
                    reviews: detail.reviews.map((existingReview) => existingReview.id === review.id
                        ? {
                            ...existingReview,
                            rating: updatedReview.rating,
                            content: updatedReview.content,
                            created_at: updatedReview.created_at ?? existingReview.created_at,
                        }
                        : existingReview)
                });
                this.expandedReviews.set({});
                this.cancelEditReview(true);
            },
            error: (err: HttpErrorResponse) => {
                const detailMessage = typeof err.error?.detail === 'string' ? err.error.detail : null;
                this.reviewEditError.set(detailMessage || 'Failed to update review. Please try again.');
            }
        });
    }

    formatReviewTimestamp(review: MovieReview): string | null {
        const createdAt = review.created_at?.trim();
        return createdAt || null;
    }

    getReviewAvatarUrl(review: MovieReview): string | null {
        const avatarUrl = review.author_details?.avatar_url?.trim();
        if (avatarUrl) {
            return avatarUrl;
        }

        const avatarPath = review.author_details?.avatar_path?.trim();
        if (!avatarPath) {
            return null;
        }

        const normalizedPath = avatarPath.startsWith('/') ? avatarPath.slice(1) : avatarPath;
        if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) {
            return normalizedPath;
        }

        return `${this.tmdbAvatarBaseUrl}/${normalizedPath}`;
    }

    getReviewInitials(review: MovieReview): string {
        const initials = this.getReviewAuthorName(review)
            .split(' ')
            .filter(Boolean)
            .map((part) => part[0]?.toUpperCase())
            .slice(0, 2)
            .join('');

        return initials || 'CM';
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
        this.expandedReviews.set({});
        this.reviewPage.set(1);
        this.reviewEditingId.set(null);
        this.reviewEditRating.set(4);
        this.reviewEditContent.set('');
        this.reviewEditError.set(null);
        this.reviewEditSubmitting.set(false);

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

        if (this.displayReviews().length === 0) {
            this.aiSummaryError.set('No reviews are available yet for AI summarization.');
            return;
        }

        this.aiSummaryLoading.set(true);
        this.aiSummaryError.set(null);

        this.movieService.getMovieSummary(tmdbId).subscribe({
            next: (response) => {
                if (response.summary?.trim()) {
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
        const rawContent = this.reviewComposerContent().trim();
        const content = this.sanitizeReviewContent(rawContent);
        const rating = this.reviewComposerRating();

        if (!content) {
            this.reviewComposerError.set('Please write a short review before submitting.');
            return;
        }

        if (content.length < 10) {
            this.reviewComposerError.set('Please write at least 10 characters after removing links.');
            return;
        }

        if (this.reviewBadWordsPattern.test(content)) {
            this.reviewComposerError.set('Please remove inappropriate language from your review.');
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

        if (content !== rawContent) {
            this.reviewComposerContent.set(content);
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
                            created_at: review.created_at,
                            author_details: review.author_details ?? {
                                name: this.authService.currentUser()?.displayName ?? 'CineMatch User',
                                avatar_url: this.authService.currentUser()?.avatarUrl ?? null,
                                user_id: this.authService.currentUser()?.id ?? null,
                                source: 'local',
                            }
                        },
                        ...(detail.reviews ?? [])
                    ]
                });
                this.expandedReviews.set({});
                this.reviewPage.set(1);
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

    setReviewEditRating(rating: number): void {
        this.reviewEditRating.set(rating);
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
        return Array.from({ length: Math.max(1, Math.min(10, Math.round(this.normalizeReviewRating(rating)))) }, (_, index) => index);
    }

    getReviewContent(review: MovieReview, index: number): string {
        const content = this.sanitizeReviewForDisplay(review.content);
        if (!this.isReviewTruncated(review) || this.isReviewExpanded(review, index)) {
            return content;
        }

        return `${content.slice(0, this.reviewPreviewLength).trimEnd()}...`;
    }

    isReviewTruncated(review: MovieReview): boolean {
        return this.sanitizeReviewForDisplay(review.content).length > this.reviewPreviewLength;
    }

    isReviewExpanded(review: MovieReview, index: number): boolean {
        return this.expandedReviews()[this.reviewKey(review, index)] ?? false;
    }

    toggleReviewExpanded(review: MovieReview, index: number): void {
        const key = this.reviewKey(review, index);
        const expandedReviews = this.expandedReviews();

        this.expandedReviews.set({
            ...expandedReviews,
            [key]: !expandedReviews[key]
        });
    }

    private setInitialSummary(movie: Movie): void {
        const detail = movie as MovieDetailData & { summary?: string | null };
        const summary = detail.review_summary?.summary_text?.trim() ?? detail.summary?.trim();
        this.aiSummary.set(summary || null);
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

    private reviewKey(review: MovieReview, index: number): string {
        if (typeof review.id === 'number') {
            return `review-${review.id}`;
        }

        const author = review.author_details?.user_id ?? review.author_details?.username ?? review.author_details?.name ?? 'anonymous';
        return `review-${author}-${review.created_at ?? 'undated'}-${index}`;
    }

    private sanitizeReviewContent(content: string): string {
        return content
            .replace(this.reviewExternalLinkPattern, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private sanitizeReviewForDisplay(content: string): string {
        return this.sanitizeReviewContent(content).replace(this.reviewBadWordsPattern, (match) => '*'.repeat(match.length));
    }

    private normalizeReviewRating(rating: number): number {
        const normalized = rating > 10 ? rating / 10 : rating;
        return Math.max(0, Math.min(10, normalized));
    }
}
