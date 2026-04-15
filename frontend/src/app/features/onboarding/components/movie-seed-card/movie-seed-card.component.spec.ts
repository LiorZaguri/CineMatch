import { describe, expect, it } from 'vitest';
import { buildMovieSeedCardPresentation } from './movie-seed-card.contract';
import { MOVIE_CARD_EDGE_CASE_FIXTURES } from './movie-seed-card.fixtures';

describe('movie seed card contract', () => {
  it('normalizes missing poster data without dropping the reserved poster slot', () => {
    const presentation = buildMovieSeedCardPresentation(
      MOVIE_CARD_EDGE_CASE_FIXTURES['missingPoster'],
    );

    expect(presentation.hasPoster).toBe(false);
    expect(presentation.title).toBe('Posterless Feature');
    expect(presentation.summary).toContain('No poster URL');
  });

  it('falls back after a poster error even when a URL exists', () => {
    const presentation = buildMovieSeedCardPresentation(
      MOVIE_CARD_EDGE_CASE_FIXTURES['brokenPoster'],
      true,
    );

    expect(presentation.hasPoster).toBe(false);
  });

  it('keeps long title and overview values as content while CSS clamps their fixed slots', () => {
    const presentation = buildMovieSeedCardPresentation(MOVIE_CARD_EDGE_CASE_FIXTURES['longText']);

    expect(presentation.title).toContain('Extremely Verbose');
    expect(presentation.summary).toContain('intentionally bloated overview');
  });

  it('uses stable labels when year, rating, genre, and summary are missing', () => {
    const presentation = buildMovieSeedCardPresentation(
      MOVIE_CARD_EDGE_CASE_FIXTURES['sparseMetadata'],
    );

    expect(presentation.yearLabel).toBe('Year TBD');
    expect(presentation.ratingLabel).toBe('No rating');
    expect(presentation.genreLabel).toBe('No genre');
    expect(presentation.summary).toBe('No synopsis available yet.');
  });
});
