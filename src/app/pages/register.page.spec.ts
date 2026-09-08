import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiClientService, ApiError, TransportError } from '../core/api-client.service';
import { BackendSession, ErrorEnvelope } from '../core/api.models';
import { SiteSession, SiteSessionService } from '../core/site-session.service';
import { RegisterPage } from './register.page';

const formValue = {
  name: '  Ana Silva  ',
  email: 'ANA@example.com',
  password: 'senha-segura',
  company: {
    name: '  Clínica Teste  ',
    legalName: 'Clínica Teste LTDA',
    taxId: '00000000000100',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
    address: {
      zipCode: '',
      street: '',
      number: '',
      complement: '',
      district: '',
      city: '',
      state: 'sp',
      country: 'br',
    },
  },
};

const backendSession: BackendSession = {
  access_token: 'jwt-registration',
  refresh_token: 'refresh-registration',
  user: { id: 'user-1', name: 'Ana' },
  companies: [
    {
      companyId: 'company-1',
      companyName: 'Clínica Teste',
      membershipId: 'membership-1',
      capabilities: { whatsappMessaging: true },
      permissions_matrix: {
        empresa: { read: true, create: true, edit: true, delete: true },
        scopes: { manageCommunicationConnections: true },
      },
    },
  ],
};

interface RegisterHarness {
  form: { setValue(value: typeof formValue): void };
  submit(): Promise<void>;
  uncertain(): boolean;
  message(): string;
  apiFields(): Record<string, string[]>;
}

function canonicalError(status: number, code: string, message: string, fields = {}): ApiError {
  const envelope: ErrorEnvelope = {
    error: {
      code,
      message,
      fields,
      retryable: false,
      requestId: 'request-error',
      details: {},
    },
  };
  return new ApiError(status, envelope);
}

describe('RegisterPage', () => {
  let api: { register: ReturnType<typeof vi.fn> };
  let session: {
    session: ReturnType<typeof signal<SiteSession | null>>;
    acceptBackendSession: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let page: RegisterHarness;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    api = { register: vi.fn() };
    session = {
      session: signal<SiteSession | null>(null),
      acceptBackendSession: vi.fn(),
      clear: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [
        provideRouter([]),
        { provide: ApiClientService, useValue: api },
        { provide: SiteSessionService, useValue: session },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RegisterPage);
    page = fixture.componentInstance as unknown as RegisterHarness;
    page.form.setValue(formValue);
  });

  it('cria a sessão e encaminha os warnings quando o cadastro tem sucesso', async () => {
    api.register.mockReturnValue(
      of({
        data: backendSession,
        meta: {
          requestId: 'request-1',
          serverTime: '2026-09-08T12:00:00Z',
          warnings: [{ code: 'pending_setup', message: 'Conclua a configuração.' }],
        },
      }),
    );

    await page.submit();

    expect(api.register).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ana Silva',
        email: 'ana@example.com',
        company: expect.objectContaining({
          name: 'Clínica Teste',
          address: expect.objectContaining({ state: 'SP', country: 'BR', complement: null }),
        }),
      }),
    );
    expect(session.acceptBackendSession).toHaveBeenCalledWith(backendSession);
    expect(navigate).toHaveBeenCalledWith('/settings/integrations/whatsapp', {
      state: {
        registrationWarnings: [{ code: 'pending_setup', message: 'Conclua a configuração.' }],
      },
    });
  });

  it('preserva validações 422 e não transforma a falha em sucesso', async () => {
    api.register.mockReturnValue(
      throwError(() =>
        canonicalError(422, 'invalid_email', 'Informe um e-mail válido.', {
          email: ['E-mail inválido.'],
        }),
      ),
    );

    await page.submit();

    expect(page.message()).toBe('Informe um e-mail válido.');
    expect(page.apiFields()).toEqual({ email: ['E-mail inválido.'] });
    expect(session.acceptBackendSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('exibe conflito canônico sem criar uma sessão local', async () => {
    api.register.mockReturnValue(
      throwError(() =>
        canonicalError(
          409,
          'registration_conflict',
          'Já existe uma conta ou clínica com estes dados.',
        ),
      ),
    );

    await page.submit();

    expect(page.message()).toBe('Já existe uma conta ou clínica com estes dados.');
    expect(session.acceptBackendSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('não repete um cadastro cujo resultado de transporte ficou incerto', async () => {
    api.register.mockReturnValue(throwError(() => new TransportError()));

    await page.submit();
    await page.submit();

    expect(api.register).toHaveBeenCalledOnce();
    expect(page.uncertain()).toBe(true);
    expect(page.message()).toBe('O resultado do cadastro ficou incerto.');
    expect(session.acceptBackendSession).not.toHaveBeenCalled();
  });
});
