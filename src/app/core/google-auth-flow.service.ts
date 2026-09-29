import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClientService, ApiError, TransportError } from './api-client.service';
import {
  GoogleAuthAuthorization,
  GoogleAuthAuthorizeInput,
  GoogleAuthIntent,
  GoogleAuthStatus,
} from './api.models';
import { abortError, delay } from './polling';
import { I18nService } from './i18n.service';

export interface GoogleAuthFlow {
  intent: GoogleAuthIntent;
  authorization: GoogleAuthAuthorization;
  popup: Window;
}

export class GoogleAuthPopupBlockedError extends Error {
  constructor(
    message = 'O navegador bloqueou a janela do Google. Permita pop-ups e tente novamente.',
  ) {
    super(message);
    this.name = 'GoogleAuthPopupBlockedError';
  }
}

@Injectable({ providedIn: 'root' })
export class GoogleAuthFlowService {
  private readonly api = inject(ApiClientService);
  private readonly i18n = inject(I18nService);
  private readonly window = inject(DOCUMENT).defaultView;

  async start(input: GoogleAuthAuthorizeInput, signal?: AbortSignal): Promise<GoogleAuthFlow> {
    if (signal?.aborted) throw abortError();
    const popup = this.window?.open(
      'about:blank',
      'chips_google_auth',
      'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes',
    );
    if (!popup) throw new GoogleAuthPopupBlockedError(this.i18n.translate('calendar.popupBlocked'));

    try {
      const response = await firstValueFrom(this.api.authorizeGoogleAuth(input));
      if (signal?.aborted) throw abortError();
      const target = new URL(response.data.authorizationUrl);
      if (
        target.origin !== 'https://accounts.google.com' ||
        target.username ||
        target.password ||
        target.hash ||
        !response.data.attemptId ||
        response.data.exchangeToken.length < 32 ||
        response.data.exchangeToken.length > 256 ||
        !Number.isFinite(Date.parse(response.data.expiresAt)) ||
        Date.parse(response.data.expiresAt) <= Date.now()
      ) {
        throw new ApiError(502, undefined, this.i18n.translate('core.requestFailed'));
      }
      popup.location.replace(target.toString());
      return { intent: input.intent, authorization: response.data, popup };
    } catch (error) {
      popup.close();
      throw error;
    }
  }

  async waitForTerminal(flow: GoogleAuthFlow, signal?: AbortSignal): Promise<GoogleAuthStatus> {
    const expiresAt = Date.parse(flow.authorization.expiresAt);
    try {
      while (!signal?.aborted && Date.now() < expiresAt) {
        try {
          const response = await firstValueFrom(
            this.api.getGoogleAuthStatus({
              attemptId: flow.authorization.attemptId,
              exchangeToken: flow.authorization.exchangeToken,
            }),
          );
          if (signal?.aborted) throw abortError();
          if (
            response.data.attemptId !== flow.authorization.attemptId ||
            response.data.intent !== flow.intent ||
            Date.parse(response.data.expiresAt) !== expiresAt ||
            (response.data.status === 'verified' && !response.data.profile)
          ) {
            throw new ApiError(400, undefined, this.i18n.translate('auth.invalidAttempt'));
          }
          if (response.data.status !== 'pending') {
            flow.popup.close();
            return response.data;
          }
        } catch (error) {
          if (
            !(error instanceof TransportError) &&
            !(error instanceof ApiError && error.retryable)
          ) {
            flow.popup.close();
            throw error;
          }
        }
        await delay(Math.min(1500, Math.max(0, expiresAt - Date.now())), signal);
      }
      flow.popup.close();
      if (signal?.aborted) throw new DOMException('Fluxo cancelado.', 'AbortError');
      return {
        attemptId: flow.authorization.attemptId,
        intent: flow.intent,
        status: 'failed',
        expiresAt: flow.authorization.expiresAt,
        profile: null,
        errorCode: 'google_auth_expired',
        message: this.i18n.translate('auth.expired'),
        calendarAccess: 'notRequested',
      };
    } finally {
      flow.popup.close();
    }
  }
}
