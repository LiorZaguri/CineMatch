import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, timeout } from 'rxjs';
import { Movie, TmdbMovie } from '../../models/movie.models';
import { AuthService } from '../../services/auth.service';
import { MovieService } from '../../services/movie.service';

type SearchMode = 'normal' | 'ai';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './topbar.html',
  styleUrl: './topbar.css',
})
export class TopbarComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly movieService = inject(MovieService);
  private readonly desktopBreakpoint = 960;
  private readonly normalSearchDebounceMs = 300;
  private readonly searchPageSize = 5;
  private activeSearchSubscription: Subscription | null = null;
  private searchDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  private latestSearchQuery = '';

  @ViewChild('profileMenu') private readonly profileMenu?: ElementRef<HTMLDetailsElement>;
  @ViewChild('topbarShell') private readonly topbarShell?: ElementRef<HTMLElement>;

  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly user = this.auth.currentUser;
  readonly searchMode = signal<SearchMode>('normal');
  readonly searchQuery = signal('');
  readonly searchAllResults = signal<Movie[]>([]);
  readonly searchResults = signal<Movie[]>([]);
  readonly searchLoading = signal(false);
  readonly searchError = signal<string | null>(null);
  readonly searchNoMoreSuggestions = signal(false);
  readonly searchResultsOffset = signal(0);
  readonly isSearchOpen = signal(false);
  readonly isMobileViewport = signal(this.readIsMobileViewport());
  readonly isMobileMenuOpen = signal(false);
  readonly isMobileSearchVisible = signal(false);

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

  isAiMode(): boolean {
    return this.searchMode() === 'ai';
  }

  searchPlaceholder(): string {
    if (this.isAiMode()) {
      return this.isAuthenticated() ? 'Ask AI for a movie vibe...' : 'Sign in to use AI search';
    }

    return 'Search movies, actors, and genres...';
  }

  searchHeading(): string {
    return this.isAiMode() ? 'AI Matches' : 'TMDB Results';
  }

  searchLoadingMessage(): string {
    return this.isAiMode() ? 'Searching for AI matches...' : 'Searching TMDB...';
  }

  emptySearchMessage(): string {
    if (this.searchError()) {
      return this.searchError()!;
    }

    return this.isAiMode() ? 'No AI matches found.' : 'No matching movies found.';
  }

  isSearchDisabled(): boolean {
    return this.isAiMode() && !this.isAuthenticated();
  }

  shouldShowSearchActions(): boolean {
    return (
      !this.searchLoading() &&
      this.searchAllResults().length > this.searchPageSize &&
      this.searchResults().length > 0 &&
      (this.hasPreviousSuggestions() || this.hasMoreSuggestions() || this.searchNoMoreSuggestions())
    );
  }

  setSearchMode(mode: SearchMode): void {
    if (this.searchMode() === mode) {
      return;
    }

    this.searchMode.set(mode);
    this.searchError.set(null);
    this.cancelPendingSearch();
    this.cancelActiveSearch();

    const query = this.searchQuery().trim();
    if (!query) {
      this.resetSearchResults();
      return;
    }

    if (mode === 'normal') {
      this.scheduleNormalSearch(query);
      this.isSearchOpen.set(true);
      return;
    }

    this.resetSearchResults();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const trimmedValue = value.trim();

    this.searchQuery.set(value);
    this.searchError.set(null);
    this.cancelPendingSearch();
    this.cancelActiveSearch();

    if (!trimmedValue) {
      this.resetSearchResults();
      return;
    }

    if (this.isAiMode()) {
      if (!this.isAuthenticated()) {
        this.resetSearchResults();
      }
      return;
    }

    this.scheduleNormalSearch(trimmedValue);
    this.isSearchOpen.set(true);
  }

  onSearchFocus(): void {
    const query = this.searchQuery().trim();
    if (!query) {
      return;
    }

    if (!this.isAiMode() || !!this.latestSearchQuery) {
      this.isSearchOpen.set(true);
    }
  }

  onSearchSubmit(event: Event): void {
    event.preventDefault();

    const query = this.searchQuery().trim();
    if (!query) {
      return;
    }

    if (this.isAiMode()) {
      if (!this.isAuthenticated()) {
        this.searchError.set('Sign in to use AI search.');
        this.isSearchOpen.set(true);
        return;
      }

      this.runAiSearch(query);
      return;
    }

    this.runNormalSearch(query);
  }

  showOtherSuggestions(): void {
    const allResults = this.searchAllResults();
    const nextOffset = this.searchResultsOffset() + this.searchPageSize;
    if (nextOffset >= allResults.length) {
      this.searchNoMoreSuggestions.set(true);
      return;
    }

    this.searchResultsOffset.set(nextOffset);
    this.searchResults.set(this.getResultsPage(nextOffset));
    this.searchNoMoreSuggestions.set(nextOffset + this.searchPageSize >= allResults.length);
  }

  showPreviousSuggestions(): void {
    const previousOffset = Math.max(this.searchResultsOffset() - this.searchPageSize, 0);
    this.searchResultsOffset.set(previousOffset);
    this.searchResults.set(this.getResultsPage(previousOffset));
    this.searchNoMoreSuggestions.set(false);
  }

  hasMoreSuggestions(): boolean {
    return this.searchResultsOffset() + this.searchPageSize < this.searchAllResults().length;
  }

  hasPreviousSuggestions(): boolean {
    return this.searchResultsOffset() > 0;
  }

  currentSuggestionsPage(): number {
    return Math.floor(this.searchResultsOffset() / this.searchPageSize) + 1;
  }

  totalSuggestionsPages(): number {
    const totalResults = this.searchAllResults().length;
    return totalResults ? Math.ceil(totalResults / this.searchPageSize) : 1;
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.resetSearchResults();
  }

  toggleMobileMenu(): void {
    if (!this.isMobileViewport()) {
      return;
    }

    const nextState = !this.isMobileMenuOpen();
    this.isMobileMenuOpen.set(nextState);

    if (nextState) {
      this.isMobileSearchVisible.set(false);
    }
  }

  toggleMobileSearch(): void {
    if (!this.isMobileViewport()) {
      return;
    }

    const nextState = !this.isMobileSearchVisible();
    this.isMobileSearchVisible.set(nextState);

    if (nextState) {
      this.isMobileMenuOpen.set(false);
      if (this.searchQuery().trim()) {
        this.isSearchOpen.set(true);
      }
    } else {
      this.isSearchOpen.set(false);
    }
  }

  closeMobilePanels(): void {
    this.isMobileMenuOpen.set(false);
    this.isMobileSearchVisible.set(false);
  }

  onNavigateFromMenu(): void {
    this.closeProfileMenu();
    this.closeMobilePanels();
  }

  openMovie(movieId: number): void {
    this.router.navigate(['/movies', movieId]);
    this.closeProfileMenu();
    this.closeMobilePanels();
    this.clearSearch();
  }

  onLogout(): void {
    this.auth.logout();
    this.closeProfileMenu();
    this.closeMobilePanels();
    this.clearSearch();
    this.router.navigate(['/']);
  }

  closeProfileMenu(): void {
    if (this.profileMenu?.nativeElement?.open) {
      this.profileMenu.nativeElement.open = false;
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    const isMobile = this.readIsMobileViewport();
    this.isMobileViewport.set(isMobile);

    if (!isMobile) {
      this.isMobileMenuOpen.set(false);
      this.isMobileSearchVisible.set(false);
    } else {
      this.closeProfileMenu();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    const shell = this.topbarShell?.nativeElement;

    if (shell && !shell.contains(target)) {
      this.closeProfileMenu();
      this.isSearchOpen.set(false);
      this.closeMobilePanels();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeProfileMenu();
    this.isSearchOpen.set(false);
    this.closeMobilePanels();
  }

  ngOnDestroy(): void {
    this.cancelPendingSearch();
    this.cancelActiveSearch();
  }

  private scheduleNormalSearch(query: string): void {
    this.searchLoading.set(false);
    this.searchDebounceHandle = setTimeout(() => {
      this.runNormalSearch(query);
    }, this.normalSearchDebounceMs);
  }

  private runNormalSearch(query: string): void {
    this.cancelPendingSearch();
    this.cancelActiveSearch();
    this.latestSearchQuery = query;
    this.searchLoading.set(true);
    this.searchError.set(null);
    this.isSearchOpen.set(true);

    this.activeSearchSubscription = this.movieService
      .searchMovies(query)
      .pipe(timeout(15000))
      .subscribe({
        next: (movies) => {
          if (query !== this.latestSearchQuery) {
            return;
          }

          this.updateSearchResults(movies);
          this.searchLoading.set(false);
        },
        error: () => {
          if (query !== this.latestSearchQuery) {
            return;
          }

          this.resetSearchResults();
          this.searchError.set('Unable to load search results right now.');
          this.isSearchOpen.set(true);
        },
      });
  }

  private runAiSearch(query: string): void {
    this.cancelPendingSearch();
    this.cancelActiveSearch();
    this.latestSearchQuery = query;
    this.searchLoading.set(true);
    this.searchError.set(null);
    this.isSearchOpen.set(true);

    this.activeSearchSubscription = this.movieService
      .aiSearch({ prompt: query })
      .pipe(timeout(30000))
      .subscribe({
        next: (response) => {
          if (query !== this.latestSearchQuery) {
            return;
          }

          if (response.status === 'fallback') {
            this.resetSearchResults();
            this.searchError.set('AI search is temporarily unavailable.');
            this.isSearchOpen.set(true);
            return;
          }

          const movies = response.movies.map((movie) => this.mapSearchMovie(movie));
          this.updateSearchResults(movies);
          this.searchLoading.set(false);
        },
        error: () => {
          if (query !== this.latestSearchQuery) {
            return;
          }

          this.resetSearchResults();
          this.searchError.set('Unable to complete AI search right now.');
          this.isSearchOpen.set(true);
        },
      });
  }

  private updateSearchResults(movies: Movie[]): void {
    this.searchAllResults.set(movies);
    this.searchResultsOffset.set(0);
    this.searchNoMoreSuggestions.set(false);
    this.searchResults.set(this.getResultsPage(0));
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
      review_summary: null,
    };
  }

  private resetSearchResults(): void {
    this.cancelPendingSearch();
    this.cancelActiveSearch();
    this.latestSearchQuery = '';
    this.searchAllResults.set([]);
    this.searchResults.set([]);
    this.searchResultsOffset.set(0);
    this.searchLoading.set(false);
    this.searchError.set(null);
    this.searchNoMoreSuggestions.set(false);
    this.isSearchOpen.set(false);
  }

  private cancelActiveSearch(): void {
    this.activeSearchSubscription?.unsubscribe();
    this.activeSearchSubscription = null;
  }

  private cancelPendingSearch(): void {
    if (this.searchDebounceHandle !== null) {
      clearTimeout(this.searchDebounceHandle);
      this.searchDebounceHandle = null;
    }
  }

  private getResultsPage(offset: number): Movie[] {
    return this.searchAllResults().slice(offset, offset + this.searchPageSize);
  }

  private readIsMobileViewport(): boolean {
    return typeof window !== 'undefined' ? window.innerWidth <= this.desktopBreakpoint : false;
  }
}
