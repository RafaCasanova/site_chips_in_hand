import { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiClientService, ApiError } from '../core/api-client.service';
import {
  AuthenticationSession,
  ErrorEnvelope,
  GoogleAuthAuthorization,
  GoogleAuthProfile,
} from '../core/api.models';
import { GoogleAuthFlow, GoogleAuthFlowService } from '../core/google-auth-flow.service';
import { SiteSession, SiteSessionService } from '../core/site-session.service';
import { envelope, sessionFixture } from '../testing/api.fixtures';
import { RegisterPage } from './register.page';

interface RegisterHarness {
  path: WritableSignal<'create' | 'invite' | null>;
  step: WritableSignal<1 | 2 | 3>;
  accountReady: WritableSignal<boolean>;
  connectGoogleCalendar: WritableSignal<boolean>;
  googlePending: WritableSignal<boolean>;
  identityLinkRequired: WritableSignal<boolean>;
  identityPassword: FormControl<string>;
  form: FormGroup;
  selectPath(path: 'create' | 'invite'): void;
  setGoogleCalendarChoice(connect: boolean): void;
  next(): void;
  startGoogleRegistration(): Promise<void>;
  completeRegistration(): Promise<void>;
  linkExistingAccount(): Promise<void>;
}

const authorization = (): GoogleAuthAuthorization => ({
  attemptId: 'attempt-new-account',
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque',
  exchangeToken: 'x'.repeat(43),
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
});

const profile: GoogleAuthProfile = {
  name: 'Pessoa Nova',
  email: 'pessoa.nova@example.com',
  avatarUrl: null,
};

