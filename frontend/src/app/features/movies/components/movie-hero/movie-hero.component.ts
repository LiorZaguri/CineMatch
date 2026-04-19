import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Movie } from '../../../../core/models/movie.models';

@Component({
  selector: 'app-movie-hero',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="movie-hero" [style.backgroundImage]="'url(' + movie.posterUrl + ')'">
      <div class="hero-overlay">
        <div class="hero-content">
          <div class="hero-meta">
            <span class="rating">{{ movie.rating }}</span>
            <span class="separator">|</span>
            <span class="year">{{ movie.releaseDate | date: 'yyyy' }}</span>
            <span class="separator">|</span>
            <span class="duration">{{ movie.durationMinutes }} min</span>
          </div>

          <h1 class="hero-title">{{ movie.title }}</h1>
          <p class="hero-description">{{ movie.description }}</p>

          <div class="hero-actions">
            <button
              class="btn-play"
              [routerLink]="['/movies', movie.id]"
              [fragment]="'where-to-watch'"
            >
              <span class="material-symbols-outlined">tv</span>
              Where to Watch
            </button>
            <button class="btn-info" [routerLink]="['/movies', movie.id]">More Info</button>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .movie-hero {
        position: relative;
        height: 80vh;
        min-height: 600px;
        background-size: cover;
        background-position: center 20%;
        border-radius: 1.5rem;
        margin-bottom: var(--spacing-3xl);
        overflow: hidden;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
      }

      .hero-overlay {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(
            to right,
            rgba(10, 10, 12, 0.95) 0%,
            rgba(10, 10, 12, 0.7) 30%,
            transparent 100%
          ),
          linear-gradient(to top, var(--color-bg-base) 0%, transparent 50%);
        display: flex;
        align-items: center;
        padding: 0 5%;
      }

      .hero-content {
        max-width: 650px;
        z-index: 2;
      }

      .hero-meta {
        display: flex;
        align-items: center;
        gap: 1rem;
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        font-weight: 600;
        margin-bottom: 1rem;
      }

      .rating {
        color: #ffc107;
      }

      .hero-title {
        font-size: clamp(2.5rem, 6vw, 4.5rem);
        font-weight: 800;
        line-height: 1.1;
        margin-bottom: 1.5rem;
        letter-spacing: -0.04em;
      }

      .hero-description {
        font-size: 1.1rem;
        line-height: 1.6;
        color: var(--color-text-secondary);
        margin-bottom: 2.5rem;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .hero-actions {
        display: flex;
        gap: 1rem;
      }

      .btn-play {
        padding: 0.8rem 2.5rem;
        background: #fff;
        color: #000;
        border: none;
        border-radius: 0.5rem;
        font-size: 1.1rem;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        transition: all 0.2s ease;
      }

      .btn-play:hover {
        background: var(--color-accent);
        transform: scale(1.05);
      }

      .btn-play .material-symbols-outlined {
        font-size: 1.3rem;
      }

      .btn-info {
        padding: 0.8rem 2.5rem;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 0.5rem;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: pointer;
        backdrop-filter: blur(10px);
        transition: all 0.2s ease;
      }

      .btn-info:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      @media (max-width: 768px) {
        .movie-hero {
          height: 60vh;
        }
        .hero-title {
          font-size: 2.5rem;
        }
        .hero-actions {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class MovieHeroComponent {
  @Input({ required: true }) movie!: Movie;
}
