import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteShellComponent } from '../shared/site-shell.component';

@Component({
  imports: [RouterLink, SiteShellComponent],
  template: `
    <app-site-shell>
      <section class="card narrow empty-state">
        <div class="empty-icon" aria-hidden="true">?</div>
        <h1>Página não encontrada</h1>
        <p>Confira o endereço ou volte ao início.</p>
        <a class="button button-primary" routerLink="/">Voltar ao início</a>
      </section>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
