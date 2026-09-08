import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly document = inject(DOCUMENT);
  readonly apiBaseUrl = this.readApiBaseUrl();

  private readApiBaseUrl(): string {
    const value =
      this.document
        .querySelector<HTMLMetaElement>('meta[name="chips-api-base-url"]')
        ?.content.trim() ?? '';
    if (!value) return '';

    const url = new URL(value);
    const loopback =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
      throw new Error('A origem configurada para a API deve usar HTTPS.');
    }
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('A configuração da API deve conter somente uma origem.');
    }
    return url.origin;
  }
}
