import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiClientService, ApiError, TransportError } from '../core/api-client.service';
import {
  ApiWarning,
  AuthenticationSession,
  CompanyCreateInput,
  GoogleAuthAuthorization,
  GoogleAuthAuthorizeInput,
  GoogleAuthProfile,
  GoogleCalendarAccess,
  GoogleOwnerMode,
  InvitePreview,
} from '../core/api.models';
import {
  GoogleAuthFlowService,
  GoogleAuthPopupBlockedError,
} from '../core/google-auth-flow.service';
import { I18nService } from '../core/i18n.service';
import { SiteSessionService } from '../core/site-session.service';
import { SiteShellComponent } from '../shared/site-shell.component';
import { TranslatePipe } from '../shared/translate.pipe';

type RegistrationPath = 'create' | 'invite';

@Component({
  imports: [ReactiveFormsModule, RouterLink, SiteShellComponent, TranslatePipe],
  template: `
    <app-site-shell>
      <div class="register-layout">
        <aside class="register-aside">
          <p class="eyebrow">{{ 'register.account' | t }}</p>
          <h1>
            {{ (path() === 'invite' ? 'register.inviteHeading' : 'register.configureHeading') | t }}
          </h1>
          <p class="lead">
            {{ 'register.lead' | t }}
          </p>
          @if (path() === 'create') {
            <ol class="wizard-nav" [attr.aria-label]="'register.createStepsLabel' | t">
              <li [class.active]="step() === 1" [class.complete]="step() > 1">
                <span>1</span>
                <div>
                  <strong>{{ 'register.yourRole' | t }}</strong
                  ><small>{{ 'register.companyAndSchedule' | t }}</small>
                </div>
              </li>
              <li [class.active]="step() === 2" [class.complete]="step() > 2">
                <span>2</span>
                <div>
                  <strong>{{ 'register.clinicData' | t }}</strong
                  ><small>{{ 'register.mainIdentification' | t }}</small>
                </div>
              </li>
              <li [class.active]="step() === 3">
                <span>3</span>
                <div>
                  <strong>{{ 'register.addressReview' | t }}</strong
                  ><small>{{ 'register.completeRegistration' | t }}</small>
                </div>
              </li>
            </ol>
          } @else if (path() === 'invite') {
            <ol class="wizard-nav" [attr.aria-label]="'register.inviteStepsLabel' | t">
              <li class="active">
                <span>1</span>
                <div>
                  <strong>{{ 'register.invitation' | t }}</strong
                  ><small>{{ 'register.clinicAndRole' | t }}</small>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>{{ 'register.googleAccount' | t }}</strong
                  ><small>{{ 'register.enterWithoutNewRegistration' | t }}</small>
                </div>
              </li>
            </ol>
          }
        </aside>

        <section class="card register-card">
          <div class="section-heading compact-heading">
            <div>
              <p class="step-caption">{{ stepCaption() }}</p>
              <h2>{{ stepTitle() }}</h2>
            </div>
            <a routerLink="/login">{{ 'home.haveAccount' | t }}</a>
          </div>

          @if (message()) {
            <div class="notice notice-error" role="alert">
              <strong>{{ message() }}</strong>
              @if (uncertain()) {
                <p>
                  {{ 'register.uncertainDescription' | t }}
                </p>
                <a routerLink="/login">{{ 'register.goToLogin' | t }}</a>
              }
            </div>
          }
          @if (calendarNotice()) {
            <div class="notice" role="status">{{ calendarNotice() }}</div>
          }

          @if (!path()) {
            <div class="wizard-panel onboarding-options">
              <button type="button" class="onboarding-option" (click)="selectPath('create')">
                <strong>{{ 'register.createClinic' | t }}</strong>
                <span>{{ 'register.createClinicDescription' | t }}</span>
              </button>
              <button type="button" class="onboarding-option" (click)="selectPath('invite')">
                <strong>{{ 'register.haveInvite' | t }}</strong>
                <span>{{ 'register.haveInviteDescription' | t }}</span>
              </button>
            </div>
          } @else if (path() === 'invite') {
            <div class="wizard-panel">
              <form [formGroup]="inviteForm" (ngSubmit)="previewInvite()" novalidate>
                <label class="field field-wide">
                  <span>{{ 'register.inviteCode' | t }}</span>
                  <input
                    formControlName="inviteCode"
                    autocomplete="one-time-code"
                    maxlength="64"
                    (input)="clearInvitePreview()"
                  />
                </label>
                <div class="wizard-actions compact-actions">
                  <button class="button button-secondary" type="button" (click)="resetPath()">
                    {{ 'register.back' | t }}
                  </button>
                  <button class="button button-primary" type="submit" [disabled]="previewPending()">
                    {{ (previewPending() ? 'register.verifying' : 'register.verifyInvite') | t }}
                  </button>
                </div>
              </form>
              @if (invitePreview(); as invite) {
                <div class="review-box invite-preview">
                  <span>{{ 'register.clinic' | t }}</span
                  ><strong>{{ invite.companyName }}</strong> <span>{{ 'register.role' | t }}</span
                  ><strong>{{ invite.groupName }}</strong>
                  <span>{{ 'register.accessType' | t }}</span>
                  <strong>{{
                    (invite.isProfessional
                      ? 'register.companyProfessionalAccess'
                      : 'register.companyAccess'
                    ) | t
                  }}</strong>
                </div>
                <p>
                  @if (invite.isProfessional) {
                    {{ 'register.professionalInviteDescription' | t }}
                  } @else {
                    {{ 'register.adminInviteDescription' | t }}
                  }
                </p>
                <button
                  class="button button-google button-full"
                  type="button"
                  [disabled]="googlePending() || pending()"
                  (click)="startGoogleRegistration()"
                >
                  <img src="/google-g.svg" alt="" width="18" height="18" />
                  {{
                    (pending()
                      ? 'register.joiningClinic'
                      : googlePending()
                        ? 'login.waitingGoogle'
                        : 'register.acceptInviteGoogle'
                    ) | t
                  }}
                </button>
              }
              @if (canRetryWithoutCalendar()) {
                <button
                  class="button button-secondary button-full"
                  type="button"
                  (click)="startGoogleRegistration(false)"
                >
                  {{ 'register.continueWithoutCalendar' | t }}
                </button>
              }
            </div>
          } @else if (step() === 1) {
            <div class="wizard-panel">
              <fieldset class="role-options">
                <legend>{{ 'register.participationQuestion' | t }}</legend>
                <label class="role-option" [class.selected]="ownerMode() === 'adminProfessional'">
                  <input
                    type="radio"
                    name="ownerMode"
                    value="adminProfessional"
                    [checked]="ownerMode() === 'adminProfessional'"
                    [disabled]="calendarAccess() === 'granted'"
                    (change)="setOwnerMode('adminProfessional')"
                  />
                  <span
                    ><strong>{{ 'register.adminAndCare' | t }}</strong
                    ><small>{{ 'register.adminAndCareDescription' | t }}</small></span
                  >
                </label>
                <label class="role-option" [class.selected]="ownerMode() === 'admin'">
                  <input
                    type="radio"
                    name="ownerMode"
                    value="admin"
                    [checked]="ownerMode() === 'admin'"
                    [disabled]="calendarAccess() === 'granted'"
                    (change)="setOwnerMode('admin')"
                  />
                  <span
                    ><strong>{{ 'register.adminOnly' | t }}</strong
                    ><small>{{ 'register.adminOnlyDescription' | t }}</small></span
                  >
                </label>
              </fieldset>
              @if (ownerMode() === 'adminProfessional') {
                <fieldset class="role-options calendar-choice">
                  <legend>{{ 'register.calendarChoiceTitle' | t }}</legend>
                  <label class="role-option" [class.selected]="connectGoogleCalendar()">
                    <input
                      type="radio"
                      name="connectGoogleCalendar"
                      [checked]="connectGoogleCalendar()"
                      [disabled]="calendarAccess() === 'granted'"
                      (change)="setGoogleCalendarChoice(true)"
                    />
                    <span
                      ><strong>{{ 'register.connectCalendarNow' | t }}</strong
                      ><small>{{ 'register.connectCalendarNowDescription' | t }}</small></span
                    >
                  </label>
                  <label class="role-option" [class.selected]="!connectGoogleCalendar()">
                    <input
                      type="radio"
                      name="connectGoogleCalendar"
                      [checked]="!connectGoogleCalendar()"
                      [disabled]="calendarAccess() === 'granted'"
                      (change)="setGoogleCalendarChoice(false)"
                    />
                    <span
                      ><strong>{{ 'register.connectCalendarLater' | t }}</strong
                      ><small>{{ 'register.connectCalendarLaterDescription' | t }}</small></span
                    >
                  </label>
                </fieldset>
              }
              @if (accountReady()) {
                <div class="review-box account-confirmed" role="status">
                  <span>{{ 'register.googleIdentity' | t }}</span>
                  <strong>{{ googleProfile()?.email }}</strong>
                  <span>{{ 'register.accountStatus' | t }}</span>
                  <strong>{{ 'register.accountValidated' | t }}</strong>
                </div>
                @if (
                  ownerMode() === 'adminProfessional' &&
                  connectGoogleCalendar() &&
                  calendarAccess() !== 'granted'
                ) {
                  <button
                    class="button button-google button-full"
                    type="button"
                    [disabled]="googlePending() || pending()"
                    [attr.aria-busy]="googlePending() || pending()"
                    (click)="startGoogleRegistration(true)"
                  >
                    <img src="/google-g.svg" alt="" width="18" height="18" />
                    {{
                      (googlePending() ? 'login.waitingGoogle' : 'register.authorizeCalendarNow')
                        | t
                    }}
                  </button>
                  <button
                    class="button button-secondary button-full"
                    type="button"
                    [disabled]="googlePending() || pending()"
                    (click)="setGoogleCalendarChoice(false)"
                  >
                    {{ 'register.continueWithoutCalendar' | t }}
                  </button>
                } @else {
                  <button class="button button-primary button-full" type="button" (click)="next()">
                    {{ 'register.continueWithAccount' | t }}
                  </button>
                }
              } @else if (identityLinkRequired()) {
                <div class="notice notice-info identity-link-panel" role="region">
                  <strong>{{ 'register.linkExistingTitle' | t }}</strong>
                  <p>{{ 'register.linkExistingDescription' | t }}</p>
                  <label class="field field-wide">
                    <span>{{ 'register.existingPassword' | t }}</span>
                    <input
                      [formControl]="identityPassword"
                      type="password"
                      autocomplete="current-password"
                      maxlength="1024"
                      required
                    />
                    @if (identityPassword.touched && identityPassword.invalid) {
                      <small class="field-error">{{
                        'register.existingPasswordRequired' | t
                      }}</small>
                    }
                  </label>
                  <button
                    class="button button-primary button-full"
                    type="button"
                    [disabled]="linkPending() || uncertain()"
                    [attr.aria-busy]="linkPending()"
                    (click)="linkExistingAccount()"
                  >
                    {{
                      (linkPending()
                        ? 'register.linkingExistingAccount'
                        : 'register.linkExistingAccount'
                      ) | t
                    }}
                  </button>
                </div>
              } @else {
                <button
                  class="button button-google button-full"
                  type="button"
                  [disabled]="googlePending() || pending()"
                  [attr.aria-busy]="googlePending() || pending()"
                  (click)="startGoogleRegistration()"
                >
                  <img src="/google-g.svg" alt="" width="18" height="18" />
                  {{
                    (pending()
                      ? 'register.validatingAccount'
                      : googlePending()
                        ? 'login.waitingGoogle'
                        : 'register.continueGoogleFirstStep'
                    ) | t
                  }}
                </button>
              }
              <p class="auth-disclaimer">
                {{ 'register.googleFinalDescription' | t }}
              </p>
              <button class="link-button" type="button" (click)="resetPath()">
                {{ 'register.changeInitialOption' | t }}
              </button>
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="completeRegistration()" novalidate>
              @if (step() === 2) {
                <div class="form-grid">
                  <label class="field field-wide"
                    ><span>{{ 'register.clinicName' | t }}</span
                    ><input formControlName="name" autocomplete="organization" required />
                    @if (fieldMessage('name')) {
                      <small class="field-error">{{ fieldMessage('name') }}</small>
                    }
                  </label>
                  <label class="field field-wide"
                    ><span>{{ 'register.legalName' | t }}</span
                    ><input formControlName="legalName" required />
                    @if (fieldMessage('legalName')) {
                      <small class="field-error">{{ fieldMessage('legalName') }}</small>
                    }
                  </label>
                  <label class="field field-wide"
                    ><span>{{ 'register.taxId' | t }}</span
                    ><input formControlName="taxId" inputmode="numeric" required />
                    @if (fieldMessage('taxId')) {
                      <small class="field-error">{{ fieldMessage('taxId') }}</small>
                    }
                  </label>
                  <label class="field"
                    ><span>{{ 'register.timezone' | t }}</span
                    ><select formControlName="timezone" required>
                      <option value="America/Sao_Paulo">
                        {{ 'register.brasiliaTimezone' | t }}
                      </option>
                    </select></label
                  >
                  <label class="field"
                    ><span>{{ 'register.currency' | t }}</span
                    ><select formControlName="currency" required>
                      <option value="BRL">{{ 'register.brlCurrency' | t }}</option>
                    </select></label
                  >
                </div>
                <div class="wizard-actions">
                  <button class="button button-secondary" type="button" (click)="back()">
                    {{ 'register.back' | t }}</button
                  ><button class="button button-primary" type="button" (click)="next()">
                    {{ 'register.continue' | t }}
                  </button>
                </div>
              } @else {
                <div class="form-grid" formGroupName="address">
                  <label class="field"
                    ><span>{{ 'register.zipCode' | t }}</span
                    ><input
                      formControlName="zipCode"
                      inputmode="numeric"
                      autocomplete="postal-code"
                  /></label>
                  <label class="field field-wide"
                    ><span>{{ 'register.street' | t }}</span
                    ><input formControlName="street" autocomplete="address-line1"
                  /></label>
                  <label class="field"
                    ><span>{{ 'register.number' | t }}</span
                    ><input formControlName="number"
                  /></label>
                  <label class="field"
                    ><span>{{ 'register.complement' | t }}</span
                    ><input formControlName="complement" autocomplete="address-line2"
                  /></label>
                  <label class="field"
                    ><span>{{ 'register.district' | t }}</span
                    ><input formControlName="district"
                  /></label>
                  <label class="field"
                    ><span>{{ 'register.city' | t }}</span
                    ><input formControlName="city" autocomplete="address-level2"
                  /></label>
                  <label class="field"
                    ><span>{{ 'register.state' | t }}</span
                    ><input formControlName="state" maxlength="2" autocomplete="address-level1"
                  /></label>
                  <label class="field"
                    ><span>{{ 'register.country' | t }}</span
                    ><input formControlName="country" maxlength="2" autocomplete="country"
                  /></label>
                </div>
                <div class="review-box">
                  <span>{{ 'register.googleIdentity' | t }}</span>
                  @if (googleProfile(); as profile) {
                    <strong>{{ profile.email }}</strong>
                  } @else {
                    <strong>{{ 'register.googleIdentityPending' | t }}</strong>
                  }
                  <span>{{ 'register.access' | t }}</span
                  ><strong>{{
                    (ownerMode() === 'adminProfessional'
                      ? 'register.adminAndCare'
                      : 'register.adminOnly'
                    ) | t
                  }}</strong>
                  <span>{{ 'register.clinic' | t }}</span
                  ><strong>{{ form.controls.name.value }}</strong>
                </div>
                <div class="wizard-actions">
                  <button
                    class="button button-secondary"
                    type="button"
                    [disabled]="pending()"
                    (click)="back()"
                  >
                    {{ 'register.back' | t }}
                  </button>
                  <button
                    class="button button-primary"
                    type="submit"
                    [disabled]="pending() || uncertain()"
                    [attr.aria-busy]="pending()"
                  >
                    {{ (pending() ? 'register.creatingClinic' : 'register.finishClinic') | t }}
                  </button>
                </div>
              }
            </form>
          }
        </section>
      </div>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiClientService);
  private readonly session = inject(SiteSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly googleAuth = inject(GoogleAuthFlowService);
  private readonly i18n = inject(I18nService);
  private googleAbort?: AbortController;
  private companyOperationId = '';
  private companyOccurredAt = '';

  protected readonly path = signal<RegistrationPath | null>(null);
  protected readonly step = signal<1 | 2 | 3>(1);
  protected readonly ownerMode = signal<GoogleOwnerMode>('adminProfessional');
  protected readonly connectGoogleCalendar = signal(true);
  protected readonly pending = signal(false);
  protected readonly previewPending = signal(false);
  protected readonly uncertain = signal(false);
  protected readonly message = signal('');
  protected readonly calendarNotice = signal('');
  protected readonly canRetryWithoutCalendar = signal(false);
  protected readonly apiFields = signal<Record<string, string[]>>({});
  protected readonly googlePending = signal(false);
  protected readonly linkPending = signal(false);
  protected readonly identityLinkRequired = signal(false);
  protected readonly accountReady = signal(false);
  protected readonly googleProfile = signal<GoogleAuthProfile | null>(null);
  protected readonly googleAuthorization = signal<GoogleAuthAuthorization | null>(null);
  protected readonly calendarAccess = signal<GoogleCalendarAccess>('notRequested');
  protected readonly invitePreview = signal<InvitePreview | null>(null);

  protected readonly inviteForm = this.fb.nonNullable.group({
    inviteCode: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(64)]],
  });

  protected readonly identityPassword = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.minLength(8),
    Validators.maxLength(1024),
  ]);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(160)]],
    legalName: ['', [Validators.required, Validators.maxLength(200)]],
    taxId: ['', [Validators.required, Validators.maxLength(32)]],
    timezone: ['America/Sao_Paulo', [Validators.required]],
    currency: ['BRL', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]],
    address: this.fb.nonNullable.group({
      zipCode: [''],
      street: [''],
      number: [''],
      complement: [''],
      district: [''],
      city: [''],
      state: [''],
      country: ['BR'],
    }),
  });

  constructor() {
    const inviteCode = this.route.snapshot.queryParamMap.get('invite')?.trim();
    if (inviteCode) {
      this.path.set('invite');
      this.inviteForm.controls.inviteCode.setValue(inviteCode);
      const view = this.document.defaultView;
      if (view)
        view.history.replaceState(
          view.history.state,
          '',
          view.location.pathname + view.location.hash,
        );
      void this.previewInvite();
    }
  }

  async ngOnInit(): Promise<void> {
    if (this.path() === 'invite') return;
    if (!(await this.session.initialize())) return;
    if (this.session.hasCompanies()) {
      await this.router.navigateByUrl('/settings/integrations');
      return;
    }
    this.resumeAccountWithoutClinic();
  }

  protected stepCaption(): string {
    if (!this.path()) return this.i18n.translate('register.chooseStart');
    return this.path() === 'invite'
      ? this.i18n.translate('register.existingClinicInvite')
      : this.i18n.translate('register.stepOfThree', { step: this.step() });
  }

  protected stepTitle(): string {
    if (!this.path()) return this.i18n.translate('register.whatToDo');
    if (this.path() === 'invite') return this.i18n.translate('register.acceptInvitation');
    const keys = ['register.defineRole', 'register.tellClinic', 'register.reviewFinish'] as const;
    return this.i18n.translate(keys[this.step() - 1]!);
  }

  protected selectPath(path: RegistrationPath): void {
    this.path.set(path);
    this.step.set(1);
    this.message.set('');
    if (path === 'create') this.resumeAccountWithoutClinic();
  }

  protected resetPath(): void {
    if (this.pending() || this.googlePending()) return;
    this.googleAbort?.abort();
    this.path.set(null);
    this.step.set(1);
    this.invitePreview.set(null);
    this.clearGoogleIdentity();
  }

  protected setOwnerMode(mode: GoogleOwnerMode): void {
    if (this.ownerMode() === mode || this.calendarAccess() === 'granted') return;
    this.ownerMode.set(mode);
    this.connectGoogleCalendar.set(mode === 'adminProfessional');
    this.calendarAccess.set('notRequested');
    this.googleAuthorization.set(null);
    this.calendarNotice.set('');
  }

  protected setGoogleCalendarChoice(connect: boolean): void {
    if (this.calendarAccess() === 'granted') return;
    this.connectGoogleCalendar.set(connect);
    if (!connect) {
      this.calendarAccess.set('notRequested');
      this.googleAuthorization.set(null);
      this.calendarNotice.set('');
    }
  }

  protected clearInvitePreview(): void {
    this.invitePreview.set(null);
    this.clearGoogleIdentity();
  }

  protected async previewInvite(): Promise<void> {
    this.inviteForm.markAllAsTouched();
    if (this.inviteForm.invalid || this.previewPending()) {
      if (this.inviteForm.invalid)
        this.message.set(this.i18n.translate('register.invalidInviteCode'));
      return;
    }
    this.previewPending.set(true);
    this.message.set('');
    try {
      const response = await firstValueFrom(this.api.previewInvite(this.inviteCode()));
      this.invitePreview.set(response.data);
    } catch (error) {
      this.invitePreview.set(null);
      this.message.set(
        error instanceof ApiError
          ? error.message
          : this.i18n.translate('register.inviteCheckFailed'),
      );
    } finally {
      this.previewPending.set(false);
    }
  }

  protected next(): void {
    if (this.step() === 1) {
      if (!this.accountReady()) {
        this.message.set(this.i18n.translate('register.validateGoogleBeforeClinic'));
        return;
      }
      this.message.set('');
      this.step.set(2);
      return;
    }
    const controls = [
      this.form.controls.name,
      this.form.controls.legalName,
      this.form.controls.taxId,
      this.form.controls.timezone,
      this.form.controls.currency,
    ];
    controls.forEach((control) => control.markAsTouched());
    if (controls.some((control) => control.invalid)) {
      this.message.set(this.i18n.translate('register.requiredClinicData'));
      return;
    }
    this.message.set('');
    this.step.set(3);
  }

  protected back(): void {
    if (!this.pending()) {
      this.message.set('');
      this.resetCompanyOperation();
      this.step.set(this.step() === 3 ? 2 : 1);
    }
  }

  protected async startGoogleRegistration(requestCalendar?: boolean): Promise<void> {
    if (this.googlePending() || this.pending()) return;
    if (this.path() === 'create' && this.step() !== 1) {
      return;
    }
    const input = this.googleAuthorizeInput(requestCalendar);
    if (!input) return;
    this.googleAbort?.abort();
    this.googleAbort = new AbortController();
    this.googlePending.set(true);
    this.message.set('');
    this.calendarNotice.set('');
    this.canRetryWithoutCalendar.set(false);
    this.apiFields.set({});
    const requestedCalendar = input.requestCalendar === true;
    try {
      const flow = await this.googleAuth.start(input, this.googleAbort.signal);
      const status = await this.googleAuth.waitForTerminal(flow, this.googleAbort.signal);
      if (status.status !== 'verified' || !status.profile) {
        this.message.set(status.message);
        this.canRetryWithoutCalendar.set(
          requestedCalendar && status.errorCode === 'google_auth_access_denied',
        );
        return;
      }
      this.googleAuthorization.set(flow.authorization);
      this.googleProfile.set(status.profile);
      this.calendarAccess.set(status.calendarAccess);
      if (status.calendarAccess === 'declined')
        this.calendarNotice.set(this.i18n.translate('register.calendarDeclined'));
      else if (status.calendarAccess === 'unavailable')
        this.calendarNotice.set(this.i18n.translate('register.calendarUnavailable'));
      if (this.path() === 'invite') await this.submitJoin();
      else await this.completeGoogleAccount();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof ApiError || error instanceof GoogleAuthPopupBlockedError)
        this.message.set(error.message);
      else if (error instanceof TransportError)
        this.message.set(this.i18n.translate('register.googleStartFailed'));
      else this.message.set(this.i18n.translate('register.googleConfirmFailed'));
    } finally {
      this.googlePending.set(false);
    }
  }

  protected clearGoogleIdentity(): void {
    const current = this.session.session();
    this.googleAbort?.abort();
    this.googleAuthorization.set(null);
    this.calendarAccess.set('notRequested');
    this.calendarNotice.set('');
    this.canRetryWithoutCalendar.set(false);
    this.identityLinkRequired.set(false);
    if (current && current.companies.length === 0) {
      this.accountReady.set(true);
      this.googleProfile.set({
        name: current.userName,
        email: current.userEmail,
        avatarUrl: current.avatarUrl,
      });
    } else {
      this.accountReady.set(false);
      this.googleProfile.set(null);
    }
    this.identityPassword.reset();
    this.message.set('');
  }

  protected async completeRegistration(): Promise<void> {
    if (
      this.path() !== 'create' ||
      this.step() !== 3 ||
      !this.accountReady() ||
      this.pending() ||
      this.googlePending() ||
      this.uncertain()
    )
      return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.message.set(this.i18n.translate('register.requiredClinicData'));
      return;
    }
    const current = this.session.session();
    if (!current) {
      this.accountReady.set(false);
      this.step.set(1);
      this.message.set(this.i18n.translate('register.validateGoogleBeforeClinic'));
      return;
    }
    if (current.companies.length > 0) {
      await this.router.navigateByUrl('/settings/integrations');
      return;
    }
    if (
      this.ownerMode() === 'adminProfessional' &&
      this.connectGoogleCalendar() &&
      (this.calendarAccess() !== 'granted' || !this.googleAuthorization())
    ) {
      this.step.set(1);
      this.message.set(this.i18n.translate('register.authorizeCalendarBeforeClinic'));
      return;
    }
    this.ensureCompanyOperation();
    this.pending.set(true);
    this.message.set('');
    this.apiFields.set({});
    try {
      const creation = await firstValueFrom(
        this.api.createCompany(
          current.accessToken,
          this.companyInput(),
          this.companyOperationId,
          this.companyOccurredAt,
        ),
      );
      const canonical = await firstValueFrom(this.api.getSession(current.accessToken));
      this.session.acceptAuthenticationSession({
        ...canonical.data,
        access_token: current.accessToken,
        selectedCompanyId: creation.data.id,
      });
      await this.finishRegistration(creation.meta.warnings ?? []);
    } catch (error) {
      this.handleCompletionError(error);
    } finally {
      this.pending.set(false);
    }
  }

  protected async linkExistingAccount(): Promise<void> {
    const authorization = this.googleAuthorization();
    this.identityPassword.markAsTouched();
    if (
      !this.identityLinkRequired() ||
      !authorization ||
      this.identityPassword.invalid ||
      this.linkPending() ||
      this.pending() ||
      this.googlePending() ||
      this.uncertain()
    )
      return;
    if (!this.authorizationIsCurrent(authorization)) return;
    this.linkPending.set(true);
    this.message.set('');
    try {
      const response = await firstValueFrom(
        this.api.linkGoogleIdentity({
          attemptId: authorization.attemptId,
          exchangeToken: authorization.exchangeToken,
          password: this.identityPassword.value,
        }),
      );
      if (this.googleAbort?.signal.aborted) return;
      await this.acceptAccountSession(response.data, true);
    } catch (error) {
      this.handleCompletionError(error);
    } finally {
      this.identityPassword.reset();
      this.linkPending.set(false);
    }
  }

  protected fieldMessage(name: 'name' | 'legalName' | 'taxId'): string {
    const backend =
      this.apiFields()[`company.${name}`]?.join(' ') || this.apiFields()[name]?.join(' ') || '';
    if (backend) return backend;
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) return '';
    return this.i18n.translate(
      control.errors['required'] ? 'register.requiredField' : 'register.checkField',
    );
  }

  ngOnDestroy(): void {
    this.googleAbort?.abort();
  }

  private googleAuthorizeInput(requestCalendar?: boolean): GoogleAuthAuthorizeInput | null {
    if (this.path() === 'create')
      return {
        intent: 'register',
        ownerMode: this.ownerMode(),
        requestCalendar:
          requestCalendar ??
          (this.ownerMode() === 'adminProfessional' && this.connectGoogleCalendar()),
      };
    const preview = this.invitePreview();
    if (this.path() !== 'invite' || !preview) {
      this.message.set(this.i18n.translate('register.verifyBeforeContinue'));
      return null;
    }
    return {
      intent: 'join',
      inviteCode: this.inviteCode(),
      requestCalendar: requestCalendar ?? preview.isProfessional,
    };
  }

  private inviteCode(): string {
    return this.inviteForm.controls.inviteCode.value.replace(/\s+/g, '').toUpperCase();
  }

  private authorizationIsCurrent(authorization: GoogleAuthAuthorization): boolean {
    if (Date.parse(authorization.expiresAt) > Date.now()) return true;
    this.clearGoogleIdentity();
    this.message.set(this.i18n.translate('register.authorizationExpired'));
    return false;
  }

  private async submitJoin(): Promise<void> {
    const authorization = this.googleAuthorization();
    if (!authorization || !this.authorizationIsCurrent(authorization)) return;
    this.pending.set(true);
    try {
      const response = await firstValueFrom(
        this.api.joinWithGoogle({
          attemptId: authorization.attemptId,
          exchangeToken: authorization.exchangeToken,
        }),
      );
      if (this.googleAbort?.signal.aborted) return;
      this.session.acceptAuthenticationSession(response.data);
      await this.finishRegistration(response.meta.warnings ?? []);
    } catch (error) {
      this.handleCompletionError(error);
    } finally {
      this.pending.set(false);
    }
  }

  private async completeGoogleAccount(): Promise<void> {
    const authorization = this.googleAuthorization();
    if (!authorization || !this.authorizationIsCurrent(authorization) || this.pending()) return;
    this.pending.set(true);
    this.identityLinkRequired.set(false);
    this.identityPassword.reset();
    try {
      const response = await firstValueFrom(
        this.api.completeGoogleAccount({
          attemptId: authorization.attemptId,
          exchangeToken: authorization.exchangeToken,
          preferredLocale: this.i18n.locale(),
        }),
      );
      if (this.googleAbort?.signal.aborted) return;
      await this.acceptAccountSession(response.data, false);
    } catch (error) {
      this.handleCompletionError(error);
    } finally {
      this.pending.set(false);
    }
  }

  private async acceptAccountSession(
    backend: AuthenticationSession,
    identityLinked: boolean,
  ): Promise<void> {
    this.session.acceptAuthenticationSession(backend);
    if (backend.companies.length > 0) {
      await this.router.navigateByUrl('/settings/integrations', {
        state: { existingAccount: true, identityLinked, calendarAccess: this.calendarAccess() },
      });
      return;
    }
    this.accountReady.set(true);
    this.identityLinkRequired.set(false);
    if (this.calendarAccess() !== 'granted') this.googleAuthorization.set(null);
    this.googleProfile.set({
      name: backend.user.name,
      email: backend.user.email,
      avatarUrl: backend.user.avatarUrl,
    });
    this.message.set('');
  }

  private handleCompletionError(error: unknown): void {
    if (error instanceof TransportError) {
      this.uncertain.set(true);
      this.message.set(this.i18n.translate('register.uncertainResult'));
    } else if (error instanceof ApiError) {
      this.apiFields.set(error.fields);
      this.message.set(error.message);
      if (error.outcomeUncertain) this.uncertain.set(true);
      if (error.code === 'google_calendar_authorization_invalid') {
        this.googleAuthorization.set(null);
        this.calendarAccess.set('notRequested');
        this.calendarNotice.set('');
        this.resetCompanyOperation();
        this.step.set(1);
        return;
      }
      if (
        error.code === 'identity_link_required' &&
        this.googleAuthorization() &&
        this.googleProfile()
      ) {
        this.message.set('');
        this.identityLinkRequired.set(true);
        return;
      }
      if (
        Object.keys(error.fields).some((key) =>
          /^(company\.)?(name|legalName|taxId|timezone|currency)$/.test(key),
        )
      ) {
        this.resetCompanyOperation();
        this.step.set(2);
      }
    } else this.message.set(this.i18n.translate('register.completionFailed'));
  }

  private companyInput(): CompanyCreateInput {
    const value = this.form.getRawValue();
    const calendarAuthorization = this.googleAuthorization();
    return {
      name: value.name.trim(),
      legalName: value.legalName.trim(),
      taxId: value.taxId.trim(),
      timezone: value.timezone,
      currency: value.currency,
      defaultLocale: this.i18n.locale(),
      ownerMode: this.ownerMode(),
      ...(this.ownerMode() === 'adminProfessional' &&
      this.connectGoogleCalendar() &&
      this.calendarAccess() === 'granted' &&
      calendarAuthorization
        ? {
            googleCalendarAuthorization: {
              attemptId: calendarAuthorization.attemptId,
              exchangeToken: calendarAuthorization.exchangeToken,
            },
          }
        : {}),
      address: {
        zipCode: value.address.zipCode.trim(),
        street: value.address.street.trim(),
        number: value.address.number.trim(),
        complement: value.address.complement.trim() || null,
        district: value.address.district.trim(),
        city: value.address.city.trim(),
        state: value.address.state.trim().toUpperCase(),
        country: value.address.country.trim().toUpperCase(),
      },
    };
  }

  private async finishRegistration(warnings: ApiWarning[]): Promise<void> {
    const target =
      this.connectGoogleCalendar() && this.calendarAccess() === 'granted'
        ? '/settings/integrations/google-calendar'
        : '/settings/integrations';
    await this.router.navigateByUrl(target, {
      state: { registrationWarnings: warnings, calendarAccess: this.calendarAccess() },
    });
  }

  private resumeAccountWithoutClinic(): void {
    const current = this.session.session();
    if (!current || current.companies.length > 0) return;
    this.path.set('create');
    this.step.set(1);
    this.accountReady.set(true);
    this.googleProfile.set({
      name: current.userName,
      email: current.userEmail,
      avatarUrl: current.avatarUrl,
    });
  }

  private ensureCompanyOperation(): void {
    if (!this.companyOperationId) this.companyOperationId = this.operationId();
    if (!this.companyOccurredAt) this.companyOccurredAt = new Date().toISOString();
  }

  private resetCompanyOperation(): void {
    this.companyOperationId = '';
    this.companyOccurredAt = '';
  }

  private operationId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
}
