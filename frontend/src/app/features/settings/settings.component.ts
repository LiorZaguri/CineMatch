import { CommonModule } from '@angular/common';
import {
    AfterViewInit,
    Component,
    HostListener,
    OnDestroy,
    OnInit,
    WritableSignal,
    computed,
    effect,
    inject,
    signal,
} from '@angular/core';
import {
    AbstractControl,
    FormBuilder,
    ReactiveFormsModule,
    ValidationErrors,
    ValidatorFn,
    Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import type { ChangePasswordRequest, DeleteAccountRequest, UpdateProfileRequest } from '../../core/models/auth.models';

const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const newPassword = control.get('newPassword');
    const confirmPassword = control.get('confirmPassword');

    if (!newPassword || !confirmPassword) {
        return null;
    }

    return newPassword.value === confirmPassword.value ? null : { passwordMismatch: true };
};

type FeedbackState = {
    type: 'success' | 'error';
    message: string;
};

type SectionId = 'sec-profile' | 'sec-danger';

type PasswordStrength = {
    score: number;
    label: string;
    tone: '' | 'w' | 'm' | 's';
};

const AVATAR_OUTPUT_SIZE = 512;
const AVATAR_MAX_INPUT_BYTES = 6 * 1024 * 1024;
const AVATAR_TARGET_BYTES = 300 * 1024;
const AVATAR_HARD_MAX_BYTES = 1024 * 1024;
const AVATAR_MIN_QUALITY = 0.6;
const AVATAR_START_QUALITY = 0.86;
const AVATAR_QUALITY_STEP = 0.08;

