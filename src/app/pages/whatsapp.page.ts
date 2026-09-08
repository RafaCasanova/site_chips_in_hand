import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiWarning } from '../core/api.models';
import { SiteSessionService } from '../core/site-session.service';
import { WhatsappFlowService } from '../core/whatsapp-flow.service';
import { SiteShellComponent } from '../shared/site-shell.component';
import { WarningsComponent } from '../shared/warnings.component';

@Component({
  imports: [SiteShellComponent, WarningsComponent],
  template: `
    <app-site-shell>
      <section class="card integration-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Integrações</p>
            <h1>WhatsApp da clínica</h1>
            <p class="muted">A Meta autoriza; o backend valida e guarda as credenciais.</p>
          </div>
          <span class="security-chip">Credenciais protegidas</span>
        </div>

        @if (session.session()!.companies.length > 1) {
          <label class="field tenant-field">
            <span>Clínica</span>
            <select
              [value]="company()?.companyId"
              [disabled]="flow.busy()"
              (change)="chooseCompany($event)"
            >
              @for (item of session.session()!.companies; track item.companyId) {
                <option [value]="item.companyId">{{ item.companyName }}</option>
              }
            </select>
          </label>
        }

        <div class="flow-summary">
          <div class="whatsapp-icon" aria-hidden="true">W</div>
          <div>
            <strong>{{ company()?.companyName }}</strong>
            <p>Use uma conta Meta autorizada a administrar o número da clínica.</p>
          </div>
        </div>

        @if (!company()?.whatsappMessaging) {
          <div class="notice notice-warning" role="status">
            A integração com WhatsApp ainda não está habilitada para esta clínica.
          </div>
        } @else if (!company()?.companyEdit || !company()?.manageCommunicationConnections) {
          <div class="notice notice-error" role="alert">
            Seu acesso não permite administrar conexões de comunicação.
          </div>
        }

        @if (registrationWarnings().length) {
          <app-warnings [warnings]="registrationWarnings()" />
        }

        @if (flow.state().message) {
          <div
            class="notice"
            [class.notice-error]="flow.state().stage === 'error'"
            [class.notice-success]="flow.state().stage === 'complete'"
            [class.notice-info]="flow.busy()"
            [attr.role]="flow.state().stage === 'error' ? 'alert' : 'status'"
          >
            <strong>{{ flow.state().message }}</strong>
            @if (flow.state().connection; as connection) {
              <p>Status atual: {{ statusLabel(connection.status) }}</p>
              @if (connection.phoneNumberLabel) {
                <p>Número: {{ connection.phoneNumberLabel }}</p>
              }
            }
          </div>
        }

        @if (flow.state().warnings?.length) {
          <app-warnings [warnings]="flow.state().warnings ?? []" />
        }

        <ol class="flow-steps">
          <li [class.active]="flow.state().stage === 'authorizing'">Autorização Chips</li>
          <li [class.active]="flow.state().stage === 'meta'">Cadastro na Meta</li>
          <li [class.active]="flow.state().stage === 'completing'">Validação do backend</li>
        </ol>

        <button
          class="button button-whatsapp button-full"
          type="button"
          [disabled]="!canConnect()"
          (click)="connect()"
        >
          {{ flow.busy() ? 'Conexão em andamento…' : 'Conectar WhatsApp' }}
        </button>
        @if (flow.state().stage === 'error' || flow.state().stage === 'complete') {
          <button class="button button-secondary button-full" type="button" (click)="flow.clear()">
            Limpar resultado
          </button>
        }
        <p class="privacy-note">
          O site não recebe token da Meta. O código de uso único e a sessão curta são enviados
          somente ao backend.
        </p>
      </section>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappPage {
  protected readonly session = inject(SiteSessionService);
  protected readonly flow = inject(WhatsappFlowService);
  protected readonly company = this.session.selectedCompany;
  protected readonly registrationWarnings = signal<ApiWarning[]>(this.readRegistrationWarnings());
  protected readonly canConnect = computed(() => {
    const company = this.company();
    return !!(
      company?.whatsappMessaging &&
      company.companyEdit &&
      company.manageCommunicationConnections &&
      !this.flow.busy()
    );
  });

  protected connect(): void {
    void this.flow.start();
  }

  protected chooseCompany(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (select && !this.flow.busy()) this.session.chooseCompany(select.value);
  }

  protected statusLabel(status: string): string {
    const labels: Record<string, string> = {
      provisioning: 'configuração em andamento',
      active: 'ativa',
      paused: 'pausada',
      degraded: 'atenção necessária',
      reconnect_required: 'nova conexão necessária',
    };
    return labels[status] ?? 'em processamento';
  }

  private readRegistrationWarnings(): ApiWarning[] {
    const value: unknown = globalThis.history.state?.registrationWarnings;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is ApiWarning =>
        typeof item === 'string' ||
        (!!item && typeof item === 'object' && ('message' in item || 'code' in item)),
    );
  }
}
