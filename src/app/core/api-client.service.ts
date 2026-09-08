import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import {
  BackendSession,
  ErrorEnvelope,
  LoginInput,
  ObjectEnvelope,
  PublicBillingLink,
  RegisterInput,
  WhatsappAuthorization,
  WhatsappCompleteInput,
  WhatsappConnection,
} from './api.models';
import { RuntimeConfigService } from './runtime-config.service';

export interface TenantRequestContext {
  accessToken: string;
  tenantId: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string[]>;
  readonly retryable: boolean;
  readonly requestId: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, envelope?: ErrorEnvelope) {
    const error = envelope?.error;
    super(error?.message || 'Não foi possível concluir a solicitação.');
    this.name = 'ApiError';
    this.status = status;
    this.code = error?.code || 'unexpected_response';
    this.fields = error?.fields || {};
    this.retryable = error?.retryable ?? status >= 500;
    this.requestId = error?.requestId || '';
    this.details = error?.details || {};
  }
}

export class TransportError extends Error {
  readonly outcomeUncertain = true;

  constructor() {
    super('Não foi possível confirmar a resposta do servidor.');
    this.name = 'TransportError';
  }
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  register(input: RegisterInput): Observable<ObjectEnvelope<BackendSession>> {
    return this.post('/api/auth/register', input, this.jsonHeaders());
  }

  login(input: LoginInput): Observable<ObjectEnvelope<BackendSession>> {
    return this.post('/api/auth/login', input, this.jsonHeaders());
  }

  authorizeWhatsapp(
    context: TenantRequestContext,
  ): Observable<ObjectEnvelope<WhatsappAuthorization>> {
    return this.post('/api/integrations/whatsapp/authorize', {}, this.mutationHeaders(context));
  }

  completeWhatsapp(
    context: TenantRequestContext,
    input: WhatsappCompleteInput,
  ): Observable<ObjectEnvelope<WhatsappConnection>> {
    return this.post('/api/integrations/whatsapp/complete', input, this.mutationHeaders(context));
  }

  getPublicBillingLink(token: string): Observable<ObjectEnvelope<PublicBillingLink>> {
    return this.request(
      this.http.get<unknown>(
        this.endpoint(`/api/public/billing-links/${encodeURIComponent(token)}`),
        {
          headers: new HttpHeaders({ Accept: 'application/json' }),
        },
      ),
    );
  }

  private post<T>(
    path: string,
    body: unknown,
    headers: HttpHeaders,
  ): Observable<ObjectEnvelope<T>> {
    return this.request(this.http.post<unknown>(this.endpoint(path), body, { headers }));
  }

  private request<T>(source: Observable<unknown>): Observable<ObjectEnvelope<T>> {
    return source.pipe(
      map((payload) => {
        if (!this.isEnvelope<T>(payload)) throw new ApiError(200);
        return payload;
      }),
      catchError((error: unknown) => throwError(() => this.normalizeError(error))),
    );
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof ApiError || error instanceof TransportError) return error;
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return new TransportError();
      return new ApiError(
        error.status,
        this.isErrorEnvelope(error.error) ? error.error : undefined,
      );
    }
    return new ApiError(500);
  }

  private isEnvelope<T>(payload: unknown): payload is ObjectEnvelope<T> {
    if (!payload || typeof payload !== 'object') return false;
    return 'data' in payload && 'meta' in payload;
  }

  private isErrorEnvelope(payload: unknown): payload is ErrorEnvelope {
    return !!payload && typeof payload === 'object' && 'error' in payload;
  }

  private endpoint(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }

  private jsonHeaders(extra: Record<string, string> = {}): HttpHeaders {
    return new HttpHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extra,
    });
  }

  private mutationHeaders(context: TenantRequestContext): HttpHeaders {
    const id = this.operationId();
    return this.jsonHeaders({
      Authorization: `Bearer ${context.accessToken}`,
      'X-Tenant-Id': context.tenantId,
      'Idempotency-Key': id,
      'X-Operation-Id': id,
      'X-Client-Occurred-At': new Date().toISOString(),
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
