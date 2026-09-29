import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  TitleStrategy,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';
import { LocalizedTitleStrategy } from './core/localized-title.strategy';
import { RuntimeConfigService } from './core/runtime-config.service';
import { sessionInterceptor } from './core/session.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([sessionInterceptor])),
    provideAppInitializer(() => inject(RuntimeConfigService).load()),
    { provide: TitleStrategy, useClass: LocalizedTitleStrategy },
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      withViewTransitions(),
    ),
  ],
};
