import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { BackendSession } from '../core/api.models';
import { SiteSessionService } from '../core/site-session.service';
import { WhatsappFlowService, WhatsappFlowState } from '../core/whatsapp-flow.service';
import { WhatsappPage } from './whatsapp.page';

function backendSession(
  whatsappMessaging: boolean,
  companyEdit: boolean,
  manageConnections: boolean,
): BackendSession {
  return {
    access_token: 'jwt-ui',
    user: { id: 'user-1', name: 'Ana' },
    companies: [
      {
        companyId: 'company-1',
        companyName: 'Clínica Teste',
        membershipId: 'membership-1',
        capabilities: { whatsappMessaging },
        permissions_matrix: {
          empresa: { read: true, create: true, edit: companyEdit, delete: false },
          scopes: { manageCommunicationConnections: manageConnections },
        },
      },
    ],
  };
}

async function renderPage(sessionData: BackendSession): Promise<HTMLElement> {
  const state = signal<WhatsappFlowState>({ stage: 'idle', message: '' });
  const busy = signal(false);
  const flow = {
    state: state.asReadonly(),
    busy: busy.asReadonly(),
    start: vi.fn(),
    clear: vi.fn(),
  };
  await TestBed.configureTestingModule({
    imports: [WhatsappPage],
    providers: [provideRouter([]), { provide: WhatsappFlowService, useValue: flow }],
  }).compileComponents();
  TestBed.inject(SiteSessionService).acceptBackendSession(sessionData);
  const fixture = TestBed.createComponent(WhatsappPage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('WhatsappPage', () => {
  beforeEach(() => sessionStorage.clear());

  it('desabilita a conexão quando a capability da clínica está desligada', async () => {
    const element = await renderPage(backendSession(false, true, true));

    expect(element.textContent).toContain('ainda não está habilitada para esta clínica');
    expect(element.querySelector<HTMLButtonElement>('.button-whatsapp')?.disabled).toBe(true);
  });

  it('desabilita a conexão quando falta empresa.edit ou o escopo adicional', async () => {
    const element = await renderPage(backendSession(true, false, false));

    expect(element.textContent).toContain('Seu acesso não permite administrar conexões');
    expect(element.querySelector<HTMLButtonElement>('.button-whatsapp')?.disabled).toBe(true);
  });
});
