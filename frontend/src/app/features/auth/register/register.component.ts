import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule, LucideIconProvider, LUCIDE_ICONS, Eye, EyeOff } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { OnboardingService } from '../../../core/services/onboarding.service';
import { AuthLayoutComponent } from '../components/auth-layout/auth-layout.component';
import type { RegisterRequest } from '../../../core/models/auth.models';

const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password');
  const confirm = control.get('confirmPassword');
  if (!password || !confirm) return null;
  return password.value === confirm.value ? null : { passwordMismatch: true };
};

const trimmedRequired: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = (control.value ?? '').toString();
  return value.trim().length > 0 ? null : { required: true };
};

const passwordComplexity: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = (control.value ?? '').toString();
  if (!value) return null;

  const errors: ValidationErrors = {};
  if (!/[A-Z]/.test(value)) errors['uppercase'] = true;
  if (!/[0-9]/.test(value)) errors['number'] = true;
  if (!/[^A-Za-z0-9]/.test(value)) errors['special'] = true;
  if (!/[a-z]/.test(value)) errors['lowercase'] = true;

  return Object.keys(errors).length > 0 ? errors : null;
};

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, LucideAngularModule],
  providers: [
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ Eye, EyeOff }) },
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly onboarding = inject(OnboardingService);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly form = this.fb.group(
    {
      displayName: ['', [trimmedRequired, Validators.minLength(2)]],
      email: ['', [trimmedRequired, Validators.email]],
      password: [
        '',
        [trimmedRequired, Validators.minLength(12), Validators.maxLength(128), passwordComplexity],
      ],
      confirmPassword: ['', trimmedRequired],
    },
    { validators: passwordMatchValidator },
  );

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  onSubmit(): void {
    if (this.isLoading()) return;

    this.errorMessage.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid) return;

    this.isLoading.set(true);

    const displayName = (this.form.controls.displayName.value ?? '').toString().trim();
    const email = (this.form.controls.email.value ?? '').toString().trim().toLowerCase();
    const password = (this.form.controls.password.value ?? '').toString();
    const req: RegisterRequest = { displayName, email, password };

    this.auth
      .register(req)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: () => {
          this.onboarding.reset();
          this.router.navigate(['/onboarding']);
        },
        error: () => {
          this.errorMessage.set(
            'Unable to create your account. Please check your details and try again.',
          );
        },
      });
  }
}
