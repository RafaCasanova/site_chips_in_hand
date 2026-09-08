import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClientService, ApiError, TransportError } from './api-client.service';
import { ApiWarning, WhatsappConnection } from './api.models';
import { MetaEmbeddedSignupService, MetaSignupError } from './meta-embedded-signup.service';
import { SiteSessionService } from './site-session.service';

export type WhatsappFlowStage =
  'idle' | 'authorizing' | 'meta' | 'completing' | 'complete' | 'error';

export interface WhatsappFlowState {
  stage: WhatsappFlowStage;
  message: string;
  connection?: WhatsappConnection;
  warnings?: ApiWarning[];
}

export class WhatsappFlowContextChangedError extends Error {
  constructor() {
    super('A sessão ou a clínica mudou durante a conexão. Inicie novamente.');
    this.name = 'WhatsappFlowContextChangedError';
  }
}

@Injectable({ providedIn: 'root' })
export class WhatsappFlowService {
  private readonly api = inject(ApiClientService);
  private readonly meta = inject(MetaEmbeddedSignupService);
  private readonly siteSession = inject(SiteSessionService);
  private readonly stateSignal = signal<WhatsappFlowState>({ stage: 'idle', message: '' });

  readonly state = this.stateSignal.asReadonly();
  readonly busy = computed(() => {
    const stage = this.stateSignal().stage;
    return stage === 'authorizing' || stage === 'meta' || stage === 'completing';
  });

  async start(): Promise<void> {
    if (this.busy()) return;
    const session = this.siteSession.session();
    if (!session) {
      this.stateSignal.set({
        stage: 'error',
        message: 'Entre novamente para conectar o WhatsApp.',
      });
      return;
    }

    const principal = this.siteSession.principal(session);
    const requestContext = { accessToken: principal.accessToken, tenantId: principal.tenantId };
    let sessionToken = '';
    let authorizationCode = '';

    try {
      this.setStage('authorizing');
      const authorization = await firstValueFrom(this.api.authorizeWhatsapp(requestContext));
      sessionToken = authorization.data.sessionToken;
      if (sessionToken.length < 32 || sessionToken.length > 256) {
        throw new Error('invalid authorization response');
      }
      this.assertSamePrincipal(principal);

      this.setStage('meta');
      const result = await this.meta.run({
        appId: authorization.data.appId,
        configurationId: authorization.data.configurationId,
        sdkVersion: authorization.data.sdkVersion,
        expiresAt: authorization.data.expiresAt,
      });
      authorizationCode = result.code;
      this.assertSamePrincipal(principal);

      this.setStage('completing');
      const completed = await firstValueFrom(
        this.api.completeWhatsapp(requestContext, {
          sessionToken,
          code: authorizationCode,
          wabaId: result.wabaId,
          phoneNumberId: result.phoneNumberId,
        }),
      );
      this.stateSignal.set({
        stage: 'complete',
        message:
          completed.data.status === 'active'
            ? 'WhatsApp conectado e confirmado pelo backend.'
            : 'Conexão recebida pelo backend. O provisionamento continuará em segundo plano.',
        connection: completed.data,
        warnings: [...(authorization.meta.warnings ?? []), ...(completed.meta.warnings ?? [])],
      });
    } catch (error) {
      this.stateSignal.set({ stage: 'error', message: this.safeMessage(error) });
    } finally {
      sessionToken = '';
      authorizationCode = '';
    }
  }

  clear(): void {
    if (!this.busy()) this.stateSignal.set({ stage: 'idle', message: '' });
  }

  private assertSamePrincipal(expected: {
    sessionInstanceId: string;
    accessToken: string;
    userId: string;
    tenantId: string;
    membershipId: string;
  }): void {
    if (!this.siteSession.samePrincipal(expected)) throw new WhatsappFlowContextChangedError();
  }

  private setStage(stage: 'authorizing' | 'meta' | 'completing'): void {
    const messages = {
      authorizing: 'Preparando uma autorização segura…',
      meta: 'Conclua as etapas na janela da Meta.',
      completing: 'Validando a conta e o número com o backend…',
    };
    this.stateSignal.set({ stage, message: messages[stage] });
  }

  private safeMessage(error: unknown): string {
    if (error instanceof WhatsappFlowContextChangedError || error instanceof MetaSignupError) {
      return error.message;
    }
    if (error instanceof ApiError) {
      if (error.code === 'capability_disabled') {
        return 'A integração com WhatsApp não está habilitada para esta clínica.';
      }
      if (error.code === 'permission_denied') {
        return 'Seu acesso não permite administrar a conexão do WhatsApp.';
      }
      return error.message;
    }
    if (error instanceof TransportError) {
      return 'Não foi possível confirmar o resultado. Verifique a conexão antes de tentar novamente.';
    }
    return 'Não foi possível concluir a conexão do WhatsApp.';
  }
}
