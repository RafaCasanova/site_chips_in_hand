import { DOCUMENT } from '@angular/common';
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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  ApiClientService,
  ApiError,
  isUncertain,
  TransportError,
} from '../core/api-client.service';
import {
  AgendaProfessionalOption,
  ApiWarning,
  GoogleCalendarConflict,
  GoogleCalendarConflictPolicy,
  GoogleCalendarConnection,
  GoogleCalendarConnectionPatch,
  GoogleCalendarLinkStatus,
  ObjectEnvelope,
  Professional,
  ProfessionalInput,
} from '../core/api.models';
import { RuntimeConfigService } from '../core/runtime-config.service';
import { FlowPrincipal, SiteSessionService } from '../core/site-session.service';
import { abortError, isAborted, pollUntil } from '../core/polling';
import { I18nService } from '../core/i18n.service';
import {
  googleCalendarConflictMessageKey,
  googleCalendarLinkMessageKey,
} from '../core/google-calendar-localizations';
import { SiteShellComponent } from '../shared/site-shell.component';
import { TranslatePipe } from '../shared/translate.pipe';
import { WarningsComponent } from '../shared/warnings.component';

interface ConnectionDraft {
  enabled: boolean;
  externalConflictPolicy: GoogleCalendarConflictPolicy;
  importManualBlocks: boolean;
}

