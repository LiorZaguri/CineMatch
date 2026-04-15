import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  MoviePreferenceStatus,
  UpdateUserPreferenceRequest,
  UserPreferenceMovie,
  UserPreferenceProfile,
} from '../models/user-preference.models';

@Injectable({ providedIn: 'root' })
export class UserPreferenceService {
  private readonly http = inject(HttpClient);
  private readonly preferenceUrl = `${environment.apiUrl}/user-preferences`;

  getMyPreferences() {
    return this.http.get<UserPreferenceProfile>(`${this.preferenceUrl}/me/`);
  }

  updatePreferences(payload: UpdateUserPreferenceRequest) {
    return this.http.put<UserPreferenceProfile>(`${this.preferenceUrl}/update/`, payload);
  }

  addChosenMovie(tmdbId: number) {
    return this.http.post<UserPreferenceMovie>(`${this.preferenceUrl}/movie/`, { tmdb_id: tmdbId });
  }

  removeChosenMovie(tmdbId: number) {
    return this.http.delete<UserPreferenceProfile>(`${this.preferenceUrl}/movie/${tmdbId}/`);
  }

  checkMoviePreference(tmdbId: number) {
    return this.http.get<MoviePreferenceStatus>(`${this.preferenceUrl}/movie/${tmdbId}/`);
  }
}
