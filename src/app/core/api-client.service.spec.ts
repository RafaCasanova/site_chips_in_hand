import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ApiClientService, ApiError } from './api-client.service';

describe('ApiClientService', () => {
  let api: ApiClientService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiClientService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envia o tenant e headers idempotentes iguais nas mutações do WhatsApp', async () => {
    const result = firstValueFrom(
      api.authorizeWhatsapp({ accessToken: 'jwt-test', tenantId: 'tenant-1' }),
    );
    const request = http.expectOne('/api/integrations/whatsapp/authorize');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.headers.get('Authorization')).toBe('Bearer jwt-test');
    expect(request.request.headers.get('X-Tenant-Id')).toBe('tenant-1');
    expect(request.request.headers.get('Idempotency-Key')).toBe(
      request.request.headers.get('X-Operation-Id'),
    );
    expect(request.request.headers.get('X-Client-Occurred-At')).toMatch(/Z$/);

    request.flush({
      data: {
        connectionId: 'connection-1',
        appId: '12345678',
        configurationId: '87654321',
        sdkVersion: 'v24.0',
        sessionToken: 's'.repeat(43),
        expiresAt: '2026-09-08T13:00:00Z',
      },
      meta: { requestId: 'request-1', serverTime: '2026-09-08T12:50:00Z' },
    });
    await expect(result).resolves.toMatchObject({ data: { connectionId: 'connection-1' } });
  });

  it('mantém os headers e o tenant também na conclusão do WhatsApp', async () => {
    const input = {
      sessionToken: 's'.repeat(43),
      code: 'single-use-code',
      wabaId: '1234567890',
      phoneNumberId: '9876543210',
    };
    const result = firstValueFrom(
      api.completeWhatsapp({ accessToken: 'jwt-test', tenantId: 'tenant-1' }, input),
    );
    const request = http.expectOne('/api/integrations/whatsapp/complete');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    expect(request.request.headers.get('Authorization')).toBe('Bearer jwt-test');
    expect(request.request.headers.get('X-Tenant-Id')).toBe('tenant-1');
    expect(request.request.headers.get('Idempotency-Key')).toBe(
      request.request.headers.get('X-Operation-Id'),
    );
    expect(request.request.headers.get('X-Client-Occurred-At')).toMatch(/Z$/);

    request.flush({
      data: {
        id: 'connection-1',
        companyId: 'tenant-1',
        status: 'provisioning',
        enabled: true,
        businessAccountLabel: 'Cl••••',
        phoneNumberLabel: '+55••••9999',
        templateReadiness: 'pending',
      },
      meta: { requestId: 'request-2', serverTime: '2026-09-08T12:51:00Z' },
    });
    await expect(result).resolves.toMatchObject({ data: { status: 'provisioning' } });
  });

  it('não envia JWT nem headers idempotentes no cadastro público', async () => {
    const result = firstValueFrom(
      api.register({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'senha-segura',
        company: {
          name: 'Clínica Teste',
          legalName: 'Clínica Teste LTDA',
          taxId: '00000000000100',
          timezone: 'America/Sao_Paulo',
          currency: 'BRL',
          address: {
            zipCode: '',
            street: '',
            number: '',
            complement: null,
            district: '',
            city: '',
            state: '',
            country: 'BR',
          },
        },
      }),
    );
    const request = http.expectOne('/api/auth/register');

    expect(request.request.headers.get('Authorization')).toBeNull();
    expect(request.request.headers.get('X-Tenant-Id')).toBeNull();
    expect(request.request.headers.get('Idempotency-Key')).toBeNull();

    request.flush({
      data: {},
      meta: { requestId: 'request-register', serverTime: '2026-09-08T12:51:00Z' },
    });
    await expect(result).resolves.toMatchObject({ meta: { requestId: 'request-register' } });
  });

  it('preserva o erro canônico do backend', async () => {
    const result = firstValueFrom(api.login({ email: 'invalido@example.com', password: 'senha' }));
    const request = http.expectOne('/api/auth/login');
    request.flush(
      {
        error: {
          code: 'invalid_credentials',
          message: 'E-mail ou senha incorretos.',
          fields: {},
          retryable: false,
          requestId: 'request-2',
          details: {},
        },
      },
      { status: 401, statusText: 'Unauthorized' },
    );

    await expect(result).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
      message: 'E-mail ou senha incorretos.',
    });
  });

  it('consulta a cobrança pública sem JWT ou tenant e escapa o token no path', async () => {
    const result = firstValueFrom(api.getPublicBillingLink('token/com espaço'));
    const request = http.expectOne('/api/public/billing-links/token%2Fcom%20espa%C3%A7o');

    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBeNull();
    expect(request.request.headers.get('X-Tenant-Id')).toBeNull();

    request.flush({
      data: {
        companyName: 'Clínica Teste',
        referenceMonth: '2026-09',
        dueDate: '2026-09-10',
        currency: 'BRL',
        totalCents: 10000,
        balanceCents: 10000,
        status: 'issued',
        deepLink: 'chipsinhand://billing/value',
      },
      meta: { requestId: 'request-3', serverTime: '2026-09-08T12:50:00Z' },
    });
    await expect(result).resolves.toMatchObject({ data: { companyName: 'Clínica Teste' } });
  });
});
