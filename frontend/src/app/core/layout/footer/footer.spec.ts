import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FooterComponent } from './footer';

describe('FooterComponent (QA Agent)', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should display the current year', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const currentYear = new Date().getFullYear().toString();
    const copyrightText = compiled.querySelector('.footer-bottom p');
    expect(copyrightText?.textContent).toContain(currentYear);
  });

  it('should have standard legal and action links at the bottom', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const linkTexts = Array.from(compiled.querySelectorAll('a')).map((link) =>
      link.textContent?.trim(),
    );
    expect(linkTexts).toContain('Privacy Policy');
    expect(linkTexts).toContain('Terms of Service');
    expect(linkTexts).toContain('Movies');
    expect(linkTexts).toContain('LinkedIn');
  });
});
