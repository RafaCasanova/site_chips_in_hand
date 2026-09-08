import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SiteSessionService } from '../core/site-session.service';

@Component({
  selector: 'app-site-shell',
  imports: [RouterLink],
  template: `
    <header class="site-header">
      <a class="brand" routerLink="/" aria-label="Chips in Hand, início">
        <span class="brand-mark" aria-hidden="true">C</span>
        <span>Chips in Hand</span>
      </a>
      <nav aria-label="Navegação principal">
        @if (session.session()) {
          <a routerLink="/settings/integrations/whatsapp">WhatsApp</a>
          <span class="user-label">{{ session.session()?.userName }}</span>
          <button type="button" class="link-button" (click)="leave()">Sair desta aba</button>
        } @else {
          <a routerLink="/login">Entrar</a>
          <a class="nav-action" routerLink="/register">Criar conta</a>
        }
      </nav>
    </header>
    <main class="page-shell"><ng-content /></main>
    <footer>Chips in Hand · Ambiente seguro para sua clínica</footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteShellComponent {
  protected readonly session = inject(SiteSessionService);
  private readonly router = inject(Router);

  protected leave(): void {
    this.session.clear();
    void this.router.navigateByUrl('/login');
  }
}
