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
    private activeSearchSubscription: Subscription | null = null;
    private latestSearchQuery = '';
    @ViewChild('profileMenu') private readonly profileMenu?: ElementRef<HTMLDetailsElement>;
    @ViewChild('searchPanel') private readonly searchPanel?: ElementRef<HTMLElement>;

    readonly isAuthenticated = this.auth.isAuthenticated;
    readonly user = this.auth.currentUser;
    readonly aiSearchQuery = signal('');
    readonly aiSearchLoading = signal(false);
    readonly aiSearchResults = signal<Movie[]>([]);
    readonly aiSearchError = signal<string | null>(null);
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

        this.isSearchOpen.set(true);
    }

    onSearchFocus(): void {
        if (this.aiSearchQuery().trim() && this.isAuthenticated()) {
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
                    this.aiSearchResults.set([]);
                    this.aiSearchLoading.set(false);
                    return;
                }

                const movies = response.movies
                    .slice(0, 5)
                    .map((movie) => this.mapSearchMovie(movie));
                this.aiSearchResults.set(movies);
                this.aiSearchLoading.set(false);
            },
            error: (error: unknown) => {
                if (query !== this.latestSearchQuery) {
                    return;
                }

                this.aiSearchResults.set([]);
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
            director: 'CineMatch',
            cast: [],
            durationMinutes: 0,
            review_summary: null
        };
    }

    private resetSearchState(): void {
        this.cancelActiveSearch();
        this.latestSearchQuery = '';
        this.aiSearchResults.set([]);
        this.aiSearchError.set(null);
        this.aiSearchLoading.set(false);
        this.isSearchOpen.set(false);
    }

    private cancelActiveSearch(): void {
        this.activeSearchSubscription?.unsubscribe();
        this.activeSearchSubscription = null;
    }
}
