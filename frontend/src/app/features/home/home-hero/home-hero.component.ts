import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Movie } from '../../../core/models/movie.models';
import { MovieService } from '../../../core/services/movie.service';

interface HeroPoster {
  src: string;
  alt: string;
}

@Component({
  selector: 'app-home-hero',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home-hero.component.html',
  styleUrls: ['./home-hero.component.css'],
})
export class HomeHeroComponent implements AfterViewInit, OnDestroy, OnInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly movieService = inject(MovieService);

  private animationFrameId: number | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private movieSubscription: Subscription | null = null;
  private readonly cleanupFns: Array<() => void> = [];
  private readonly fallbackPosters: HeroPoster[] = [
    {
      src: 'https://image.tmdb.org/t/p/w780/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
      alt: 'Parasite movie poster',
    },
    {
      src: 'https://image.tmdb.org/t/p/w780/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
      alt: 'Blade Runner 2049 movie poster',
    },
    {
      src: 'https://image.tmdb.org/t/p/w780/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
      alt: 'The Dark Knight movie poster',
    },
    {
      src: 'https://image.tmdb.org/t/p/w780/uhviyknTT5cEQXbn6vWIqfM4vGm.jpg',
      alt: 'Prisoners movie poster',
    },
    {
      src: 'https://image.tmdb.org/t/p/w780/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg',
      alt: 'Arrival movie poster',
    },
    {
      src: 'https://image.tmdb.org/t/p/w780/7fn624j5lj3xTme2SgiLCeuedmO.jpg',
      alt: 'Whiplash movie poster',
    },
    {
      src: 'https://image.tmdb.org/t/p/w780/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
      alt: 'Spirited Away movie poster',
    },
    {
      src: 'https://image.tmdb.org/t/p/w780/hA2ple9q4qnwxp3hKVNhroipsir.jpg',
      alt: 'Mad Max: Fury Road movie poster',
    },
  ];

  readonly heroPosters = computed(() => {
    const tmdbPosters = this.toHeroPosters([
      ...this.movieService.nowPlaying(),
      ...this.movieService.popular(),
      ...this.movieService.topRated(),
    ]);

    return tmdbPosters.length >= 8
      ? tmdbPosters.slice(0, 8)
      : [...tmdbPosters, ...this.fallbackPosters].slice(0, 8);
  });

  ngOnInit(): void {
    this.movieSubscription = this.movieService.getMovies().subscribe({
      error: () => {
        this.movieSubscription = null;
      },
    });
  }

  ngAfterViewInit(): void {
    const root = this.host.nativeElement as HTMLElement;
    const cursor = root.querySelector('#cursor') as HTMLElement | null;
    const ring = root.querySelector('#cursorRing') as HTMLElement | null;

    if (cursor && ring) {
      let mouseX = 0;
      let mouseY = 0;
      let ringX = 0;
      let ringY = 0;

      const onMouseMove = (event: MouseEvent) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
        cursor.style.left = `${mouseX}px`;
        cursor.style.top = `${mouseY}px`;
      };

      const animateRing = () => {
        ringX += (mouseX - ringX) * 0.12;
        ringY += (mouseY - ringY) * 0.12;
        ring.style.left = `${ringX}px`;
        ring.style.top = `${ringY}px`;
        this.animationFrameId = window.requestAnimationFrame(animateRing);
      };

      document.addEventListener('mousemove', onMouseMove);
      this.cleanupFns.push(() => document.removeEventListener('mousemove', onMouseMove));

      const hoverTargets = root.querySelectorAll('a, button, input') as NodeListOf<HTMLElement>;
      hoverTargets.forEach((element: HTMLElement) => {
        const onEnter = () => {
          cursor.style.width = '20px';
          cursor.style.height = '20px';
          ring.style.width = '56px';
          ring.style.height = '56px';
        };

        const onLeave = () => {
          cursor.style.width = '10px';
          cursor.style.height = '10px';
          ring.style.width = '36px';
          ring.style.height = '36px';
        };

        element.addEventListener('mouseenter', onEnter);
        element.addEventListener('mouseleave', onLeave);

        this.cleanupFns.push(() => {
          element.removeEventListener('mouseenter', onEnter);
          element.removeEventListener('mouseleave', onLeave);
        });
      });

      animateRing();
    }

    const reveals = root.querySelectorAll('.reveal') as NodeListOf<HTMLElement>;
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            this.intersectionObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    reveals.forEach((element: HTMLElement) => this.intersectionObserver?.observe(element));
  }

  ngOnDestroy(): void {
    this.movieSubscription?.unsubscribe();
    this.movieSubscription = null;

    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns.length = 0;

    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
  }

  private toHeroPosters(movies: Movie[]): HeroPoster[] {
    const seen = new Set<string>();

    return movies.reduce<HeroPoster[]>((posters, movie) => {
      if (!movie.posterUrl || seen.has(movie.posterUrl)) {
        return posters;
      }

      seen.add(movie.posterUrl);
      posters.push({
        src: movie.posterUrl,
        alt: `${movie.title} movie poster`,
      });
      return posters;
    }, []);
  }
}
