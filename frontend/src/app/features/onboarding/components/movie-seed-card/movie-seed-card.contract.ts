import { OnboardingMovieCard } from '../../movie-card.models';

export interface MovieSeedCardPresentation {
  title: string;
  summary: string;
  yearLabel: string;
  ratingLabel: string;
  genreLabel: string;
  hasPoster: boolean;
}

export function buildMovieSeedCardPresentation(
  movie: OnboardingMovieCard,
  imageFailed = false,
): MovieSeedCardPresentation {
  const title = movie.title?.trim() || 'Untitled movie';
  const summary = movie.summary?.trim() || 'No synopsis available yet.';
  const year =
    typeof movie.year === 'number' && Number.isFinite(movie.year) && movie.year > 0
      ? String(movie.year)
      : 'Year TBD';
  const rating =
    typeof movie.rating === 'number' && Number.isFinite(movie.rating) && movie.rating > 0
      ? `${movie.rating.toFixed(1)}/10`
      : 'No rating';
  const genre = movie.genre?.trim() || movie.metadata?.trim() || 'No genre';
  const hasPoster = Boolean(movie.posterUrl?.trim()) && !imageFailed;

  return {
    title,
    summary,
    yearLabel: year,
    ratingLabel: rating,
    genreLabel: genre,
    hasPoster,
  };
}
