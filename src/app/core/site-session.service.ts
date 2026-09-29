import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, Injector, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClientService, ApiError, TransportError } from './api-client.service';
import { AuthenticationSession, SessionCompany, SessionProjection } from './api.models';
import { I18nService, type SupportedLocale } from './i18n.service';

export interface SiteCompany {
  companyId: string;
  companyName: string;
  membershipId: string;
  defaultLocale: SupportedLocale;
  whatsappMessaging: boolean;
  whatsappInbox: boolean;
  whatsappCampaigns: boolean;
  whatsappAiAgent: boolean;
  googleCalendarSync: boolean;
  agendaRead: boolean;
  agendaEdit: boolean;
  companyRead: boolean;
  companyCreate: boolean;
  companyEdit: boolean;
  patientsRead: boolean;
  communicationsRead: boolean;
  communicationsCreate: boolean;
  communicationsEdit: boolean;
  communicationsDelete: boolean;
  manageGoogleCalendarConnections: boolean;
  manageCommunicationConnections: boolean;
}

export interface SiteSession {
  sessionInstanceId: string;
  accessToken: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPreferredLocale: SupportedLocale;
  avatarUrl: string | null;
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

interface StoredCredentials {
  accessToken: string;
  selectedCompanyId?: string;
}

export type SessionStatus = 'idle' | 'checking' | 'authenticated' | 'anonymous' | 'unavailable';
export type LogoutOutcome = 'complete' | 'local-only';

export const siteSessionStorageKey = 'chips.site.credentials.v2';
const legacyStorageKey = 'chips.site.session.v1';

@Injectable({ providedIn: 'root' })
export class SiteSessionService {
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;
  private readonly injector = inject(Injector);
  private readonly i18n = inject(I18nService);
  private readonly sessionState = signal<SiteSession | null>(null);
  private readonly statusState = signal<SessionStatus>('idle');
  private validation?: Promise<boolean>;
  private generation = 0;

  readonly session = this.sessionState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly selectedCompany = computed(() => {
    const current = this.sessionState();
    return (
      current?.companies.find((company) => company.companyId === current.selectedCompanyId) ?? null
    );
  });
  readonly hasCompanies = computed(() => (this.sessionState()?.companies.length ?? 0) > 0);

  acceptBackendSession(backend: AuthenticationSession): void {
    this.acceptAuthenticationSession(backend);
  }

  acceptAuthenticationSession(backend: AuthenticationSession): void {
    if (!backend.access_token) throw new Error('A sessão recebida pelo backend está incompleta.');
    this.generation++;
    this.setCanonicalSession(backend, backend.access_token, backend.selectedCompanyId);
  }

  async initialize(): Promise<boolean> {
    if (this.statusState() === 'authenticated') return true;
    if (this.validation) return this.validation;
    const stored = this.readCredentials();
    if (!stored) {
      this.statusState.set('anonymous');
      return false;
    }
    this.statusState.set('checking');
    this.validation = this.validate(stored, this.generation);
    try {
      return await this.validation;
    } finally {
      this.validation = undefined;
    }
  }

  async ensureValidated(): Promise<boolean> {
    return this.initialize();
  }

  chooseCompany(companyId: string): void {
    const current = this.sessionState();
    if (!current?.companies.some((company) => company.companyId === companyId)) return;
    if (current.selectedCompanyId === companyId) return;
    this.generation++;
    const next: SiteSession = {
      ...current,
      sessionInstanceId: this.operationId(),
      selectedCompanyId: companyId,
    };
    this.writeCredentials({ accessToken: current.accessToken, selectedCompanyId: companyId });
    this.sessionState.set(next);
  }

  async updatePreferredLocale(preferredLocale: SupportedLocale): Promise<void> {
    const current = this.sessionState();
    if (!current) {
      this.i18n.setLocale(preferredLocale);
      return;
    }
    const sessionInstanceId = current.sessionInstanceId;
    const response = await firstValueFrom(
      this.injector
        .get(ApiClientService)
        .updateUserPreferences(current.accessToken, preferredLocale),
    );
    const latest = this.sessionState();
    if (!latest || latest.sessionInstanceId !== sessionInstanceId) return;
    this.sessionState.set({
      ...latest,
      userPreferredLocale: response.data.preferredLocale,
    });
    this.i18n.setLocale(response.data.preferredLocale);
  }

  async logout(): Promise<LogoutOutcome> {
    const token = this.sessionState()?.accessToken || this.readCredentials()?.accessToken;
    // Invalidate flows immediately; the remote logout may still be waiting for a response.
    this.clear();
    let outcome: LogoutOutcome = 'complete';
    try {
      if (token) await firstValueFrom(this.injector.get(ApiClientService).logout(token));
    } catch {
      outcome = 'local-only';
    }
    return outcome;
  }

