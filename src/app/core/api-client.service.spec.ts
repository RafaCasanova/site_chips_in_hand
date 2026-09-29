import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable } from 'rxjs';
import { ApiClientService } from './api-client.service';
import {
  envelope,
  externalTemplateFixture,
  googleAuthorizationFixture,
  googleConnectionFixture,
  googleStatusFixture,
  meta,
  sessionFixture,
  templateFixture,
  whatsappFixture,
  whatsappStatusFixture,
} from '../testing/api.fixtures';

describe('API contracts', () => {
  let api: ApiClientService;
  let http: HttpTestingController;
  const context = { accessToken: 'jwt-test', tenantId: 'company-1' };
  const firstUnknownValue = (source: unknown) => firstValueFrom(source as Observable<unknown>);
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiClientService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('starts Google identity without tenant, bearer or idempotency and exchanges only in the body', async () => {
    const result = firstValueFrom(api.authorizeGoogleAuth({ intent: 'login' }));
    const req = http.expectOne('/api/auth/google/authorize');
    expect(req.request.body).toEqual({ intent: 'login' });
    ['Authorization', 'X-Tenant-Id', 'Idempotency-Key'].forEach((header) =>
      expect(req.request.headers.has(header)).toBe(false),
    );
    req.flush({
      data: googleAuthorizationFixture(),
      meta: {
        ...meta,
        warnings: [
          {
            code: 'google_calendar_not_connected',
            message: 'Agenda ainda não conectada.',
            details: { professionalId: 'professional-1', professionalName: 'Ana Silva' },
          },
        ],
      },
    });
    await expect(result).resolves.toMatchObject({
      meta: {
        warnings: [
          {
            details: { professionalId: 'professional-1', professionalName: 'Ana Silva' },
          },
        ],
      },
    });
    const login = firstValueFrom(api.loginWithGoogle({ attemptId: 'a', exchangeToken: 'secret' }));
    const loginReq = http.expectOne('/api/auth/google/login');
    expect(loginReq.request.body).toEqual({ attemptId: 'a', exchangeToken: 'secret' });
    loginReq.flush(envelope(sessionFixture()));
    await login;

    const account = firstValueFrom(
      api.completeGoogleAccount({
        attemptId: 'register-attempt',
        exchangeToken: 'register-secret',
        preferredLocale: 'pt-BR',
      }),
    );
    const accountReq = http.expectOne('/api/auth/google/account');
    expect(accountReq.request.body).toEqual({
      attemptId: 'register-attempt',
      exchangeToken: 'register-secret',
      preferredLocale: 'pt-BR',
    });
    expect(accountReq.request.headers.has('Authorization')).toBe(false);
    accountReq.flush(envelope({ ...sessionFixture(), companies: [] }));
    await account;

    const link = firstValueFrom(
      api.linkGoogleIdentity({
        attemptId: 'register-attempt',
        exchangeToken: 'register-secret',
        password: 'existing-password',
      }),
    );
    const linkReq = http.expectOne('/api/auth/google/link');
    expect(linkReq.request.body).toEqual({
      attemptId: 'register-attempt',
      exchangeToken: 'register-secret',
      password: 'existing-password',
    });
    expect(linkReq.request.headers.has('Authorization')).toBe(false);
    linkReq.flush(envelope(sessionFixture()));
    await link;

    const preview = firstValueFrom(api.previewInvite('ABCD1234'));
    const previewReq = http.expectOne('/api/auth/invites/preview');
    expect(previewReq.request.body).toEqual({ inviteCode: 'ABCD1234' });
    previewReq.flush(
      envelope({
        companyId: 'company-1',
        companyName: 'Clínica Teste',
        groupName: 'Profissionais',
        isProfessional: true,
        googleCalendarAvailable: true,
        expiresAt: '2026-09-20T12:00:00Z',
      }),
    );
    await preview;

    const join = firstValueFrom(api.joinWithGoogle({ attemptId: 'a', exchangeToken: 'secret' }));
    const joinReq = http.expectOne('/api/auth/google/join');
    expect(joinReq.request.body).toEqual({ attemptId: 'a', exchangeToken: 'secret' });
    joinReq.flush(envelope({ ...sessionFixture(), selectedCompanyId: 'company-1' }));
    await join;
  });

  it('decodes a tokenless remote session and accepts an empty 204 logout', async () => {
    const { user, companies } = sessionFixture();
    const result = firstValueFrom(api.getSession('jwt'));
    const req = http.expectOne('/api/auth/session');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt');
    expect(req.request.headers.has('Content-Type')).toBe(false);
    expect(req.request.headers.has('X-Tenant-Id')).toBe(false);
    req.flush(envelope({ user, companies }));
    await expect(result).resolves.toEqual(envelope({ user, companies }));
    const logout = firstValueFrom(api.logout('jwt'));
    const exit = http.expectOne('/api/auth/logout');
    exit.flush(null, { status: 204, statusText: 'No Content' });
    await expect(logout).resolves.toBeUndefined();
  });

  it('updates account locale without a tenant and with idempotency headers', async () => {
    const result = firstValueFrom(api.updateUserPreferences('jwt-account', 'es'));
    const req = http.expectOne('/api/users/preferences');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ preferredLocale: 'es' });
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-account');
    expect(req.request.headers.has('X-Tenant-Id')).toBe(false);
    expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(req.request.headers.get('X-Operation-Id')).toBe(
      req.request.headers.get('Idempotency-Key'),
    );
    req.flush(envelope({ preferredLocale: 'es', updatedAt: '2026-09-14T12:00:00Z' }));
    await expect(result).resolves.toMatchObject({
      data: { preferredLocale: 'es' },
    });
  });

  it('creates the first clinic through an authenticated account mutation', async () => {
    const occurredAt = '2026-09-23T12:00:00.000Z';
    const input = {
      name: 'Clínica Nova',
      legalName: 'Clínica Nova Ltda.',
      taxId: '12345678000190',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      defaultLocale: 'pt-BR' as const,
      ownerMode: 'adminProfessional' as const,
      googleCalendarAuthorization: {
        attemptId: 'calendar-attempt',
        exchangeToken: 'calendar-exchange-secret',
      },
      address: {
        zipCode: '88000-000',
        street: 'Rua Teste',
        number: '10',
        complement: null,
        district: 'Centro',
        city: 'Florianópolis',
        state: 'SC',
        country: 'BR',
      },
    };
    const result = firstValueFrom(
      api.createCompany('jwt-account', input, 'operation-first-clinic', occurredAt),
    );
    const req = http.expectOne('/api/companies');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-account');
    expect(req.request.headers.has('X-Tenant-Id')).toBe(false);
    expect(req.request.headers.get('Idempotency-Key')).toBe('operation-first-clinic');
    expect(req.request.headers.get('X-Operation-Id')).toBe('operation-first-clinic');
    expect(req.request.headers.get('X-Client-Occurred-At')).toBe(occurredAt);
    req.flush(envelope({ id: 'company-created' }));

    await expect(result).resolves.toEqual(envelope({ id: 'company-created' }));
  });

  it('keeps new WhatsApp gates fail-closed during a rolling backend deployment', async () => {
    const legacy = structuredClone(sessionFixture()) as unknown as Record<string, any>;
    delete legacy['companies'][0].capabilities.whatsappInbox;
    delete legacy['companies'][0].capabilities.whatsappCampaigns;
    delete legacy['companies'][0].capabilities.whatsappAiAgent;
    delete legacy['companies'][0].permissions_matrix.comunicacoes;
    delete legacy['user'].preferredLocale;
    delete legacy['companies'][0].defaultLocale;
    const result = firstValueFrom(api.getSession('jwt'));
    http.expectOne('/api/auth/session').flush(envelope(legacy));

    await expect(result).resolves.toMatchObject({
      data: {
        user: { preferredLocale: 'pt-BR' },
        companies: [
          {
            defaultLocale: 'pt-BR',
            capabilities: {
              whatsappInbox: false,
              whatsappCampaigns: false,
              whatsappAiAgent: false,
            },
            permissions_matrix: {
              comunicacoes: { read: false, create: false, edit: false, delete: false },
            },
          },
        ],
      },
    });
  });

  it('sends tenant and fresh matching operation IDs for every management mutation', async () => {
    const gc = googleConnectionFixture();
    const wa = whatsappFixture();
    const conflict = {
      id: 'conflict-1',
      connectionId: gc.id,
      type: 'external_edit',
      status: 'resolved',
      message: 'Resolvido',
      detectedAt: meta.serverTime,
    };
    const operations = [
      {
        call: () => api.updateGoogleCalendarConnection(context, gc.id, { enabled: false }),
        method: 'PATCH',
        path: `/api/integrations/google-calendar/${gc.id}`,
        data: gc,
      },
      {
        call: () => api.syncGoogleCalendar(context, gc.id),
        method: 'POST',
        path: `/api/integrations/google-calendar/${gc.id}/sync`,
        data: gc,
      },
      {
        call: () => api.repairGoogleCalendar(context, gc.id),
        method: 'POST',
        path: `/api/integrations/google-calendar/${gc.id}/repair`,
        data: gc,
      },
      {
        call: () =>
          api.disconnectGoogleCalendar(context, gc.id, {
            removeProjectedEvents: false,
            revokeGrantEverywhere: false,
          }),
        method: 'DELETE',
        path: `/api/integrations/google-calendar/${gc.id}?removeProjectedEvents=false&revokeGrantEverywhere=false`,
        data: gc,
      },
      {
        call: () => api.resolveGoogleCalendarConflict(context, gc.id, 'conflict-1', 'acknowledge'),
        method: 'POST',
        path: `/api/integrations/google-calendar/${gc.id}/conflicts/conflict-1/resolve`,
        data: conflict,
      },
      {
        call: () => api.updateWhatsappConnection(context, wa.id, false),
        method: 'PATCH',
        path: `/api/integrations/whatsapp/${wa.id}`,
        data: wa,
      },
      {
        call: () => api.repairWhatsapp(context, wa.id),
        method: 'POST',
        path: `/api/integrations/whatsapp/${wa.id}/repair`,
        data: wa,
      },
      {
        call: () => api.syncWhatsappTemplates(context, wa.id),
        method: 'POST',
        path: `/api/integrations/whatsapp/${wa.id}/templates/sync`,
        data: wa,
      },
      {
        call: () => api.disconnectWhatsapp(context, wa.id),
        method: 'DELETE',
        path: `/api/integrations/whatsapp/${wa.id}`,
        data: wa,
      },
      {
        call: () => api.testWhatsapp(context, wa.id, 'patient-1'),
        method: 'POST',
        path: `/api/integrations/whatsapp/${wa.id}/test`,
        data: {
          id: 'receipt-1',
          status: 'queued',
          recipientLabel: '+55••9999',
          queuedAt: meta.serverTime,
        },
      },
    ];
    const keys = new Set<string>();
    for (const operation of operations) {
      const result = firstUnknownValue(operation.call());
      const req = http.expectOne(operation.path);
      const key = req.request.headers.get('Idempotency-Key')!;
      expect(req.request.method).toBe(operation.method);
      expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-test');
      expect(req.request.headers.get('X-Tenant-Id')).toBe('company-1');
      expect(req.request.headers.get('X-Operation-Id')).toBe(key);
      expect(req.request.headers.get('X-Client-Occurred-At')).toMatch(/Z$/);
      expect(keys.has(key)).toBe(false);
      keys.add(key);
      req.flush(envelope(operation.data));
      await result;
    }
  });

  it('rejects incomplete, cross-tenant, wrong-ID and inconsistent canonical projections', async () => {
    const cases = [
      {
        call: () => api.getGoogleCalendarConnection(context, 'google-1'),
        path: '/api/integrations/google-calendar/google-1',
        data: { ...googleConnectionFixture(), enabled: undefined },
      },
      {
        call: () => api.getGoogleCalendarConnection(context, 'google-1'),
        path: '/api/integrations/google-calendar/google-1',
        data: { ...googleConnectionFixture(), id: 'wrong' },
      },
      {
        call: () => api.getWhatsappConnection(context, 'whatsapp-1'),
        path: '/api/integrations/whatsapp/whatsapp-1',
        data: { ...whatsappFixture(), companyId: 'foreign' },
      },
      {
        call: () => api.getGoogleCalendarLinkStatus(context, 'google-1'),
        path: '/api/integrations/google-calendar/google-1/link-status',
        data: { ...googleStatusFixture(), connected: false },
      },
    ];
    for (const item of cases) {
      const result = firstUnknownValue(item.call());
      const assertion = expect(result).rejects.toMatchObject({
        status: 502,
        outcomeUncertain: true,
      });
      http.expectOne(item.path).flush(envelope(item.data));
      await assertion;
    }
  });

  it('all integration GETs omit mutation and content-type headers', async () => {
    const cases = [
      {
        call: () => api.listGoogleCalendarConnections(context),
        path: '/api/integrations/google-calendar',
        data: [googleConnectionFixture()],
      },
      {
        call: () => api.listWhatsappConnections(context),
        path: '/api/integrations/whatsapp',
        data: [whatsappFixture()],
      },
      {
        call: () => api.getWhatsappLinkStatus(context, 'whatsapp-1'),
        path: '/api/integrations/whatsapp/whatsapp-1/link-status',
        data: whatsappStatusFixture(),
      },
      {
        call: () => api.listWhatsappTemplates(context, 'whatsapp-1'),
        path: '/api/integrations/whatsapp/whatsapp-1/templates',
        data: [templateFixture()],
      },
      {
        call: () => api.listWhatsappExternalTemplates(context, 'whatsapp-1'),
        path: '/api/integrations/whatsapp/whatsapp-1/external-templates',
        data: [externalTemplateFixture()],
      },
    ];
    for (const item of cases) {
      const result = firstUnknownValue(item.call());
      const req = http.expectOne(item.path);
      ['Content-Type', 'Idempotency-Key', 'X-Operation-Id'].forEach((key) =>
        expect(req.request.headers.has(key)).toBe(false),
      );
      req.flush(envelope(item.data));
      await result;
    }
  });

  it('projects patient search to names only and preserves opaque pagination', async () => {
    const result = firstValueFrom(
      api.listPatientOptions(context, { search: 'Ana & João', cursor: 'opaque/+', limit: 25 }),
    );
    const req = http.expectOne((item) => item.url === '/api/patients');
    expect(req.request.params.get('search')).toBe('Ana & João');
    expect(req.request.params.get('cursor')).toBe('opaque/+');
    req.flush({
      data: [
        {
          id: 'patient-1',
          companyId: 'company-1',
          name: 'Ana',
          socialName: null,
          status: 'active',
          phone: 'private-number',
          mainComplaint: 'private-clinical',
        },
      ],
      meta: { ...meta, hasMore: true, nextCursor: 'next/+opaque' },
    });
    const response = await result;
    expect(JSON.stringify(response)).not.toContain('private-');
    expect(response.meta.nextCursor).toBe('next/+opaque');
  });

  it('preserves canonical validation errors without a fabricated session', async () => {
    const result = firstValueFrom(api.loginWithGoogle({ attemptId: 'a', exchangeToken: 'x' }));
    const assertion = expect(result).rejects.toMatchObject({
      status: 409,
      code: 'google_account_not_linked',
      requestId: 'request-1',
    });
    http.expectOne('/api/auth/google/login').flush(
      {
        error: {
          code: 'google_account_not_linked',
          message: 'Conta não vinculada.',
          messageKey: 'error.google_account_not_linked',
          messageParams: {},
          fields: {},
          fieldMessages: {},
          details: {},
          retryable: false,
          requestId: 'request-1',
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await assertion;
  });

  it('localizes canonical errors and field references without discarding fallbacks', async () => {
    const result = firstValueFrom(api.loginWithGoogle({ attemptId: 'a', exchangeToken: 'x' }));
    const assertion = expect(result).rejects.toMatchObject({
      code: 'required_field',
      messageKey: 'error.required_field',
      message: 'Preencha os campos obrigatórios.',
      fields: { attemptId: ['Revise o identificador.'] },
    });
    http.expectOne('/api/auth/google/login').flush(
      {
        error: {
          code: 'required_field',
          message: 'Fallback que não deve vencer o catálogo.',
          messageKey: 'error.required_field',
          messageParams: {},
          fields: { attemptId: ['Revise o identificador.'] },
          fieldMessages: {
            attemptId: [{ key: 'field.required_field', params: { field: 'attemptId' } }],
          },
          details: {},
          retryable: false,
          requestId: 'request-translation',
        },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await assertion;
  });
});
