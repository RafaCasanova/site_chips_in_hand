import { translateCanonicalMessage } from './message-localizations';

describe('canonical message translations', () => {
  it('interpolates safe primitive parameters', () => {
    expect(
      translateCanonicalMessage(
        'en',
        'warning.google_calendar_not_connected',
        { professionalName: 'Ana' },
        'fallback',
      ),
    ).toMatch(/^Ana:/);
  });

  it('uses a localized generic error for future stable codes', () => {
    expect(translateCanonicalMessage('es', 'error.future_code', {}, 'fallback')).toBe(
      'No pudimos completar la solicitud.',
    );
  });

  it('retains the server fallback for an unknown non-error key', () => {
    expect(translateCanonicalMessage('en', 'notification.future.title', {}, 'Legacy')).toBe(
      'Legacy',
    );
  });
});
