import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { SettingsComponent } from './settings.component';
import { AuthService } from '../../core/services/auth.service';

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let component: SettingsComponent;

  const currentUser = signal({
    id: 'user-1',
    email: 'user@mail.com',
    displayName: 'Existing User',
    avatarUrl: null,
  });

  const authMock = {
    currentUser: currentUser.asReadonly(),
    updateProfile: vi.fn().mockReturnValue(
      of({
        user: {
          id: 'user-1',
          email: 'user@mail.com',
          displayName: 'Updated User',
          avatarUrl: null,
        },
      }),
    ),
    uploadAvatar: vi.fn(),
    changePassword: vi.fn().mockReturnValue(of(null)),
    deleteAccount: vi.fn().mockReturnValue(of(null)),
  };

  beforeEach(async () => {
    authMock.updateProfile.mockClear();
    authMock.changePassword.mockClear();
    authMock.deleteAccount.mockClear();
    currentUser.set({
      id: 'user-1',
      email: 'user@mail.com',
      displayName: 'Existing User',
      avatarUrl: null,
    });

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: authMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should populate the profile form from the current user', () => {
    expect(component.profileForm.controls.displayName.value).toBe('Existing User');
    expect(component.profileForm.controls.email.value).toBe('user@mail.com');
  });

  it('should reveal the password confirmation form before account deletion', () => {
    const trigger = fixture.debugElement.query(By.css('.btn-red'));
    trigger.nativeElement.click();
    fixture.detectChanges();

    expect(component.isDeleteConfirming()).toBe(true);

    const passwordInput = fixture.debugElement.query(By.css('input[formControlName="password"]'));
    expect(passwordInput).toBeTruthy();
  });

  it('should submit the trimmed display name to the auth service', () => {
    component.profileForm.controls.displayName.setValue('  Updated User  ');
    component.profileForm.controls.displayName.markAsDirty();

    component.saveProfile();

    expect(authMock.updateProfile).toHaveBeenCalledWith({ displayName: 'Updated User' });
  });

  it('should enable the save changes button when the display name changes', () => {
    const saveButton: HTMLButtonElement = fixture.nativeElement.querySelector('.sidebar-save-btn');
    expect(saveButton.disabled).toBe(true);

    component.profileForm.controls.displayName.setValue('Updated User');
    fixture.detectChanges();

    expect(component.canSaveChanges()).toBe(true);
    expect(saveButton.disabled).toBe(false);
  });

  it('should enable the save changes button when the password form is valid', () => {
    const saveButton: HTMLButtonElement = fixture.nativeElement.querySelector('.sidebar-save-btn');
    expect(saveButton.disabled).toBe(true);

    component.passwordForm.controls.oldPassword.setValue('CurrentPass123!');
    component.passwordForm.controls.newPassword.setValue('UpdatedPass123!');
    component.passwordForm.controls.confirmPassword.setValue('UpdatedPass123!');
    fixture.detectChanges();

    expect(component.canSaveChanges()).toBe(true);
    expect(saveButton.disabled).toBe(false);
  });
});
