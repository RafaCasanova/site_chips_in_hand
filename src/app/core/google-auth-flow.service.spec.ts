import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClientService, ApiError } from './api-client.service';
import { GoogleAuthFlowService } from './google-auth-flow.service';

describe('GoogleAuthFlowService', () => {
  let api: { authorizeGoogleAuth: ReturnType<typeof vi.fn> };
  let service: GoogleAuthFlowService;
  let popup: { location: { replace: ReturnType<typeof vi.fn> }; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { authorizeGoogleAuth: vi.fn() };
    popup = { location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClientService, useValue: api }],
    });
    service = TestBed.inject(GoogleAuthFlowService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('abre somente a URL oficial devolvida pelo backend', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    api.authorizeGoogleAuth.mockReturnValue(
      of({
        data: {
          attemptId: 'attempt-1',
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
          exchangeToken: 'x'.repeat(43),
          expiresAt,
        },
        meta: { requestId: 'request-1', serverTime: '2026-09-09T17:50:00Z' },
      }),
    );

    const flow = await service.start({ intent: 'login' });

    expect(flow.authorization.attemptId).toBe('attempt-1');
    expect(api.authorizeGoogleAuth).toHaveBeenCalledWith({ intent: 'login' });
    expect(popup.location.replace).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
    );
  });

  it('fecha o popup e rejeita URL de terceiro', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    api.authorizeGoogleAuth.mockReturnValue(
      of({
        data: {
          attemptId: 'attempt-1',
          authorizationUrl: 'https://login.example.test/google',
          exchangeToken: 'x'.repeat(43),
          expiresAt,
        },
        meta: { requestId: 'request-1', serverTime: '2026-09-09T17:50:00Z' },
      }),
    );

    await expect(service.start({ intent: 'login' })).rejects.toBeInstanceOf(ApiError);
    expect(popup.close).toHaveBeenCalledOnce();
    expect(popup.location.replace).not.toHaveBeenCalled();
  });
});
