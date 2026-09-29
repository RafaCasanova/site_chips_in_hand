import { Routes } from '@angular/router';
import { authenticatedGuard } from './core/authenticated.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home.page').then((module) => module.HomePage),
    title: 'Chips in Hand',
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register.page').then((module) => module.RegisterPage),
    title: 'route.register',
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login.page').then((module) => module.LoginPage),
    title: 'route.login',
  },
  {
    path: 'auth/google/complete',
    loadComponent: () =>
      import('./pages/google-auth-complete.page').then((module) => module.GoogleAuthCompletePage),
    title: 'route.googleAuthComplete',
  },
  {
    path: 'settings/integrations',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/integrations.page').then((module) => module.IntegrationsPage),
    title: 'route.integrations',
  },
  {
    path: 'settings/integrations/whatsapp',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./pages/whatsapp.page').then((module) => module.WhatsappPage),
    title: 'route.whatsapp',
  },
  {
    path: 'settings/integrations/google-calendar',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/google-calendar.page').then((module) => module.GoogleCalendarPage),
    title: 'route.googleCalendar',
  },
  {
    path: 'integrations/google-calendar/complete',
    loadComponent: () =>
      import('./pages/google-calendar-complete.page').then(
        (module) => module.GoogleCalendarCompletePage,
      ),
    title: 'route.googleCalendarComplete',
  },
  {
    path: 'whatsapp',
    redirectTo: 'settings/integrations/whatsapp',
    pathMatch: 'full',
  },
  {
    path: 'pay/:token',
    loadComponent: () => import('./pages/billing.page').then((module) => module.BillingPage),
    title: 'route.billing',
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found.page').then((module) => module.NotFoundPage),
    title: 'route.notFound',
  },
];
