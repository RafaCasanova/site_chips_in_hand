import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { I18nService } from './core/i18n.service';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    const meta = inject(Meta);
    const document = inject(DOCUMENT);
    const i18n = inject(I18nService);
    effect(() => {
      i18n.locale();
      meta.updateTag({ name: 'description', content: i18n.translate('meta.description') });
    });
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        meta.updateTag({
          name: 'robots',
          content:
            event.urlAfterRedirects.split('?')[0] === '/'
              ? 'index,follow'
              : 'noindex,nofollow,noarchive',
        });
        document.defaultView?.requestAnimationFrame(() => {
          const main = document.querySelector<HTMLElement>('main');
          if (main) {
            main.setAttribute('tabindex', '-1');
            main.focus({ preventScroll: true });
          }
        });
      });
  }
}
