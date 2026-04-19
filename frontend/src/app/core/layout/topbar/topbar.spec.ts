import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { TopbarComponent } from './topbar';
import { AuthService } from '../../services/auth.service';
import { MovieService } from '../../services/movie.service';

describe('TopbarComponent', () => {
  let component: TopbarComponent;
  let fixture: ComponentFixture<TopbarComponent>;

  const authServiceStub = {
    isAuthenticated: signal(false),
    currentUser: signal(null),
    logout: vi.fn(),
  };

  const movieServiceStub = {
    aiSearch: vi.fn().mockReturnValue(of({ status: 'success', fallback_used: false, movies: [] })),
    searchMovies: vi.fn().mockReturnValue(of([])),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopbarComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceStub },
        { provide: MovieService, useValue: movieServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TopbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    authServiceStub.isAuthenticated.set(false);
    authServiceStub.currentUser.set(null);
    movieServiceStub.aiSearch.mockReset();
    movieServiceStub.aiSearch.mockReturnValue(
      of({ status: 'success', fallback_used: false, movies: [] }),
    );
    movieServiceStub.searchMovies.mockReset();
    movieServiceStub.searchMovies.mockReturnValue(of([]));
    authServiceStub.logout.mockReset();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should render the brand and default to normal search', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const chips = compiled.querySelectorAll('.search-mode-chip');

    expect(compiled.querySelector('.brand')?.textContent).toContain('CineMatch');
    expect(compiled.querySelector('.search-input')).toBeTruthy();
    expect(chips[0]?.textContent).toContain('Normal');
    expect(component.searchMode()).toBe('normal');
  });

  it('should allow normal search while the user is logged out', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('.search-input') as HTMLInputElement;

    expect(input.disabled).toBe(false);
    expect(input.placeholder).toContain('Search movies');
  });

  it('should disable AI search when the user is not authenticated', () => {
    component.setSearchMode('ai');
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.search-input') as HTMLInputElement;

    expect(input.disabled).toBe(true);
    expect(input.placeholder).toContain('Sign in');
  });

  it('should debounce normal search input and open the dropdown with TMDB results', async () => {
    vi.useFakeTimers();
    movieServiceStub.searchMovies.mockReturnValue(of([]));
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('.search-input'))
      .nativeElement as HTMLInputElement;
    input.value = 'interstellar';
    input.dispatchEvent(new Event('input'));

    await vi.advanceTimersByTimeAsync(299);
    expect(movieServiceStub.searchMovies).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();

    expect(movieServiceStub.searchMovies).toHaveBeenCalledWith('interstellar');
    expect(component.isSearchOpen()).toBe(true);
    expect(fixture.debugElement.query(By.css('.search-dropdown'))).not.toBeNull();
    vi.useRealTimers();
  });

  it('should not call TMDB search while the user is only typing in AI mode', () => {
    authServiceStub.isAuthenticated.set(true);
    component.setSearchMode('ai');
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('.search-input'))
      .nativeElement as HTMLInputElement;
    input.value = 'space opera';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.searchQuery()).toBe('space opera');
    expect(component.isSearchOpen()).toBe(false);
    expect(movieServiceStub.searchMovies).not.toHaveBeenCalled();
    expect(movieServiceStub.aiSearch).not.toHaveBeenCalled();
  });

  it('should run AI search only after submit in AI mode', () => {
    authServiceStub.isAuthenticated.set(true);
    movieServiceStub.aiSearch.mockReturnValue(
      of({ status: 'success', fallback_used: false, movies: [] }),
    );
    component.setSearchMode('ai');
    fixture.detectChanges();

    const form = fixture.debugElement.query(By.css('.search-form'))
      .nativeElement as HTMLFormElement;
    const input = fixture.debugElement.query(By.css('.search-input'))
      .nativeElement as HTMLInputElement;
    input.value = 'mind-bending sci-fi';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(movieServiceStub.aiSearch).toHaveBeenCalledWith({ prompt: 'mind-bending sci-fi' });
    expect(component.isSearchOpen()).toBe(true);
    expect(fixture.debugElement.query(By.css('.search-dropdown'))).not.toBeNull();
  });
});
