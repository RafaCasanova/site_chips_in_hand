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
    title: 'Criar conta | Chips in Hand',
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login.page').then((module) => module.LoginPage),
    title: 'Entrar | Chips in Hand',
  },
  {
    path: 'settings/integrations/whatsapp',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./pages/whatsapp.page').then((module) => module.WhatsappPage),
    title: 'Conectar WhatsApp | Chips in Hand',
  },
  {
    path: 'whatsapp',
    redirectTo: 'settings/integrations/whatsapp',
    pathMatch: 'full',
  },
  {
    path: 'pay/:token',
    loadComponent: () => import('./pages/billing.page').then((module) => module.BillingPage),
    title: 'Cobrança | Chips in Hand',
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found.page').then((module) => module.NotFoundPage),
    title: 'Página não encontrada | Chips in Hand',
  },
];