  clear(): void {
    this.generation++;
    try {
      this.storage?.removeItem(siteSessionStorageKey);
      this.storage?.removeItem(legacyStorageKey);
    } finally {
      this.sessionState.set(null);
      this.statusState.set('anonymous');
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
      expected.accessToken === actual.accessToken &&
      expected.userId === actual.userId &&
      expected.tenantId === actual.tenantId &&
      expected.membershipId === actual.membershipId
    );
  }

  private async validate(stored: StoredCredentials, generation: number): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.injector.get(ApiClientService).getSession(stored.accessToken),
      );
      if (generation !== this.generation) return this.statusState() === 'authenticated';
      this.setCanonicalSession(response.data, stored.accessToken, stored.selectedCompanyId);
      return true;
    } catch (error) {
      if (generation !== this.generation) return this.statusState() === 'authenticated';
      this.sessionState.set(null);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        this.clear();
        return false;
      }
      if (error instanceof TransportError || error instanceof ApiError) {
        this.statusState.set('unavailable');
        return false;
      }
      this.clear();
      return false;
    }
  }

  private setCanonicalSession(
    backend: SessionProjection,
    accessToken: string,
    preferredCompanyId?: string,
  ): void {
    const companies = backend.companies.map((company) => this.projectCompany(company));
    if (!backend.user.id || !backend.user.name) {
      throw new Error('A sessão recebida pelo backend está incompleta.');
    }
    const selectedCompanyId = companies.some((company) => company.companyId === preferredCompanyId)
      ? preferredCompanyId!
      : (companies[0]?.companyId ?? '');
    const session: SiteSession = {
      sessionInstanceId: this.operationId(),
      accessToken,
      userId: backend.user.id,
      userName: backend.user.name,
      userEmail: backend.user.email,
      userPreferredLocale: backend.user.preferredLocale,
      avatarUrl: backend.user.avatarUrl,
      companies,
      selectedCompanyId,
    };
    this.writeCredentials({ accessToken, selectedCompanyId });
    this.sessionState.set(session);
    this.i18n.setLocale(backend.user.preferredLocale);
    this.statusState.set('authenticated');
  }

  private projectCompany(company: SessionCompany): SiteCompany {
    return {
      companyId: company.companyId,
      companyName: company.companyName,
      membershipId: company.membershipId,
      defaultLocale: company.defaultLocale,
      whatsappMessaging: company.capabilities.whatsappMessaging,
      whatsappInbox: company.capabilities.whatsappInbox,
      whatsappCampaigns: company.capabilities.whatsappCampaigns,
      whatsappAiAgent: company.capabilities.whatsappAiAgent,
      googleCalendarSync: company.capabilities.googleCalendarSync,
      agendaRead: company.permissions_matrix.agenda.read,
      agendaEdit: company.permissions_matrix.agenda.edit,
      companyRead: company.permissions_matrix.empresa.read,
      companyCreate: company.permissions_matrix.empresa.create,
      companyEdit: company.permissions_matrix.empresa.edit,
      patientsRead: company.permissions_matrix.clientes.read,
      communicationsRead: company.permissions_matrix.comunicacoes.read,
      communicationsCreate: company.permissions_matrix.comunicacoes.create,
      communicationsEdit: company.permissions_matrix.comunicacoes.edit,
      communicationsDelete: company.permissions_matrix.comunicacoes.delete,
      manageGoogleCalendarConnections:
        company.permissions_matrix.scopes.manageGoogleCalendarConnections,
      manageCommunicationConnections:
        company.permissions_matrix.scopes.manageCommunicationConnections,
    };
  }

  private readCredentials(): StoredCredentials | null {
    try {
      this.storage?.removeItem(legacyStorageKey);
      const raw = this.storage?.getItem(siteSessionStorageKey);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('invalid');
      const value = parsed as Partial<StoredCredentials>;
      if (
        typeof value.accessToken !== 'string' ||
        value.accessToken.length < 10 ||
        (value.selectedCompanyId !== undefined && typeof value.selectedCompanyId !== 'string')
      ) {
        throw new Error('invalid');
      }
      return {
        accessToken: value.accessToken,
        ...(value.selectedCompanyId ? { selectedCompanyId: value.selectedCompanyId } : {}),
      };
    } catch {
      this.storage?.removeItem(siteSessionStorageKey);
      return null;
    }
  }

  private writeCredentials(credentials: StoredCredentials): void {
    this.storage?.setItem(siteSessionStorageKey, JSON.stringify(credentials));
  }

  private operationId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
}
