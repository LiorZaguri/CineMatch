import { Component, input, computed } from '@angular/core';
import { TypewriterComponent } from '../typewriter/typewriter.component';
import { ScrollRevealDirective } from '../../../../core/directives/scroll-reveal.directive';

export interface AuthContent {
  image?: { src: string; alt: string };
  quote?: { text: string; author: string };
}

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [TypewriterComponent, ScrollRevealDirective],
  templateUrl: './auth-layout.component.html',
  styleUrls: ['./auth-layout.component.css'],
})
export class AuthLayoutComponent {
  isSignIn = input(true);
  customSignInContent = input<AuthContent | undefined>(undefined);
  customSignUpContent = input<AuthContent | undefined>(undefined);

  private readonly defaultSignInContent: AuthContent = {
    image: {
      src: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=2070&auto=format&fit=crop',
      alt: 'Cinema theatre',
    },
    quote: {
      text: 'Movies can transport us anywhere, but the best journeys are the ones we share.',
      author: '',
    },
  };

  private readonly defaultSignUpContent: AuthContent = {
    image: {
      src: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2025&auto=format&fit=crop',
      alt: 'Film reels',
    },
    quote: {
      text: 'Every film is a doorway to another world—step inside and make it your own.',
      author: '',
    },
  };

  currentContent = computed(() => {
    if (this.isSignIn()) {
      return {
        image: { ...this.defaultSignInContent.image, ...this.customSignInContent()?.image },
        quote: { ...this.defaultSignInContent.quote, ...this.customSignInContent()?.quote },
      };
    } else {
      return {
        image: { ...this.defaultSignUpContent.image, ...this.customSignUpContent()?.image },
        quote: { ...this.defaultSignUpContent.quote, ...this.customSignUpContent()?.quote },
      };
    }
  });

  imageSrc = computed(() => this.currentContent().image?.src || '');
  imageAlt = computed(() => this.currentContent().image?.alt || 'Authentication background');
  quoteText = computed(() => this.currentContent().quote?.text || '');
  quoteAuthor = computed(() => this.currentContent().quote?.author || '');
}
