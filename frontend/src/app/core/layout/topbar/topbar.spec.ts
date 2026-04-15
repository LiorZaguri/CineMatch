import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { TopbarComponent } from './topbar';
import { AuthService } from '../../services/auth.service';
import { MovieService } from '../../services/movie.service';

describe('TopbarComponent', () => {
    let component: TopbarComponent;
    let fixture: ComponentFixture<TopbarComponent>;

    const authServiceStub = {
        isAuthenticated: signal(false),
        currentUser: signal(null),
        logout: jasmine.createSpy('logout')
    };

    const movieServiceStub = {
        aiSearch: jasmine.createSpy('aiSearch').and.returnValue(of({ status: 'success', fallback_used: false, movies: [] }))
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TopbarComponent],
            providers: [
                provideRouter([]),
                { provide: AuthService, useValue: authServiceStub },
                { provide: MovieService, useValue: movieServiceStub }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(TopbarComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create the component', () => {
        expect(component).toBeTruthy();
    });

    it('should render the brand and AI search input', () => {
        const compiled = fixture.nativeElement as HTMLElement;

        expect(compiled.querySelector('.brand')?.textContent).toContain('CineMatch');
        expect(compiled.querySelector('.ai-search-input')).toBeTruthy();
    });

    it('should disable AI search when the user is not authenticated', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        const input = compiled.querySelector('.ai-search-input') as HTMLInputElement;

        expect(input.disabled).toBeTrue();
        expect(input.placeholder).toContain('Sign in');
    });

    it('should not open the AI dropdown while the user is only typing', () => {
        authServiceStub.isAuthenticated.set(true);
        fixture.detectChanges();

        const input = fixture.debugElement.query(By.css('.ai-search-input')).nativeElement as HTMLInputElement;
        input.value = 'interstellar';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();

        expect(component.aiSearchQuery()).toBe('interstellar');
        expect(component.isSearchOpen()).toBeFalse();
        expect(fixture.debugElement.query(By.css('.ai-search-dropdown'))).toBeNull();
    });

    it('should open the AI dropdown after the user submits a search', () => {
        authServiceStub.isAuthenticated.set(true);
        movieServiceStub.aiSearch.and.returnValue(of({ status: 'success', fallback_used: false, movies: [] }));
        fixture.detectChanges();

        const form = fixture.debugElement.query(By.css('.ai-search-form')).nativeElement as HTMLFormElement;
        const input = fixture.debugElement.query(By.css('.ai-search-input')).nativeElement as HTMLInputElement;
        input.value = 'interstellar';
        input.dispatchEvent(new Event('input'));
        form.dispatchEvent(new Event('submit'));
        fixture.detectChanges();

        expect(movieServiceStub.aiSearch).toHaveBeenCalledWith({ prompt: 'interstellar' });
        expect(component.isSearchOpen()).toBeTrue();
        expect(fixture.debugElement.query(By.css('.ai-search-dropdown'))).not.toBeNull();
    });
});
