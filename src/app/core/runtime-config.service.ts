import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';

interface RuntimeConfigDocument {
  apiBaseUrl: string;
}

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly document = inject(DOCUMENT);
  private readonly http = inject(HttpClient);
  private apiOrigin = '';
  private loaded = false;

  get apiBaseUrl(): string {
    return this.apiOrigin;
  }

  get googleCalendarReturnUrl(): string {
    return new URL(
      '/integrations/google-calendar/complete',
      this.document.location.origin,
    ).toString();
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    const payload = await firstValueFrom(
      this.http
        .get<unknown>('/runtime-config.json', {
          headers: { Accept: 'application/json' },
          params: { v: '1' },
        })
        .pipe(timeout(5_000)),
    );
    this.apiOrigin = this.decode(payload);
    this.loaded = true;
  }

  private decode(payload: unknown): string {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('O arquivo runtime-config.json é inválido.');
    }
    const keys = Object.keys(payload);
    if (keys.length !== 1 || keys[0] !== 'apiBaseUrl') {
      throw new Error('runtime-config.json deve conter somente apiBaseUrl.');
    }
    const configured = (payload as Partial<RuntimeConfigDocument>).apiBaseUrl;
    if (typeof configured !== 'string') {
      throw new Error('apiBaseUrl deve ser uma origem em texto.');
    }
    const value = configured.trim();
    if (!value) {
      if (this.isLoopback(this.document.location.hostname)) return '';
      throw new Error('Defina apiBaseUrl no runtime-config.json deste ambiente.');
    }

    const url = new URL(value);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && this.isLoopback(url.hostname))) {
      throw new Error('A origem configurada para a API deve usar HTTPS.');
    }
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('apiBaseUrl deve conter somente a origem da API.');
    }
    return url.origin;
  }

  private isLoopback(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  }
}
