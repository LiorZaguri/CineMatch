import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () =>
            import('./features/home/home-hero/home-hero.component').then((m) => m.HomeHeroComponent),
    },
    {
        path: 'login',
        loadComponent: () =>
            import('./features/auth/login/login.component').then((m) => m.LoginComponent),
        canActivate: [guestGuard],
    },
    {
        path: 'register',
        loadComponent: () =>
            import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
        canActivate: [guestGuard],
    },
    {
        path: 'movies',
        loadComponent: () =>
            import('./features/movies/movie-list/movie-list.component').then((m) => m.MovieListComponent),
        canActivate: [authGuard],
    },
    {
        path: 'movies/:tmdbId',
        loadComponent: () =>
            import('./features/movies/movie-detail/movie-detail.component').then((m) => m.MovieDetailComponent),
        canActivate: [authGuard],
    },
    {
        path: 'settings',
        loadComponent: () =>
            import('./features/settings/settings.component').then((m) => m.SettingsComponent),
        canActivate: [authGuard],
    },
    {
        path: '**',
        redirectTo: '/',
    },
];
