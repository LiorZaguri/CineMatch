import { Component, signal, inject } from '@angular/core';
import {
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { TopbarComponent } from './core/layout/topbar/topbar';
import { FooterComponent } from './core/layout/footer/footer';

const CHUNK_RELOAD_KEY = 'cm_chunk_reload_attempted';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TopbarComponent, FooterComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('frontend');
  readonly pageVisible = signal(false);
  private readonly router = inject(Router);

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.pageVisible.set(false);
        return;
      }

      if (event instanceof NavigationError) {
        this.reloadOnceForStaleChunk(event.error);
        return;
      }

      if (event instanceof NavigationEnd) {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        const hasFragment = this.router.parseUrl(event.urlAfterRedirects).fragment !== null;

        requestAnimationFrame(() => {
          if (!hasFragment) {
            this.scrollViewportToTop();
          }

          requestAnimationFrame(() => {
            if (!hasFragment) {
              this.scrollViewportToTop();
            }

            this.pageVisible.set(true);
          });
        });
      }
    });
  }

  private scrollViewportToTop(): void {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  private reloadOnceForStaleChunk(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const isChunkLoadFailure =
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Loading chunk') ||
      message.includes('ChunkLoadError');

    if (!isChunkLoadFailure || sessionStorage.getItem(CHUNK_RELOAD_KEY) === 'true') {
      return;
    }

    sessionStorage.setItem(CHUNK_RELOAD_KEY, 'true');
    window.location.reload();
  }
}
