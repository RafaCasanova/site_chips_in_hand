import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClientService, ApiError, isUncertain } from './api-client.service';
import { ApiWarning, WhatsappAuthorization, WhatsappConnection } from './api.models';
import { MetaEmbeddedSignupService, MetaSignupError } from './meta-embedded-signup.service';
import { isAborted } from './polling';
import { FlowPrincipal, SiteSessionService } from './site-session.service';
import { I18nService } from './i18n.service';

export type WhatsappFlowStage =
  'idle' | 'authorizing' | 'ready' | 'meta' | 'completing' | 'complete' | 'error';
export interface WhatsappFlowState {
  stage: WhatsappFlowStage;
  message: string;
  connection?: WhatsappConnection;
  warnings?: ApiWarning[];
  uncertain?: boolean;
}

export class WhatsappFlowContextChangedError extends Error {
  constructor(message = 'A sessão ou a clínica mudou durante a conexão. Inicie novamente.') {
    super(message);
    this.name = 'WhatsappFlowContextChangedError';
  }
}

@Injectable({ providedIn: 'root' })
export class WhatsappFlowService {
  private readonly api = inject(ApiClientService);
  private readonly meta = inject(MetaEmbeddedSignupService);
  private readonly siteSession = inject(SiteSessionService);
  private readonly i18n = inject(I18nService);
  private readonly stateSignal = signal<WhatsappFlowState>({ stage: 'idle', message: '' });
  private attempt?: {
    authorization: WhatsappAuthorization;
    principal: FlowPrincipal;
    warnings: ApiWarning[];
  };
  private abort = new AbortController();
  private generation = 0;

  readonly state = this.stateSignal.asReadonly();
  readonly busy = computed(() =>
    ['authorizing', 'meta', 'completing'].includes(this.stateSignal().stage),
  );

  async start(): Promise<void> {
    if (this.busy()) return;
    const session = this.siteSession.session();
    const company = this.siteSession.selectedCompany();
    if (
      !session ||
      !company?.whatsappMessaging ||
      !company.companyEdit ||
      !company.manageCommunicationConnections
    ) {
      this.stateSignal.set({
        stage: 'error',
        message: this.i18n.translate('whatsapp.flowNoAccess'),
      });
      return;
    }
    this.cancel();
    const generation = this.generation;
    const principal = this.siteSession.principal(session);
    const requestContext = { accessToken: principal.accessToken, tenantId: principal.tenantId };
    try {
      this.stateSignal.set({
        stage: 'authorizing',
        message: this.i18n.translate('whatsapp.flowPreparing'),
      });
      const authorization = await firstValueFrom(this.api.authorizeWhatsapp(requestContext));
      this.assertSamePrincipal(principal);
      if (generation !== this.generation) return;
      if (
        authorization.data.sessionToken.length < 32 ||
        authorization.data.sessionToken.length > 256
      ) {
        throw new Error('invalid authorization response');
      }
      await this.meta.prepare();
      this.assertSamePrincipal(principal);
      if (generation !== this.generation) return;
      this.attempt = {
        authorization: authorization.data,
        principal,
        warnings: authorization.meta.warnings ?? [],
      };
      this.stateSignal.set({
        stage: 'ready',
        message: this.i18n.translate('whatsapp.flowReady'),
      });
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  }

  async continueWithMeta(): Promise<void> {
    const attempt = this.attempt;
    if (!attempt || this.busy() || this.stateSignal().stage !== 'ready') return;
    const generation = this.generation;
    const { principal, authorization } = attempt;
    const requestContext = { accessToken: principal.accessToken, tenantId: principal.tenantId };
    try {
      this.assertSamePrincipal(principal);
      this.stateSignal.set({ stage: 'meta', message: this.i18n.translate('whatsapp.flowMeta') });
      const result = await this.meta.run(
        {
          appId: authorization.appId,
          configurationId: authorization.configurationId,
          sdkVersion: authorization.sdkVersion,
          expiresAt: authorization.expiresAt,
        },
        this.abort.signal,
      );
      this.assertSamePrincipal(principal);
      if (generation !== this.generation) return;
      this.stateSignal.set({
        stage: 'completing',
        message: this.i18n.translate('whatsapp.flowCompleting'),
      });
      const completed = await firstValueFrom(
        this.api.completeWhatsapp(requestContext, {
          sessionToken: authorization.sessionToken,
          code: result.code,
          wabaId: result.wabaId,
          phoneNumberId: result.phoneNumberId,
        }),
      );
      this.assertSamePrincipal(principal);
      if (generation !== this.generation) return;
      if (
        completed.data.companyId !== principal.tenantId ||
        completed.data.id !== authorization.connectionId
      ) {
        throw new ApiError(
          502,
          undefined,
          this.i18n.translate('whatsapp.flowInvalidResponse'),
          true,
        );
      }
      this.stateSignal.set({
        stage: 'complete',
        message: this.i18n.translate('whatsapp.flowReceived'),
        connection: completed.data,
        warnings: [...attempt.warnings, ...(completed.meta.warnings ?? [])],
      });
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    } finally {
      if (generation === this.generation) this.attempt = undefined;
    }
  }

  cancel(): void {
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    this.attempt = undefined;
    this.stateSignal.set({ stage: 'idle', message: '' });
  }

  clear(): void {
    if (!this.busy()) this.cancel();
  }

  private assertSamePrincipal(principal: FlowPrincipal): void {
    if (!this.siteSession.samePrincipal(principal))
      throw new WhatsappFlowContextChangedError(
        this.i18n.translate('whatsapp.flowPrincipalChanged'),
      );
  }

  private fail(error: unknown): void {
    if (isAborted(error)) return;
    let message = this.i18n.translate('whatsapp.flowFailed');
    if (isUncertain(error)) message = this.i18n.translate('whatsapp.flowUncertain');
    else if (
      error instanceof WhatsappFlowContextChangedError ||
      error instanceof MetaSignupError ||
      error instanceof ApiError
    )
      message = error.message;
    this.stateSignal.set({ stage: 'error', message, uncertain: isUncertain(error) });
  }
}
