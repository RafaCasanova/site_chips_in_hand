import { ContractError, decodeWhatsappExternalTemplate } from './api-decoders';
import { externalTemplateFixture } from '../testing/api.fixtures';

describe('WhatsApp external template contract', () => {
  it('accepts sanitized read-only catalog metadata', () => {
    expect(decodeWhatsappExternalTemplate(externalTemplateFixture())).toEqual(
      externalTemplateFixture(),
    );
  });

  it('fails closed for category, status and rejection consistency', () => {
    expect(() =>
      decodeWhatsappExternalTemplate({
        ...externalTemplateFixture(),
        category: 'FUTURE_CATEGORY',
      }),
    ).toThrow(ContractError);
    expect(() =>
      decodeWhatsappExternalTemplate({
        ...externalTemplateFixture(),
        status: 'rejected',
        rejectionCode: null,
      }),
    ).toThrow(ContractError);
    expect(() =>
      decodeWhatsappExternalTemplate({
        ...externalTemplateFixture(),
        rejectionCode: 'raw provider reason',
      }),
    ).toThrow(ContractError);
  });
});
