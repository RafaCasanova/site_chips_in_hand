import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteShellComponent } from '../shared/site-shell.component';

@Component({
  imports: [RouterLink, SiteShellComponent],
  template: `
    <app-site-shell>
      <section class="hero">
        <div>
          <p class="eyebrow">Chips in Hand</p>
          <h1>O essencial da clínica, sem complicação.</h1>
          <p class="hero-copy">
            Crie sua conta, conecte o WhatsApp da clínica e consulte cobranças compartilhadas com
            segurança.
          </p>
          <div class="button-row">
            <a class="button button-primary" routerLink="/register">Criar conta</a>
            <a class="button button-secondary" routerLink="/login">Entrar</a>
          </div>
        </div>
        <aside class="hero-panel" aria-label="Recursos disponíveis">
          <div>
            <span>01</span>
            <p>Cadastro de conta e clínica em uma única operação.</p>
          </div>
          <div>
            <span>02</span>
            <p>Conexão do WhatsApp validada pelo backend.</p>
          </div>
          <div>
            <span>03</span>
            <p>Cobranças públicas com dados reduzidos ao necessário.</p>
          </div>
        </aside>
      </section>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {}
