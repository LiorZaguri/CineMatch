import { Component, signal, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { TopbarComponent } from './core/layout/topbar/topbar';
import { FooterComponent } from './core/layout/footer/footer';

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

      if (event instanceof NavigationEnd) {
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
}
