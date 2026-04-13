import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
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
});
