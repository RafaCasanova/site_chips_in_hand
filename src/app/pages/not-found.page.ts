import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteShellComponent } from '../shared/site-shell.component';
import { TranslatePipe } from '../shared/translate.pipe';

@Component({
  imports: [RouterLink, SiteShellComponent, TranslatePipe],
  template: `
    <app-site-shell>
      <section class="card narrow empty-state">
        <div class="empty-icon" aria-hidden="true">?</div>
        <h1>{{ 'notFound.title' | t }}</h1>
        <p>{{ 'notFound.description' | t }}</p>
        <a class="button button-primary" routerLink="/">{{ 'notFound.backHome' | t }}</a>
      </section>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
