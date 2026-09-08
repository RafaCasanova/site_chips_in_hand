import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiClientService, ApiError } from '../core/api-client.service';
import { ErrorEnvelope } from '../core/api.models';
import { BillingPage } from './billing.page';

function routeWithToken(token: string): Partial<ActivatedRoute> {
  return { snapshot: { paramMap: convertToParamMap({ token }) } as ActivatedRoute['snapshot'] };
}

function unavailableError(): ApiError {
  const envelope: ErrorEnvelope = {
    error: {
      code: 'billing_link_not_found',
      message: 'A cobrança interna 123 não existe.',
      fields: {},
      retryable: false,
      requestId: 'request-private',
      details: { internalInvoiceId: 'invoice-private' },
    },
  };
  return new ApiError(404, envelope);
}

describe('BillingPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renderiza somente a projeção pública sanitizada', async () => {
    const api = {
      getPublicBillingLink: vi.fn().mockReturnValue(
        of({
          data: {
            companyName: 'Clínica Teste',
            referenceMonth: '2026-09',
            dueDate: '2026-09-10',
            currency: 'BRL',
            totalCents: 15000,
            balanceCents: 5000,
            status: 'partially_paid',
            deepLink: 'chipsinhand://billing/signed-public-value',
          },
          meta: { requestId: 'request-1', serverTime: '2026-09-08T12:00:00Z' },
        }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [BillingPage],
      providers: [
        { provide: ApiClientService, useValue: api },
        { provide: ActivatedRoute, useValue: routeWithToken('temporary-token') },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(BillingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Clínica Teste');
    expect(element.textContent).toContain('R$ 50,00');
    expect(element.textContent).toContain('Parcialmente paga');
    expect(element.querySelector<HTMLAnchorElement>('a[href^="chipsinhand:"]')?.href).toContain(
      'chipsinhand://billing/signed-public-value',
    );
  });

  it('usa uma resposta genérica para token inválido sem registrar detalhes internos', async () => {
    const log = vi.spyOn(console, 'log');
    const error = vi.spyOn(console, 'error');
    const api = {
      getPublicBillingLink: vi.fn().mockReturnValue(throwError(() => unavailableError())),
    };
    await TestBed.configureTestingModule({
      imports: [BillingPage],
      providers: [
        { provide: ApiClientService, useValue: api },
        { provide: ActivatedRoute, useValue: routeWithToken('private-billing-token') },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(BillingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(content).toContain('Link indisponível');
    expect(content).toContain('inválido, expirou ou não está mais disponível');
    expect(content).not.toContain('cobrança interna 123');
    expect(content).not.toContain('invoice-private');
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
