import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  ApiClientService,
  ApiError,
  isUncertain,
  TransportError,
} from '../core/api-client.service';
import {
  ApiWarning,
  ObjectEnvelope,
  PatientOption,
  WhatsappConnection,
  WhatsappExternalTemplate,
  WhatsappLinkStatus,
  WhatsappProvisioningStep,
  WhatsappTemplate,
  WhatsappTestReceipt,
} from '../core/api.models';
import { FlowPrincipal, SiteSessionService } from '../core/site-session.service';
import { abortError, isAborted, pollUntil } from '../core/polling';
import { WhatsappFlowService } from '../core/whatsapp-flow.service';
import { I18nService } from '../core/i18n.service';
import { SiteShellComponent } from '../shared/site-shell.component';
import { TranslatePipe } from '../shared/translate.pipe';
import { WarningsComponent } from '../shared/warnings.component';

@Component({
  providers: [WhatsappFlowService],
  imports: [RouterLink, SiteShellComponent, TranslatePipe, WarningsComponent],
  template: `
    <app-site-shell>
      <a class="back-link" routerLink="/settings/integrations">{{ 'whatsapp.back' | t }}</a>
      <section class="page-heading integration-heading">
        <div>
          <p class="eyebrow">{{ 'whatsapp.eyebrow' | t }}</p>
          <h1>{{ 'whatsapp.title' | t }}</h1>
          <p class="lead">
            {{ 'whatsapp.lead' | t }}
          </p>
        </div>
        <div class="integration-logo whatsapp-logo" aria-hidden="true">W</div>
      </section>

      <div class="notice notice-info consent-banner">
        <strong>{{ 'whatsapp.backendManaged' | t }}</strong>
        <p>
          {{ 'whatsapp.backendManagedDescription' | t }}
        </p>
      </div>

      @if (registrationWarnings().length) {
        <app-warnings [warnings]="registrationWarnings()" />
      }
      @if (!company()?.whatsappMessaging) {
        <div class="notice notice-warning" role="status">
          {{ 'whatsapp.notEnabled' | t: { company: company()?.companyName ?? '' } }}
        </div>
      } @else if (!company()?.companyRead) {
        <div class="notice notice-error" role="alert">
          {{ 'whatsapp.cannotRead' | t }}
        </div>
      } @else {
        @if (error()) {
          <div class="notice notice-error" role="alert">
            <strong>{{ error() }}</strong>
            <button
              class="link-button"
              type="button"
              [disabled]="loading()"
              [attr.aria-busy]="loading()"
              (click)="load()"
            >
              {{ 'whatsapp.refreshState' | t }}
            </button>
          </div>
        }
        @if (message()) {
          <div class="notice notice-success" role="status">{{ message() }}</div>
        }
        @if (flow.state().message && flow.busy()) {
          <div class="notice notice-info" role="status">
            <span class="inline-spinner" aria-hidden="true"></span>{{ flow.state().message }}
          </div>
        }
        @if (flow.state().stage === 'ready') {
          <div class="notice notice-info" role="status">
            <p>{{ flow.state().message }}</p>
            <button
              class="button button-whatsapp"
              type="button"
              [attr.aria-busy]="flow.busy()"
              (click)="continueWithMeta()"
            >
              {{ 'whatsapp.continueMeta' | t }}
            </button>
            <button class="button button-quiet" type="button" (click)="flow.cancel()">
              {{ 'whatsapp.cancel' | t }}
            </button>
          </div>
        }
        @if (flow.state().warnings?.length) {
          <app-warnings [warnings]="flow.state().warnings ?? []" />
        }

        @if (loading()) {
          <div class="card loading-state" role="status">
            <span class="spinner" aria-hidden="true"></span>
            <p>{{ 'whatsapp.loading' | t }}</p>
          </div>
        } @else if (!activeConnection()) {
          <section class="card setup-card whatsapp-setup">
            <div>
              <p class="eyebrow">{{ 'whatsapp.setup' | t }}</p>
              <h2>{{ 'whatsapp.connectNumber' | t }}</h2>
              <p>
                {{ 'whatsapp.connectDescription' | t }}
              </p>
            </div>
            <ol class="flow-steps">
              <li [class.active]="flow.state().stage === 'authorizing'">
                {{ 'whatsapp.prepare' | t }}
              </li>
              <li [class.active]="flow.state().stage === 'meta'">
                {{ 'whatsapp.authorizeMeta' | t }}
              </li>
              <li [class.active]="flow.state().stage === 'completing'">
                {{ 'whatsapp.validateBackend' | t }}
              </li>
            </ol>
            @if (!canManage()) {
              <div class="notice notice-warning">
                {{ 'whatsapp.cannotManage' | t }}
              </div>
            }
            <button
              class="button button-whatsapp button-full"
              type="button"
              [disabled]="busy() || !canManage() || flow.state().stage === 'ready'"
              [attr.aria-busy]="flow.busy()"
              (click)="connect()"
            >
              {{ (flow.busy() ? 'whatsapp.connecting' : 'whatsapp.connectMeta') | t }}
            </button>
          </section>
        } @else if (activeConnection(); as connection) {
          <article class="card connection-card">
            <header class="connection-header">
              <div>
                <p class="eyebrow">{{ 'whatsapp.numberConnected' | t }}</p>
                <h2>{{ connection.businessAccountLabel || company()?.companyName }}</h2>
                <p class="connection-identity">
                  {{ connection.phoneNumberLabel || ('whatsapp.numberPending' | t) }}
                </p>
              </div>
              <span [class]="statusClass(connection.status)">{{
                statusLabel(connection.status)
              }}</span>
            </header>

            @if (linkStatus(); as status) {
              <div
                class="notice"
                [class.notice-success]="status.outcome === 'success'"
                [class.notice-warning]="status.outcome === 'pending'"
                [class.notice-error]="status.outcome === 'error'"
              >
                {{ linkStatusMessage(status) }}
              </div>
              <details class="management-panel provisioning-panel" open>
                <summary>{{ 'whatsapp.provisioning.title' | t }}</summary>
                <p>{{ 'whatsapp.provisioning.description' | t }}</p>
                <div class="provisioning-list" role="list">
                  @for (step of status.provisioningSteps; track step.code) {
                    <article role="listitem">
                      <div>
                        <strong>{{ provisioningStepLabel(step) }}</strong>
                        @if (step.attemptCount > 1) {
                          <small>{{
                            'whatsapp.provisioning.attempts' | t: { count: step.attemptCount }
                          }}</small>
                        }
                        @if (step.status === 'failed') {
                          <small>{{ 'whatsapp.provisioning.failureHint' | t }}</small>
                        }
                      </div>
                      <span [class]="provisioningStatusClass(step.status)">{{
                        provisioningStatusLabel(step.status)
                      }}</span>
                    </article>
                  }
                </div>
              </details>
            }

            <dl class="connection-facts">
              <div>
                <dt>{{ 'whatsapp.templates' | t }}</dt>
                <dd>{{ templateReadinessLabel(connection.templateReadiness) }}</dd>
              </div>
              <div>
                <dt>{{ 'whatsapp.quality' | t }}</dt>
                <dd>{{ connection.qualityRating || ('whatsapp.qualityMissing' | t) }}</dd>
              </div>
              <div>
                <dt>{{ 'whatsapp.messageLimit' | t }}</dt>
                <dd>{{ connection.messagingLimit || ('whatsapp.messageLimitMissing' | t) }}</dd>
              </div>
              <div>
                <dt>{{ 'whatsapp.lastSend' | t }}</dt>
                <dd>{{ dateTime(connection.lastSendAt) }}</dd>
              </div>
            </dl>

            <div class="action-toolbar">
              <button
                class="button button-secondary button-small"
                type="button"
                [disabled]="busy()"
                [attr.aria-busy]="actionKey() === 'verify:' + connection.id"
                (click)="verify(connection)"
              >
                {{ 'whatsapp.verifyNow' | t }}
              </button>
              @if (canManage()) {
                <button
                  class="button button-secondary button-small"
                  type="button"
                  [disabled]="busy() || !canToggle(connection)"
                  [attr.aria-busy]="actionKey() === 'toggle:' + connection.id"
                  (click)="toggle(connection)"
                >
                  {{ (connection.enabled ? 'whatsapp.pause' : 'whatsapp.activate') | t }}
                </button>
                @if (linkStatus()?.recommendedAction === 'repair') {
                  <button
                    class="button button-secondary button-small"
                    type="button"
                    [disabled]="busy()"
                    [attr.aria-busy]="actionKey() === 'repair:' + connection.id"
                    (click)="repair(connection)"
                  >
                    {{ 'whatsapp.repair' | t }}
                  </button>
                }
                @if (
                  linkStatus()?.recommendedAction === 'reconnect' ||
                  connection.status === 'pending_signup'
                ) {
                  <button
                    class="button button-whatsapp button-small"
                    type="button"
                    [disabled]="busy() || flow.state().stage === 'ready'"
                    [attr.aria-busy]="flow.busy()"
                    (click)="connect()"
                  >
                    {{ 'whatsapp.reconnectMeta' | t }}
                  </button>
                }
              }
            </div>

            <details class="management-panel" open>
              <summary>{{ 'whatsapp.managedTemplates' | t }}</summary>
              <div class="panel-heading">
                <p>{{ 'whatsapp.managedTemplatesDescription' | t }}</p>
                @if (canManage()) {
                  <button
                    class="button button-secondary button-small"
                    type="button"
                    [disabled]="busy() || !canSyncTemplates(connection)"
                    [attr.aria-busy]="actionKey() === 'templates:' + connection.id"
                    (click)="syncTemplates(connection)"
                  >
                    {{ 'whatsapp.syncTemplates' | t }}
                  </button>
                }
              </div>
              @if (templatesLoading()) {
                <p class="muted">{{ 'whatsapp.loadingTemplates' | t }}</p>
              } @else if (!templates().length) {
                <p class="muted">{{ 'whatsapp.templatesPreparing' | t }}</p>
              } @else {
                <div class="template-grid">
                  @for (template of templates(); track template.id) {
                    <article>
                      <div>
                        <strong>{{ templateLabel(template.templateType) }}</strong>
                        <small>{{ template.providerName }} · v{{ template.version }}</small>
                      </div>
                      <span [class]="templateStatusClass(template)">{{
                        templateStatusLabel(template.status)
                      }}</span>
                    </article>
                  }
                </div>
              }
              <section class="external-template-section">
                <h3>{{ 'whatsapp.externalTemplates' | t }}</h3>
                <p>{{ 'whatsapp.externalTemplatesDescription' | t }}</p>
                @if (!templatesLoading() && !externalTemplates().length) {
                  <p class="muted">{{ 'whatsapp.noExternalTemplates' | t }}</p>
                } @else if (!templatesLoading()) {
                  <div class="template-grid">
                    @for (template of externalTemplates(); track template.id) {
                      <article>
                        <div>
                          <strong>{{ template.providerName }}</strong>
                          <small>
                            {{ template.language }} ·
                            {{ externalTemplateCategory(template.category) }}
                          </small>
                        </div>
                        <span [class]="externalTemplateStatusClass(template)">{{
                          templateStatusLabel(template.status)
                        }}</span>
                      </article>
                    }
                  </div>
                }
              </section>
            </details>

            @if (canManage() && company()?.patientsRead) {
              <details class="management-panel">
                <summary>{{ 'whatsapp.sendTestTitle' | t }}</summary>
                <p>
                  {{ 'whatsapp.sendTestDescription' | t }}
                </p>
                <div class="patient-search">
                  <label class="field">
                    <span>{{ 'whatsapp.searchPatient' | t }}</span>
                    <input
                      #patientSearch
                      type="search"
                      autocomplete="off"
                      (keyup.enter)="searchPatients(patientSearch.value)"
                    />
                  </label>
                  <button
                    class="button button-secondary"
                    type="button"
                    [disabled]="patientsLoading()"
                    [attr.aria-busy]="patientsLoading()"
                    (click)="searchPatients(patientSearch.value)"
                  >
                    {{ (patientsLoading() ? 'whatsapp.searching' : 'whatsapp.search') | t }}
                  </button>
                </div>
                @if (patients().length) {
                  <div
                    class="patient-options"
                    role="radiogroup"
                    [attr.aria-label]="'whatsapp.testPatient' | t"
                  >
                    @for (patient of patients(); track patient.id) {
                      <label class="radio-card">
                        <input
                          type="radio"
                          name="testPatient"
                          [value]="patient.id"
                          [checked]="selectedPatientId() === patient.id"
                          (change)="selectedPatientId.set(patient.id)"
                        />
                        <span>{{ patient.socialName || patient.name }}</span>
                      </label>
                    }
                  </div>
                  @if (patientsCursor()) {
                    <button
                      class="link-button"
                      type="button"
                      [disabled]="patientsLoading()"
                      [attr.aria-busy]="patientsLoading()"
                      (click)="loadMorePatients()"
                    >
                      {{ 'whatsapp.loadMore' | t }}
                    </button>
                  }
                } @else if (patientSearchDone()) {
                  <p class="muted">{{ 'whatsapp.noPatient' | t }}</p>
                }
                <button
                  class="button button-primary"
                  type="button"
                  [disabled]="
                    busy() || !selectedPatientId() || testUncertain() || !canTest(connection)
                  "
                  [attr.aria-busy]="actionKey() === 'test'"
                  (click)="sendTest(connection)"
                >
                  {{ 'whatsapp.sendTest' | t }}
                </button>
                @if (!canTest(connection)) {
                  <p class="permission-note">
                    {{ 'whatsapp.testRequirement' | t }}
                  </p>
                }
                @if (testReceipt(); as receipt) {
                  <div class="notice notice-success">
                    {{
                      'whatsapp.testReceipt'
                        | t
                          : {
                              status: receipt.status,
                              recipient: receipt.recipientLabel,
                              date: dateTime(receipt.queuedAt),
                            }
                    }}
                  </div>
                }
              </details>
            }

            @if (canManage()) {
              <div class="danger-zone">
                @if (!confirmDisconnect()) {
                  <button
                    class="link-button danger-link"
                    type="button"
                    [disabled]="busy() || connection.status === 'revoking'"
                    (click)="confirmDisconnect.set(true)"
                  >
                    {{ 'whatsapp.disconnect' | t }}
                  </button>
                } @else {
                  <strong>{{ 'whatsapp.disconnectQuestion' | t }}</strong>
                  <p>
                    {{ 'whatsapp.disconnectDescription' | t }}
                  </p>
                  <div class="button-row">
                    <button
                      class="button button-danger button-small"
                      type="button"
                      [disabled]="busy()"
                      [attr.aria-busy]="actionKey() === 'disconnect:' + connection.id"
                      (click)="disconnect(connection)"
                    >
                      {{ 'whatsapp.confirmDisconnect' | t }}
                    </button>
                    <button
                      class="button button-quiet button-small"
                      type="button"
                      (click)="confirmDisconnect.set(false)"
                    >
                      {{ 'whatsapp.cancel' | t }}
                    </button>
                  </div>
                }
              </div>
            }
          </article>
        }
      }

      <p class="privacy-note">
        {{ 'whatsapp.privacy' | t }}
      </p>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappPage implements OnDestroy {
  protected readonly session = inject(SiteSessionService);
  protected readonly flow = inject(WhatsappFlowService);
  private readonly api = inject(ApiClientService);
  private readonly i18n = inject(I18nService);

  protected readonly company = this.session.selectedCompany;
  protected readonly connections = signal<WhatsappConnection[]>([]);
  protected readonly activeConnection = computed(
    () => this.connections().find((connection) => connection.status !== 'revoked') ?? null,
  );
  protected readonly templates = signal<WhatsappTemplate[]>([]);
  protected readonly externalTemplates = signal<WhatsappExternalTemplate[]>([]);
  protected readonly linkStatus = signal<WhatsappLinkStatus | null>(null);
  protected readonly loading = signal(true);
  protected readonly templatesLoading = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly actionKey = signal('');
  protected readonly busy = computed(() => this.flow.busy() || this.actionKey() !== '');
  protected readonly registrationWarnings = signal<ApiWarning[]>(this.readRegistrationWarnings());
  protected readonly confirmDisconnect = signal(false);
  protected readonly patients = signal<PatientOption[]>([]);
  protected readonly patientsCursor = signal<string | null>(null);
  protected readonly patientsLoading = signal(false);
  protected readonly patientSearchDone = signal(false);
  protected readonly patientSearchTerm = signal('');
  protected readonly selectedPatientId = signal('');
  protected readonly testReceipt = signal<WhatsappTestReceipt | null>(null);
  protected readonly testUncertain = signal(false);

  private abort = new AbortController();
  private pollAbort?: AbortController;

  constructor() {
    effect((onCleanup) => {
      this.session.session();
      untracked(() => {
        this.abort = new AbortController();
        this.connections.set([]);
        this.templates.set([]);
        this.linkStatus.set(null);
        this.patients.set([]);
        this.patientsCursor.set(null);
        this.patientSearchTerm.set('');
        this.patientSearchDone.set(false);
        this.selectedPatientId.set('');
        this.testReceipt.set(null);
        this.testUncertain.set(false);
        this.actionKey.set('');
        this.error.set('');
        this.message.set('');
        this.confirmDisconnect.set(false);
        void this.load();
      });
      onCleanup(() => {
        this.abort.abort();
        this.pollAbort?.abort();
        this.flow.cancel();
      });
    });
  }

  ngOnDestroy(): void {
    this.abort.abort();
    this.pollAbort?.abort();
    this.flow.cancel();
    this.patients.set([]);
  }

  protected canManage(): boolean {
    const company = this.company();
    return !!(
      company?.whatsappMessaging &&
      company.companyEdit &&
      company.manageCommunicationConnections
    );
  }

  protected async connect(): Promise<void> {
    if (!this.canManage() || this.busy()) return;
    this.error.set('');
    this.message.set('');
    await this.flow.start();
    if (this.flow.state().stage === 'error') this.error.set(this.flow.state().message);
  }

  protected async continueWithMeta(): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || !this.canManage() || this.busy()) return;
    await this.flow.continueWithMeta();
    if (!this.session.samePrincipal(principal) || this.abort.signal.aborted) return;
    const result = this.flow.state();
    if (result.stage === 'error') {
      await this.load(false);
      this.error.set(result.message);
      return;
    }
    if (result.connection) {
      await this.load(false);
      await this.pollLink(principal, result.connection.id);
    }
  }

  protected async verify(connection: WhatsappConnection): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || this.busy()) return;
    this.actionKey.set(`verify:${connection.id}`);
    this.error.set('');
    try {
      const response = await firstValueFrom(
        this.api.getWhatsappLinkStatus(principal, connection.id),
      );
      this.assertPrincipal(principal);
      this.linkStatus.set(response.data);
      const statusMessage = this.linkStatusMessage(response.data);
      if (response.data.outcome === 'error') this.error.set(statusMessage);
      else this.message.set(statusMessage);
      await this.load(false);
    } catch (error) {
      this.error.set(this.errorMessage(error, this.i18n.translate('whatsapp.verifyFailed')));
    } finally {
      this.actionKey.set('');
    }
  }

  protected async toggle(connection: WhatsappConnection): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || !this.canManage() || !this.canToggle(connection)) return;
    await this.mutate(
      `toggle:${connection.id}`,
      this.i18n.translate(
        connection.enabled ? 'whatsapp.pauseRequested' : 'whatsapp.activationRequested',
      ),
      () =>
        firstValueFrom(
          this.api.updateWhatsappConnection(principal, connection.id, !connection.enabled),
        ),
    );
  }

  protected async repair(connection: WhatsappConnection): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || !this.canManage() || this.linkStatus()?.recommendedAction !== 'repair')
      return;
    await this.mutate(
      `repair:${connection.id}`,
      this.i18n.translate('whatsapp.repairRequested'),
      () => firstValueFrom(this.api.repairWhatsapp(principal, connection.id)),
    );
  }

  protected async syncTemplates(connection: WhatsappConnection): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || !this.canManage() || !this.canSyncTemplates(connection)) return;
    await this.mutate(
      `templates:${connection.id}`,
      this.i18n.translate('whatsapp.templateSyncRequested'),
      () => firstValueFrom(this.api.syncWhatsappTemplates(principal, connection.id)),
    );
  }

  protected async disconnect(connection: WhatsappConnection): Promise<void> {
    const principal = this.currentPrincipal();
    if (
      !principal ||
      !this.canManage() ||
      !this.confirmDisconnect() ||
      connection.status === 'revoking'
    )
      return;
    await this.mutate(
      `disconnect:${connection.id}`,
      this.i18n.translate('whatsapp.disconnectRequested'),
      () => firstValueFrom(this.api.disconnectWhatsapp(principal, connection.id)),
    );
    this.confirmDisconnect.set(false);
  }

  protected async searchPatients(search: string): Promise<void> {
    this.patientSearchTerm.set(search.trim());
    this.patients.set([]);
    this.patientsCursor.set(null);
    this.selectedPatientId.set('');
    await this.loadPatients(false);
  }

  protected async loadMorePatients(): Promise<void> {
    await this.loadPatients(true);
  }

  protected async sendTest(connection: WhatsappConnection): Promise<void> {
    const principal = this.currentPrincipal();
    const patientId = this.selectedPatientId();
    if (
      !principal ||
      !patientId ||
      !this.canManage() ||
      !this.company()?.patientsRead ||
      this.busy() ||
      this.testUncertain() ||
      !this.canTest(connection)
    )
      return;
    if (!this.patients().some((patient) => patient.id === patientId)) return;
    this.testReceipt.set(null);
    this.actionKey.set('test');
    this.error.set('');
    try {
      const response = await firstValueFrom(
        this.api.testWhatsapp(principal, connection.id, patientId),
      );
      this.assertPrincipal(principal);
      this.testReceipt.set(response.data);
      this.message.set(this.i18n.translate('whatsapp.testAccepted'));
    } catch (error) {
      if (isAborted(error) || !this.session.samePrincipal(principal)) return;
      if (isUncertain(error)) {
        this.testUncertain.set(true);
        this.selectedPatientId.set('');
      }
      this.handleMutationError(error, this.i18n.translate('whatsapp.testFailed'));
    } finally {
      this.actionKey.set('');
    }
  }

  protected statusLabel(status: WhatsappConnection['status']): string {
    const keys = {
      pending_signup: 'whatsapp.status.pendingSignup',
      provisioning: 'whatsapp.status.provisioning',
      active: 'whatsapp.status.active',
      degraded: 'whatsapp.status.degraded',
      reconnect_required: 'whatsapp.status.reconnectRequired',
      paused: 'whatsapp.status.paused',
      revoking: 'whatsapp.status.revoking',
      revoked: 'whatsapp.status.revoked',
    } as const;
    return this.i18n.translate(keys[status]);
  }

  protected linkStatusMessage(status: WhatsappLinkStatus): string {
    if (status.outcome === 'pending') return this.i18n.translate('whatsapp.link.preparing');
    if (status.outcome === 'success')
      return this.i18n.translate(
        status.recommendedAction === 'resume' ? 'whatsapp.link.paused' : 'whatsapp.link.ready',
      );
    if (status.recommendedAction === 'repair') return this.i18n.translate('whatsapp.link.repair');
    if (status.recommendedAction === 'reconnect')
      return this.i18n.translate(
        status.connectionStatus === 'revoked' ? 'whatsapp.link.removed' : 'whatsapp.link.reconnect',
      );
    return this.i18n.translate('whatsapp.link.preparing');
  }

  protected provisioningStepLabel(step: WhatsappProvisioningStep): string {
    const keys = {
      credentials: 'whatsapp.provisioning.step.credentials',
      two_step_verification: 'whatsapp.provisioning.step.two_step_verification',
      system_user_access: 'whatsapp.provisioning.step.system_user_access',
      credit_line: 'whatsapp.provisioning.step.credit_line',
      phone_registration: 'whatsapp.provisioning.step.phone_registration',
      webhook_subscription: 'whatsapp.provisioning.step.webhook_subscription',
      template_sync: 'whatsapp.provisioning.step.template_sync',
      activation: 'whatsapp.provisioning.step.activation',
    } as const;
    return this.i18n.translate(keys[step.code]);
  }

  protected provisioningStatusLabel(status: WhatsappProvisioningStep['status']): string {
    const keys = {
      pending: 'whatsapp.provisioning.status.pending',
      running: 'whatsapp.provisioning.status.running',
      passed: 'whatsapp.provisioning.status.passed',
      skipped: 'whatsapp.provisioning.status.skipped',
      failed: 'whatsapp.provisioning.status.failed',
      not_available: 'whatsapp.provisioning.status.notAvailable',
    } as const;
    return this.i18n.translate(keys[status]);
  }

  protected provisioningStatusClass(status: WhatsappProvisioningStep['status']): string {
    if (status === 'passed') return 'status-pill status-ok';
    if (status === 'failed') return 'status-pill status-warn';
    if (status === 'running') return 'status-pill status-progress';
    return 'status-pill status-neutral';
  }

  protected canToggle(connection: WhatsappConnection): boolean {
    return ['active', 'degraded', 'provisioning', 'paused'].includes(connection.status);
  }

  protected canSyncTemplates(connection: WhatsappConnection): boolean {
    return ['active', 'degraded'].includes(connection.status);
  }

  protected canTest(connection: WhatsappConnection): boolean {
    return (
      connection.status === 'active' &&
      connection.enabled &&
      this.templates().some(
        (item) =>
          item.templateType === 'appointmentReminder' && item.current && item.status === 'approved',
      )
    );
  }

  protected statusClass(status: WhatsappConnection['status']): string {
    if (status === 'active') return 'status-pill status-ok';
    if (status === 'degraded' || status === 'reconnect_required') return 'status-pill status-warn';
    if (status === 'revoked') return 'status-pill status-neutral';
    return 'status-pill status-progress';
  }

  protected templateReadinessLabel(value: WhatsappConnection['templateReadiness']): string {
    const keys = {
      pending: 'whatsapp.readiness.pending',
      ready: 'whatsapp.readiness.ready',
      degraded: 'whatsapp.readiness.degraded',
    } as const;
    return this.i18n.translate(keys[value]);
  }

  protected templateLabel(value: WhatsappTemplate['templateType']): string {
    const keys = {
      appointmentReminder: 'whatsapp.template.appointmentReminder',
      appointmentRescheduled: 'whatsapp.template.appointmentRescheduled',
      appointmentCancelled: 'whatsapp.template.appointmentCancelled',
      billingReminder: 'whatsapp.template.billingReminder',
      billingDueDate: 'whatsapp.template.billingDueDate',
      billingOverdue: 'whatsapp.template.billingOverdue',
    } as const;
    return this.i18n.translate(keys[value]);
  }

  protected templateStatusLabel(
    status: WhatsappTemplate['status'] | WhatsappExternalTemplate['status'],
  ): string {
    const keys = {
      pending: 'whatsapp.templateStatus.pending',
      approved: 'whatsapp.templateStatus.approved',
      rejected: 'whatsapp.templateStatus.rejected',
      paused: 'whatsapp.templateStatus.paused',
      disabled: 'whatsapp.templateStatus.disabled',
      unknown: 'whatsapp.templateStatus.unknown',
    } as const;
    return this.i18n.translate(keys[status]);
  }

  protected templateStatusClass(template: WhatsappTemplate): string {
    if (template.status === 'approved') return 'status-pill status-ok';
    if (template.status === 'rejected') return 'status-pill status-warn';
    return 'status-pill';
  }

  protected externalTemplateStatusClass(template: WhatsappExternalTemplate): string {
    if (template.status === 'approved') return 'status-pill status-ok';
    if (template.status === 'rejected') return 'status-pill status-warn';
    return 'status-pill';
  }

  protected externalTemplateCategory(category: WhatsappExternalTemplate['category']): string {
    const keys = {
      UTILITY: 'whatsapp.templateCategory.utility',
      MARKETING: 'whatsapp.templateCategory.marketing',
      AUTHENTICATION: 'whatsapp.templateCategory.authentication',
      UNKNOWN: 'whatsapp.templateCategory.unknown',
    } as const;
    return this.i18n.translate(keys[category]);
  }

  protected dateTime(value: string | null): string {
    if (!value) return this.i18n.translate('whatsapp.notRecorded');
    return this.i18n.formatDate(new Date(value), { dateStyle: 'short', timeStyle: 'short' });
  }

  protected async load(showLoader = true): Promise<void> {
    const principal = this.currentPrincipal();
    const company = this.company();
    if (!principal || !company?.whatsappMessaging || !company.companyRead) {
      this.loading.set(false);
      this.connections.set([]);
      this.templates.set([]);
      this.externalTemplates.set([]);
      this.linkStatus.set(null);
      return;
    }
    if (showLoader) this.loading.set(true);
    if (showLoader) this.error.set('');
    try {
      const response = await firstValueFrom(this.api.listWhatsappConnections(principal));
      this.assertPrincipal(principal);
      this.connections.set(response.data);
      const connection = response.data.find((item) => item.status !== 'revoked');
      if (connection) {
        const status = await firstValueFrom(
          this.api.getWhatsappLinkStatus(principal, connection.id),
        );
        this.assertPrincipal(principal);
        this.linkStatus.set(status.data);
        await this.loadTemplates(principal, connection.id);
      } else {
        this.templates.set([]);
        this.externalTemplates.set([]);
      }
    } catch (error) {
      if (isAborted(error) || !this.session.samePrincipal(principal)) return;
      this.error.set(this.errorMessage(error, this.i18n.translate('whatsapp.loadFailed')));
    } finally {
      if (this.session.samePrincipal(principal)) this.loading.set(false);
    }
  }

  private async loadTemplates(principal: FlowPrincipal, connectionId: string): Promise<void> {
    this.templatesLoading.set(true);
    try {
      const [response, externalResponse] = await Promise.all([
        firstValueFrom(this.api.listWhatsappTemplates(principal, connectionId)),
        firstValueFrom(this.api.listWhatsappExternalTemplates(principal, connectionId)),
      ]);
      this.assertPrincipal(principal);
      this.templates.set(response.data.filter((item) => item.current));
      this.externalTemplates.set(externalResponse.data);
    } catch (error) {
      if (isAborted(error) || !this.session.samePrincipal(principal)) return;
      this.error.set(this.errorMessage(error, this.i18n.translate('whatsapp.templatesLoadFailed')));
    } finally {
      this.templatesLoading.set(false);
    }
  }

  private async loadPatients(append: boolean): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || !this.company()?.patientsRead || this.patientsLoading()) return;
    this.patientsLoading.set(true);
    this.patientSearchDone.set(false);
    try {
      const response = await firstValueFrom(
        this.api.listPatientOptions(principal, {
          search: this.patientSearchTerm(),
          limit: 25,
          ...(append && this.patientsCursor() ? { cursor: this.patientsCursor()! } : {}),
        }),
      );
      this.assertPrincipal(principal);
      this.patients.set(append ? [...this.patients(), ...response.data] : response.data);
      this.patientsCursor.set(response.meta.hasMore ? (response.meta.nextCursor ?? null) : null);
    } catch (error) {
      this.error.set(this.errorMessage(error, this.i18n.translate('whatsapp.patientsLoadFailed')));
    } finally {
      this.patientsLoading.set(false);
      this.patientSearchDone.set(true);
    }
  }

  private async pollLink(principal: FlowPrincipal, connectionId: string): Promise<void> {
    this.pollAbort?.abort();
    this.pollAbort = new AbortController();
    try {
      const result = await pollUntil({
        signal: this.pollAbort.signal,
        read: async () => {
          this.assertPrincipal(principal);
          const [connection, status] = await Promise.all([
            firstValueFrom(this.api.getWhatsappConnection(principal, connectionId)),
            firstValueFrom(this.api.getWhatsappLinkStatus(principal, connectionId)),
          ]);
          return { connection: connection.data, status: status.data };
        },
        onValue: ({ connection, status }) => {
          this.assertPrincipal(principal);
          this.connections.update((items) => [
            ...items.filter((item) => item.id !== connection.id),
            connection,
          ]);
          this.linkStatus.set(status);
          if (connection.status === 'revoked')
            this.message.set(this.i18n.translate('whatsapp.disconnected'));
          else if (status.outcome === 'error') this.error.set(this.linkStatusMessage(status));
          else this.message.set(this.linkStatusMessage(status));
        },
        pending: ({ connection, status }) =>
          connection.status !== 'revoked' &&
          (status.outcome === 'pending' || connection.status === 'revoking'),
      });
      if (result === 'timeout')
        this.message.set(this.i18n.translate('whatsapp.provisioningContinues'));
      if (this.activeConnection()) await this.loadTemplates(principal, connectionId);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.error.set(
          this.errorMessage(error, this.i18n.translate('whatsapp.provisioningCheckFailed')),
        );
      }
    }
  }

  private async mutate(
    key: string,
    success: string,
    request: () => Promise<ObjectEnvelope<WhatsappConnection>>,
  ): Promise<void> {
    if (this.busy()) return;
    const principal = this.currentPrincipal();
    if (!principal) return;
    this.actionKey.set(key);
    this.error.set('');
    this.message.set('');
    try {
      const response = await request();
      this.assertPrincipal(principal);
      this.connections.update((items) => [
        ...items.filter((item) => item.id !== response.data.id),
        response.data,
      ]);
      if (response.meta.warnings?.length) this.registrationWarnings.set(response.meta.warnings);
      this.message.set(success);
      await this.pollLink(principal, response.data.id);
    } catch (error) {
      if (isAborted(error) || !this.session.samePrincipal(principal)) return;
      if (isUncertain(error)) {
        await this.load(false);
      }
      this.handleMutationError(error, this.i18n.translate('whatsapp.operationFailed'));
    } finally {
      if (this.session.samePrincipal(principal)) this.actionKey.set('');
    }
  }

  private handleMutationError(error: unknown, fallback: string): void {
    this.error.set(
      isUncertain(error)
        ? this.i18n.translate('whatsapp.uncertain')
        : this.errorMessage(error, fallback),
    );
  }

  private currentPrincipal(): FlowPrincipal | null {
    const current = this.session.session();
    return current ? this.session.principal(current) : null;
  }

  private assertPrincipal(principal: FlowPrincipal): void {
    if (this.abort.signal.aborted || !this.session.samePrincipal(principal)) {
      throw abortError();
    }
  }

  private readRegistrationWarnings(): ApiWarning[] {
    const value: unknown = globalThis.history.state?.registrationWarnings;
    return Array.isArray(value) ? (value as ApiWarning[]) : [];
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof ApiError) return error.message;
    if (error instanceof TransportError) return this.i18n.translate('whatsapp.serverUnconfirmed');
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }
}
