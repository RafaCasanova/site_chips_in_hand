import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError, timeout } from 'rxjs';
import { I18nService } from './i18n.service';
import {
  arrayOf,
  ContractError,
  decodeAgendaProfessionalOption,
  decodeAuthenticationSession,
  decodeCompanyCreationResult,
  Decoder,
  decodeEnvelope,
  decodeGoogleAuthAuthorization,
  decodeGoogleAuthStatus,
  decodeInvitePreview,
  decodeGoogleCalendarAuthorization,
  decodeGoogleCalendarConflict,
  decodeGoogleCalendarConnection,
  decodeGoogleCalendarLinkStatus,
  decodeProfessional,
  decodePublicBillingLink,
  decodeSessionProjection,
  decodeWhatsappAuthorization,
  decodeWhatsappExternalTemplate,
  decodeWhatsappLinkStatus,
  decodeWhatsappTemplate,
  decodeWhatsappTestReceipt,
  decodeUserPreferences,
  patientOptionDecoder,
  matching,
  whatsappConnectionDecoder,
} from './api-decoders';
import {
  AgendaProfessionalOption,
  AuthenticationSession,
  CompanyCreateInput,
  CompanyCreationResult,
  ErrorEnvelope,
  GoogleAuthAttemptInput,
  GoogleAccountInput,
  GoogleAuthAuthorizeInput,
  GoogleAuthAuthorization,
  GoogleAuthRegisterInput,
  GoogleAuthStatus,
  GoogleIdentityLinkInput,
  InvitePreview,
  GoogleCalendarAuthorization,
  GoogleCalendarConflict,
  GoogleCalendarConflictResolution,
  GoogleCalendarConnection,
  GoogleCalendarConnectionPatch,
  GoogleCalendarLinkStatus,
  ObjectEnvelope,
  PatientOption,
  Professional,
  ProfessionalInput,
  PublicBillingLink,
  SessionProjection,
  WhatsappAuthorization,
  WhatsappCompleteInput,
  WhatsappConnection,
  WhatsappExternalTemplate,
  WhatsappLinkStatus,
  WhatsappTemplate,
  WhatsappTestReceipt,
  UserPreferences,
} from './api.models';
import type { SupportedLocale } from './i18n.service';
import { RuntimeConfigService } from './runtime-config.service';

export interface TenantRequestContext {
  accessToken: string;
  tenantId: string;
}

export interface CursorQuery {
  cursor?: string;
  limit?: number;
}

type MessageResolver = (
  key: string,
  parameters: Readonly<Record<string, unknown>>,
  fallback: string,
) => string;

export class ApiError extends Error {
  readonly outcomeUncertain: boolean;
  readonly status: number;
  readonly code: string;
  readonly messageKey: string;
  readonly messageParams: Record<string, unknown>;
  readonly fields: Record<string, string[]>;
  readonly fieldMessages: ErrorEnvelope['error']['fieldMessages'];
  readonly retryable: boolean;
  readonly requestId: string;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    envelope?: ErrorEnvelope,
    message?: string,
    outcomeUncertain = false,
    resolveMessage?: MessageResolver,
  ) {
    const error = envelope?.error;
    const fallback = error?.message || message || 'Não foi possível concluir a solicitação.';
    const code = error?.code || 'unexpected_response';
    const messageKey = error?.messageKey || `error.${code}`;
    const messageParams = error?.messageParams || {};
    super(resolveMessage ? resolveMessage(messageKey, messageParams, fallback) : fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.messageKey = messageKey;
    this.messageParams = messageParams;
    this.fieldMessages = error?.fieldMessages || {};
    this.fields = Object.fromEntries(
      Object.entries(error?.fields || {}).map(([field, messages]) => [
        field,
        messages.map((fieldFallback, index) => {
          const reference = this.fieldMessages[field]?.[index];
          return resolveMessage && reference
            ? resolveMessage(reference.key, reference.params, fieldFallback)
            : fieldFallback;
        }),
      ]),
    );
    this.retryable = error?.retryable ?? (!outcomeUncertain && status >= 500);
    this.requestId = error?.requestId || '';
    this.details = error?.details || {};
    this.outcomeUncertain = outcomeUncertain;
  }
}

