import { Component, Input, signal, computed, HostListener, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, LucideIconProvider, LUCIDE_ICONS, Star } from 'lucide-angular';

export interface FocusRailItem {
  id: string | number;
  title: string;
  description?: string;
  imageSrc: string;
  backdropUrl?: string;
  href?: string;
  meta?: string;
  rating?: number;
}

@Component({
  selector: 'app-focus-rail',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  providers: [{ provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ Star }) }],
  templateUrl: './focus-rail.component.html',
  styleUrls: ['./focus-rail.component.css'],
})
export class FocusRailComponent implements OnInit {
  @Input({ required: true }) items: FocusRailItem[] = [];
  @Input() initialIndex = 0;
  @Input() loop = true;
  @Input() autoPlay = false;
  @Input() interval = 4000;

  active = signal(0);
  isHovering = signal(false);
  private lastWheelTime = 0;

  activeIndex = computed(() => this.wrap(0, this.items.length, this.active()));
  activeItem = computed(() => this.items[this.activeIndex()]);

  visibleOffsets = [-2, -1, 0, 1, 2];

  constructor() {
    effect((onCleanup) => {
      if (!this.autoPlay || this.isHovering()) return;
      const timer = setInterval(() => this.handleNext(), this.interval);
      onCleanup(() => clearInterval(timer));
    });
  }

  ngOnInit() {
    this.active.set(this.initialIndex);
  }

  handlePrev() {
    if (!this.loop && this.active() === 0) return;
    this.active.update((v) => v - 1);
  }

  handleNext() {
    if (!this.loop && this.active() === this.items.length - 1) return;
    this.active.update((v) => v + 1);
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') this.handlePrev();
    if (e.key === 'ArrowRight') this.handleNext();
  }

  onWheel(e: WheelEvent) {
    const now = Date.now();
    if (now - this.lastWheelTime < 400) return;

    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    const delta = isHorizontal ? e.deltaX : e.deltaY;

    if (Math.abs(delta) > 20) {
      if (delta > 0) {
        this.handleNext();
      } else {
        this.handlePrev();
      }
      this.lastWheelTime = now;
    }
  }

  getItem(offset: number) {
    const absIndex = this.active() + offset;
    const index = this.wrap(0, this.items.length, absIndex);
    return {
      item: this.items[index],
      absIndex,
      isValid: this.loop || (absIndex >= 0 && absIndex < this.items.length),
    };
  }

  getTransform(offset: number) {
    const isCenter = offset === 0;
    const dist = Math.abs(offset);

    const xOffset = offset * 320;
    const zOffset = -dist * 180;
    const scale = isCenter ? 1 : 0.85;
    const rotateY = offset * -20;

    return `translateX(${xOffset}px) translateZ(${zOffset}px) scale(${scale}) rotateY(${rotateY}deg)`;
  }

  getStyle(offset: number) {
    const isCenter = offset === 0;
    const dist = Math.abs(offset);
    const opacity = isCenter ? 1 : Math.max(0.1, 1 - dist * 0.5);
    const blur = isCenter ? 0 : dist * 6;
    const brightness = isCenter ? 1 : 0.5;

    return {
      opacity: opacity,
      filter: `blur(${blur}px) brightness(${brightness})`,
      zIndex: isCenter ? 20 : 10 - dist,
    };
  }

  handleCardSelect(offset: number, absIndex: number): void {
    if (offset !== 0) {
      this.active.set(absIndex);
    }
  }

  private wrap(min: number, max: number, v: number): number {
    if (max === 0) return 0;
    const rangeSize = max - min;
    return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
  }
}
