import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MetaEmbeddedSignupService } from './meta-embedded-signup.service';

interface LoginResponse {
  authResponse?: { code?: string };
}

describe('MetaEmbeddedSignupService', () => {
  afterEach(() => {
    delete window.FB;
    delete window.fbAsyncInit;
    vi.restoreAllMocks();
  });

  it('correlaciona o code com os ativos somente a partir de uma origem Meta válida', async () => {
    let loginCallback: ((response: LoginResponse) => void) | undefined;
    const init = vi.fn();
    const login = vi.fn((callback: (response: LoginResponse) => void) => {
      loginCallback = callback;
    });
    window.FB = { init, login };
    TestBed.configureTestingModule({});
    const service = TestBed.inject(MetaEmbeddedSignupService);

    const result = service.run({
      appId: '12345678',
      configurationId: '87654321',
      sdkVersion: 'v24.0',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await vi.waitFor(() => expect(login).toHaveBeenCalledOnce());
    loginCallback?.({ authResponse: { code: 'single-use-meta-code' } });

    let settled = false;
    void result.then(() => {
      settled = true;
    });
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://facebook.com.evil.example',
        data: {
          type: 'WA_EMBEDDED_SIGNUP',
          event: 'FINISH',
          data: { waba_id: '1234567890', phone_number_id: '9876543210' },
        },
      }),
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://business.facebook.com',
        data: JSON.stringify({
          type: 'WA_EMBEDDED_SIGNUP',
          event: 'FINISH',
          data: { waba_id: '1234567890', phone_number_id: '9876543210' },
        }),
      }),
    );

    await expect(result).resolves.toEqual({
      code: 'single-use-meta-code',
      wabaId: '1234567890',
      phoneNumberId: '9876543210',
    });
    expect(init).toHaveBeenCalledWith({
      appId: '12345678',
      version: 'v24.0',
      cookie: false,
      xfbml: false,
      autoLogAppEvents: false,
    });
    expect(login).toHaveBeenCalledWith(expect.any(Function), {
      config_id: '87654321',
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, sessionInfoVersion: '3' },
    });
  });
});
