import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { OnboardingMovieCard } from '../../movie-card.models';
import { buildMovieSeedCardPresentation } from './movie-seed-card.contract';

@Component({
  selector: 'app-movie-seed-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './movie-seed-card.component.html',
  styleUrl: './movie-seed-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovieSeedCardComponent {
  readonly movie = input.required<OnboardingMovieCard>();
  readonly selected = input(false);
  readonly posterLoading = input(false);

  readonly toggled = output<number>();

  protected readonly imageReady = signal(false);
  protected readonly imageFailed = signal(false);

  protected readonly presentation = computed(() =>
    buildMovieSeedCardPresentation(this.movie(), this.imageFailed()),
  );
  protected readonly title = computed(() => this.presentation().title);
  protected readonly summary = computed(() => this.presentation().summary);
  protected readonly yearLabel = computed(() => this.presentation().yearLabel);
  protected readonly ratingLabel = computed(() => this.presentation().ratingLabel);
  protected readonly genreLabel = computed(() => this.presentation().genreLabel);
  protected readonly hasPoster = computed(() => this.presentation().hasPoster);
  protected readonly showPosterSkeleton = computed(
    () => (this.posterLoading() || this.hasPoster()) && !this.imageReady() && !this.imageFailed(),
  );

  constructor() {
    effect(() => {
      this.movie();
      this.imageReady.set(false);
      this.imageFailed.set(false);
    });
  }

  protected onSelect(): void {
    this.toggled.emit(this.movie().id);
  }

  protected onImageLoad(): void {
    this.imageReady.set(true);
  }

  protected onImageError(): void {
    this.imageFailed.set(true);
    this.imageReady.set(false);
  }
}
