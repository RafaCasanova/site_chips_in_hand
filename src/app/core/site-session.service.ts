import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import { BackendSession, SessionCompany } from './api.models';

export interface SiteCompany {
  companyId: string;
  companyName: string;
  membershipId: string;
  whatsappMessaging: boolean;
  companyEdit: boolean;
  manageCommunicationConnections: boolean;
}

export interface SiteSession {
  sessionInstanceId: string;
  accessToken: string;
  userId: string;
  userName: string;
  companies: SiteCompany[];
  selectedCompanyId: string;
}

export interface FlowPrincipal {
  sessionInstanceId: string;
  accessToken: string;
  userId: string;
  tenantId: string;
  membershipId: string;
}

export const siteSessionStorageKey = 'chips.site.session.v1';

@Injectable({ providedIn: 'root' })
export class SiteSessionService {
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;
  private readonly sessionState = signal<SiteSession | null>(this.read());

  readonly session = this.sessionState.asReadonly();
  readonly selectedCompany = computed(() => {
    const current = this.sessionState();
    return (
      current?.companies.find((company) => company.companyId === current.selectedCompanyId) ?? null
    );
  });

  acceptBackendSession(backend: BackendSession): void {
    const companies = backend.companies.map((company) => this.projectCompany(company));
    if (!backend.access_token || !backend.user.id || companies.length === 0) {
      throw new Error('A sessão recebida pelo backend está incompleta.');
    }
    const session: SiteSession = {
      sessionInstanceId: this.operationId(),
      accessToken: backend.access_token,
      userId: backend.user.id,
      userName: backend.user.name,
      companies,
      selectedCompanyId: companies[0]?.companyId ?? '',
    };
    this.write(session);
    this.sessionState.set(session);
  }

  chooseCompany(companyId: string): void {
    const current = this.sessionState();
    if (!current?.companies.some((company) => company.companyId === companyId)) return;
    const next = { ...current, selectedCompanyId: companyId };
    this.write(next);
    this.sessionState.set(next);
  }

  clear(): void {
    try {
      this.storage?.removeItem(siteSessionStorageKey);
    } finally {
      this.sessionState.set(null);
    }
  }

  principal(session: SiteSession): FlowPrincipal {
    const company = session.companies.find((item) => item.companyId === session.selectedCompanyId);
    if (!company) throw new Error('Selecione uma clínica válida.');
    return {
      sessionInstanceId: session.sessionInstanceId,
      accessToken: session.accessToken,
      userId: session.userId,
      tenantId: company.companyId,
      membershipId: company.membershipId,
    };
  }

  samePrincipal(expected: FlowPrincipal): boolean {
    const current = this.sessionState();
    if (!current) return false;
    let actual: FlowPrincipal;
    try {
      actual = this.principal(current);
    } catch {
      return false;
    }
    return (
      expected.sessionInstanceId === actual.sessionInstanceId &&
      expected.userId === actual.userId &&
      expected.tenantId === actual.tenantId &&
      expected.membershipId === actual.membershipId
    );
  }

  private projectCompany(company: SessionCompany): SiteCompany {
    return {
      companyId: company.companyId,
      companyName: company.companyName,
      membershipId: company.membershipId,
      whatsappMessaging: company.capabilities?.whatsappMessaging === true,
      companyEdit: company.permissions_matrix?.empresa?.edit === true,
      manageCommunicationConnections:
        company.permissions_matrix?.scopes?.manageCommunicationConnections === true,
    };
  }

  private read(): SiteSession | null {
    try {
      const raw = this.storage?.getItem(siteSessionStorageKey);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!this.isSession(parsed)) {
        this.storage?.removeItem(siteSessionStorageKey);
        return null;
      }
      return parsed;
    } catch {
      this.storage?.removeItem(siteSessionStorageKey);
      return null;
    }
  }

  private write(session: SiteSession): void {
    this.storage?.setItem(siteSessionStorageKey, JSON.stringify(session));
  }

  private isSession(value: unknown): value is SiteSession {
    if (!value || typeof value !== 'object') return false;
    const session = value as Partial<SiteSession>;
    return (
      typeof session.sessionInstanceId === 'string' &&
      typeof session.accessToken === 'string' &&
      typeof session.userId === 'string' &&
      typeof session.userName === 'string' &&
      typeof session.selectedCompanyId === 'string' &&
      Array.isArray(session.companies) &&
      session.companies.some((company) => company?.companyId === session.selectedCompanyId)
    );
  }

  private operationId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
}