@Component({
  imports: [ReactiveFormsModule, RouterLink, SiteShellComponent, TranslatePipe, WarningsComponent],
  template: `
    <app-site-shell>
      <a class="back-link" routerLink="/settings/integrations">{{ 'whatsapp.back' | t }}</a>
      <section class="page-heading integration-heading">
        <div>
          <p class="eyebrow">{{ 'calendar.eyebrow' | t }}</p>
          <h1>{{ 'shell.googleCalendar' | t }}</h1>
          <p class="lead">
            {{ 'calendar.lead' | t }}
          </p>
        </div>
        <div class="integration-logo google-logo" aria-hidden="true">
          <img src="/google-g.svg" alt="" width="30" height="30" />
        </div>
      </section>

      <div class="notice notice-info consent-banner">
        <strong>{{ 'calendar.loginNoAccess' | t }}</strong>
        <p>
          {{ 'calendar.consentDescription' | t }}
        </p>
      </div>

      @if (registrationWarnings().length) {
        <app-warnings [warnings]="registrationWarnings()" />
      }
      @if (!company()?.googleCalendarSync) {
        <div class="notice notice-warning" role="status">
          {{ 'calendar.notEnabled' | t: { company: company()?.companyName ?? '' } }}
        </div>
      } @else if (!company()?.agendaRead) {
        <div class="notice notice-error" role="alert">
          {{ 'calendar.cannotRead' | t }}
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

        @if (loading()) {
          <div class="card loading-state" role="status">
            <span class="spinner" aria-hidden="true"></span>
            <p>{{ 'calendar.loading' | t }}</p>
          </div>
        } @else if (!professionals().length) {
          <section class="card setup-card">
            <div>
              <p class="eyebrow">{{ 'calendar.prerequisite' | t }}</p>
              <h2>{{ 'calendar.createProfile' | t }}</h2>
              <p>
                {{ 'calendar.profileDescription' | t }}
              </p>
            </div>
            @if (company()?.companyCreate) {
              <form [formGroup]="profileForm" (ngSubmit)="createInitialProfessional()" novalidate>
                <div class="form-grid">
                  <label class="field field-wide">
                    <span>{{ 'calendar.displayName' | t }}</span>
                    <input formControlName="displayName" autocomplete="name" required />
                  </label>
                  <label class="field">
                    <span>{{ 'calendar.councilOptional' | t }}</span>
                    <input
                      formControlName="council"
                      [placeholder]="'calendar.councilExample' | t"
                    />
                  </label>
                  <label class="field">
                    <span>{{ 'calendar.numberOptional' | t }}</span>
                    <input formControlName="registrationNumber" />
                  </label>
                  <label class="field">
                    <span>{{ 'calendar.councilState' | t }}</span>
                    <input formControlName="registrationState" maxlength="2" />
                  </label>
                  <label class="field">
                    <span>{{ 'calendar.defaultDuration' | t }}</span>
                    <select formControlName="duration">
                      <option [ngValue]="30">{{ 'calendar.minutes' | t: { count: 30 } }}</option>
                      <option [ngValue]="45">{{ 'calendar.minutes' | t: { count: 45 } }}</option>
                      <option [ngValue]="50">{{ 'calendar.minutes' | t: { count: 50 } }}</option>
                      <option [ngValue]="60">{{ 'calendar.minutes' | t: { count: 60 } }}</option>
                      <option [ngValue]="90">{{ 'calendar.minutes' | t: { count: 90 } }}</option>
                    </select>
                  </label>
                </div>
                <fieldset class="choice-fieldset">
                  <legend>{{ 'calendar.modalities' | t }}</legend>
                  <label class="check-row">
                    <input type="checkbox" formControlName="inPerson" />
                    {{ 'calendar.inPerson' | t }}
                  </label>
                  <label class="check-row">
                    <input type="checkbox" formControlName="telehealth" />
                    {{ 'calendar.telehealth' | t }}
                  </label>
                  <label class="check-row">
                    <input type="checkbox" formControlName="homeCare" />
                    {{ 'calendar.homeCare' | t }}
                  </label>
                </fieldset>
                <button
                  class="button button-primary"
                  type="submit"
                  [disabled]="busy()"
                  [attr.aria-busy]="busyKey() === 'profile'"
                >
                  {{
                    (busyKey() === 'profile'
                      ? 'calendar.creatingProfile'
                      : 'calendar.createMyProfile'
                    ) | t
                  }}
                </button>
              </form>
            } @else {
              <div class="notice notice-warning">
                {{ 'calendar.askAdminProfile' | t }}
              </div>
            }
          </section>
        } @else {
          <div class="connection-stack">
            @for (professional of professionals(); track professional.professionalId) {
              @let connection = connectionFor(professional.professionalId);
              <article class="card connection-card">
                <header class="connection-header">
                  <div>
                    <p class="eyebrow">{{ 'calendar.professionalProfile' | t }}</p>
                    <h2>{{ professional.professionalName }}</h2>
                    @if (connection) {
                      <p class="connection-identity">
                        {{ connection.accountLabel || ('calendar.accountPending' | t) }}
                        @if (connection.calendarName) {
                          · {{ connection.calendarName }}
                        }
                      </p>
                    } @else {
                      <p class="connection-identity">{{ 'calendar.noneLinked' | t }}</p>
                    }
                  </div>
                  <span [class]="connection ? statusClass(connection.status) : 'status-pill'">
                    {{
                      connection ? statusLabel(connection.status) : ('calendar.notConnected' | t)
                    }}
                  </span>
                </header>

                @if (!connection || connection.status === 'revoked') {
                  @if (connection && linkStatus()[connection.id]; as status) {
                    @if (status.outcome === 'error') {
                      <div class="notice notice-error" role="alert">
                        {{ linkStatusMessage(status) }}
                      </div>
                    }
                  }
                  <div class="empty-connection">
                    <div>
                      <strong>{{ 'calendar.connectTitle' | t }}</strong>
                      <p>
                        {{ 'calendar.connectDescription' | t }}
                      </p>
                    </div>
                    <button
                      class="button button-google"
                      type="button"
                      [disabled]="busy() || !professional.access.canAuthorizeGoogleCalendar"
                      [attr.aria-busy]="busyKey() === professional.professionalId"
                      (click)="connect(professional)"
                    >
                      <img src="/google-g.svg" alt="" width="18" height="18" />
                      {{
                        (busyKey() === professional.professionalId
                          ? 'calendar.waiting'
                          : 'calendar.connect'
                        ) | t
                      }}
                    </button>
                  </div>
                  @if (!professional.access.canAuthorizeGoogleCalendar) {
                    <p class="permission-note">
                      {{ 'calendar.ownerOnly' | t }}
                    </p>
                  }
                } @else {
                  @if (linkStatus()[connection.id]; as status) {
                    <div
                      class="notice"
                      [class.notice-success]="status.outcome === 'success'"
                      [class.notice-warning]="status.outcome === 'pending'"
                      [class.notice-error]="status.outcome === 'error'"
                    >
                      {{ linkStatusMessage(status) }}
                    </div>
                  }

                  <dl class="connection-facts">
                    <div>
                      <dt>{{ 'calendar.lastSync' | t }}</dt>
                      <dd>{{ dateTime(connection.lastSuccessfulSyncAt) }}</dd>
                    </div>
                    <div>
                      <dt>{{ 'calendar.mode' | t }}</dt>
                      <dd>{{ 'calendar.chipsSource' | t }}</dd>
                    </div>
                    <div>
                      <dt>{{ 'calendar.externalBlocks' | t }}</dt>
                      <dd>{{ policyLabel(connection.externalConflictPolicy) }}</dd>
                    </div>
                    <div>
                      <dt>{{ 'calendar.import' | t }}</dt>
                      <dd>
                        {{
                          (connection.importManualBlocks ? 'calendar.active' : 'calendar.disabled')
                            | t
                        }}
                      </dd>
                    </div>
                  </dl>

                  <div class="action-toolbar" [attr.aria-label]="'calendar.connectionActions' | t">
                    <button
                      class="button button-secondary button-small"
                      type="button"
                      [disabled]="busy()"
                      [attr.aria-busy]="busyKey() === 'verify:' + connection.id"
                      (click)="verify(connection)"
                    >
                      {{ 'calendar.verifyNow' | t }}
                    </button>
                    @if (connection.status === 'active') {
                      <button
                        class="button button-secondary button-small"
                        type="button"
                        [disabled]="
                          busy() ||
                          connection.syncInProgress ||
                          !professional.access.canManageGoogleCalendar
                        "
                        [attr.aria-busy]="busyKey() === 'sync:' + connection.id"
                        (click)="sync(connection)"
                      >
                        {{ (connection.syncInProgress ? 'calendar.syncing' : 'calendar.sync') | t }}
                      </button>
                    }
                    @if (linkStatus()[connection.id]?.recommendedAction === 'repair') {
                      <button
                        class="button button-secondary button-small"
                        type="button"
                        [disabled]="busy() || !professional.access.canManageGoogleCalendar"
                        [attr.aria-busy]="busyKey() === 'repair:' + connection.id"
                        (click)="repair(connection)"
                      >
                        {{ 'calendar.repair' | t }}
                      </button>
                    }
                    @if (
                      linkStatus()[connection.id]?.recommendedAction === 'reconnect' ||
                      connection.status === 'pending_oauth'
                    ) {
                      <button
                        class="button button-google button-small"
                        type="button"
                        [disabled]="busy() || !professional.access.canAuthorizeGoogleCalendar"
                        [attr.aria-busy]="busyKey() === professional.professionalId"
                        (click)="connect(professional)"
                      >
                        <img src="/google-g.svg" alt="" width="18" height="18" />
                        {{ 'calendar.reconnect' | t }}
                      </button>
                    }
                    @if (linkStatus()[connection.id]?.recommendedAction === 'resume') {
                      <button
                        class="button button-primary button-small"
                        type="button"
                        [disabled]="busy() || !professional.access.canManageGoogleCalendar"
                        [attr.aria-busy]="busyKey() === 'resume:' + connection.id"
                        (click)="resume(connection)"
                      >
                        {{ 'calendar.resume' | t }}
                      </button>
                    }
                  </div>

                  @if (
                    professional.access.canManageGoogleCalendar && connection.status !== 'revoking'
                  ) {
                    <details class="management-panel">
                      <summary>{{ 'calendar.settings' | t }}</summary>
                      @if (draftFor(connection); as draft) {
                        <div class="settings-form">
                          <label class="switch-row">
                            <span
                              ><strong>{{ 'calendar.syncActive' | t }}</strong
                              ><small>{{ 'calendar.pauseKeepsCalendar' | t }}</small></span
                            >
                            <input
                              type="checkbox"
                              [attr.aria-label]="'calendar.syncActive' | t"
                              [disabled]="busy() || !canToggle(connection)"
                              [checked]="draft.enabled"
                              (change)="setEnabled(connection.id, $event)"
                            />
                          </label>
                          <label class="field">
                            <span>{{ 'calendar.externalSameTime' | t }}</span>
                            <select
                              [value]="draft.externalConflictPolicy"
                              (change)="setPolicy(connection.id, $event)"
                            >
                              <option value="off">{{ 'calendar.policy.off' | t }}</option>
                              <option value="warn">{{ 'calendar.policy.warn' | t }}</option>
                              <option value="block">{{ 'calendar.policy.block' | t }}</option>
                            </select>
                          </label>
                          <label class="switch-row">
                            <span
                              ><strong>{{ 'calendar.importBusy' | t }}</strong
                              ><small>{{ 'calendar.importSanitized' | t }}</small></span
                            >
                            <input
                              type="checkbox"
                              [attr.aria-label]="'calendar.importBusy' | t"
                              [disabled]="busy()"
                              [checked]="draft.importManualBlocks"
                              (change)="setImport(connection.id, $event)"
                            />
                          </label>
                          <button
                            class="button button-primary button-small"
                            type="button"
                            [disabled]="busy()"
                            [attr.aria-busy]="busyKey() === 'save:' + connection.id"
                            (click)="saveSettings(connection)"
                          >
                            {{ 'calendar.saveSettings' | t }}
                          </button>
                        </div>
                      }
                    </details>

                    <details class="management-panel" (toggle)="openConflicts(connection, $event)">
                      <summary>{{ 'calendar.conflicts' | t }}</summary>
                      @if (conflictConnectionId() === connection.id) {
                        @if (conflictsLoading()) {
                          <p class="muted">{{ 'calendar.loadingConflicts' | t }}</p>
                        } @else if (!conflicts().length) {
                          <p class="muted">{{ 'calendar.noConflicts' | t }}</p>
                        } @else {
                          <div class="conflict-list">
                            @for (conflict of conflicts(); track conflict.id) {
                              <article>
                                <div>
                                  <strong>{{ conflictMessage(conflict) }}</strong
                                  ><small>{{ dateTime(conflict.detectedAt) }}</small>
                                </div>
                                <div class="button-row compact-actions">
                                  <button
                                    class="link-button"
                                    type="button"
                                    [disabled]="busy()"
                                    [attr.aria-busy]="
                                      busyKey() === 'conflict:retry_restore:' + conflict.id
                                    "
                                    (click)="resolveConflict(connection, conflict, 'retry_restore')"
                                  >
                                    {{ 'calendar.retryRestore' | t }}
                                  </button>
                                  <button
                                    class="link-button"
                                    type="button"
                                    [disabled]="busy()"
                                    [attr.aria-busy]="
                                      busyKey() === 'conflict:acknowledge:' + conflict.id
                                    "
                                    (click)="resolveConflict(connection, conflict, 'acknowledge')"
                                  >
                                    {{ 'calendar.acknowledge' | t }}
                                  </button>
                                </div>
                              </article>
                            }
                            @if (conflictsCursor()) {
                              <button
                                class="button button-secondary button-small"
                                type="button"
                                [disabled]="conflictsLoading()"
                                [attr.aria-busy]="conflictsLoading()"
                                (click)="loadConflicts(connection, true)"
                              >
                                {{ 'whatsapp.loadMore' | t }}
                              </button>
                            }
                          </div>
                        }
                      }
                    </details>

                    <div class="danger-zone">
                      @if (disconnectingId() !== connection.id) {
                        <button
                          class="link-button danger-link"
                          type="button"
                          [disabled]="busy()"
                          (click)="prepareDisconnect(connection.id)"
                        >
                          {{ 'calendar.disconnect' | t }}
                        </button>
                      } @else {
                        <strong>{{ 'calendar.confirmDisconnect' | t }}</strong>
                        <p>
                          {{ 'calendar.disconnectDescription' | t }}
                        </p>
                        <label class="check-row"
                          ><input
                            type="checkbox"
                            [checked]="removeProjectedEvents()"
                            (change)="setRemoveEvents($event)"
                          />
                          {{ 'calendar.removeEvents' | t }}</label
                        >
                        @if (professional.access.canRevokeGoogleGrantEverywhere) {
                          <label class="check-row"
                            ><input
                              type="checkbox"
                              [checked]="revokeEverywhere()"
                              (change)="setRevokeEverywhere($event)"
                            />
                            {{ 'calendar.revokeEverywhere' | t }}</label
                          >
                        }
                        <div class="button-row">
                          <button
                            class="button button-danger button-small"
                            type="button"
                            [disabled]="busy()"
                            [attr.aria-busy]="busyKey() === 'disconnect:' + connection.id"
                            (click)="disconnect(connection, professional)"
                          >
                            {{ 'calendar.confirmDisconnect' | t }}
                          </button>
                          <button
                            class="button button-quiet button-small"
                            type="button"
                            (click)="cancelDisconnect()"
                          >
                            {{ 'whatsapp.cancel' | t }}
                          </button>
                        </div>
                      }
                    </div>
                  }
                }
              </article>
            }
          </div>
        }
      }

      <p class="privacy-note">
        {{ 'calendar.privacy' | t }}
      </p>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleCalendarPage implements OnDestroy {
  protected readonly session = inject(SiteSessionService);
  private readonly api = inject(ApiClientService);
  private readonly config = inject(RuntimeConfigService);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly fb = inject(FormBuilder);
  private readonly i18n = inject(I18nService);

  protected readonly company = this.session.selectedCompany;
  protected readonly professionals = signal<AgendaProfessionalOption[]>([]);
  protected readonly connections = signal<GoogleCalendarConnection[]>([]);
  protected readonly drafts = signal<Record<string, ConnectionDraft>>({});
  protected readonly linkStatus = signal<Record<string, GoogleCalendarLinkStatus>>({});
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly busyKey = signal('');
  protected readonly busy = computed(() => this.busyKey() !== '');
  protected readonly registrationWarnings = signal<ApiWarning[]>(this.readRegistrationWarnings());
  protected readonly disconnectingId = signal('');
  protected readonly removeProjectedEvents = signal(false);
  protected readonly revokeEverywhere = signal(false);
  protected readonly conflictConnectionId = signal('');
  protected readonly conflicts = signal<GoogleCalendarConflict[]>([]);
  protected readonly conflictsCursor = signal<string | null>(null);
  protected readonly conflictsLoading = signal(false);

  protected readonly profileForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(160)]],
    council: ['', [Validators.maxLength(40)]],
    registrationNumber: ['', [Validators.maxLength(60)]],
    registrationState: ['', [Validators.maxLength(2)]],
    duration: [50, [Validators.required, Validators.min(1), Validators.max(1440)]],
    inPerson: [true],
    telehealth: [true],
    homeCare: [false],
  });

  private popup?: Window;
  private abort = new AbortController();
  private pollAbort?: AbortController;
  private profileUncertain = false;

  constructor() {
    effect((onCleanup) => {
      const current = this.session.session();
      untracked(() => {
        this.abort = new AbortController();
        this.professionals.set([]);
        this.connections.set([]);
        this.linkStatus.set({});
        this.conflicts.set([]);
        this.conflictConnectionId.set('');
        this.conflictsCursor.set(null);
        this.drafts.set({});
        this.busyKey.set('');
        this.cancelDisconnect();
        this.message.set('');
        this.error.set('');
        this.profileUncertain = false;
        if (current) this.profileForm.controls.displayName.setValue(current.userName);
        void this.load();
      });
      onCleanup(() => {
        this.abort.abort();
        this.pollAbort?.abort();
        this.popup?.close();
      });
    });
  }

  ngOnDestroy(): void {
    this.abort.abort();
    this.pollAbort?.abort();
    this.popup?.close();
  }

  protected connectionFor(professionalId: string): GoogleCalendarConnection | null {
    return (
      this.connections().find(
        (item) => item.professionalId === professionalId && item.status !== 'revoked',
      ) ??
      this.connections().find((item) => item.professionalId === professionalId) ??
      null
    );
  }

  protected draftFor(connection: GoogleCalendarConnection): ConnectionDraft {
    return (
      this.drafts()[connection.id] ?? {
        enabled: connection.enabled,
        externalConflictPolicy: connection.externalConflictPolicy,
        importManualBlocks: connection.importManualBlocks,
      }
    );
  }

  protected setEnabled(id: string, event: Event): void {
    this.patchDraft(id, { enabled: (event.target as HTMLInputElement).checked });
  }

  protected setImport(id: string, event: Event): void {
    this.patchDraft(id, { importManualBlocks: (event.target as HTMLInputElement).checked });
  }

  protected setPolicy(id: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as GoogleCalendarConflictPolicy;
    if (value === 'off' || value === 'warn' || value === 'block') {
      this.patchDraft(id, { externalConflictPolicy: value });
    }
  }

  protected async createInitialProfessional(): Promise<void> {
    const principal = this.currentPrincipal();
    const company = this.company();
    if (
      !principal ||
      !company?.companyCreate ||
      this.profileForm.invalid ||
      this.busy() ||
      this.profileUncertain
    ) {
      this.profileForm.markAllAsTouched();
      if (this.profileForm.invalid) this.error.set(this.i18n.translate('calendar.invalidProfile'));
      if (this.profileUncertain) this.error.set(this.i18n.translate('calendar.profileUncertain'));
      return;
    }
    const value = this.profileForm.getRawValue();
    const modalities = [
      ...(value.inPerson ? ['inPerson'] : []),
      ...(value.telehealth ? ['telehealth'] : []),
      ...(value.homeCare ? ['homeCare'] : []),
    ];
    if (!modalities.length) {
      this.error.set(this.i18n.translate('calendar.selectModality'));
      return;
    }
    const input: ProfessionalInput = {
      clientReference: this.operationId(),
      memberId: company.membershipId,
      displayName: value.displayName.trim(),
      registration: {
        council: value.council.trim(),
        number: value.registrationNumber.trim(),
        state: value.registrationState.trim().toUpperCase(),
      },
      specialties: [],
      unitIds: [],
      roomIds: [],
      serviceIds: [],
      allowedModalities: modalities,
      defaultSessionDurationMinutes: value.duration,
      calendarColor: '#2D5B41',
      signatureUrl: null,
      acceptsOnlineBooking: false,
      commissionBasisPoints: 0,
      active: true,
    };
    await this.mutate('profile', this.i18n.translate('calendar.profileCreated'), () =>
      firstValueFrom(this.api.createProfessional(principal, input)),
    );
  }

  protected async connect(professional: AgendaProfessionalOption): Promise<void> {
    if (!professional.access.canAuthorizeGoogleCalendar || this.busy()) return;
    const principal = this.currentPrincipal();
    if (!principal) return;
    const popup = this.window?.open(
      'about:blank',
      'chips_google_calendar',
      'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes',
    );
    if (!popup) {
      this.error.set(this.i18n.translate('calendar.popupBlocked'));
      return;
    }
    this.popup = popup;
    this.busyKey.set(professional.professionalId);
    this.error.set('');
    this.message.set('');
    try {
      const response = await firstValueFrom(
        this.api.authorizeGoogleCalendar(principal, {
          professionalId: professional.professionalId,
          features: ['dedicatedCalendar', 'importManualBlocks'],
          returnUrl: this.config.googleCalendarReturnUrl,
        }),
      );
      this.assertPrincipal(principal);
      const target = new URL(response.data.authorizationUrl);
      if (
        target.origin !== 'https://accounts.google.com' ||
        target.username ||
        target.password ||
        target.hash ||
        Date.parse(response.data.expiresAt) <= Date.now()
      ) {
        throw new Error(this.i18n.translate('calendar.invalidAuthorizationUrl'));
      }
      popup.location.replace(target.toString());
      this.message.set(this.i18n.translate('calendar.completePopup'));
      await this.load(false);
      await this.pollLink(principal, response.data.connectionId);
    } catch (error) {
      popup.close();
      if (isAborted(error) || !this.session.samePrincipal(principal)) return;
      if (isUncertain(error)) await this.load(false);
      this.handleMutationError(error, this.i18n.translate('calendar.connectFailed'));
    } finally {
      this.busyKey.set('');
    }
  }

  protected async verify(connection: GoogleCalendarConnection): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || this.busy()) return;
    this.busyKey.set(`verify:${connection.id}`);
    this.error.set('');
    try {
      const response = await firstValueFrom(
        this.api.getGoogleCalendarLinkStatus(principal, connection.id),
      );
      this.assertPrincipal(principal);
      this.recordLinkStatus(response.data);
      const localizedMessage = this.linkStatusMessage(response.data);
      if (response.data.outcome === 'error') this.error.set(localizedMessage);
      else this.message.set(localizedMessage);
      await this.load(false);
    } catch (error) {
      this.error.set(this.errorMessage(error, this.i18n.translate('calendar.verifyFailed')));
    } finally {
      this.busyKey.set('');
    }
  }

  protected async saveSettings(connection: GoogleCalendarConnection): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || !this.canManage(connection)) return;
    const draft = this.draftFor(connection);
    const patch: GoogleCalendarConnectionPatch = {};
    if (draft.enabled !== connection.enabled) patch.enabled = draft.enabled;
    if (draft.externalConflictPolicy !== connection.externalConflictPolicy)
      patch.externalConflictPolicy = draft.externalConflictPolicy;
    if (draft.importManualBlocks !== connection.importManualBlocks)
      patch.importManualBlocks = draft.importManualBlocks;
    if (!Object.keys(patch).length) {
      this.message.set(this.i18n.translate('calendar.noChanges'));
      return;
    }
    await this.mutate(
      `save:${connection.id}`,
      this.i18n.translate('calendar.settingsUpdated'),
      () =>
        firstValueFrom(this.api.updateGoogleCalendarConnection(principal, connection.id, patch)),
    );
  }

  protected canToggle(connection: GoogleCalendarConnection): boolean {
    return ['active', 'degraded', 'provisioning', 'paused'].includes(connection.status);
  }

  protected async resume(connection: GoogleCalendarConnection): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || !this.canManage(connection)) return;
    await this.mutate(
      `resume:${connection.id}`,
      this.i18n.translate('calendar.resumeRequested'),
      () =>
        firstValueFrom(
          this.api.updateGoogleCalendarConnection(principal, connection.id, { enabled: true }),
        ),
    );
  }

  protected async sync(connection: GoogleCalendarConnection): Promise<void> {
    const principal = this.currentPrincipal();
    if (
      !principal ||
      !this.canManage(connection) ||
      connection.status !== 'active' ||
      connection.syncInProgress
    )
      return;
    await this.mutate(`sync:${connection.id}`, this.i18n.translate('calendar.syncRequested'), () =>
      firstValueFrom(this.api.syncGoogleCalendar(principal, connection.id)),
    );
  }

  protected async repair(connection: GoogleCalendarConnection): Promise<void> {
    const principal = this.currentPrincipal();
    if (
      !principal ||
      !this.canManage(connection) ||
      this.linkStatus()[connection.id]?.recommendedAction !== 'repair'
    )
      return;
    await this.mutate(
      `repair:${connection.id}`,
      this.i18n.translate('calendar.repairRequested'),
      () => firstValueFrom(this.api.repairGoogleCalendar(principal, connection.id)),
    );
  }

  protected prepareDisconnect(connectionId: string): void {
    this.disconnectingId.set(connectionId);
    this.removeProjectedEvents.set(false);
    this.revokeEverywhere.set(false);
  }

  protected cancelDisconnect(): void {
    this.disconnectingId.set('');
    this.removeProjectedEvents.set(false);
    this.revokeEverywhere.set(false);
  }

  protected setRemoveEvents(event: Event): void {
    this.removeProjectedEvents.set((event.target as HTMLInputElement).checked);
  }

  protected setRevokeEverywhere(event: Event): void {
    this.revokeEverywhere.set((event.target as HTMLInputElement).checked);
  }

  protected async disconnect(
    connection: GoogleCalendarConnection,
    professional: AgendaProfessionalOption,
  ): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || !this.canManage(connection) || this.disconnectingId() !== connection.id)
      return;
    const revoke = professional.access.canRevokeGoogleGrantEverywhere && this.revokeEverywhere();
    await this.mutate(
      `disconnect:${connection.id}`,
      this.i18n.translate('calendar.disconnectRequested'),
      () =>
        firstValueFrom(
          this.api.disconnectGoogleCalendar(principal, connection.id, {
            removeProjectedEvents: this.removeProjectedEvents(),
            revokeGrantEverywhere: revoke,
          }),
        ),
    );
    this.cancelDisconnect();
  }

  protected async openConflicts(connection: GoogleCalendarConnection, event: Event): Promise<void> {
    if (!(event.target as HTMLDetailsElement).open) return;
    if (this.conflictConnectionId() === connection.id && this.conflicts().length) return;
    this.conflictConnectionId.set(connection.id);
    this.conflicts.set([]);
    this.conflictsCursor.set(null);
    await this.loadConflicts(connection, false);
  }

  protected async loadConflicts(
    connection: GoogleCalendarConnection,
    append: boolean,
  ): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || this.conflictsLoading()) return;
    const connectionId = connection.id;
    this.conflictsLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.api.listGoogleCalendarConflicts(principal, connection.id, {
          status: 'open',
          limit: 50,
          ...(append && this.conflictsCursor() ? { cursor: this.conflictsCursor()! } : {}),
        }),
      );
      this.assertPrincipal(principal);
      if (this.conflictConnectionId() !== connectionId) return;
      this.conflicts.set(append ? [...this.conflicts(), ...response.data] : response.data);
      this.conflictsCursor.set(response.meta.hasMore ? (response.meta.nextCursor ?? null) : null);
    } catch (error) {
      this.error.set(this.errorMessage(error, this.i18n.translate('calendar.conflictsLoadFailed')));
    } finally {
      this.conflictsLoading.set(false);
    }
  }

  protected async resolveConflict(
    connection: GoogleCalendarConnection,
    conflict: GoogleCalendarConflict,
    resolution: 'retry_restore' | 'acknowledge',
  ): Promise<void> {
    const principal = this.currentPrincipal();
    if (!principal || !this.canManage(connection) || conflict.connectionId !== connection.id)
      return;
    await this.mutate(
      `conflict:${resolution}:${conflict.id}`,
      this.i18n.translate('calendar.conflictUpdated'),
      () =>
        firstValueFrom(
          this.api.resolveGoogleCalendarConflict(principal, connection.id, conflict.id, resolution),
        ),
    );
    if (this.session.samePrincipal(principal)) {
      this.conflicts.set([]);
      this.conflictsCursor.set(null);
      await this.loadConflicts(connection, false);
    }
  }

  protected statusLabel(status: GoogleCalendarConnection['status']): string {
    const keys = {
      pending_oauth: 'calendar.status.pendingOauth',
      provisioning: 'calendar.status.provisioning',
      active: 'calendar.status.active',
      degraded: 'calendar.status.degraded',
      reconnect_required: 'calendar.status.reconnectRequired',
      paused: 'calendar.status.paused',
      revoking: 'calendar.status.revoking',
      revoked: 'calendar.status.revoked',
    } as const;
    return this.i18n.translate(keys[status]);
  }

  protected statusClass(status: GoogleCalendarConnection['status']): string {
    if (status === 'active') return 'status-pill status-ok';
    if (status === 'degraded' || status === 'reconnect_required') return 'status-pill status-warn';
    if (status === 'revoked') return 'status-pill status-neutral';
    return 'status-pill status-progress';
  }

  protected policyLabel(policy: GoogleCalendarConflictPolicy): string {
    const keys = {
      off: 'calendar.policy.off',
      warn: 'calendar.policy.warn',
      block: 'calendar.policy.block',
    } as const;
    return this.i18n.translate(keys[policy]);
  }

  protected linkStatusMessage(status: GoogleCalendarLinkStatus): string {
    return this.i18n.translate(googleCalendarLinkMessageKey(status));
  }

  protected conflictMessage(conflict: GoogleCalendarConflict): string {
    return this.i18n.translate(googleCalendarConflictMessageKey(conflict));
  }

  protected dateTime(value: string | null): string {
    if (!value) return this.i18n.translate('calendar.notPerformed');
    return this.i18n.formatDate(new Date(value), { dateStyle: 'short', timeStyle: 'short' });
  }

  protected async load(showLoader = true): Promise<void> {
    const principal = this.currentPrincipal();
    const company = this.company();
    if (!principal || !company?.googleCalendarSync || !company.agendaRead) {
      this.loading.set(false);
      this.professionals.set([]);
      this.connections.set([]);
      return;
    }
    if (showLoader) this.loading.set(true);
    if (showLoader) this.error.set('');
    try {
      const [professionals, connections] = await Promise.all([
        firstValueFrom(this.api.listAgendaProfessionalOptions(principal)),
        firstValueFrom(this.api.listGoogleCalendarConnections(principal)),
      ]);
      this.assertPrincipal(principal);
      this.professionals.set(professionals.data);
      this.connections.set(connections.data);
      if (professionals.data.length) this.profileUncertain = false;
      this.drafts.set(
        Object.fromEntries(
          connections.data.map((connection) => [
            connection.id,
            {
              enabled: connection.enabled,
              externalConflictPolicy: connection.externalConflictPolicy,
              importManualBlocks: connection.importManualBlocks,
            },
          ]),
        ),
      );
      const statuses = await Promise.all(
        connections.data.map((connection) =>
          firstValueFrom(this.api.getGoogleCalendarLinkStatus(principal, connection.id)),
        ),
      );
      this.assertPrincipal(principal);
      this.linkStatus.set(
        Object.fromEntries(statuses.map((item) => [item.data.connectionId, item.data])),
      );
    } catch (error) {
      if (isAborted(error) || !this.session.samePrincipal(principal)) return;
      this.error.set(this.errorMessage(error, this.i18n.translate('calendar.loadFailed')));
    } finally {
      if (this.session.samePrincipal(principal)) this.loading.set(false);
    }
  }

  private async pollLink(principal: FlowPrincipal, connectionId: string): Promise<void> {
    this.pollAbort?.abort();
    this.pollAbort = new AbortController();
    const result = await pollUntil({
      signal: this.pollAbort.signal,
      read: async () => {
        this.assertPrincipal(principal);
        const [connection, status] = await Promise.all([
          firstValueFrom(this.api.getGoogleCalendarConnection(principal, connectionId)),
          firstValueFrom(this.api.getGoogleCalendarLinkStatus(principal, connectionId)),
        ]);
        return { connection: connection.data, status: status.data };
      },
      onValue: ({ connection, status }) => {
        this.assertPrincipal(principal);
        this.upsertConnection(connection);
        this.recordLinkStatus(status);
        const localizedMessage = this.linkStatusMessage(status);
        if (status.outcome === 'error') this.error.set(localizedMessage);
        else if (connection.status === 'revoked')
          this.message.set(this.i18n.translate('calendar.disconnected'));
        else this.message.set(localizedMessage);
      },
      pending: ({ connection, status }) =>
        connection.status !== 'revoked' &&
        (connection.status === 'revoking' ||
          status.outcome === 'pending' ||
          (connection.status === 'active' && connection.syncInProgress)),
    });
    if (result === 'timeout') {
      this.message.set(this.i18n.translate('calendar.confirmationContinues'));
    } else {
      this.popup?.close();
    }
  }

  private async mutate<T extends GoogleCalendarConnection | Professional | GoogleCalendarConflict>(
    key: string,
    success: string,
    request: () => Promise<ObjectEnvelope<T>>,
  ): Promise<void> {
    if (this.busy()) return;
    const principal = this.currentPrincipal();
    if (!principal) return;
    this.busyKey.set(key);
    this.error.set('');
    this.message.set('');
    try {
      const response = await request();
      this.assertPrincipal(principal);
      if (response.meta.warnings?.length) this.registrationWarnings.set(response.meta.warnings);
      this.message.set(success);
      if ('professionalId' in response.data) {
        this.upsertConnection(response.data);
        await this.pollLink(principal, response.data.id);
      } else {
        await this.load(false);
      }
    } catch (error) {
      if (isAborted(error) || !this.session.samePrincipal(principal)) return;
      if (isUncertain(error)) {
        if (key === 'profile') this.profileUncertain = true;
        await this.load(false);
      }
      this.handleMutationError(error, this.i18n.translate('calendar.operationFailed'));
    } finally {
      if (this.session.samePrincipal(principal)) this.busyKey.set('');
    }
  }

  private handleMutationError(error: unknown, fallback: string): void {
    this.error.set(
      isUncertain(error)
        ? this.i18n.translate('calendar.uncertain')
        : this.errorMessage(error, fallback),
    );
  }

  private patchDraft(id: string, patch: Partial<ConnectionDraft>): void {
    const connection = this.connections().find((item) => item.id === id);
    if (!connection) return;
    this.drafts.update((current) => ({
      ...current,
      [id]: { ...this.draftFor(connection), ...patch },
    }));
  }

  private recordLinkStatus(status: GoogleCalendarLinkStatus): void {
    this.linkStatus.update((current) => ({ ...current, [status.connectionId]: status }));
  }

  private canManage(connection: GoogleCalendarConnection): boolean {
    return (
      !!this.professionals().find((item) => item.professionalId === connection.professionalId)
        ?.access.canManageGoogleCalendar &&
      connection.status !== 'revoking' &&
      connection.status !== 'revoked'
    );
  }

  private upsertConnection(connection: GoogleCalendarConnection): void {
    this.connections.update((items) => [
      ...items.filter((item) => item.id !== connection.id),
      connection,
    ]);
    this.drafts.update((drafts) => ({
      ...drafts,
      [connection.id]: {
        enabled: connection.enabled,
        externalConflictPolicy: connection.externalConflictPolicy,
        importManualBlocks: connection.importManualBlocks,
      },
    }));
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

  private operationId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('');
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
