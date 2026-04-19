import { Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs/operators';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule, LucideIconProvider, LUCIDE_ICONS, Eye, EyeOff } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { AuthLayoutComponent } from '../components/auth-layout/auth-layout.component';
import type { LoginRequest } from '../../../core/models/auth.models';

const trimmedRequired: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = (control.value ?? '').toString();
  return value.trim().length > 0 ? null : { required: true };
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, LucideAngularModule],
  providers: [
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ Eye, EyeOff }) },
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);

  readonly form = this.fb.group({
    email: ['', [trimmedRequired]],
    password: ['', [trimmedRequired]],
  });

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  onSubmit(): void {
    if (this.isLoading()) return;

    this.errorMessage.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid) return;

    this.isLoading.set(true);

    const email = (this.form.controls.email.value ?? '').toString().trim().toLowerCase();
    const password = (this.form.controls.password.value ?? '').toString();
    const req: LoginRequest = { email, password };

    this.auth
      .login(req)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: () => {
          this.router.navigate([
            (this.auth.currentUser()?.onboardingStatus ?? 'pending') === 'pending'
              ? '/onboarding'
              : '/movies',
          ]);
        },
        error: () => {
          this.errorMessage.set('Invalid email or password.');
        },
      });
  }
}
