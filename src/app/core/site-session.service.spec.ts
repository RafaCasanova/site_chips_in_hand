import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiClientService, ApiError, TransportError } from './api-client.service';
import { SiteSessionService, siteSessionStorageKey } from './site-session.service';
import { companyFixture, envelope, sessionFixture } from '../testing/api.fixtures';
import { I18nService } from './i18n.service';

describe('Site session lifecycle', () => {
  let api: {
    getSession: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    updateUserPreferences: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    sessionStorage.clear();
    api = {
      getSession: vi.fn().mockReturnValue(of(envelope(sessionFixture()))),
      logout: vi.fn().mockReturnValue(of(undefined)),
      updateUserPreferences: vi.fn().mockReturnValue(
        of(
          envelope({
            preferredLocale: 'es',
            updatedAt: '2026-09-14T12:00:00Z',
          }),
        ),
      ),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClientService, useValue: api }] });
  });
  it('persists only access token and selected clinic, never profile or permissions', () => {
    const session = TestBed.inject(SiteSessionService);
    session.acceptAuthenticationSession(sessionFixture());
    expect(JSON.parse(sessionStorage.getItem(siteSessionStorageKey)!)).toEqual({
      accessToken: sessionFixture().access_token,
      selectedCompanyId: 'company-1',
    });
  });
  it('selects the clinic returned by Google invite onboarding', () => {
    const session = TestBed.inject(SiteSessionService);
    const backend = sessionFixture();
    backend.companies.push(companyFixture('company-invite'));
    backend.selectedCompanyId = 'company-invite';

    session.acceptAuthenticationSession(backend);

    expect(session.selectedCompany()?.companyId).toBe('company-invite');
  });
  it('keeps an authenticated account without clinics so onboarding can resume', () => {
    const session = TestBed.inject(SiteSessionService);
    const backend = sessionFixture();
    backend.companies = [];

    session.acceptAuthenticationSession(backend);

    expect(session.status()).toBe('authenticated');
    expect(session.hasCompanies()).toBe(false);
    expect(session.session()?.selectedCompanyId).toBe('');
    expect(JSON.parse(sessionStorage.getItem(siteSessionStorageKey)!)).toEqual({
      accessToken: backend.access_token,
      selectedCompanyId: '',
    });
    expect(() => session.principal(session.session()!)).toThrowError(
      'Selecione uma clínica válida.',
    );
  });
  it('projects independent WhatsApp capabilities and communication permissions', () => {
    const session = TestBed.inject(SiteSessionService);
    const backend = sessionFixture();
    backend.companies[0]!.capabilities.whatsappInbox = true;
    backend.companies[0]!.capabilities.whatsappCampaigns = true;
    backend.companies[0]!.permissions_matrix.comunicacoes.edit = true;

    session.acceptAuthenticationSession(backend);

    expect(session.selectedCompany()).toMatchObject({
      whatsappMessaging: true,
      whatsappInbox: true,
      whatsappCampaigns: true,
      whatsappAiAgent: false,
      communicationsEdit: true,
    });
  });
  it('uses the canonical account locale and persists changes through the backend', async () => {
    const service = TestBed.inject(SiteSessionService);
    const i18n = TestBed.inject(I18nService);
    const backend = sessionFixture();
    backend.user.preferredLocale = 'en';
    backend.companies[0]!.defaultLocale = 'es';

    service.acceptAuthenticationSession(backend);
    expect(i18n.locale()).toBe('en');
    expect(service.selectedCompany()?.defaultLocale).toBe('es');

    await service.updatePreferredLocale('es');

    expect(api.updateUserPreferences).toHaveBeenCalledWith(backend.access_token, 'es');
    expect(service.session()?.userPreferredLocale).toBe('es');
    expect(i18n.locale()).toBe('es');
  });
  it('does not trust a local projection and restores only after a remote response', async () => {
    sessionStorage.setItem(
      siteSessionStorageKey,
      JSON.stringify({
        accessToken: 'stored-access-token',
        selectedCompanyId: 'foreign',
        companies: [{ permissions: 'forged' }],
      }),
    );
    const response = new Subject<unknown>();
    api.getSession.mockReturnValue(response);
    const session = TestBed.inject(SiteSessionService);
    const restoring = session.initialize();
    expect(session.session()).toBeNull();
    expect(session.status()).toBe('checking');
    response.next(envelope(sessionFixture()));
    response.complete();
    await restoring;
    expect(session.session()?.accessToken).toBe('stored-access-token');
    expect(session.selectedCompany()?.companyId).toBe('company-1');
  });
  it('clears invalid sessions but preserves credentials during an outage', async () => {
    sessionStorage.setItem(
      siteSessionStorageKey,
      JSON.stringify({ accessToken: 'stored-access-token' }),
    );
    const session = TestBed.inject(SiteSessionService);
    api.getSession.mockReturnValue(throwError(() => new TransportError()));
    expect(await session.initialize()).toBe(false);
    expect(session.status()).toBe('unavailable');
    expect(sessionStorage.getItem(siteSessionStorageKey)).not.toBeNull();
    api.getSession.mockReturnValue(throwError(() => new ApiError(401)));
    expect(await session.initialize()).toBe(false);
    expect(sessionStorage.getItem(siteSessionStorageKey)).toBeNull();
  });
  it('does not resurrect a session from a late validation after logout', async () => {
    sessionStorage.setItem(
      siteSessionStorageKey,
      JSON.stringify({ accessToken: 'stored-access-token' }),
    );
    const response = new Subject<unknown>();
    api.getSession.mockReturnValue(response);
    const session = TestBed.inject(SiteSessionService);
    const restoring = session.initialize();
    await session.logout();
    response.next(envelope(sessionFixture()));
    response.complete();
    expect(await restoring).toBe(false);
    expect(session.session()).toBeNull();
  });
  it('invalidates a flow even when clinic changes away and back', () => {
    const session = TestBed.inject(SiteSessionService);
    const backend = sessionFixture();
    backend.companies.push(companyFixture('company-2'));
    session.acceptAuthenticationSession(backend);
    const principal = session.principal(session.session()!);
    session.chooseCompany('company-2');
    session.chooseCompany('company-1');
    expect(session.samePrincipal(principal)).toBe(false);
  });
  it('reports local-only logout honestly and drops credentials immediately', async () => {
    const session = TestBed.inject(SiteSessionService);
    session.acceptAuthenticationSession(sessionFixture());
    api.logout.mockReturnValue(throwError(() => new TransportError()));
    expect(await session.logout()).toBe('local-only');
    expect(api.logout).toHaveBeenCalledWith(sessionFixture().access_token);
    expect(session.session()).toBeNull();
  });
});