describe('RegisterPage Google account-first clinic flow', () => {
  let api: {
    completeGoogleAccount: ReturnType<typeof vi.fn>;
    createCompany: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
    linkGoogleIdentity: ReturnType<typeof vi.fn>;
  };
  let googleAuth: {
    start: ReturnType<typeof vi.fn>;
    waitForTerminal: ReturnType<typeof vi.fn>;
  };
  let currentSession: SiteSession | null;
  let session: {
    session: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    hasCompanies: ReturnType<typeof vi.fn>;
    acceptAuthenticationSession: ReturnType<typeof vi.fn>;
  };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let page: RegisterHarness;

  beforeEach(() => {
    currentSession = null;
    api = {
      completeGoogleAccount: vi.fn().mockReturnValue(of(envelope(accountOnlySession()))),
      createCompany: vi.fn().mockReturnValue(of(envelope({ id: 'company-created' }))),
      getSession: vi.fn().mockReturnValue(of(envelope(sessionProjection()))),
      linkGoogleIdentity: vi.fn().mockReturnValue(of(envelope(accountOnlySession()))),
    };
    googleAuth = {
      start: vi.fn().mockImplementation(async () => flow()),
      waitForTerminal: vi.fn().mockImplementation(async () => verifiedStatus()),
    };
    session = {
      session: vi.fn(() => currentSession),
      initialize: vi.fn().mockResolvedValue(false),
      hasCompanies: vi.fn(() => (currentSession?.companies.length ?? 0) > 0),
      acceptAuthenticationSession: vi.fn((backend: AuthenticationSession) => {
        currentSession = siteSessionFrom(backend);
      }),
    };
    router = { navigateByUrl: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiClientService, useValue: api },
        { provide: GoogleAuthFlowService, useValue: googleAuth },
        { provide: SiteSessionService, useValue: session },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });

    page = TestBed.runInInjectionContext(() => new RegisterPage() as unknown as RegisterHarness);
    page.selectPath('create');
  });

  it('requires and validates Google in step one before collecting clinic data', async () => {
    page.next();
    expect(page.step()).toBe(1);
    expect(api.completeGoogleAccount).not.toHaveBeenCalled();

    await page.startGoogleRegistration();

    expect(googleAuth.start).toHaveBeenCalledWith(
      { intent: 'register', ownerMode: 'adminProfessional', requestCalendar: true },
      expect.any(AbortSignal),
    );
    expect(api.completeGoogleAccount).toHaveBeenCalledWith({
      attemptId: 'attempt-new-account',
      exchangeToken: 'x'.repeat(43),
      preferredLocale: 'pt-BR',
    });
    expect(page.accountReady()).toBe(true);
    expect(page.step()).toBe(1);

    page.next();
    expect(page.step()).toBe(2);
  });

  it('creates only the clinic at the final step and reloads the canonical session', async () => {
    await moveToReview();

    await page.completeRegistration();

    expect(api.createCompany).toHaveBeenCalledOnce();
    expect(api.createCompany).toHaveBeenCalledWith(
      'jwt-test-access-token',
      expect.objectContaining({
        name: 'Clínica Nova',
        legalName: 'Clínica Nova Ltda.',
        taxId: '12345678000190',
        ownerMode: 'adminProfessional',
        googleCalendarAuthorization: {
          attemptId: 'attempt-new-account',
          exchangeToken: 'x'.repeat(43),
        },
      }),
      expect.any(String),
      expect.stringMatching(/Z$/),
    );
    expect(api.getSession).toHaveBeenCalledWith('jwt-test-access-token');
    expect(api.completeGoogleAccount).toHaveBeenCalledOnce();
    expect(router.navigateByUrl).toHaveBeenLastCalledWith(
      '/settings/integrations/google-calendar',
      {
        state: { registrationWarnings: [], calendarAccess: 'granted' },
      },
    );
  });

  it('creates the clinic without Calendar when the user explicitly chooses to connect later', async () => {
    page.setGoogleCalendarChoice(false);
    googleAuth.waitForTerminal.mockResolvedValue(verifiedStatus('notRequested'));

    await moveToReview();
    await page.completeRegistration();

    expect(googleAuth.start).toHaveBeenCalledWith(
      { intent: 'register', ownerMode: 'adminProfessional', requestCalendar: false },
      expect.any(AbortSignal),
    );
    expect(api.createCompany).toHaveBeenCalledWith(
      'jwt-test-access-token',
      expect.not.objectContaining({ googleCalendarAuthorization: expect.anything() }),
      expect.any(String),
      expect.stringMatching(/Z$/),
    );
    expect(router.navigateByUrl).toHaveBeenLastCalledWith('/settings/integrations', {
      state: { registrationWarnings: [], calendarAccess: 'notRequested' },
    });
  });

  it('returns to the first step when the one-time Calendar authorization is no longer valid', async () => {
    await moveToReview();
    api.createCompany.mockReturnValue(throwError(() => googleCalendarAuthorizationInvalidError()));

    await page.completeRegistration();

    expect(page.step()).toBe(1);
    expect(api.createCompany).toHaveBeenCalledOnce();

    await page.startGoogleRegistration();
    expect(googleAuth.start).toHaveBeenCalledTimes(2);
  });

  it('redirects an existing Google account that already belongs to a clinic', async () => {
    api.completeGoogleAccount.mockReturnValue(of(envelope(sessionFixture())));

    await page.startGoogleRegistration();

    expect(api.createCompany).not.toHaveBeenCalled();
    expect(page.accountReady()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/settings/integrations', {
      state: {
        existingAccount: true,
        identityLinked: false,
        calendarAccess: 'granted',
      },
    });
  });

  it('ignores a repeated Google action while account validation is already starting', async () => {
    let releaseStart!: (value: GoogleAuthFlow) => void;
    googleAuth.start.mockReturnValue(
      new Promise<GoogleAuthFlow>((resolve) => {
        releaseStart = resolve;
      }),
    );

    const first = page.startGoogleRegistration();
    const repeated = page.startGoogleRegistration();

    expect(page.googlePending()).toBe(true);
    expect(googleAuth.start).toHaveBeenCalledOnce();
    releaseStart(flow());
    await Promise.all([first, repeated]);

    expect(api.completeGoogleAccount).toHaveBeenCalledOnce();
    expect(session.acceptAuthenticationSession).toHaveBeenCalledOnce();
  });

  it('links a legacy account in step one and lets an account without a clinic continue', async () => {
    api.completeGoogleAccount.mockReturnValue(throwError(() => identityLinkRequiredError()));

    await page.startGoogleRegistration();

    expect(page.step()).toBe(1);
    expect(page.identityLinkRequired()).toBe(true);
    expect(api.linkGoogleIdentity).not.toHaveBeenCalled();

    page.identityPassword.setValue('senha-legada-segura');
    await page.linkExistingAccount();

    expect(api.linkGoogleIdentity).toHaveBeenCalledWith({
      attemptId: 'attempt-new-account',
      exchangeToken: 'x'.repeat(43),
      password: 'senha-legada-segura',
    });
    expect(page.accountReady()).toBe(true);
    expect(page.step()).toBe(1);
    expect(router.navigateByUrl).not.toHaveBeenCalled();

    page.next();
    expect(page.step()).toBe(2);
  });

  function fillRequiredClinicData(): void {
    page.form.patchValue({
      name: '  Clínica Nova  ',
      legalName: '  Clínica Nova Ltda.  ',
      taxId: '  12345678000190  ',
    });
  }

  async function moveToReview(): Promise<void> {
    await page.startGoogleRegistration();
    page.next();
    fillRequiredClinicData();
    page.next();
    expect(page.step()).toBe(3);
  }
});

