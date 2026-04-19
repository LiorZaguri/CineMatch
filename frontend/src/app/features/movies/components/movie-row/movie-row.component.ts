import { Component, Input, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Movie } from '../../../../core/models/movie.models';

@Component({
  selector: 'app-movie-row',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="movie-row">
      <h2 class="row-title">{{ title }}</h2>

      <div class="row-container">
        <button class="scroll-btn prev" (click)="scroll(-400)" aria-label="Scroll Left">‹</button>

        <div class="movie-cards" #scrollContainerRef>
          @for (movie of movies; track movie.id) {
            <div class="movie-card" [routerLink]="['/movies', movie.id]" role="listitem">
              <div class="card-inner">
                <img
                  [src]="movie.posterUrl"
                  [alt]="movie.title"
                  class="card-image"
                  loading="lazy"
                />
                <div class="card-overlay">
                  <div class="card-info">
                    <h4 class="card-title">{{ movie.title }}</h4>
                    <div class="card-meta">
                      <span class="rating"> {{ movie.rating }}</span>
                      <span class="year">{{ movie.releaseDate | date: 'yyyy' }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
        </div>

        <button class="scroll-btn next" (click)="scroll(400)" aria-label="Scroll Right">›</button>
      </div>
    </section>
  `,
  styles: [
    `
      .movie-row {
        margin-bottom: var(--spacing-3xl);
        position: relative;
      }

      .row-title {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 1.25rem;
        color: var(--color-text-primary);
        padding-left: 0.5rem;
        border-left: 4px solid var(--color-accent);
      }

      .row-container {
        position: relative;
        display: flex;
        align-items: center;
      }

      .movie-cards {
        display: flex;
        gap: 1.5rem;
        overflow-x: auto;
        scroll-behavior: smooth;
        padding: 1.5rem 0.5rem;
        scrollbar-width: none; /* Hide scrollbar Firefox */
        -ms-overflow-style: none; /* Hide scrollbar IE/Edge */
      }

      .movie-cards::-webkit-scrollbar {
        display: none; /* Hide scrollbar Chrome/Safari */
      }

      .movie-card {
        flex: 0 0 auto;
        width: 280px;
        perspective: 1000px;
        cursor: pointer;
      }

      .card-inner {
        position: relative;
        width: 100%;
        aspect-ratio: 16/9;
        border-radius: 0.75rem;
        overflow: hidden;
        background: var(--color-bg-elevated);
        transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }

      .movie-card:hover .card-inner {
        transform: scale(1.15) translateY(-5px);
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
        z-index: 100;
      }

      .card-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.4s ease;
      }

      .card-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to top,
          rgba(0, 0, 0, 0.9) 0%,
          rgba(0, 0, 0, 0.4) 40%,
          transparent 100%
        );
        opacity: 0;
        transition: opacity 0.3s ease;
        display: flex;
        align-items: flex-end;
        padding: 1rem;
      }

      .movie-card:hover .card-overlay {
        opacity: 1;
      }

      .card-info {
        width: 100%;
      }

      .card-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card-meta {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.8rem;
        margin-top: 0.25rem;
        color: rgba(255, 255, 255, 0.7);
      }

      .rating {
        color: #ffbc00;
      }

      /* Scroll Buttons */
      .scroll-btn {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 3rem;
        height: 3rem;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #fff;
        font-size: 2rem;
        cursor: pointer;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition:
          opacity 0.3s,
          background 0.2s;
      }

      .row-container:hover .scroll-btn {
        opacity: 1;
      }

      .scroll-btn:hover {
        background: rgba(0, 0, 0, 0.9);
        border-color: var(--color-accent);
      }

      .scroll-btn.prev {
        left: -1.5rem;
      }
      .scroll-btn.next {
        right: -1.5rem;
      }

      @media (max-width: 640px) {
        .movie-card {
          width: 200px;
        }
        .scroll-btn {
          display: none;
        }
      }
    `,
  ],
})
export class MovieRowComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) movies: Movie[] = [];

  @ViewChild('scrollContainerRef') scrollContainer!: ElementRef<HTMLDivElement>;

  scroll(offset: number): void {
    this.scrollContainer.nativeElement.scrollBy({ left: offset, behavior: 'smooth' });
  }
}