export class TransportError extends Error {
  readonly outcomeUncertain = true;

  constructor(message = 'Não foi possível confirmar a resposta do servidor.') {
    super(message);
    this.name = 'TransportError';
  }
}

export function isUncertain(error: unknown): boolean {
  return error instanceof TransportError || (error instanceof ApiError && error.outcomeUncertain);
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);
  private readonly i18n = inject(I18nService);

  authorizeGoogleAuth(
    input: GoogleAuthAuthorizeInput,
  ): Observable<ObjectEnvelope<GoogleAuthAuthorization>> {
    return this.post(
      '/api/auth/google/authorize',
      input,
      this.publicMutationHeaders(),
      decodeGoogleAuthAuthorization,
    );
  }

  previewInvite(inviteCode: string): Observable<ObjectEnvelope<InvitePreview>> {
    return this.post(
      '/api/auth/invites/preview',
      { inviteCode },
      this.publicMutationHeaders(),
      decodeInvitePreview,
    );
  }

  getGoogleAuthStatus(input: GoogleAuthAttemptInput): Observable<ObjectEnvelope<GoogleAuthStatus>> {
    return this.post(
      '/api/auth/google/status',
      input,
      this.publicMutationHeaders(),
      decodeGoogleAuthStatus,
    );
  }

  completeGoogleAccount(
    input: GoogleAccountInput,
  ): Observable<ObjectEnvelope<AuthenticationSession>> {
    return this.post(
      '/api/auth/google/account',
      input,
      this.publicMutationHeaders(),
      decodeAuthenticationSession,
    );
  }

  registerWithGoogle(
    input: GoogleAuthRegisterInput,
  ): Observable<ObjectEnvelope<AuthenticationSession>> {
    return this.post(
      '/api/auth/google/register',
      input,
      this.publicMutationHeaders(),
      decodeAuthenticationSession,
    );
  }

  linkGoogleIdentity(
    input: GoogleIdentityLinkInput,
  ): Observable<ObjectEnvelope<AuthenticationSession>> {
    return this.post(
      '/api/auth/google/link',
      input,
      this.publicMutationHeaders(),
      decodeAuthenticationSession,
    );
  }

  loginWithGoogle(
    input: GoogleAuthAttemptInput,
  ): Observable<ObjectEnvelope<AuthenticationSession>> {
    return this.post(
      '/api/auth/google/login',
      input,
      this.publicMutationHeaders(),
      decodeAuthenticationSession,
    );
  }

  joinWithGoogle(input: GoogleAuthAttemptInput): Observable<ObjectEnvelope<AuthenticationSession>> {
    return this.post(
      '/api/auth/google/join',
      input,
      this.publicMutationHeaders(),
      decodeAuthenticationSession,
    );
  }

  getSession(accessToken: string): Observable<ObjectEnvelope<SessionProjection>> {
    return this.get('/api/auth/session', this.authHeaders(accessToken), decodeSessionProjection);
  }

  createCompany(
    accessToken: string,
    input: CompanyCreateInput,
    operationId: string,
    clientOccurredAt: string,
  ): Observable<ObjectEnvelope<CompanyCreationResult>> {
    return this.post(
      '/api/companies',
      input,
      this.accountMutationHeaders(accessToken, operationId, clientOccurredAt),
      decodeCompanyCreationResult,
    );
  }

  updateUserPreferences(
    accessToken: string,
    preferredLocale: SupportedLocale,
  ): Observable<ObjectEnvelope<UserPreferences>> {
    return this.patch(
      '/api/users/preferences',
      { preferredLocale },
      this.accountMutationHeaders(accessToken),
      decodeUserPreferences,
    );
  }

  logout(accessToken: string): Observable<void> {
    return this.http
      .post(this.endpoint('/api/auth/logout'), null, {
        headers: this.authHeaders(accessToken),
        observe: 'response',
        responseType: 'text',
      })
      .pipe(
        timeout(10_000),
        map(() => undefined),
        catchError((error: unknown) => throwError(() => this.normalizeError(error))),
      );
  }

  listAgendaProfessionalOptions(
    context: TenantRequestContext,
  ): Observable<ObjectEnvelope<AgendaProfessionalOption[]>> {
    return this.get(
      '/api/agenda/professional-options',
      this.tenantHeaders(context),
      arrayOf(decodeAgendaProfessionalOption),
    );
  }

  createProfessional(
    context: TenantRequestContext,
    input: ProfessionalInput,
  ): Observable<ObjectEnvelope<Professional>> {
    return this.post(
      '/api/professionals',
      input,
      this.mutationHeaders(context),
      matching(decodeProfessional, { memberId: input.memberId }),
    );
  }

  listGoogleCalendarConnections(
    context: TenantRequestContext,
  ): Observable<ObjectEnvelope<GoogleCalendarConnection[]>> {
    return this.get(
      '/api/integrations/google-calendar',
      this.tenantHeaders(context),
      arrayOf(decodeGoogleCalendarConnection),
    );
  }

  getGoogleCalendarConnection(
    context: TenantRequestContext,
    connectionId: string,
  ): Observable<ObjectEnvelope<GoogleCalendarConnection>> {
    return this.get(
      this.googlePath(connectionId),
      this.tenantHeaders(context),
      matching(decodeGoogleCalendarConnection, { id: connectionId }),
    );
  }

  authorizeGoogleCalendar(
    context: TenantRequestContext,
    input: { professionalId: string; features: string[]; returnUrl: string },
  ): Observable<ObjectEnvelope<GoogleCalendarAuthorization>> {
    return this.post(
      '/api/integrations/google-calendar/authorize',
      input,
      this.mutationHeaders(context),
      decodeGoogleCalendarAuthorization,
    );
  }

  getGoogleCalendarLinkStatus(
    context: TenantRequestContext,
    connectionId: string,
  ): Observable<ObjectEnvelope<GoogleCalendarLinkStatus>> {
    return this.get(
      `${this.googlePath(connectionId)}/link-status`,
      this.tenantHeaders(context),
      (value, path) => {
        const status = decodeGoogleCalendarLinkStatus(value, path);
        if (status.connectionId !== connectionId) throw new ContractError(`${path}.connectionId`);
        return status;
      },
    );
  }

  updateGoogleCalendarConnection(
    context: TenantRequestContext,
    connectionId: string,
    input: GoogleCalendarConnectionPatch,
  ): Observable<ObjectEnvelope<GoogleCalendarConnection>> {
    return this.patch(
      this.googlePath(connectionId),
      input,
      this.mutationHeaders(context),
      matching(decodeGoogleCalendarConnection, { id: connectionId }),
    );
  }

  syncGoogleCalendar(
    context: TenantRequestContext,
    connectionId: string,
  ): Observable<ObjectEnvelope<GoogleCalendarConnection>> {
    return this.post(
      `${this.googlePath(connectionId)}/sync`,
      null,
      this.mutationHeaders(context),
      matching(decodeGoogleCalendarConnection, { id: connectionId }),
    );
  }

  repairGoogleCalendar(
    context: TenantRequestContext,
    connectionId: string,
  ): Observable<ObjectEnvelope<GoogleCalendarConnection>> {
    return this.post(
      `${this.googlePath(connectionId)}/repair`,
      null,
      this.mutationHeaders(context),
      matching(decodeGoogleCalendarConnection, { id: connectionId }),
    );
  }

  disconnectGoogleCalendar(
    context: TenantRequestContext,
    connectionId: string,
    options: { removeProjectedEvents: boolean; revokeGrantEverywhere: boolean },
  ): Observable<ObjectEnvelope<GoogleCalendarConnection>> {
    const params = new HttpParams()
      .set('removeProjectedEvents', String(options.removeProjectedEvents))
      .set('revokeGrantEverywhere', String(options.revokeGrantEverywhere));
    return this.delete(
      this.googlePath(connectionId),
      this.mutationHeaders(context),
      matching(decodeGoogleCalendarConnection, { id: connectionId }),
      params,
    );
  }

  listGoogleCalendarConflicts(
    context: TenantRequestContext,
    connectionId: string,
    query: CursorQuery & { status?: 'open' | 'restoring' | 'resolved' } = {},
  ): Observable<ObjectEnvelope<GoogleCalendarConflict[]>> {
    let params = new HttpParams().set('limit', String(query.limit ?? 50));
    if (query.cursor) params = params.set('cursor', query.cursor);
    if (query.status) params = params.set('status', query.status);
    return this.get(
      `${this.googlePath(connectionId)}/conflicts`,
      this.tenantHeaders(context),
      arrayOf((value, path) => {
        const conflict = decodeGoogleCalendarConflict(value, path);
        if (conflict.connectionId !== connectionId) {
          throw new ContractError(`${path}.connectionId`);
        }
        return conflict;
      }),
      params,
    );
  }

  resolveGoogleCalendarConflict(
    context: TenantRequestContext,
    connectionId: string,
    conflictId: string,
    resolution: GoogleCalendarConflictResolution,
  ): Observable<ObjectEnvelope<GoogleCalendarConflict>> {
    return this.post(
      `${this.googlePath(connectionId)}/conflicts/${encodeURIComponent(conflictId)}/resolve`,
      { resolution },
      this.mutationHeaders(context),
      matching(decodeGoogleCalendarConflict, { id: conflictId, connectionId }),
    );
  }

  authorizeWhatsapp(
    context: TenantRequestContext,
  ): Observable<ObjectEnvelope<WhatsappAuthorization>> {
    return this.post(
      '/api/integrations/whatsapp/authorize',
      {},
      this.mutationHeaders(context),
      decodeWhatsappAuthorization,
    );
  }

  completeWhatsapp(
    context: TenantRequestContext,
    input: WhatsappCompleteInput,
  ): Observable<ObjectEnvelope<WhatsappConnection>> {
    return this.post(
      '/api/integrations/whatsapp/complete',
      input,
      this.mutationHeaders(context),
      whatsappConnectionDecoder(context.tenantId),
    );
  }

  listWhatsappConnections(
    context: TenantRequestContext,
  ): Observable<ObjectEnvelope<WhatsappConnection[]>> {
    return this.get(
      '/api/integrations/whatsapp',
      this.tenantHeaders(context),
      arrayOf(whatsappConnectionDecoder(context.tenantId)),
    );
  }

  getWhatsappConnection(
    context: TenantRequestContext,
    connectionId: string,
  ): Observable<ObjectEnvelope<WhatsappConnection>> {
    return this.get(
      this.whatsappPath(connectionId),
      this.tenantHeaders(context),
      matching(whatsappConnectionDecoder(context.tenantId), { id: connectionId }),
    );
  }

  getWhatsappLinkStatus(
    context: TenantRequestContext,
    connectionId: string,
  ): Observable<ObjectEnvelope<WhatsappLinkStatus>> {
    return this.get(
      `${this.whatsappPath(connectionId)}/link-status`,
      this.tenantHeaders(context),
      (value, path) => {
        const status = decodeWhatsappLinkStatus(value, path);
        if (status.connectionId !== connectionId) throw new ContractError(`${path}.connectionId`);
        return status;
      },
    );
  }

  updateWhatsappConnection(
    context: TenantRequestContext,
    connectionId: string,
    enabled: boolean,
  ): Observable<ObjectEnvelope<WhatsappConnection>> {
    return this.patch(
      this.whatsappPath(connectionId),
      { enabled },
      this.mutationHeaders(context),
      matching(whatsappConnectionDecoder(context.tenantId), { id: connectionId }),
    );
  }

  repairWhatsapp(
    context: TenantRequestContext,
    connectionId: string,
  ): Observable<ObjectEnvelope<WhatsappConnection>> {
    return this.post(
      `${this.whatsappPath(connectionId)}/repair`,
      null,
      this.mutationHeaders(context),
      matching(whatsappConnectionDecoder(context.tenantId), { id: connectionId }),
    );
  }

  disconnectWhatsapp(
    context: TenantRequestContext,
    connectionId: string,
  ): Observable<ObjectEnvelope<WhatsappConnection>> {
    return this.delete(
      this.whatsappPath(connectionId),
      this.mutationHeaders(context),
      matching(whatsappConnectionDecoder(context.tenantId), { id: connectionId }),
    );
  }

  listWhatsappTemplates(
    context: TenantRequestContext,
    connectionId: string,
  ): Observable<ObjectEnvelope<WhatsappTemplate[]>> {
    return this.get(
      `${this.whatsappPath(connectionId)}/templates`,
      this.tenantHeaders(context),
      arrayOf((value, path) => {
        const template = decodeWhatsappTemplate(value, path);
        if (template.connectionId !== connectionId) {
          throw new ContractError(`${path}.connectionId`);
        }
        return template;
      }),
    );
  }

  listWhatsappExternalTemplates(
    context: TenantRequestContext,
    connectionId: string,
  ): Observable<ObjectEnvelope<WhatsappExternalTemplate[]>> {
    return this.get(
      `${this.whatsappPath(connectionId)}/external-templates`,
      this.tenantHeaders(context),
      arrayOf((value, path) => {
        const template = decodeWhatsappExternalTemplate(value, path);
        if (template.connectionId !== connectionId) {
          throw new ContractError(`${path}.connectionId`);
        }
        return template;
      }),
    );
  }

  syncWhatsappTemplates(
    context: TenantRequestContext,
    connectionId: string,
  ): Observable<ObjectEnvelope<WhatsappConnection>> {
    return this.post(
      `${this.whatsappPath(connectionId)}/templates/sync`,
      null,
      this.mutationHeaders(context),
      matching(whatsappConnectionDecoder(context.tenantId), { id: connectionId }),
    );
  }

  testWhatsapp(
    context: TenantRequestContext,
    connectionId: string,
    patientId: string,
  ): Observable<ObjectEnvelope<WhatsappTestReceipt>> {
    return this.post(
      `${this.whatsappPath(connectionId)}/test`,
      { patientId },
      this.mutationHeaders(context),
      decodeWhatsappTestReceipt,
    );
  }

  listPatientOptions(
    context: TenantRequestContext,
    query: CursorQuery & { search?: string } = {},
  ): Observable<ObjectEnvelope<PatientOption[]>> {
    let params = new HttpParams().set('status', 'active').set('limit', String(query.limit ?? 25));
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.cursor) params = params.set('cursor', query.cursor);
    return this.get(
      '/api/patients',
      this.tenantHeaders(context),
      arrayOf(patientOptionDecoder(context.tenantId)),
      params,
    );
  }

  getPublicBillingLink(token: string): Observable<ObjectEnvelope<PublicBillingLink>> {
    return this.get(
      `/api/public/billing-links/${encodeURIComponent(token)}`,
      this.acceptHeaders(),
      decodePublicBillingLink,
    );
  }

  private post<T>(
    path: string,
    body: unknown,
    headers: HttpHeaders,
    decoder: Decoder<T>,
  ): Observable<ObjectEnvelope<T>> {
    return this.request(this.http.post<unknown>(this.endpoint(path), body, { headers }), decoder);
  }

  private patch<T>(
    path: string,
    body: unknown,
    headers: HttpHeaders,
    decoder: Decoder<T>,
  ): Observable<ObjectEnvelope<T>> {
    return this.request(this.http.patch<unknown>(this.endpoint(path), body, { headers }), decoder);
  }

  private get<T>(
    path: string,
    headers: HttpHeaders,
    decoder: Decoder<T>,
    params?: HttpParams,
  ): Observable<ObjectEnvelope<T>> {
    return this.request(
      this.http.get<unknown>(this.endpoint(path), { headers, ...(params ? { params } : {}) }),
      decoder,
    );
  }

  private delete<T>(
    path: string,
    headers: HttpHeaders,
    decoder: Decoder<T>,
    params?: HttpParams,
  ): Observable<ObjectEnvelope<T>> {
    return this.request(
      this.http.delete<unknown>(this.endpoint(path), { headers, ...(params ? { params } : {}) }),
      decoder,
    );
  }

  private request<T>(
    source: Observable<unknown>,
    decoder: Decoder<T>,
  ): Observable<ObjectEnvelope<T>> {
    return source.pipe(
      timeout(20_000),
      map((payload) => decodeEnvelope(payload, decoder)),
      catchError((error: unknown) => throwError(() => this.normalizeError(error))),
    );
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof ApiError || error instanceof TransportError) return error;
    if (error instanceof ContractError) {
      return new ApiError(502, undefined, this.i18n.translate('core.incompatibleResponse'), true);
    }
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0)
        return new TransportError(this.i18n.translate('core.serverUnconfirmed'));
      return new ApiError(
        error.status,
        this.errorEnvelope(error.error),
        undefined,
        false,
        (key, parameters, fallback) => this.i18n.translateMessage(key, parameters, fallback),
      );
    }
    if (error && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError') {
      return new TransportError(this.i18n.translate('core.serverUnconfirmed'));
    }
    return new ApiError(500, undefined, this.i18n.translate('core.requestFailed'));
  }

  private errorEnvelope(payload: unknown): ErrorEnvelope | undefined {
    if (!payload || typeof payload !== 'object' || !('error' in payload)) return undefined;
    const error = (payload as { error?: unknown }).error;
    if (!error || typeof error !== 'object') return undefined;
    const candidate = error as Partial<ErrorEnvelope['error']>;
    if (
      typeof candidate.code !== 'string' ||
      typeof candidate.message !== 'string' ||
      typeof candidate.retryable !== 'boolean' ||
      typeof candidate.requestId !== 'string' ||
      !candidate.fields ||
      typeof candidate.fields !== 'object' ||
      !candidate.details ||
      typeof candidate.details !== 'object'
    ) {
      return undefined;
    }
    const validFields = Object.values(candidate.fields).every(
      (value) => Array.isArray(value) && value.every((item) => typeof item === 'string'),
    );
    if (!validFields) return undefined;
    if (
      candidate.messageKey !== undefined &&
      (typeof candidate.messageKey !== 'string' || !candidate.messageKey.trim())
    )
      return undefined;
    if (
      candidate.messageParams !== undefined &&
      (!candidate.messageParams || typeof candidate.messageParams !== 'object')
    )
      return undefined;
    if (candidate.fieldMessages !== undefined) {
      if (!candidate.fieldMessages || typeof candidate.fieldMessages !== 'object') return undefined;
      const validFieldMessages = Object.values(candidate.fieldMessages).every(
        (references) =>
          Array.isArray(references) &&
          references.every(
            (reference) =>
              reference &&
              typeof reference === 'object' &&
              typeof reference.key === 'string' &&
              !!reference.key.trim() &&
              !!reference.params &&
              typeof reference.params === 'object',
          ),
      );
      if (!validFieldMessages) return undefined;
    }
    return payload as ErrorEnvelope;
  }

  private endpoint(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }

  private googlePath(connectionId: string): string {
    return `/api/integrations/google-calendar/${encodeURIComponent(connectionId)}`;
  }

  private whatsappPath(connectionId: string): string {
    return `/api/integrations/whatsapp/${encodeURIComponent(connectionId)}`;
  }

  private acceptHeaders(extra: Record<string, string> = {}): HttpHeaders {
    return new HttpHeaders({ Accept: 'application/json', ...extra });
  }

  private publicMutationHeaders(): HttpHeaders {
    return this.acceptHeaders({ 'Content-Type': 'application/json' });
  }

  private authHeaders(accessToken: string): HttpHeaders {
    return this.acceptHeaders({ Authorization: `Bearer ${accessToken}` });
  }

  private mutationHeaders(context: TenantRequestContext): HttpHeaders {
    const id = this.operationId();
    return this.acceptHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${context.accessToken}`,
      'X-Tenant-Id': context.tenantId,
      'Idempotency-Key': id,
      'X-Operation-Id': id,
      'X-Client-Occurred-At': new Date().toISOString(),
    });
  }

  private accountMutationHeaders(
    accessToken: string,
    operationId = this.operationId(),
    clientOccurredAt = new Date().toISOString(),
  ): HttpHeaders {
    return this.acceptHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Idempotency-Key': operationId,
      'X-Operation-Id': operationId,
      'X-Client-Occurred-At': clientOccurredAt,
    });
  }

  private tenantHeaders(context: TenantRequestContext): HttpHeaders {
    return this.acceptHeaders({
      Authorization: `Bearer ${context.accessToken}`,
      'X-Tenant-Id': context.tenantId,
    });
  }

  private operationId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}
