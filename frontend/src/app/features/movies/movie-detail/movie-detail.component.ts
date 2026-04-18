import { Component, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { MovieService } from '../../../core/services/movie.service';
import { UserPreferenceService } from '../../../core/services/user-preference.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import {
    CreateReviewRequest,
    Movie,
    MovieReview,
    ProductionCompany,
    ProductionCountry,
    SpokenLanguage,
    StreamingService,
} from '../../../core/models/movie.models';
import { ScrollRevealDirective } from '../../../core/directives/scroll-reveal.directive';

interface MovieSummaryPayload {
    summary_text?: string;
}

interface MovieDetailData extends Movie {
    reviews?: MovieReview[];
    review_summary?: MovieSummaryPayload | null;
}

interface MediaCard {
    kind: 'trailer' | 'image';
    label: string;
    imageUrl: string;
    trailerUrl?: string;
}

@Component({
    selector: 'app-movie-detail',
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule, ScrollRevealDirective],
    templateUrl: './movie-detail.component.html',
    styleUrls: ['./movie-detail.component.css']
})
export class MovieDetailComponent implements OnDestroy {
    readonly reviewsPerPage = 5;
    private readonly reviewPreviewLength = 280;
    private readonly tmdbAvatarBaseUrl = 'https://image.tmdb.org/t/p/w185';
    private readonly reviewExternalLinkPattern = /\b(?:https?:\/\/\S+|www\.\S+|(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|tv|app|dev|info|biz|me|gg|xyz)(?:\/\S*)?)/gi;
    private readonly reviewBadWordsPattern = /\b(?:asshole|bastard|bitch|bullshit|cunt|dick|douchebag|fuck|fucker|fucking|motherfucker|piss(?:ed)?\s*off|shit|slut|whore)\b/i;
    private readonly route = inject(ActivatedRoute);
    private readonly movieService = inject(MovieService);
    private readonly authService = inject(AuthService);
    private readonly userPreferenceService = inject(UserPreferenceService);
    private readonly watchlistService = inject(WatchlistService);
    private readonly sanitizer = inject(DomSanitizer);
    private readonly document = inject(DOCUMENT);
    private previousBodyOverflow = '';
    private previousDocumentOverflow = '';

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
    readonly mediaModalOpen = signal<boolean>(false);
    readonly mediaModalKind = signal<'trailer' | 'image'>('trailer');
    readonly mediaModalUrl = signal<SafeResourceUrl | string | null>(null);
    readonly mediaModalTitle = signal<string>('Trailer');
    readonly likeLoading = signal<boolean>(false);
    readonly likeError = signal<string | null>(null);
    readonly isLiked = signal<boolean>(false);
    readonly listLoading = signal<boolean>(false);
    readonly listError = signal<string | null>(null);
    readonly isInMyList = signal<boolean>(false);
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

