import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { Application } from '@splinetool/runtime';

@Component({
  selector: 'app-spline-scene',
  standalone: true,
  template: `
    <div class="spline-container">
      @if (isLoading()) {
        <div class="loader-overlay">
          <div class="loader"></div>
        </div>
      }
      <canvas #splineCanvas></canvas>
    </div>
  `,
  styles: [
    `
      .spline-container {
        position: relative;
        width: 100%;
        height: 100%;
      }
      canvas {
        width: 100% !important;
        height: 100% !important;
      }
      .loader-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.2);
        z-index: 10;
      }
      .loader {
        width: 48px;
        height: 48px;
        border: 3px solid var(--color-text-secondary);
        border-bottom-color: transparent;
        border-radius: 50%;
        display: inline-block;
        box-sizing: border-box;
        animation: rotation 1s linear infinite;
      }
      @keyframes rotation {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class SplineSceneComponent implements OnInit, OnDestroy {
  @Input({ required: true }) sceneUrl!: string;
  @ViewChild('splineCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  isLoading = signal(true);
  private splineApp?: Application;

  async ngOnInit() {
    this.splineApp = new Application(this.canvasRef.nativeElement);
    try {
      await this.splineApp.load(this.sceneUrl);
      this.isLoading.set(false);
    } catch (error) {
      console.error('Failed to load spline scene:', error);
      this.isLoading.set(false);
    }
  }

  ngOnDestroy() {
    if (this.splineApp) {
      this.splineApp.dispose();
    }
  }
}
