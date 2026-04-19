import { Component, HostListener, Input, signal } from '@angular/core';

@Component({
  selector: 'app-spotlight',
  standalone: true,
  template: `
    <div
      class="spotlight"
      [style.--x.px]="mouseX()"
      [style.--y.px]="mouseY()"
      [style.--size.px]="size"
      [style.opacity]="isHovered() ? 1 : 0"
    ></div>
  `,
  styles: [
    `
      .spotlight {
        pointer-events: none;
        position: absolute;
        inset: 0;
        z-index: 1;
        width: 100%;
        height: 100%;
        background: radial-gradient(
          var(--size) circle at var(--x) var(--y),
          rgba(255, 255, 255, 0.08),
          transparent 80%
        );
        transition: opacity 0.3s ease;
      }
    `,
  ],
})
export class SpotlightComponent {
  @Input() size = 400;

  mouseX = signal(0);
  mouseY = signal(0);
  isHovered = signal(false);

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.mouseX.set(event.clientX - rect.left);
    this.mouseY.set(event.clientY - rect.top);
  }

  @HostListener('mouseenter')
  onMouseEnter() {
    this.isHovered.set(true);
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    this.isHovered.set(false);
  }
}