    readonly mediaCards = computed<MediaCard[]>(() => {
        const current = this.movie();
        if (!current) {
            return [];
        }

        const cards: MediaCard[] = [];
        if (current.trailer) {
            cards.push({
                kind: 'trailer',
                label: 'Official Trailer',
                imageUrl: current.backdropUrl || current.posterUrl,
                trailerUrl: current.trailer,
            });
        }

        const seenImages = new Set<string>();
        const imageCandidates = [
            { label: 'Backdrop Still', imageUrl: current.backdropUrl || '' },
            { label: 'Poster Art', imageUrl: current.posterUrl || '' },
        ];

        for (const candidate of imageCandidates) {
            if (!candidate.imageUrl || seenImages.has(candidate.imageUrl)) {
                continue;
            }
            seenImages.add(candidate.imageUrl);
            cards.push({
                kind: 'image',
                label: candidate.label,
                imageUrl: candidate.imageUrl,
            });
        }

        return cards;
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

    readonly canLikeMovie = computed(() => this.authService.isAuthenticated() && !!this.movie());
    readonly heroAiMatchScore = computed(() => {
        const currentMovie = this.movie();
        if (!currentMovie) {
            return 0;
        }

        if (
            typeof currentMovie.aiMatchScore === 'number'
            && Number.isFinite(currentMovie.aiMatchScore)
        ) {
            return Math.round(Math.max(0, Math.min(currentMovie.aiMatchScore, 100)));
        }

        const tmdbId = this.resolveTmdbId(currentMovie);
        const recommendationMatch = this.movieService
            .recommendations()
            .find((entry) => {
                const recommendationTmdbId = this.resolveTmdbId(entry);
                return recommendationTmdbId !== null && recommendationTmdbId === tmdbId;
            });

        if (
            recommendationMatch
            && typeof recommendationMatch.aiMatchScore === 'number'
            && Number.isFinite(recommendationMatch.aiMatchScore)
        ) {
            return Math.round(Math.max(0, Math.min(recommendationMatch.aiMatchScore, 100)));
        }

        return Math.round(Math.max(0, Math.min(currentMovie.rating * 10, 100)));
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

    ngOnDestroy(): void {
        this.unlockTrailerModalScroll();
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

    getProductionStudios(movie: Movie | null): string {
        const companies = movie?.production_companies ?? [];
        const names = companies
            .map((company: ProductionCompany) => company.name?.trim())
            .filter((name): name is string => !!name);

        return names.length > 0 ? names.slice(0, 2).join(' / ') : 'Not available';
    }

    getProductionCountries(movie: Movie | null): string {
        const countries = movie?.production_countries ?? [];
        const names = countries
            .map((country: ProductionCountry) => country.name?.trim())
            .filter((name): name is string => !!name);

        return names.length > 0 ? names.slice(0, 3).join(' / ') : 'Not available';
    }

    getSpokenLanguages(movie: Movie | null): string {
        const languages = movie?.spoken_languages ?? [];
        const names = languages
            .map((language: SpokenLanguage) => language.english_name?.trim() || language.name?.trim())
            .filter((name): name is string => !!name);

        return names.length > 0 ? names.slice(0, 3).join(' / ') : 'Not available';
    }

    isTrailerCard(card: MediaCard): boolean {
        return card.kind === 'trailer' && !!card.trailerUrl;
    }

    openMedia(card: MediaCard): void {
        if (this.isTrailerCard(card) && card.trailerUrl) {
            const embedUrl = this.buildYouTubeEmbedUrl(card.trailerUrl);
            if (!embedUrl) {
                return;
            }

            this.mediaModalKind.set('trailer');
            this.mediaModalTitle.set(card.label);
            this.mediaModalUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl));
            this.mediaModalOpen.set(true);
            this.lockTrailerModalScroll();
            return;
        }

        if (card.kind !== 'image' || !card.imageUrl) {
            return;
        }

        this.mediaModalKind.set('image');
        this.mediaModalTitle.set(card.label);
        this.mediaModalUrl.set(card.imageUrl);
        this.mediaModalOpen.set(true);
        this.lockTrailerModalScroll();
    }

    closeMediaModal(): void {
        this.mediaModalOpen.set(false);
        this.mediaModalUrl.set(null);
        this.unlockTrailerModalScroll();
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

    getActorProfileUrl(profilePath: string | null | undefined): string | null {
        if (!profilePath) {
            return null;
        }
        const normalizedPath = profilePath.startsWith('/') ? profilePath.slice(1) : profilePath;
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
        this.closeMediaModal();
        this.likeLoading.set(false);
        this.likeError.set(null);
        this.isLiked.set(false);
        this.listLoading.set(false);
        this.listError.set(null);
        this.isInMyList.set(false);

        this.movieService.getMovieByTmdbId(tmdbId, true).subscribe({
            next: (movie: Movie) => {
                this.movie.set(movie);
                this.setInitialSummary(movie);
                
                // Directly set signals from the movie object to avoid delays
                if (movie.isLiked !== undefined) {
                    this.isLiked.set(movie.isLiked);
                }
                if (movie.isInMyList !== undefined) {
                    this.isInMyList.set(movie.isInMyList);
                }

                this.loading.set(false);
                this.loadMoviePreferenceStatus(movie);
                this.loadWatchlistStatus(movie);
                this.loadRecommendationScoreContext();
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

    private loadRecommendationScoreContext(): void {
        if (!this.authService.isAuthenticated()) {
            return;
        }

        this.movieService.getPersonalizedRecommendations(false).subscribe({
            error: () => {
                // The hero badge already has a deterministic fallback.
            }
        });
    }

    toggleLikedMovie(): void {
        const currentMovie = this.movie();
        if (!currentMovie || this.likeLoading()) {
            return;
        }

        if (!this.authService.isAuthenticated()) {
            this.likeError.set('Please sign in to save movies to your taste profile.');
            return;
        }

        const tmdbId = this.resolveTmdbId(currentMovie);
        if (!tmdbId) {
            this.likeError.set('This movie cannot be added to your profile right now.');
            return;
        }

        this.likeLoading.set(true);
        this.likeError.set(null);

        if (this.isLiked()) {
            this.userPreferenceService.removeChosenMovie(tmdbId).pipe(
                finalize(() => this.likeLoading.set(false)),
            ).subscribe({
                next: () => {
                    this.isLiked.set(false);
                },
                error: (err: HttpErrorResponse) => {
                    const detailMessage = typeof err.error?.detail === 'string' ? err.error.detail : null;
                    this.likeError.set(detailMessage || 'Failed to update your profile. Please try again.');
                },
            });
            return;
        }

        this.userPreferenceService.addChosenMovie(tmdbId).pipe(
            finalize(() => this.likeLoading.set(false)),
        ).subscribe({
            next: () => {
                this.isLiked.set(true);
            },
            error: (err: HttpErrorResponse) => {
                const detailMessage = typeof err.error?.detail === 'string' ? err.error.detail : null;
                this.likeError.set(detailMessage || 'Failed to update your profile. Please try again.');
            },
        });
    }

    toggleMyList(): void {
        const currentMovie = this.movie();
        if (!currentMovie || this.listLoading()) {
            return;
        }

        if (!this.authService.isAuthenticated()) {
            this.listError.set('Please sign in to manage your list.');
            return;
        }

        const tmdbId = this.resolveTmdbId(currentMovie);
        if (!tmdbId) {
            this.listError.set('This movie cannot be added to your list right now.');
            return;
        }

        this.listLoading.set(true);
        this.listError.set(null);

        if (this.isInMyList()) {
            this.watchlistService.removeMovie(tmdbId).pipe(
                finalize(() => this.listLoading.set(false)),
            ).subscribe({
                next: () => {
                    this.isInMyList.set(false);
                },
                error: (err: HttpErrorResponse) => {
                    const detailMessage = typeof err.error?.message === 'string'
                        ? err.error.message
                        : typeof err.error?.detail === 'string'
                            ? err.error.detail
                            : null;
                    this.listError.set(detailMessage || 'Failed to update your list. Please try again.');
                },
            });
            return;
        }

        this.watchlistService.addMovie(tmdbId).pipe(
            finalize(() => this.listLoading.set(false)),
        ).subscribe({
            next: () => {
                this.isInMyList.set(true);
            },
            error: (err: HttpErrorResponse) => {
                const detailMessage = typeof err.error?.message === 'string'
                    ? err.error.message
                    : typeof err.error?.detail === 'string'
                        ? err.error.detail
                        : null;
                this.listError.set(detailMessage || 'Failed to update your list. Please try again.');
            },
        });
    }

    shareMovie(): void {
        const currentMovie = this.movie();
        if (!currentMovie) {
            return;
        }

        const shareUrl = this.document.defaultView?.location.href ?? '';
        const shareData = {
            title: currentMovie.title,
            text: `Check out ${currentMovie.title} on CineMatch`,
            url: shareUrl,
        };

        const navigatorRef = this.document.defaultView?.navigator;
        if (navigatorRef && 'share' in navigatorRef && typeof navigatorRef.share === 'function') {
            navigatorRef.share(shareData).catch(() => undefined);
            return;
        }

        if (navigatorRef?.clipboard?.writeText) {
            navigatorRef.clipboard.writeText(shareUrl).catch(() => undefined);
        }
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

    private loadMoviePreferenceStatus(movie: Movie): void {
        if (!this.authService.isAuthenticated()) {
            this.isLiked.set(false);
            return;
        }

        if (movie.isLiked !== undefined) {
            this.isLiked.set(movie.isLiked);
            return;
        }

        const tmdbId = this.resolveTmdbId(movie);
        if (!tmdbId) {
            this.isLiked.set(false);
            return;
        }

        this.userPreferenceService.checkMoviePreference(tmdbId).subscribe({
            next: (status) => {
                this.isLiked.set(!!status.is_liked);
            },
            error: () => {
                this.isLiked.set(false);
            },
        });
    }

    private loadWatchlistStatus(movie: Movie): void {
        if (!this.authService.isAuthenticated()) {
            this.isInMyList.set(false);
            return;
        }

        if (movie.isInMyList !== undefined) {
            this.isInMyList.set(movie.isInMyList);
            return;
        }

        const tmdbId = this.resolveTmdbId(movie);
        if (!tmdbId) {
            this.isInMyList.set(false);
            return;
        }

        this.watchlistService.checkMovie(tmdbId).subscribe({
            next: (status) => {
                this.isInMyList.set(!!status.is_in_list);
            },
            error: () => {
                this.isInMyList.set(false);
            },
        });
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

    private buildYouTubeEmbedUrl(trailerUrl: string): string | null {
        try {
            const url = new URL(trailerUrl);
            const host = url.hostname.replace(/^www\./, '');
            let videoId = '';

            if (host === 'youtube.com' || host === 'm.youtube.com') {
                videoId = url.searchParams.get('v') ?? '';
            } else if (host === 'youtu.be') {
                videoId = url.pathname.replace('/', '');
            }

            if (!videoId) {
                return null;
            }

            return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
        } catch {
            return null;
        }
    }

    private lockTrailerModalScroll(): void {
        this.previousBodyOverflow = this.document.body.style.overflow;
        this.previousDocumentOverflow = this.document.documentElement.style.overflow;
        this.document.body.style.overflow = 'hidden';
        this.document.documentElement.style.overflow = 'hidden';
    }

    private unlockTrailerModalScroll(): void {
        this.document.body.style.overflow = this.previousBodyOverflow;
        this.document.documentElement.style.overflow = this.previousDocumentOverflow;
    }
}