@Component({
    selector: 'app-settings',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './settings.component.html',
    styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnInit, AfterViewInit, OnDestroy {
    private readonly auth = inject(AuthService);
    private readonly fb = inject(FormBuilder);
    private readonly router = inject(Router);
    private readonly revealTimers: ReturnType<typeof setTimeout>[] = [];
    private objectPreviewUrl: string | null = null;
    private avatarSelectionId = 0;
    private readonly sectionIds: SectionId[] = ['sec-profile', 'sec-danger'];

    readonly currentUser = this.auth.currentUser;
    readonly passwordBars = [1, 2, 3, 4];

    readonly showHero = signal(false);
    readonly showProfileCard = signal(false);
    readonly showDangerCard = signal(false);
    readonly activeSection = signal<SectionId>('sec-profile');

    readonly isProfileSaving = signal(false);
    readonly isPasswordSaving = signal(false);
    readonly isDeleting = signal(false);
    readonly isDeleteConfirming = signal(false);
    readonly isAvatarUploading = signal(false);
    readonly isAvatarProcessing = signal(false);

    readonly profileFeedback = signal<FeedbackState | null>(null);
    readonly passwordFeedback = signal<FeedbackState | null>(null);
    readonly deleteFeedback = signal<FeedbackState | null>(null);
    readonly avatarFeedback = signal<FeedbackState | null>(null);

    readonly avatarPreviewUrl = signal<string | null>(null);
    readonly selectedAvatarFile = signal<File | null>(null);

    readonly profileForm = this.fb.group({
        displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
        email: [{ value: '', disabled: true }],
    });

    readonly passwordForm = this.fb.group(
        {
            oldPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
            newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
            confirmPassword: ['', Validators.required],
        },
        { validators: passwordMatchValidator },
    );

    readonly deleteForm = this.fb.group({
        password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
    });
    readonly hasPasswordInput = computed(() => {
        const oldPassword = this.passwordForm.controls.oldPassword.value?.trim() ?? '';
        const newPassword = this.passwordForm.controls.newPassword.value?.trim() ?? '';
        const confirmPassword = this.passwordForm.controls.confirmPassword.value?.trim() ?? '';

        return !!(oldPassword || newPassword || confirmPassword);
    });
    readonly passwordStrength = computed<PasswordStrength>(() => {
        const value = this.passwordForm.controls.newPassword.value ?? '';

        if (!value) {
            return { score: 0, label: 'Minimum 8 characters.', tone: '' };
        }

        let score = 0;
        if (value.length >= 8) {
            score++;
        }
        if (/[A-Z]/.test(value)) {
            score++;
        }
        if (/[0-9]/.test(value)) {
            score++;
        }
        if (/[^A-Za-z0-9]/.test(value)) {
            score++;
        }

        if (score <= 1) {
            return { score, label: 'Weak', tone: 'w' };
        }

        if (score <= 2) {
            return { score, label: 'Fair - add uppercase & numbers', tone: 'm' };
        }

        if (score === 3) {
            return { score, label: 'Good - add a symbol', tone: 's' };
        }

        return { score, label: 'Strong', tone: 's' };
    });
    readonly canSaveChanges = computed(() => {
        const hasProfileChanges = this.profileForm.dirty;
        const hasPasswordChanges = this.hasPasswordInput();
        const hasAvatarChanges = !!this.selectedAvatarFile();

        if (this.isAvatarProcessing() || this.isAvatarUploading() || this.isProfileSaving() || this.isPasswordSaving()) {
            return false;
        }

        if (!hasProfileChanges && !hasPasswordChanges && !hasAvatarChanges) {
            return false;
        }

        if (hasProfileChanges && this.profileForm.invalid) {
            return false;
        }

        if (hasPasswordChanges && this.passwordForm.invalid) {
            return false;
        }

        return true;
    });

    constructor() {
        effect(() => {
            const user = this.currentUser();
            if (!user) {
                return;
            }

            this.profileForm.controls.email.setValue(user.email, { emitEvent: false });

            if (!this.profileForm.dirty) {
                this.profileForm.controls.displayName.setValue(user.displayName, { emitEvent: false });
            }
        });
    }

    ngOnInit(): void {
        this.scheduleReveal(this.showHero, 50);
        this.scheduleReveal(this.showProfileCard, 140);
        this.scheduleReveal(this.showDangerCard, 230);
    }

    ngAfterViewInit(): void {
        requestAnimationFrame(() => this.syncActiveSection());
    }

    ngOnDestroy(): void {
        for (const timer of this.revealTimers) {
            clearTimeout(timer);
        }

        this.clearPreviewUrl();
    }

    saveProfile(): void {
        if (this.profileForm.invalid || this.isProfileSaving()) {
            this.profileForm.markAllAsTouched();
            return;
        }

        const displayName = this.profileForm.controls.displayName.value?.trim() ?? '';
        const currentDisplayName = this.currentUser()?.displayName ?? '';

        if (displayName === currentDisplayName) {
            this.profileFeedback.set({ type: 'success', message: 'Display name is already up to date.' });
            return;
        }

        this.isProfileSaving.set(true);
        this.profileFeedback.set(null);

        const req: UpdateProfileRequest = { displayName };

        this.auth.updateProfile(req).subscribe({
            next: () => {
                this.profileForm.controls.displayName.setValue(displayName, { emitEvent: false });
                this.profileForm.markAsPristine();
                this.profileFeedback.set({ type: 'success', message: 'Profile updated successfully.' });
                this.isProfileSaving.set(false);
            },
            error: (err: { error?: { message?: string } }) => {
                this.profileFeedback.set({
                    type: 'error',
                    message: err?.error?.message ?? 'Unable to update your profile right now.',
                });
                this.isProfileSaving.set(false);
            },
        });
    }

    onAvatarSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            this.avatarFeedback.set({
                type: 'error',
                message: 'Please upload a JPG, PNG, or WebP file.',
            });
            input.value = '';
            return;
        }

        if (file.size > AVATAR_MAX_INPUT_BYTES) {
            this.avatarFeedback.set({
                type: 'error',
                message: 'Avatar file must be under 6MB before optimization.',
            });
            input.value = '';
            return;
        }

        const selectionId = ++this.avatarSelectionId;
        this.isAvatarProcessing.set(true);
        this.avatarFeedback.set({ type: 'success', message: 'Optimizing image...' });

        void this.prepareAvatarFile(file).then((result) => {
            if (selectionId !== this.avatarSelectionId) {
                return;
            }

            this.selectedAvatarFile.set(result.file);
            this.avatarFeedback.set({
                type: 'success',
                message: 'Preview ready. Save to upload.',
            });

            this.setPreviewUrl(result.previewUrl, true);
        }).catch((err: Error) => {
            if (selectionId !== this.avatarSelectionId) {
                return;
            }

            this.avatarFeedback.set({
                type: 'error',
                message: err.message || 'Unable to optimize the image.',
            });
            this.selectedAvatarFile.set(null);
            this.setPreviewUrl(null);
        }).finally(() => {
            if (selectionId === this.avatarSelectionId) {
                this.isAvatarProcessing.set(false);
            }
        });

        input.value = '';
    }

    uploadAvatar(): void {
        const file = this.selectedAvatarFile();
        if (!file || this.isAvatarUploading() || this.isAvatarProcessing()) {
            return;
        }

        this.isAvatarUploading.set(true);
        this.avatarFeedback.set(null);

        this.auth.uploadAvatar(file).pipe(
            finalize(() => this.isAvatarUploading.set(false)),
        ).subscribe({
            next: () => {
                this.avatarFeedback.set({ type: 'success', message: 'Avatar updated successfully.' });
                this.selectedAvatarFile.set(null);
                this.setPreviewUrl(null);
            },
            error: (err: { error?: { message?: string } }) => {
                this.avatarFeedback.set({
                    type: 'error',
                    message: err?.error?.message ?? (err as { message?: string })?.message ?? 'Unable to update avatar right now.',
                });
            },
        });
    }

    getAvatarInitials(): string {
        const name = this.currentUser()?.displayName ?? '';
        const initials = name
            .split(' ')
            .filter(Boolean)
            .map((part) => part[0]?.toUpperCase())
            .slice(0, 2)
            .join('');

        return initials || 'CM';
    }

    scrollToSection(sectionId: SectionId): void {
        this.activeSection.set(sectionId);
        const section = document.getElementById(sectionId);
        if (!section) {
            return;
        }

        const top = section.getBoundingClientRect().top + window.scrollY - 116;
        window.scrollTo({ top, behavior: 'smooth' });
    }

    passwordBarClass(index: number): string {
        const strength = this.passwordStrength();
        if (strength.score < index) {
            return '';
        }

        return strength.tone;
    }

    saveChanges(): void {
        const shouldSaveProfile = this.profileForm.dirty;
        const shouldSavePassword = this.hasPasswordInput();
        const shouldUploadAvatar = !!this.selectedAvatarFile();

        if (!shouldSaveProfile && !shouldSavePassword && !shouldUploadAvatar) {
            return;
        }

        if (shouldSaveProfile && this.profileForm.invalid) {
            this.profileForm.markAllAsTouched();
        }

        if (shouldSavePassword && this.passwordForm.invalid) {
            this.passwordForm.markAllAsTouched();
        }

        if ((shouldSaveProfile && this.profileForm.invalid) || (shouldSavePassword && this.passwordForm.invalid) || this.isAvatarProcessing()) {
            return;
        }

        if (shouldUploadAvatar) {
            this.uploadAvatar();
        }

        if (shouldSaveProfile) {
            this.saveProfile();
        }

        if (shouldSavePassword) {
            this.updatePassword();
        }
    }

    updatePassword(): void {
        if (this.passwordForm.invalid || this.isPasswordSaving()) {
            this.passwordForm.markAllAsTouched();
            return;
        }

        this.isPasswordSaving.set(true);
        this.passwordFeedback.set(null);

        const req: ChangePasswordRequest = {
            oldPassword: this.passwordForm.controls.oldPassword.value ?? '',
            newPassword: this.passwordForm.controls.newPassword.value ?? '',
        };

        this.auth.changePassword(req).subscribe({
            next: () => {
                this.passwordForm.reset();
                this.passwordFeedback.set({ type: 'success', message: 'Password updated successfully.' });
                this.isPasswordSaving.set(false);
            },
            error: (err: { error?: { message?: string } }) => {
                this.passwordFeedback.set({
                    type: 'error',
                    message: err?.error?.message ?? 'Unable to update your password right now.',
                });
                this.isPasswordSaving.set(false);
            },
        });
    }

    revealDeleteConfirmation(): void {
        this.isDeleteConfirming.set(true);
        this.deleteFeedback.set(null);
    }

    cancelDeleteConfirmation(): void {
        this.isDeleteConfirming.set(false);
        this.deleteFeedback.set(null);
        this.deleteForm.reset();
    }

    deleteAccount(): void {
        if (this.deleteForm.invalid || this.isDeleting()) {
            this.deleteForm.markAllAsTouched();
            return;
        }

        this.isDeleting.set(true);
        this.deleteFeedback.set(null);

        const req: DeleteAccountRequest = {
            password: this.deleteForm.controls.password.value ?? '',
        };

        this.auth.deleteAccount(req).subscribe({
            next: () => {
                this.isDeleting.set(false);
                void this.router.navigate(['/']);
            },
            error: (err: { error?: { message?: string } }) => {
                this.deleteFeedback.set({
                    type: 'error',
                    message: err?.error?.message ?? 'Unable to delete your account right now.',
                });
                this.isDeleting.set(false);
            },
        });
    }

    @HostListener('window:scroll')
    onWindowScroll(): void {
        this.syncActiveSection();
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        if (this.isDeleteConfirming()) {
            this.cancelDeleteConfirmation();
        }
    }

    private scheduleReveal(state: WritableSignal<boolean>, delayMs: number): void {
        const timer = setTimeout(() => state.set(true), delayMs);
        this.revealTimers.push(timer);
    }

    private syncActiveSection(): void {
        let currentSection: SectionId = this.sectionIds[0];

        for (const sectionId of this.sectionIds) {
            const section = document.getElementById(sectionId);
            if (!section) {
                continue;
            }

            if (section.getBoundingClientRect().top <= 180) {
                currentSection = sectionId;
            }
        }

        this.activeSection.set(currentSection);
    }

    private setPreviewUrl(url: string | null, isObjectUrl = false): void {
        this.clearPreviewUrl();
        this.avatarPreviewUrl.set(url);
        if (isObjectUrl) {
            this.objectPreviewUrl = url;
        }
    }

    private clearPreviewUrl(): void {
        if (this.objectPreviewUrl) {
            URL.revokeObjectURL(this.objectPreviewUrl);
            this.objectPreviewUrl = null;
        }
    }

    private async prepareAvatarFile(file: File): Promise<{ file: File; previewUrl: string }> {
        const image = await this.loadImage(file);
        const size = Math.min(image.width, image.height);
        const sx = Math.max(0, (image.width - size) / 2);
        const sy = Math.max(0, (image.height - size) / 2);

        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_OUTPUT_SIZE;
        canvas.height = AVATAR_OUTPUT_SIZE;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Unable to process the image.');
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image.element, sx, sy, size, size, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
        if ('close' in image.element && typeof (image.element as ImageBitmap).close === 'function') {
            (image.element as ImageBitmap).close();
        }

        let quality = AVATAR_START_QUALITY;
        let blob = await this.canvasToBlob(canvas, 'image/jpeg', quality);

        while (blob.size > AVATAR_TARGET_BYTES && quality > AVATAR_MIN_QUALITY) {
            quality = Math.max(AVATAR_MIN_QUALITY, quality - AVATAR_QUALITY_STEP);
            blob = await this.canvasToBlob(canvas, 'image/jpeg', quality);
        }

        if (blob.size > AVATAR_HARD_MAX_BYTES) {
            throw new Error('Avatar is still too large after optimization. Try a smaller image.');
        }

        const optimizedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
        const previewUrl = URL.createObjectURL(blob);
        return { file: optimizedFile, previewUrl };
    }

    private async loadImage(file: File): Promise<{ element: CanvasImageSource; width: number; height: number }> {
        if ('createImageBitmap' in window) {
            const bitmap = await createImageBitmap(file);
            return { element: bitmap, width: bitmap.width, height: bitmap.height };
        }

        const imageUrl = URL.createObjectURL(file);
        try {
            const img = new Image();
            img.src = imageUrl;
            await img.decode();
            return { element: img, width: img.naturalWidth, height: img.naturalHeight };
        } finally {
            URL.revokeObjectURL(imageUrl);
        }
    }

    private canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('Image conversion failed.'));
                    return;
                }
                resolve(blob);
            }, type, quality);
        });
    }
}
