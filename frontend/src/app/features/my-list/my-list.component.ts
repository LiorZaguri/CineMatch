import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Movie } from '../../core/models/movie.models';
import { MovieService } from '../../core/services/movie.service';
import { WatchlistService } from '../../core/services/watchlist.service';
import { ScrollRevealDirective } from '../../core/directives/scroll-reveal.directive';

@Component({
  selector: 'app-my-list',
  standalone: true,
  imports: [CommonModule, RouterLink, ScrollRevealDirective],
  templateUrl: './my-list.component.html',
  styleUrls: ['./my-list.component.css'],
})
export class MyListComponent implements OnInit {
  private readonly watchlistService = inject(WatchlistService);
  private readonly movieService = inject(MovieService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly movies = signal<Movie[]>([]);

  readonly hasMovies = computed(() => this.movies().length > 0);

  ngOnInit(): void {
    this.loadMyList();
  }

  retry(): void {
    this.loadMyList();
  }

  removeFromList(movie: Movie, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const tmdbId = typeof movie.tmdb_id === 'number' ? movie.tmdb_id : movie.id;
    this.watchlistService.removeMovie(tmdbId).subscribe({
      next: () => {
        this.movies.set(this.movies().filter((entry) => entry.id !== movie.id));
      },
      error: () => {
        this.error.set('Failed to remove the movie from your list.');
      },
    });
  }

  getYear(movie: Movie): string {
    if (!movie.releaseDate) {
      return 'TBA';
    }
    const year = new Date(movie.releaseDate).getFullYear();
    return Number.isFinite(year) ? year.toString() : 'TBA';
  }

  private loadMyList(): void {
    this.loading.set(true);
    this.error.set(null);

    this.watchlistService.getMyList().subscribe({
      next: ({ items }) => {
        if (items.length === 0) {
          this.movies.set([]);
          this.loading.set(false);
          return;
        }

        forkJoin(
          items.map((item) =>
            this.movieService
              .getMovieByTmdbId(String(item.tmdb_id), true)
              .pipe(catchError(() => of(null))),
          ),
        )
          .pipe(map((movies) => movies.filter((movie): movie is Movie => movie !== null)))
          .subscribe({
            next: (movies) => {
              this.movies.set(movies);
              this.loading.set(false);
            },
            error: () => {
              this.error.set('Failed to load your list.');
              this.loading.set(false);
            },
          });
      },
      error: () => {
        this.error.set('Failed to load your list.');
        this.loading.set(false);
      },
    });
  }
}
