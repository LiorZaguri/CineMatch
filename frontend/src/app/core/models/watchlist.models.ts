export interface WatchlistItemResponse {
  id: string;
  tmdb_id: number;
  created_at: string;
}

export interface WatchlistResponse {
  items: WatchlistItemResponse[];
}

export interface WatchlistMovieStatus {
  is_in_list: boolean;
}
