import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { provideHttpClient } from '@angular/common/http';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MovieDetailComponent } from './movie-detail.component';
import { AuthService } from '../../../core/services/auth.service';
import { MovieService } from '../../../core/services/movie.service';
import { Movie } from '../../../core/models/movie.models';

describe('MovieDetailComponent', () => {
    let component: MovieDetailComponent;
    let fixture: ComponentFixture<MovieDetailComponent>;
    let mockMovieService: any;
    let mockAuthService: any;
    let mockActivatedRoute: any;
    let mockMoviesSignal: ReturnType<typeof signal<Movie[]>>;

    const mockMovie: Movie = {
        id: 123,
        tmdb_id: 123,
        title: 'Detail Movie',
        description: 'Detail Desc',
        posterUrl: 'detail.jpg',
        releaseDate: '2024-01-01',
        rating: 9.5,
        genre: ['Sci-Fi'],
        director: 'Detail Dir',
        cast: ['Actor 1'],
        durationMinutes: 150,
        country_code: 'US',
        streaming_services: [
            {
                name: 'Netflix',
                logo_path: 'https://image.tmdb.org/t/p/original/netflix.png'
            }
        ]
    };

    beforeEach(async () => {
        mockMoviesSignal = signal<Movie[]>([]);
        mockMovieService = {
            movies: mockMoviesSignal.asReadonly(),
            getMovieFromState: vi.fn().mockReturnValue(undefined),
            getMovieByTmdbId: vi.fn().mockReturnValue(of(mockMovie)),
            createReview: vi.fn(),
            updateReview: vi.fn(),
        };
        mockAuthService = {
            currentUser: signal({
                id: 'user-1',
                email: 'user@example.com',
                displayName: 'Test User',
                avatarUrl: 'https://cdn.example.com/avatar.jpg'
            }).asReadonly()
        };

        mockActivatedRoute = {
            paramMap: of(convertToParamMap({ tmdbId: '123' }))
        };

        await TestBed.configureTestingModule({
            imports: [MovieDetailComponent],
            providers: [
                provideHttpClient(),
                provideRouter([]),
                { provide: AuthService, useValue: mockAuthService },
                { provide: MovieService, useValue: mockMovieService },
                { provide: ActivatedRoute, useValue: mockActivatedRoute }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(MovieDetailComponent);
        component = fixture.componentInstance;
    });

    it('should create', () => {
        fixture.detectChanges();
        expect(component).toBeTruthy();
    });

    it('should display loading state initially', () => {
        const pendingSubject = new Subject<Movie>();
        mockMovieService.getMovieByTmdbId.mockReturnValue(pendingSubject.asObservable());

        fixture.detectChanges();

        const loader = fixture.debugElement.query(By.css('.loading-state'));
        expect(loader).toBeTruthy();
        expect(loader.nativeElement.textContent).toContain('Loading movie details');
    });

    it('should fetch movie data and display details', () => {
        fixture.detectChanges(); // Triggers ngOnInit

        expect(mockMovieService.getMovieByTmdbId).toHaveBeenCalledWith('123', true);
        expect(component.loading()).toBe(false);
        expect(component.movie()).toEqual(mockMovie);

        const title = fixture.debugElement.query(By.css('.detail-hero__title'));
        expect(title.nativeElement.textContent).toContain('Detail Movie');

        const rating = fixture.debugElement.query(By.css('.rating'));
        expect(rating.nativeElement.textContent).toContain('9.5');

        const metaTag = fixture.debugElement.query(By.css('.meta-tag'));
        expect(metaTag).toBeNull();

        const metaItems = fixture.debugElement.queryAll(By.css('.detail-hero__meta .meta-item'));
        expect(metaItems[1].nativeElement.textContent).toContain('150 min');

        const providerNote = fixture.debugElement.query(By.css('.provider-note'));
        expect(providerNote.nativeElement.textContent).toContain('United States');

        const providerChip = fixture.debugElement.query(By.css('.provider-chip'));
        expect(providerChip.nativeElement.textContent).toContain('Netflix');
    });

    it('should render the AI summary section before user reviews', () => {
        const movieWithSummary: Movie = {
            ...mockMovie,
            review_summary: {
                summary_text: 'A sharp consensus summary.'
            }
        };
        mockMovieService.getMovieByTmdbId.mockReturnValue(of(movieWithSummary));

        fixture.detectChanges();

        const aiSummarySection = fixture.debugElement.query(By.css('#ai-summary'));
        const userReviewsHeading = fixture.debugElement.queryAll(By.css('.detail-heading'))
            .find((heading) => heading.nativeElement.textContent.trim() === 'User Reviews');
        const userReviewsSection = userReviewsHeading?.nativeElement.closest('.detail-block');

        expect(aiSummarySection).toBeTruthy();
        expect(userReviewsHeading).toBeTruthy();
        expect(userReviewsSection).toBeTruthy();
        expect(component.aiSummary()).toBe('A sharp consensus summary.');

        expect(
            aiSummarySection.nativeElement.compareDocumentPosition(userReviewsSection)
                & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
    });

    it('should collapse long reviews behind a read more button', () => {
        const longReview = 'A'.repeat(320);
        const movieWithReviews: Movie = {
            ...mockMovie,
            reviews: [
                {
                    id: 77,
                    rating: 8,
                    content: longReview
                }
            ]
        };
        mockMovieService.getMovieByTmdbId.mockReturnValue(of(movieWithReviews));

        fixture.detectChanges();

        const reviewBody = fixture.debugElement.query(By.css('.review-body'));
        const readMoreButton = fixture.debugElement.query(By.css('.review-read-more'));

        expect(readMoreButton.nativeElement.textContent).toContain('Read more');
        expect(reviewBody.nativeElement.textContent.length).toBeLessThan(longReview.length);

        readMoreButton.nativeElement.click();
        fixture.detectChanges();

        expect(reviewBody.nativeElement.textContent).toContain(longReview);
    });

    it('should sanitize fetched review content before rendering', () => {
        const movieWithReviews: Movie = {
            ...mockMovie,
            reviews: [
                {
                    id: 88,
                    rating: 8,
                    content: 'Visit https://spam.example.com because this fucking review should be cleaned.',
                    author_details: {
                        name: 'TMDB Critic',
                        source: 'tmdb'
                    }
                }
            ]
        };
        mockMovieService.getMovieByTmdbId.mockReturnValue(of(movieWithReviews));

        fixture.detectChanges();

        const reviewBody = fixture.debugElement.query(By.css('.review-body'));
        expect(reviewBody.nativeElement.textContent).not.toContain('https://spam.example.com');
        expect(reviewBody.nativeElement.textContent.toLowerCase()).not.toContain('fucking');
        expect(reviewBody.nativeElement.textContent).toContain('*******');
    });

    it('should render review author metadata for tmdb and local users', () => {
        const movieWithReviews: Movie = {
            ...mockMovie,
            reviews: [
                {
                    id: 1,
                    rating: 9,
                    content: 'Strong TMDB review.',
                    author_details: {
                        name: 'TMDB Critic',
                        source: 'tmdb'
                    }
                },
                {
                    id: 2,
                    rating: 8,
                    content: 'Strong local review.',
                    created_at: '2026-04-14T12:00:00Z',
                    author_details: {
                        name: 'Real User',
                        avatar_url: 'https://cdn.example.com/user.jpg',
                        source: 'local',
                        user_id: 'user-1'
                    }
                }
            ]
        };
        mockMovieService.getMovieByTmdbId.mockReturnValue(of(movieWithReviews));

        fixture.detectChanges();

        const reviewNames = fixture.debugElement.queryAll(By.css('.review-name'));
        const reviewSources = fixture.debugElement.queryAll(By.css('.review-source'));
        const reviewTimes = fixture.debugElement.queryAll(By.css('.review-time'));
        expect(reviewNames[0].nativeElement.textContent).toContain('TMDB Critic');
        expect(reviewSources[0].nativeElement.textContent).toContain('TMDB review');
        expect(reviewNames[1].nativeElement.textContent).toContain('Real User');
        expect(reviewSources[1].nativeElement.textContent).toContain('CineMatch user');
        expect(reviewTimes[0].nativeElement.textContent).toContain('Apr');
    });

    it('should paginate reviews in groups of five', () => {
        const reviews = Array.from({ length: 6 }, (_, index) => ({
            id: index + 1,
            rating: 8,
            content: `Review ${index + 1}`,
            author_details: {
                name: `Reviewer ${index + 1}`,
                source: index % 2 === 0 ? 'tmdb' : 'local',
                user_id: index % 2 === 0 ? undefined : 'user-1'
            }
        }));
        mockMovieService.getMovieByTmdbId.mockReturnValue(of({
            ...mockMovie,
            reviews
        }));

        fixture.detectChanges();

        expect(fixture.debugElement.queryAll(By.css('.review-card')).length).toBe(5);
        const nextButton = fixture.debugElement.queryAll(By.css('.review-pagination__button'))[1];
        nextButton.nativeElement.click();
        fixture.detectChanges();

        expect(component.reviewPage()).toBe(2);
        expect(fixture.debugElement.queryAll(By.css('.review-card')).length).toBe(1);
    });

    it('should show edit button only for the signed-in user review', () => {
        const movieWithReviews: Movie = {
            ...mockMovie,
            reviews: [
                {
                    id: 4,
                    rating: 8,
                    content: 'Owned review.',
                    author_details: {
                        name: 'Test User',
                        source: 'local',
                        user_id: 'user-1'
                    }
                },
                {
                    id: 5,
                    rating: 7,
                    content: 'Another local review.',
                    author_details: {
                        name: 'Another User',
                        source: 'local',
                        user_id: 'user-2'
                    }
                }
            ]
        };
        mockMovieService.getMovieByTmdbId.mockReturnValue(of(movieWithReviews));

        fixture.detectChanges();

        const editButtons = fixture.debugElement.queryAll(By.css('.review-edit'));
        expect(editButtons.length).toBe(1);
        expect(editButtons[0].nativeElement.textContent).toContain('Edit');
    });

    it('should update an owned review', () => {
        const movieWithReviews: Movie = {
            ...mockMovie,
            reviews: [
                {
                    id: 6,
                    rating: 8,
                    content: 'Original review content.',
                    author_details: {
                        name: 'Test User',
                        source: 'local',
                        user_id: 'user-1'
                    }
                }
            ]
        };
        mockMovieService.getMovieByTmdbId.mockReturnValue(of(movieWithReviews));
        mockMovieService.updateReview.mockReturnValue(of({
            id: 6,
            tmdb_id: 123,
            rating: 9,
            content: 'Updated review content.',
            created_at: '2026-04-14T13:00:00Z'
        }));

        fixture.detectChanges();

        component.openEditReview(movieWithReviews.reviews![0]);
        component.reviewEditRating.set(9);
        component.reviewEditContent.set('Updated review content.');
        component.saveEditedReview(movieWithReviews.reviews![0]);

        expect(mockMovieService.updateReview).toHaveBeenCalledWith(6, {
            rating: 9,
            content: 'Updated review content.'
        });
    });

    it('should navigate back to the movie list correctly', () => {
        fixture.detectChanges();

        const backLink = fixture.debugElement.query(By.css('.back-link'));
        expect(backLink.attributes['routerLink']).toBe('/movies');
    });

    it('should block review submission when profanity is present', () => {
        fixture.detectChanges();
        component.reviewComposerContent.set('This movie was fucking bad.');
        component.reviewComposerRating.set(7);

        component.submitReview();

        expect(component.reviewComposerError()).toContain('inappropriate language');
        expect(mockMovieService.createReview).not.toHaveBeenCalled();
    });

    it('should strip external links before submitting a review', () => {
        mockMovieService.createReview.mockReturnValue(of({
            id: 91,
            rating: 8,
            content: 'This movie is absolutely worth your time.',
            created_at: '2026-04-14T12:00:00Z'
        }));
        fixture.detectChanges();
        component.reviewComposerContent.set('This movie is https://spam.example.com absolutely worth your time.');
        component.reviewComposerRating.set(8);

        component.submitReview();

        expect(mockMovieService.createReview).toHaveBeenCalledWith({
            tmdb_id: 123,
            rating: 8,
            content: 'This movie is absolutely worth your time.'
        });
    });

    it('should display a specific 404 error if API returns 404', () => {
        const errorResponse = new HttpErrorResponse({ status: 404 });
        mockMovieService.getMovieByTmdbId.mockReturnValue(throwError(() => errorResponse));

        fixture.detectChanges(); // Triggers ngOnInit

        expect(component.loading()).toBe(false);
        expect(component.error()).toContain('Movie not found');

        const errorDisplay = fixture.debugElement.query(By.css('.error-state .error-message'));
        expect(errorDisplay.nativeElement.textContent).toContain('Movie not found');
    });

    it('should display an invalid ID error if no TMDB id is in route', async () => {
        mockActivatedRoute = {
            paramMap: of(convertToParamMap({}))
        };

        await TestBed.resetTestingModule();
        await TestBed.configureTestingModule({
            imports: [MovieDetailComponent],
            providers: [
                provideHttpClient(),
                provideRouter([]),
                { provide: AuthService, useValue: mockAuthService },
                { provide: MovieService, useValue: mockMovieService },
                { provide: ActivatedRoute, useValue: mockActivatedRoute }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(MovieDetailComponent);
        component = fixture.componentInstance;
        fixture.detectChanges(); // Triggers ngOnInit

        expect(component.loading()).toBe(false);
        expect(component.error()).toBe('Invalid movie ID');
    });
});
