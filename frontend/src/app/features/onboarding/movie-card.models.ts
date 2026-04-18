export interface OnboardingMovieCard {
  id: number;
  title: string;
  year?: number | null;
  rating?: number | null;
  genre?: string | null;
  metadata?: string | null;
  summary?: string | null;
  posterUrl?: string | null;
  genres?: string[];
  bg?: string;
  rank?: number;
}
