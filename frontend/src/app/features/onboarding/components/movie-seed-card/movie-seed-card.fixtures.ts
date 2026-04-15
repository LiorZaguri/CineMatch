import { OnboardingMovieCard } from '../../movie-card.models';

export const MOVIE_CARD_EDGE_CASE_FIXTURES: Record<string, OnboardingMovieCard> = {
  missingPoster: {
    id: 9001,
    title: 'Posterless Feature',
    year: 2024,
    rating: 7.2,
    genre: 'Drama',
    summary: 'No poster URL is provided, so the title placeholder should render instead.',
    posterUrl: '',
  },
  brokenPoster: {
    id: 9002,
    title: 'Broken Poster URL',
    year: 2023,
    rating: 6.5,
    genre: 'Thriller',
    summary: 'The component should abandon the image and fall back cleanly after an error event.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/this-will-404.jpg',
  },
  longText: {
    id: 9003,
    title:
      'An Extremely Verbose and Overly Specific Film Title That Exists Only to Stress the Clamp Rules and Refuse to Fit Nicely',
    year: null,
    rating: null,
    genre: '',
    metadata: '',
    summary:
      'This intentionally bloated overview simulates the worst kind of API payload: too long for a compact card, unevenly phrased, and absolutely guaranteed to overflow if the summary slot is not fixed and safely clamped by the component contract.',
    posterUrl: '',
  },
  sparseMetadata: {
    id: 9004,
    title: 'Metadata Vacuum',
    year: null,
    rating: null,
    genre: null,
    metadata: null,
    summary: null,
    posterUrl: null,
  },
};
