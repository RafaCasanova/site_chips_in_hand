import { TestBed } from '@angular/core/testing';
import { BackendSession } from './api.models';
import { SiteSessionService, siteSessionStorageKey } from './site-session.service';

function backendSession(): BackendSession {
  return {
    access_token: 'jwt-visible-only-in-session',
    refresh_token: 'refresh-must-not-be-persisted',
    user: { id: 'user-1', name: 'Ana', email: 'ana@example.com' },
    companies: [
      {
        companyId: 'company-1',
        companyName: 'Clínica Um',
        membershipId: 'member-1',
        capabilities: { whatsappMessaging: true },
        permissions_matrix: {
          empresa: { read: true, create: true, edit: true, delete: true },
          scopes: { manageCommunicationConnections: true },
        },
      },
    ],
  };
}

describe('SiteSessionService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('persiste somente o snapshot mínimo e descarta refresh token e e-mail', () => {
    const service = TestBed.inject(SiteSessionService);
    service.acceptBackendSession(backendSession());
    const stored = sessionStorage.getItem(siteSessionStorageKey) ?? '';

    expect(stored).toContain('jwt-visible-only-in-session');
    expect(stored).not.toContain('refresh-must-not-be-persisted');
    expect(stored).not.toContain('ana@example.com');
    expect(service.selectedCompany()?.companyId).toBe('company-1');
  });
});