function accountOnlySession(): AuthenticationSession {
  return { ...sessionFixture(), companies: [] };
}

function sessionProjection() {
  const { user, companies } = sessionFixture();
  return { user, companies };
}

function siteSessionFrom(backend: AuthenticationSession): SiteSession {
  return {
    sessionInstanceId: 'site-session-1',
    accessToken: backend.access_token,
    userId: backend.user.id,
    userName: backend.user.name,
    userEmail: backend.user.email,
    userPreferredLocale: backend.user.preferredLocale,
    avatarUrl: backend.user.avatarUrl,
    companies: backend.companies as unknown as SiteSession['companies'],
    selectedCompanyId: backend.companies[0]?.companyId ?? '',
  };
}

function flow(): GoogleAuthFlow {
  return {
    intent: 'register',
    authorization: authorization(),
    popup: { close: vi.fn() } as unknown as Window,
  };
}

function verifiedStatus(calendarAccess: 'notRequested' | 'granted' = 'granted') {
  const auth = authorization();
  return {
    attemptId: auth.attemptId,
    intent: 'register' as const,
    status: 'verified' as const,
    expiresAt: auth.expiresAt,
    profile,
    errorCode: null,
    message: 'Identidade confirmada.',
    calendarAccess,
  };
}

function identityLinkRequiredError(): ApiError {
  const response: ErrorEnvelope = {
    error: {
      code: 'identity_link_required',
      message: 'Confirme a senha existente.',
      messageKey: 'error.identity_link_required',
      messageParams: {},
      fields: {},
      fieldMessages: {},
      retryable: false,
      requestId: 'request-link',
      details: {},
    },
  };
  return new ApiError(409, response);
}

function googleCalendarAuthorizationInvalidError(): ApiError {
  const response: ErrorEnvelope = {
    error: {
      code: 'google_calendar_authorization_invalid',
      message: 'Autorize novamente o Google Agenda antes de concluir.',
      messageKey: 'error.google_calendar_authorization_invalid',
      messageParams: {},
      fields: {
        googleCalendarAuthorization: ['A autorização expirou ou já foi usada.'],
      },
      fieldMessages: {},
      retryable: false,
      requestId: 'request-calendar-setup',
      details: {},
    },
  };
  return new ApiError(422, response);
}
