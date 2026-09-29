import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { I18nService, SupportedLocale, supportedLocales } from '../core/i18n.service';
import { SiteSessionService } from '../core/site-session.service';
import { TranslatePipe } from './translate.pipe';

@Component({
  selector: 'app-site-shell',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <a class="skip-link" href="#main-content">{{ 'shell.skipContent' | t }}</a>
    <header class="site-header">
      <div class="header-primary">
        <a class="brand" routerLink="/" [attr.aria-label]="'shell.homeLabel' | t">
          <span class="brand-mark" aria-hidden="true">C</span>
          <span class="brand-copy">
            <strong>Chips in Hand</strong>
            <small>{{ 'shell.clinicManagement' | t }}</small>
          </span>
        </a>

        <label class="language-switcher">
          <span>{{ 'language.label' | t }}</span>
          <select
            [value]="i18n.locale()"
            [disabled]="localeSaving()"
            [attr.aria-label]="'language.label' | t"
            (change)="chooseLocale($event)"
          >
            <option value="pt-BR">{{ 'language.ptBR' | t }}</option>
            <option value="en">{{ 'language.en' | t }}</option>
            <option value="es">{{ 'language.es' | t }}</option>
          </select>
          @if (localeSaving()) {
            <small role="status">{{ 'shell.languageSaving' | t }}</small>
          } @else if (localeMessage()) {
            <small role="alert">{{ localeMessage() }}</small>
          }
        </label>

        @if (session.status() === 'checking') {
          <span class="session-check" role="status">{{ 'shell.checkingSession' | t }}</span>
        } @else if (session.session(); as current) {
          <div class="account-menu">
            <span class="avatar" aria-hidden="true">{{ initials(current.userName) }}</span>
            <span class="account-copy">
              <strong>{{ current.userName }}</strong>
              <small>{{ current.userEmail }}</small>
            </span>
            <button
              class="button button-quiet button-small"
              type="button"
              [disabled]="leaving()"
              [attr.aria-busy]="leaving()"
              (click)="leave()"
            >
              {{ (leaving() ? 'shell.leaving' : 'shell.leave') | t }}
            </button>
          </div>
        } @else {
          <nav class="public-nav" [attr.aria-label]="'shell.publicNavigation' | t">
            <a routerLink="/login" routerLinkActive="active">{{ 'shell.login' | t }}</a>
            <a class="button button-primary button-small" routerLink="/register">{{
              'shell.createAccount' | t
            }}</a>
          </nav>
        }
      </div>

      @if (session.session(); as current) {
        <div class="console-bar">
          <nav class="console-nav" [attr.aria-label]="'shell.accountSettings' | t">
            <a
              routerLink="/settings/integrations"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
              >{{ 'shell.overview' | t }}</a
            >
            <a routerLink="/settings/integrations/google-calendar" routerLinkActive="active">{{
              'shell.googleCalendar' | t
            }}</a>
            <a routerLink="/settings/integrations/whatsapp" routerLinkActive="active">WhatsApp</a>
          </nav>
          @if (current.companies.length > 1) {
            <label class="tenant-switcher">
              <span>{{ 'shell.activeClinic' | t }}</span>
              <select [value]="current.selectedCompanyId" (change)="chooseCompany($event)">
                @for (company of current.companies; track company.companyId) {
                  <option [value]="company.companyId">{{ company.companyName }}</option>
                }
              </select>
            </label>
          } @else {
            <span class="current-tenant">{{ session.selectedCompany()?.companyName }}</span>
          }
        </div>
      }
    </header>
    <main id="main-content" class="page-shell" tabindex="-1"><ng-content /></main>
    <footer>
      <span class="footer-brand"><span aria-hidden="true">C</span> © 2026 Chips in Hand</span>
      <span>{{ 'shell.tagline' | t }}</span>
    </footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteShellComponent implements OnInit {
  protected readonly session = inject(SiteSessionService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  protected readonly leaving = signal(false);
  protected readonly localeSaving = signal(false);
  protected readonly localeMessage = signal('');

  ngOnInit(): void {
    void this.session.initialize();
  }

  protected initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  protected async leave(): Promise<void> {
    if (this.leaving()) return;
    this.leaving.set(true);
    const outcome = await this.session.logout();
    await this.router.navigateByUrl('/login', {
      state:
        outcome === 'local-only'
          ? {
              logoutWarning: this.i18n.translate('shell.logoutLocalOnly'),
            }
          : { logoutMessage: this.i18n.translate('shell.logoutSuccess') },
    });
    this.leaving.set(false);
  }

  protected chooseCompany(event: Event): void {
    const companyId = (event.target as HTMLSelectElement | null)?.value;
    if (!companyId) return;
    this.session.chooseCompany(companyId);
    void this.router.navigateByUrl('/settings/integrations');
  }

  protected async chooseLocale(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement | null;
    const value = select?.value;
    if (!supportedLocales.includes(value as SupportedLocale)) return;
    const locale = value as SupportedLocale;
    if (!this.session.session()) {
      this.i18n.setLocale(locale);
      return;
    }
    this.localeSaving.set(true);
    this.localeMessage.set('');
    try {
      await this.session.updatePreferredLocale(locale);
    } catch {
      if (select) select.value = this.i18n.locale();
      this.localeMessage.set(this.i18n.translate('shell.languageSaveFailed'));
    } finally {
      this.localeSaving.set(false);
    }
  }
}
