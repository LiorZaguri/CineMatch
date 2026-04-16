import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { WatchlistMovieStatus, WatchlistResponse } from '../models/watchlist.models';

@Injectable({ providedIn: 'root' })
export class WatchlistService {
  private readonly http = inject(HttpClient);
  private readonly watchlistUrl = `${environment.apiUrl}/watchlist`;

  getMyList() {
    return this.http.get<WatchlistResponse>(this.watchlistUrl);
  }

  addMovie(tmdbId: number) {
    return this.http.post(`${this.watchlistUrl}`, { tmdb_id: tmdbId });
  }

  removeMovie(tmdbId: number) {
    return this.http.delete<void>(`${this.watchlistUrl}/${tmdbId}/`);
  }

  checkMovie(tmdbId: number) {
    return this.http.get<WatchlistMovieStatus>(`${this.watchlistUrl}/${tmdbId}/`);
  }
}
