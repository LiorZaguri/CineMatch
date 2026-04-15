export type UserPreferenceDiscoveryMode = 'mainstream confident' | 'hidden gems' | 'best mix';
export type UserPreferenceLanguage =
  | 'English'
  | 'Korean'
  | 'Japanese'
  | 'French'
  | 'Spanish'
  | 'Open to anything';
export type UserPreferenceRuntime = '100' | '100-140' | '140+' | 'No preference';
export type UserPreferenceEra = '1970' | '1980' | '1990' | '2000' | '2010' | '2020';
export type UserPreferenceGenre =
  | 'Thriller'
  | 'Drama'
  | 'Sci-fi'
  | 'Crime'
  | 'Mystery'
  | 'Comedy'
  | 'Romance'
  | 'Horror'
  | 'Animation'
  | 'Fantasy'
  | 'Documentary'
  | 'Action';

export interface UserPreferenceMovie {
  id?: number;
  tmdb_id: number;
}

export interface UserPreferenceNamedValue<T extends string = string> {
  id?: number;
  name: T;
}

export interface UserPreferenceProfile {
  id: number;
  user_id: string;
  discovery_mode: UserPreferenceDiscoveryMode;
  languages: UserPreferenceLanguage[];
  runtime: UserPreferenceRuntime | null;
  eras: UserPreferenceEra[];
  chosen_movies: UserPreferenceMovie[];
  liked_genres: UserPreferenceNamedValue<UserPreferenceGenre>[];
  disliked_genres: UserPreferenceNamedValue<UserPreferenceGenre>[];
  moods: UserPreferenceNamedValue[];
}

export interface UpdateUserPreferenceRequest {
  discovery_mode: UserPreferenceDiscoveryMode;
  languages?: UserPreferenceLanguage[];
  runtime?: UserPreferenceRuntime | null;
  eras?: UserPreferenceEra[];
  chosen_movies: UserPreferenceMovie[];
  liked_genres: UserPreferenceNamedValue<UserPreferenceGenre>[];
  disliked_genres: UserPreferenceNamedValue<UserPreferenceGenre>[];
  moods: UserPreferenceNamedValue[];
}

export interface MoviePreferenceStatus {
  exists: boolean;
}
