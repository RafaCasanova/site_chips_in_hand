import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { I18nService } from './i18n.service';
import { abortError } from './polling';

export interface MetaSignupConfiguration {
  appId: string;
  configurationId: string;
  sdkVersion: string;
  expiresAt: string;
}

export interface MetaSignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

interface FacebookLoginResponse {
  authResponse?: { code?: string };
}

interface FacebookSdk {
  init(options: {
    appId: string;
    version: string;
    cookie: boolean;
    xfbml: boolean;
    autoLogAppEvents: boolean;
  }): void;
  login(
    callback: (response: FacebookLoginResponse) => void,
    options: {
      config_id: string;
      response_type: 'code';
      override_default_response_type: true;
      extras: { setup: Record<string, never>; sessionInfoVersion: '3' };
    },
  ): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

export class MetaSignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaSignupError';
  }
}

@Injectable({ providedIn: 'root' })
export class MetaEmbeddedSignupService {
  private readonly document = inject(DOCUMENT);
  private readonly i18n = inject(I18nService);
  private readonly window = this.document.defaultView;
  private sdkPromise: Promise<FacebookSdk> | null = null;

  async prepare(): Promise<void> {
    await this.loadSdk();
  }

  async run(
    configuration: MetaSignupConfiguration,
    signal?: AbortSignal,
  ): Promise<MetaSignupResult> {
    if (signal?.aborted) throw abortError();
    this.validateConfiguration(configuration);
    const expiresAt = Date.parse(configuration.expiresAt);
    const remaining = expiresAt - Date.now();
    if (!Number.isFinite(expiresAt) || remaining <= 0) {
      throw new MetaSignupError(this.i18n.translate('whatsapp.metaExpired'));
    }
    if (!this.window)
      throw new MetaSignupError(this.i18n.translate('whatsapp.metaBrowserRequired'));

    // prepare() runs before the explicit user click, preserving popup user activation here.
    const facebook = this.window.FB ?? (await this.loadSdk());
    if (signal?.aborted) throw abortError();
    facebook.init({
      appId: configuration.appId,
      version: configuration.sdkVersion,
      cookie: false,
      xfbml: false,
      autoLogAppEvents: false,
    });

    return new Promise<MetaSignupResult>((resolve, reject) => {
      let code = '';
      let assets: { wabaId: string; phoneNumberId: string } | null = null;
      let settled = false;

      const cleanup = () => {
        this.window?.removeEventListener('message', onMessage);
        signal?.removeEventListener('abort', cancel);
        this.window?.clearTimeout(timeout);
        code = '';
        assets = null;
      };
      const cancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(abortError());
      };
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new MetaSignupError(message));
      };
      const finish = () => {
        if (settled || !code || !assets) return;
        settled = true;
        const result = { code, ...assets };
        cleanup();
        resolve(result);
      };
      const onMessage = (event: MessageEvent) => {
        const result = this.parseSignupMessage(event);
        if (result === 'cancel') {
          fail(this.i18n.translate('whatsapp.metaCancelled'));
          return;
        }
        if (result) {
          assets = result;
          finish();
        }
      };
      const timeout = this.window!.setTimeout(
        () => fail(this.i18n.translate('whatsapp.metaAuthorizationExpired')),
        Math.min(remaining, 10 * 60_000),
      );

      this.window!.addEventListener('message', onMessage);
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        facebook.login(
          (response) => {
            const returnedCode = response.authResponse?.code;
            if (!returnedCode || returnedCode.length > 4096) {
              fail(this.i18n.translate('whatsapp.metaCancelled'));
              return;
            }
            code = returnedCode;
            finish();
          },
          {
            config_id: configuration.configurationId,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {}, sessionInfoVersion: '3' },
          },
        );
      } catch {
        fail(this.i18n.translate('whatsapp.metaStartFailed'));
      }
    });
  }

  private loadSdk(): Promise<FacebookSdk> {
    if (!this.window)
      return Promise.reject(
        new MetaSignupError(this.i18n.translate('whatsapp.metaBrowserRequired')),
      );
    if (this.window.FB) return Promise.resolve(this.window.FB);
    if (this.sdkPromise) return this.sdkPromise;

    this.sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
      const timeout = this.window!.setTimeout(() => {
        this.sdkPromise = null;
        reject(new MetaSignupError(this.i18n.translate('whatsapp.metaLoadFailed')));
      }, 15_000);

      const finish = () => {
        if (!this.window?.FB) return;
        this.window.clearTimeout(timeout);
        resolve(this.window.FB);
      };
      const fail = () => {
        this.window?.clearTimeout(timeout);
        this.sdkPromise = null;
        reject(new MetaSignupError(this.i18n.translate('whatsapp.metaLoadFailed')));
      };

      this.window!.fbAsyncInit = finish;
      const existing = this.document.querySelector<HTMLScriptElement>('#facebook-jssdk');
      if (existing) {
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', fail, { once: true });
        return;
      }

      const script = this.document.createElement('script');
      script.id = 'facebook-jssdk';
      const sdkLocale = { 'pt-BR': 'pt_BR', en: 'en_US', es: 'es_LA' }[this.i18n.locale()];
      script.src = `https://connect.facebook.net/${sdkLocale}/sdk.js`;
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', fail, { once: true });
      this.document.head.append(script);
    });

    return this.sdkPromise;
  }

  private parseSignupMessage(
    event: MessageEvent,
  ): { wabaId: string; phoneNumberId: string } | 'cancel' | null {
    if (!this.validMetaOrigin(event.origin)) return null;
    let payload: unknown = event.data;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload) as unknown;
      } catch {
        return null;
      }
    }
    if (!payload || typeof payload !== 'object') return null;

    const message = payload as { type?: unknown; event?: unknown; data?: unknown };
    if (message.type !== 'WA_EMBEDDED_SIGNUP') return null;
    if (message.event === 'CANCEL' || message.event === 'ERROR') return 'cancel';
    if (
      !['FINISH', 'FINISH_ONLY_WABA', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(
        String(message.event),
      )
    )
      return null;
    if (!message.data || typeof message.data !== 'object') return null;

    const data = message.data as {
      waba_id?: unknown;
      phone_number_id?: unknown;
      current_step?: unknown;
    };
    if (data.current_step) return 'cancel';
    if (typeof data.waba_id !== 'string' || typeof data.phone_number_id !== 'string') return null;
    if (!/^\d{4,32}$/.test(data.waba_id) || !/^\d{4,32}$/.test(data.phone_number_id)) return null;
    return { wabaId: data.waba_id, phoneNumberId: data.phone_number_id };
  }

  private validMetaOrigin(origin: string): boolean {
    try {
      const url = new URL(origin);
      return (
        url.protocol === 'https:' &&
        !url.port &&
        !url.username &&
        !url.password &&
        (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'))
      );
    } catch {
      return false;
    }
  }

  private validateConfiguration(configuration: MetaSignupConfiguration): void {
    if (
      !/^\d{4,32}$/.test(configuration.appId) ||
      !/^\d{4,64}$/.test(configuration.configurationId)
    ) {
      throw new MetaSignupError(this.i18n.translate('whatsapp.metaInvalidConfig'));
    }
    if (!/^v\d+\.\d+$/.test(configuration.sdkVersion)) {
      throw new MetaSignupError(this.i18n.translate('whatsapp.metaInvalidSdk'));
    }
  }
}
