import { Component, ElementRef, HostListener, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, timeout } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { MovieService } from '../../services/movie.service';
import { Movie, TmdbMovie } from '../../models/movie.models';

@Component({
    selector: 'app-topbar',
    standalone: true,
    imports: [CommonModule, RouterLink, RouterLinkActive],
    templateUrl: './topbar.html',
    styleUrl: './topbar.css'
})
export class TopbarComponent implements OnDestroy {
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);
    private readonly movieService = inject(MovieService);
    private readonly aiSearchPageSize = 5;
    private activeSearchSubscription: Subscription | null = null;
    private latestSearchQuery = '';
    @ViewChild('profileMenu') private readonly profileMenu?: ElementRef<HTMLDetailsElement>;
    @ViewChild('searchPanel') private readonly searchPanel?: ElementRef<HTMLElement>;

    readonly isAuthenticated = this.auth.isAuthenticated;
    readonly user = this.auth.currentUser;
    readonly aiSearchQuery = signal('');
    readonly aiSearchAllResults = signal<Movie[]>([]);
    readonly aiSearchLoading = signal(false);
    readonly aiSearchResults = signal<Movie[]>([]);
    readonly aiSearchError = signal<string | null>(null);
    readonly aiSearchNoMoreSuggestions = signal(false);
    readonly aiSearchResultsOffset = signal(0);
    readonly isSearchOpen = signal(false);

    getAvatarInitials(): string {
        const name = this.user()?.displayName ?? '';
        const initials = name
            .split(' ')
            .filter(Boolean)
            .map((part) => part[0]?.toUpperCase())
            .slice(0, 2)
            .join('');

        return initials || 'CM';
    }

    onSearchInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.aiSearchQuery.set(value);
        this.aiSearchError.set(null);

        if (!this.isAuthenticated()) {
            this.aiSearchResults.set([]);
            this.isSearchOpen.set(false);
            return;
        }

        const trimmedValue = value.trim();
        if (!trimmedValue) {
            this.resetSearchState();
            return;
        }

        this.cancelActiveSearch();
        this.latestSearchQuery = '';
        this.aiSearchAllResults.set([]);
        this.aiSearchLoading.set(false);
        this.aiSearchNoMoreSuggestions.set(false);
        this.aiSearchResults.set([]);
        this.aiSearchResultsOffset.set(0);
        this.isSearchOpen.set(false);
    }

    onSearchFocus(): void {
        if (this.aiSearchQuery().trim() && this.isAuthenticated() && !!this.latestSearchQuery) {
            this.isSearchOpen.set(true);
        }
    }

    onSearchSubmit(event: Event): void {
        event.preventDefault();

        const query = this.aiSearchQuery().trim();
        if (!query || !this.isAuthenticated()) {
            return;
        }

        this.runSearch(query);
    }

    showOtherSuggestions(): void {
        const allResults = this.aiSearchAllResults();
        const nextOffset = this.aiSearchResultsOffset() + this.aiSearchPageSize;
        if (nextOffset >= allResults.length) {
            this.aiSearchNoMoreSuggestions.set(true);
            return;
        }

        this.aiSearchResultsOffset.set(nextOffset);
        this.aiSearchResults.set(this.getResultsPage(nextOffset));
        this.aiSearchNoMoreSuggestions.set(nextOffset + this.aiSearchPageSize >= allResults.length);
    }

    showPreviousSuggestions(): void {
        const previousOffset = Math.max(this.aiSearchResultsOffset() - this.aiSearchPageSize, 0);
        this.aiSearchResultsOffset.set(previousOffset);
        this.aiSearchResults.set(this.getResultsPage(previousOffset));
        this.aiSearchNoMoreSuggestions.set(false);
    }

    hasMoreSuggestions(): boolean {
        return this.aiSearchResultsOffset() + this.aiSearchPageSize < this.aiSearchAllResults().length;
    }

    hasPreviousSuggestions(): boolean {
        return this.aiSearchResultsOffset() > 0;
    }

    currentSuggestionsPage(): number {
        return Math.floor(this.aiSearchResultsOffset() / this.aiSearchPageSize) + 1;
    }

    totalSuggestionsPages(): number {
        const totalResults = this.aiSearchAllResults().length;
        return totalResults ? Math.ceil(totalResults / this.aiSearchPageSize) : 1;
    }

    clearSearch(): void {
        this.cancelActiveSearch();
        this.aiSearchQuery.set('');
        this.resetSearchState();
    }

    openMovie(movieId: number): void {
        this.router.navigate(['/movies', movieId]);
        this.clearSearch();
    }

    onLogout(): void {
        this.auth.logout();
        this.clearSearch();
        this.router.navigate(['/']);
    }

    closeProfileMenu(): void {
        if (this.profileMenu?.nativeElement?.open) {
            this.profileMenu.nativeElement.open = false;
        }
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const menu = this.profileMenu?.nativeElement;
        const target = event.target as Node;
        if (menu?.open && !menu.contains(target)) {
            menu.open = false;
        }

        const searchPanel = this.searchPanel?.nativeElement;
        if (searchPanel && !searchPanel.contains(target)) {
            this.isSearchOpen.set(false);
        }
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        this.closeProfileMenu();
        this.isSearchOpen.set(false);
    }

    ngOnDestroy(): void {
        this.cancelActiveSearch();
    }

    private runSearch(query: string): void {
        this.cancelActiveSearch();
        this.latestSearchQuery = query;
        this.aiSearchLoading.set(true);
        this.aiSearchError.set(null);
        this.isSearchOpen.set(true);

        this.activeSearchSubscription = this.movieService.aiSearch({ prompt: query }).pipe(
            timeout(30000)
        ).subscribe({
            next: (response) => {
                if (query !== this.latestSearchQuery) {
                    return;
                }

                if (response.status === 'fallback') {
                    this.aiSearchAllResults.set([]);
                    this.aiSearchNoMoreSuggestions.set(false);
                    this.aiSearchResults.set([]);
                    this.aiSearchResultsOffset.set(0);
                    this.aiSearchLoading.set(false);
                    return;
                }

                const movies = response.movies.map((movie) => this.mapSearchMovie(movie));
                this.aiSearchAllResults.set(movies);
                this.aiSearchResultsOffset.set(0);
                this.aiSearchNoMoreSuggestions.set(false);
                this.aiSearchResults.set(this.getResultsPage(0));
                this.aiSearchLoading.set(false);
            },
            error: (error: unknown) => {
                if (query !== this.latestSearchQuery) {
                    return;
                }

                this.aiSearchAllResults.set([]);
                this.aiSearchNoMoreSuggestions.set(false);
                this.aiSearchResults.set([]);
                this.aiSearchResultsOffset.set(0);
                this.aiSearchLoading.set(false);
            }
        });
    }

    private mapSearchMovie(movie: Movie | TmdbMovie): Movie {
        if ('description' in movie) {
            return movie;
        }

        const imageBaseUrl = 'https://image.tmdb.org/t/p';
        return {
            id: movie.id,
            tmdb_id: movie.id,
            title: movie.title,
            description: movie.overview || 'No synopsis available yet.',
            posterUrl: movie.poster_path ? `${imageBaseUrl}/w780${movie.poster_path}` : '',
            backdropUrl: movie.backdrop_path ? `${imageBaseUrl}/w1280${movie.backdrop_path}` : '',
            releaseDate: movie.release_date || '',
            rating: movie.vote_average ?? 0,
            genre: [],
            director: '',
            cast: [],
            durationMinutes: 0,
            review_summary: null
        };
    }

    private resetSearchState(): void {
        this.cancelActiveSearch();
        this.latestSearchQuery = '';
        this.aiSearchAllResults.set([]);
        this.aiSearchResults.set([]);
        this.aiSearchResultsOffset.set(0);
        this.aiSearchError.set(null);
        this.aiSearchLoading.set(false);
        this.aiSearchNoMoreSuggestions.set(false);
        this.isSearchOpen.set(false);
    }

    private cancelActiveSearch(): void {
        this.activeSearchSubscription?.unsubscribe();
        this.activeSearchSubscription = null;
    }

    private getResultsPage(offset: number): Movie[] {
        return this.aiSearchAllResults().slice(offset, offset + this.aiSearchPageSize);
    }
}
