import { ContractError, decodeWhatsappLinkStatus } from './api-decoders';
import { whatsappStatusFixture } from '../testing/api.fixtures';

describe('WhatsApp provisioning contract', () => {
  it('accepts exactly the eight ordered, sanitized provisioning steps', () => {
    const decoded = decodeWhatsappLinkStatus(whatsappStatusFixture());

    expect(decoded.provisioningSteps).toHaveLength(8);
    expect(decoded.provisioningSteps.map((step) => step.code)).toEqual([
      'credentials',
      'two_step_verification',
      'system_user_access',
      'credit_line',
      'phone_registration',
      'webhook_subscription',
      'template_sync',
      'activation',
    ]);
    expect(JSON.stringify(decoded.provisioningSteps)).not.toContain('providerPayload');
  });

  it('rejects reordered or incomplete diagnostics', () => {
    const reordered = structuredClone(whatsappStatusFixture());
    [reordered.provisioningSteps[0], reordered.provisioningSteps[1]] = [
      reordered.provisioningSteps[1],
      reordered.provisioningSteps[0],
    ];
    expect(() => decodeWhatsappLinkStatus(reordered)).toThrow(ContractError);

    const incomplete = structuredClone(whatsappStatusFixture());
    incomplete.provisioningSteps.pop();
    expect(() => decodeWhatsappLinkStatus(incomplete)).toThrow(ContractError);
  });

  it('accepts only stable failure codes and consistent failure timestamps', () => {
    const failed = structuredClone(whatsappStatusFixture());
    failed.outcome = 'error';
    failed.connected = false;
    failed.errorCode = 'whatsapp_provider_rejected';
    failed.connectionStatus = 'degraded';
    failed.provisioningSteps[2] = {
      ...failed.provisioningSteps[2],
      status: 'failed',
      failureCode: 'whatsapp_provider_rejected',
    };
    expect(decodeWhatsappLinkStatus(failed).provisioningSteps[2].failureCode).toBe(
      'whatsapp_provider_rejected',
    );

    const rawCode = structuredClone(failed) as unknown as {
      provisioningSteps: Array<Record<string, unknown>>;
    };
    rawCode.provisioningSteps[2]['failureCode'] = 'OAuthException: token=secret';
    expect(() => decodeWhatsappLinkStatus(rawCode)).toThrow(ContractError);
  });
});
