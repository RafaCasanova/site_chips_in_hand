import type { GoogleCalendarConflict, GoogleCalendarLinkStatus } from './api.models';
import {
  googleCalendarConflictMessageKey,
  googleCalendarLinkMessageKey,
} from './google-calendar-localizations';
import { translations } from './i18n.service';

const activeStatus: GoogleCalendarLinkStatus = {
  connectionId: 'connection-1',
  outcome: 'success',
  connected: true,
  connectionStatus: 'active',
  accountLabel: 'r***@gmail.com',
  calendarName: 'Chips in Hand — Luz',
  checkedAt: '2026-09-29T15:56:00Z',
  message: 'Conta Google conectada e calendário pronto para sincronizar.',
  errorCode: null,
  retryable: false,
  recommendedAction: 'none',
};

describe('Google Calendar localizations', () => {
  it('localizes a successful link without rendering the PT-BR backend fallback', () => {
    const key = googleCalendarLinkMessageKey(activeStatus);

    expect(translations['pt-BR'][key]).toBe(
      'Conta Google conectada e calendário pronto para sincronizar.',
    );
    expect(translations.en[key]).toBe(
      'Google account connected and calendar ready to synchronize.',
    );
    expect(translations.es[key]).toBe(
      'Cuenta de Google conectada y calendario listo para sincronizar.',
    );
    expect(translations.en[key]).not.toBe(activeStatus.message);
  });

  it('localizes actionable errors from stable codes instead of the free-form message', () => {
    const status: GoogleCalendarLinkStatus = {
      ...activeStatus,
      outcome: 'error',
      connected: false,
      connectionStatus: 'revoked',
      message: 'O Google não confirmou a permissão do Agenda.',
      errorCode: 'google_calendar_scope_missing',
      retryable: true,
      recommendedAction: 'reconnect',
    };
    const key = googleCalendarLinkMessageKey(status);

    expect(translations.en[key]).toBe(
      'Google did not confirm Calendar permission. Authorize it again and keep calendar access selected.',
    );
    expect(translations.es[key]).toBe(
      'Google no confirmó el permiso de Calendar. Autoriza de nuevo y mantén seleccionado el acceso al calendario.',
    );
    expect(translations.en[key]).not.toBe(status.message);
  });

  it('localizes sanitized conflicts by their stable type', () => {
    const conflict = {
      type: 'external_delete_detected',
      message: 'Evento do Google Agenda foi excluído externamente.',
    } as GoogleCalendarConflict;
    const key = googleCalendarConflictMessageKey(conflict);

    expect(translations['pt-BR'][key]).toContain('excluído');
    expect(translations.en[key]).toContain('deleted');
    expect(translations.es[key]).toContain('eliminado');
  });
});
