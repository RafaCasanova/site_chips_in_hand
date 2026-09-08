import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClientService } from './api-client.service';
import { BackendSession } from './api.models';
import { MetaEmbeddedSignupService } from './meta-embedded-signup.service';
import { SiteSessionService, siteSessionStorageKey } from './site-session.service';
import { WhatsappFlowService } from './whatsapp-flow.service';

function sessionFixture(): BackendSession {
  const permission = {
    empresa: { read: true, create: true, edit: true, delete: true },
    scopes: { manageCommunicationConnections: true },
  };
  return {
    access_token: 'jwt-flow',
    refresh_token: 'refresh-flow-secret',
    user: { id: 'user-1', name: 'Ana' },
    companies: [
      {
        companyId: 'company-1',
        companyName: 'Clínica Um',
        membershipId: 'member-1',
        capabilities: { whatsappMessaging: true },
        permissions_matrix: permission,
      },
      {
        companyId: 'company-2',
        companyName: 'Clínica Dois',
        membershipId: 'member-2',
        capabilities: { whatsappMessaging: true },
        permissions_matrix: permission,
      },
    ],
  };
}

describe('WhatsappFlowService', () => {
  const authorization = {
    data: {
      connectionId: 'connection-1',
      appId: '12345678',
      configurationId: '87654321',
      sdkVersion: 'v24.0',
      sessionToken: 'session-token-secret-value-1234567890',
      expiresAt: '2099-09-08T13:00:00Z',
    },
    meta: { requestId: 'request-1', serverTime: '2026-09-08T12:50:00Z', warnings: [] },
  };
  const completed = {
    data: {
      id: 'connection-1',
      companyId: 'company-1',
      status: 'provisioning',
      enabled: true,
      businessAccountLabel: 'Cl••••',
      phoneNumberLabel: '+55••••9999',
      templateReadiness: 'pending',
    },
    meta: { requestId: 'request-2', serverTime: '2026-09-08T12:51:00Z', warnings: [] },
  };

  let api: {
    authorizeWhatsapp: ReturnType<typeof vi.fn>;
    completeWhatsapp: ReturnType<typeof vi.fn>;
  };
  let meta: { run: ReturnType<typeof vi.fn> };
  let siteSession: SiteSessionService;
  let flow: WhatsappFlowService;

  beforeEach(() => {
    sessionStorage.clear();
    api = {
      authorizeWhatsapp: vi.fn().mockReturnValue(of(authorization)),
      completeWhatsapp: vi.fn().mockReturnValue(of(completed)),
    };
    meta = {
      run: vi.fn().mockResolvedValue({
        code: 'meta-code-secret',
        wabaId: '1234567890',
        phoneNumberId: '9876543210',
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiClientService, useValue: api },
        { provide: MetaEmbeddedSignupService, useValue: meta },
      ],
    });
    siteSession = TestBed.inject(SiteSessionService);
    siteSession.acceptBackendSession(sessionFixture());
    flow = TestBed.inject(WhatsappFlowService);
  });

  it('conclui no backend com o mesmo tenant e sem persistir ou registrar segredos', async () => {
    const log = vi.spyOn(console, 'log');
    const error = vi.spyOn(console, 'error');
    await flow.start();

    expect(api.authorizeWhatsapp).toHaveBeenCalledWith({
      accessToken: 'jwt-flow',
      tenantId: 'company-1',
    });
    expect(api.completeWhatsapp).toHaveBeenCalledWith(
      { accessToken: 'jwt-flow', tenantId: 'company-1' },
      {
        sessionToken: 'session-token-secret-value-1234567890',
        code: 'meta-code-secret',
        wabaId: '1234567890',
        phoneNumberId: '9876543210',
      },
    );
    expect(flow.state().stage).toBe('complete');
    expect(flow.state().message).toContain('backend');

    const stored = sessionStorage.getItem(siteSessionStorageKey) ?? '';
    expect(stored).not.toContain('session-token-secret-value');
    expect(stored).not.toContain('meta-code-secret');
    expect(globalThis.location.search).toBe('');
    expect(globalThis.location.hash).toBe('');
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('bloqueia a conclusão se o tenant mudar durante o popup', async () => {
    let resolveMeta!: (value: { code: string; wabaId: string; phoneNumberId: string }) => void;
    meta.run.mockReturnValue(
      new Promise((resolve) => {
        resolveMeta = resolve;
      }),
    );

    const running = flow.start();
    await vi.waitFor(() => expect(meta.run).toHaveBeenCalledOnce());
    siteSession.chooseCompany('company-2');
    resolveMeta({ code: 'meta-code-secret', wabaId: '1234567890', phoneNumberId: '9876543210' });
    await running;

    expect(api.completeWhatsapp).not.toHaveBeenCalled();
    expect(flow.state().stage).toBe('error');
    expect(flow.state().message).toContain('clínica mudou');
  });
});
