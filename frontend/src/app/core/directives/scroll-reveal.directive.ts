import {
  AfterViewInit,
  Directive,
  ElementRef,
  Input,
  OnDestroy,
  Renderer2,
  inject,
} from '@angular/core';

@Directive({
  selector: '[appScrollReveal]',
  standalone: true,
})
export class ScrollRevealDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);

  @Input() revealDelay = 0;
  @Input() revealOnce = true;

  private observer?: IntersectionObserver;

  ngAfterViewInit(): void {
    this.renderer.addClass(this.el.nativeElement, 'reveal-on-scroll');
    this.renderer.setStyle(this.el.nativeElement, '--reveal-delay', `${this.revealDelay}ms`);

    if (typeof IntersectionObserver === 'undefined') {
      this.renderer.addClass(this.el.nativeElement, 'is-revealed');
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.renderer.addClass(this.el.nativeElement, 'is-revealed');
            if (this.revealOnce) {
              this.observer?.unobserve(this.el.nativeElement);
            }
            return;
          }

          if (!this.revealOnce) {
            this.renderer.removeClass(this.el.nativeElement, 'is-revealed');
          }
        });
      },
      {
        threshold: 0.16,
        rootMargin: '0px 0px -10% 0px',
      },
    );

    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
