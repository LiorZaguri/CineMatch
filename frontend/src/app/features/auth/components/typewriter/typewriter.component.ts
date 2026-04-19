import { Component, input, effect, signal, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-typewriter',
  standalone: true,
  template: `
    <span [class]="className()">
      {{ displayText() }}<span class="cursor animate-pulse">{{ cursor() }}</span>
    </span>
  `,
  styles: [
    `
      .cursor {
        display: inline-block;
        margin-left: 2px;
        font-weight: bold;
      }
      .animate-pulse {
        animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.3;
        }
      }
    `,
  ],
})
export class TypewriterComponent implements OnDestroy {
  text = input.required<string | string[]>();
  speed = input(100);
  deleteSpeed = input(50);
  delay = input(1500);
  loop = input(false);
  cursor = input('|');
  className = input('');

  displayText = signal('');
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private charIndex = 0;
  private isDeleting = false;
  private textArrayIndex = 0;

  constructor() {
    effect(() => {
      // Re-run effect whenever text input changes
      this.text();
      this.resetAndStart();
    });
  }

  ngOnDestroy() {
    this.clearTimeout();
  }

  private resetAndStart() {
    this.clearTimeout();
    this.displayText.set('');
    this.charIndex = 0;
    this.isDeleting = false;
    this.textArrayIndex = 0;
    this.type();
  }

  private type() {
    const textArray = Array.isArray(this.text())
      ? (this.text() as string[])
      : [this.text() as string];
    const fullText = textArray[this.textArrayIndex] || '';

    if (!fullText) return;

    if (!this.isDeleting) {
      if (this.charIndex < fullText.length) {
        this.displayText.set(fullText.substring(0, this.charIndex + 1));
        this.charIndex++;
        this.timeoutId = setTimeout(() => this.type(), this.speed());
      } else if (this.loop()) {
        this.timeoutId = setTimeout(() => {
          this.isDeleting = true;
          this.type();
        }, this.delay());
      }
    } else {
      if (this.charIndex > 0) {
        this.displayText.set(fullText.substring(0, this.charIndex - 1));
        this.charIndex--;
        this.timeoutId = setTimeout(() => this.type(), this.deleteSpeed());
      } else {
        this.isDeleting = false;
        this.textArrayIndex = (this.textArrayIndex + 1) % textArray.length;
        this.timeoutId = setTimeout(() => this.type(), this.speed());
      }
    }
  }

  private clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }
}
