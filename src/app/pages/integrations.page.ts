import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiClientService, ApiError, TransportError } from '../core/api-client.service';
import { ApiWarning, GoogleCalendarConnection, WhatsappConnection } from '../core/api.models';
import { I18nService } from '../core/i18n.service';
import { SiteSessionService } from '../core/site-session.service';
import { SiteShellComponent } from '../shared/site-shell.component';
import { TranslatePipe } from '../shared/translate.pipe';
import { WarningsComponent } from '../shared/warnings.component';

type IntegrationStatus =
  | 'loading'
  | 'unavailable'
  | 'noPermission'
  | 'unconfirmed'
  | 'disconnected'
  | 'attention'
  | 'active'
  | 'progress';

@Component({
  imports: [RouterLink, SiteShellComponent, TranslatePipe, WarningsComponent],
  template: `
    <app-site-shell>
      <section class="page-heading">
        <div>
          <p class="eyebrow">{{ 'integrations.eyebrow' | t }}</p>
          <h1>{{ 'integrations.title' | t }}</h1>
          <p class="lead">
            {{ 'integrations.lead' | t }}
          </p>
        </div>
        <span class="security-chip">{{ company()?.companyName }}</span>
      </section>

      @if (warnings().length) {
        <app-warnings [warnings]="warnings()" />
      }
      @if (error()) {
        <div class="notice notice-error" role="alert">
          {{ error() }}
          <button
            class="link-button"
            type="button"
            [disabled]="loading()"
            [attr.aria-busy]="loading()"
            (click)="load()"
          >
            {{ 'integrations.retry' | t }}
          </button>
        </div>
      }

      <div class="integration-grid" [attr.aria-busy]="loading()">
        <article class="integration-overview-card">
          <div class="integration-logo google-logo" aria-hidden="true">
            <img src="/google-g.svg" alt="" width="24" height="24" />
          </div>
          <div class="card-heading-row">
            <div>
              <p class="eyebrow">{{ 'integrations.calendar' | t }}</p>
              <h2>{{ 'shell.googleCalendar' | t }}</h2>
            </div>
            <span [class]="statusClass(googleStatus())">{{ statusLabel(googleStatus()) }}</span>
          </div>
          <p>
            {{ 'integrations.googleDescription' | t }}
          </p>
          @if (!company()?.googleCalendarSync) {
            <p class="capability-note">{{ 'integrations.notEnabled' | t }}</p>
          } @else if (!company()?.agendaRead) {
            <p class="capability-note">{{ 'integrations.noAccess' | t }}</p>
          } @else if (googleConnections().length) {
            <p class="summary-line">
              <strong>{{ googleConnections().length }}</strong>
              {{
                (googleConnections().length === 1
                  ? 'integrations.connectionFound'
                  : 'integrations.connectionsFound'
                ) | t
              }}
            </p>
          }
          <a
            class="button button-secondary button-full"
            routerLink="/settings/integrations/google-calendar"
          >
            {{ 'integrations.manageGoogle' | t }}
          </a>
        </article>

        <article class="integration-overview-card">
          <div class="integration-logo whatsapp-logo" aria-hidden="true">W</div>
          <div class="card-heading-row">
            <div>
              <p class="eyebrow">{{ 'integrations.communication' | t }}</p>
              <h2>WhatsApp</h2>
            </div>
            <span [class]="statusClass(whatsappStatus())">{{ statusLabel(whatsappStatus()) }}</span>
          </div>
          <p>
            {{ 'integrations.whatsappDescription' | t }}
          </p>
          @if (!company()?.whatsappMessaging) {
            <p class="capability-note">{{ 'integrations.notEnabled' | t }}</p>
          } @else if (!company()?.companyRead) {
            <p class="capability-note">{{ 'integrations.noAccess' | t }}</p>
          } @else if (whatsappConnections().length) {
            <p class="summary-line">
              <strong>{{ whatsappConnections().length }}</strong>
              {{ 'integrations.connectionFound' | t }}
            </p>
          }
          <a
            class="button button-secondary button-full"
            routerLink="/settings/integrations/whatsapp"
          >
            {{ 'integrations.manageWhatsapp' | t }}
          </a>
        </article>
      </div>

      <section class="card consent-explainer">
        <div class="icon-badge" aria-hidden="true">i</div>
        <div>
          <h2>{{ 'integrations.googleConsentTitle' | t }}</h2>
          <p>
            {{ 'integrations.googleConsentDescription' | t }}
          </p>
        </div>
      </section>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntegrationsPage {
  protected readonly session = inject(SiteSessionService);
  private readonly api = inject(ApiClientService);
  private readonly i18n = inject(I18nService);
  protected readonly company = this.session.selectedCompany;
  protected readonly googleConnections = signal<GoogleCalendarConnection[]>([]);
  protected readonly whatsappConnections = signal<WhatsappConnection[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly warnings = signal<ApiWarning[]>(this.routeWarnings());
  private readonly googleFailed = signal(false);
  private readonly whatsappFailed = signal(false);

  constructor() {
    effect(() => {
      this.session.session();
      untracked(() => {
        this.googleConnections.set([]);
        this.whatsappConnections.set([]);
        void this.load();
      });
    });
  }

  protected async load(): Promise<void> {
    const current = this.session.session();
    const company = this.company();
    if (!current || !company) return;
    const principal = this.session.principal(current);
    this.loading.set(true);
    this.error.set('');
    try {
      const googleRequest =
        company.googleCalendarSync && company.agendaRead
          ? firstValueFrom(this.api.listGoogleCalendarConnections(principal))
          : Promise.resolve(null);
      const whatsappRequest =
        company.whatsappMessaging && company.companyRead
          ? firstValueFrom(this.api.listWhatsappConnections(principal))
          : Promise.resolve(null);
      const [google, whatsapp] = await Promise.allSettled([googleRequest, whatsappRequest]);
      if (!this.session.samePrincipal(principal)) return;
      this.googleFailed.set(google.status === 'rejected');
      this.whatsappFailed.set(whatsapp.status === 'rejected');
      this.googleConnections.set(google.status === 'fulfilled' ? (google.value?.data ?? []) : []);
      this.whatsappConnections.set(
        whatsapp.status === 'fulfilled' ? (whatsapp.value?.data ?? []) : [],
      );
      const failures = [google, whatsapp].filter((item) => item.status === 'rejected');
      if (failures.length)
        this.error.set(failures.map((item) => this.errorMessage(item.reason)).join(' '));
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      if (this.session.samePrincipal(principal)) this.loading.set(false);
    }
  }

  protected googleStatus(): IntegrationStatus {
    if (this.loading()) return 'loading';
    if (!this.company()?.googleCalendarSync) return 'unavailable';
    if (!this.company()?.agendaRead) return 'noPermission';
    if (this.googleFailed()) return 'unconfirmed';
    const connections = this.googleConnections().filter((item) => item.status !== 'revoked');
    if (!connections.length) return 'disconnected';
    if (connections.some((item) => item.status === 'degraded' || item.requiresReconnect))
      return 'attention';
    return connections.some((item) => item.status === 'active' && item.enabled)
      ? 'active'
      : connections.some((item) => item.status === 'degraded' || item.requiresReconnect)
        ? 'attention'
        : 'progress';
  }

  protected whatsappStatus(): IntegrationStatus {
    if (this.loading()) return 'loading';
    if (!this.company()?.whatsappMessaging) return 'unavailable';
    if (!this.company()?.companyRead) return 'noPermission';
    if (this.whatsappFailed()) return 'unconfirmed';
    const connection = this.whatsappConnections().find((item) => item.status !== 'revoked');
    if (!connection) return 'disconnected';
    if (connection.status === 'active' && connection.enabled) return 'active';
    if (connection.status === 'degraded' || connection.status === 'reconnect_required')
      return 'attention';
    return 'progress';
  }

  protected statusLabel(status: IntegrationStatus): string {
    return this.i18n.translate(`integrations.status.${status}`);
  }

  protected statusClass(status: IntegrationStatus): string {
    if (status === 'active') return 'status-pill status-ok';
    if (status === 'attention') return 'status-pill status-warn';
    if (status === 'loading' || status === 'progress') return 'status-pill status-progress';
    return 'status-pill';
  }

  private routeWarnings(): ApiWarning[] {
    const value: unknown = globalThis.history.state?.registrationWarnings;
    return Array.isArray(value) ? (value as ApiWarning[]) : [];
  }

  private errorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    if (error instanceof TransportError)
      return this.i18n.translate('integrations.backendUnavailable');
    return this.i18n.translate('integrations.loadFailed');
  }
}
