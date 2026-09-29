import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { resolveSupportedLocale, translations } from './app/core/i18n.service';

bootstrapApplication(App, appConfig).catch(() => {
  const root = document.querySelector('app-root');
  if (root) {
    const locale = resolveSupportedLocale([document.documentElement.lang || 'pt-BR']);
    root.setAttribute('role', 'alert');
    root.textContent = translations[locale]['bootstrap.failed'];
  }
});
