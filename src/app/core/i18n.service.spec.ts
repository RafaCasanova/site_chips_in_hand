import { TestBed } from '@angular/core/testing';
import {
  I18nService,
  resolveSupportedLocale,
  supportedLocales,
  translations,
} from './i18n.service';

describe('I18nService', () => {
  it('keeps every locale catalog complete', () => {
    const expected = Object.keys(translations['pt-BR']).sort();
    for (const locale of supportedLocales) {
      expect(Object.keys(translations[locale]).sort()).toEqual(expected);
      expect(Object.values(translations[locale]).every((value) => value.trim().length > 0)).toBe(
        true,
      );
    }
  });

  it('normalizes supported browser locales and safely falls back to pt-BR', () => {
    expect(resolveSupportedLocale(['es-MX', 'en-US'])).toBe('es');
    expect(resolveSupportedLocale(['en-GB'])).toBe('en');
    expect(resolveSupportedLocale(['pt-PT'])).toBe('pt-BR');
    expect(resolveSupportedLocale(['de-DE'])).toBe('pt-BR');
  });

  it('updates document language and formats values with the selected locale', () => {
    const service = TestBed.inject(I18nService);
    service.setLocale('en');
    TestBed.flushEffects();

    expect(document.documentElement.lang).toBe('en');
    expect(service.translate('shell.login')).toBe('Sign in');
    expect(service.formatCurrency(12345, 'USD')).toContain('123.45');

    service.setLocale('es');
    TestBed.flushEffects();
    expect(document.documentElement.lang).toBe('es');
    expect(service.translate('notFound.title')).toBe('Página no encontrada');
  });
});
