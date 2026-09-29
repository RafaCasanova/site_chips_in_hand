import {
  AgendaProfessionalOption,
  ApiMeta,
  ApiWarning,
  AuthenticationSession,
  CompanyCreationResult,
  GoogleAuthAuthorization,
  GoogleAuthProfile,
  GoogleAuthStatus,
  InvitePreview,
  GoogleCalendarAuthorization,
  GoogleCalendarConflict,
  GoogleCalendarConnection,
  GoogleCalendarLinkStatus,
  ObjectEnvelope,
  PatientOption,
  Professional,
  PublicBillingLink,
  SessionCompany,
  SessionProjection,
  WhatsappAuthorization,
  WhatsappConnection,
  WhatsappExternalTemplate,
  WhatsappLinkStatus,
  WhatsappProvisioningStep,
  WhatsappTemplate,
  WhatsappTestReceipt,
  UserPreferences,
} from './api.models';
import type { SupportedLocale } from './i18n.service';

export type Decoder<T> = (value: unknown, path?: string) => T;

export class ContractError extends Error {
  constructor(path: string) {
    super(`Resposta incompatível com o contrato em ${path}.`);
    this.name = 'ContractError';
  }
}

type JsonObject = Record<string, unknown>;

const googleStatuses = [
  'pending_oauth',
  'provisioning',
  'active',
  'degraded',
  'reconnect_required',
  'paused',
  'revoking',
  'revoked',
] as const;
const whatsappStatuses = [
  'pending_signup',
  'provisioning',
  'active',
  'degraded',
  'reconnect_required',
  'paused',
  'revoking',
  'revoked',
] as const;
const whatsappProvisioningSteps = [
  'credentials',
  'two_step_verification',
  'system_user_access',
  'credit_line',
  'phone_registration',
  'webhook_subscription',
  'template_sync',
  'activation',
] as const;
const whatsappProvisioningStatuses = [
  'pending',
  'running',
  'passed',
  'skipped',
  'failed',
  'not_available',
] as const;
const whatsappProvisioningFailureCodes = [
  'whatsapp_provider_timeout',
  'whatsapp_reconnect_required',
  'whatsapp_provider_unavailable',
  'whatsapp_provider_rejected',
  'whatsapp_internal_error',
] as const;

export function decodeEnvelope<T>(value: unknown, decoder: Decoder<T>): ObjectEnvelope<T> {
  const object = record(value, 'response');
  return {
    data: decoder(object['data'], 'data'),
    meta: decodeMeta(object['meta'], 'meta'),
  };
}

export function arrayOf<T>(decoder: Decoder<T>): Decoder<T[]> {
  return (value, path = 'data') => {
    if (!Array.isArray(value)) fail(path);
    return value.map((item, index) => decoder(item, `${path}[${index}]`));
  };
}

export function matching<T extends object>(decoder: Decoder<T>, expected: Partial<T>): Decoder<T> {
  return (value, path = 'data') => {
    const decoded = decoder(value, path);
    for (const key of Object.keys(expected) as (keyof T)[]) {
      if (decoded[key] !== expected[key]) fail(`${path}.${String(key)}`);
    }
    return decoded;
  };
}

export const decodeGoogleAuthAuthorization: Decoder<GoogleAuthAuthorization> = (
  value,
  path = 'data',
) => {
  const item = record(value, path);
  return {
    attemptId: text(item, 'attemptId', path),
    authorizationUrl: text(item, 'authorizationUrl', path),
    exchangeToken: text(item, 'exchangeToken', path),
    expiresAt: instant(item, 'expiresAt', path),
  };
};

export const decodeGoogleAuthStatus: Decoder<GoogleAuthStatus> = (value, path = 'data') => {
  const item = record(value, path);
  const status = enumeration(item, 'status', ['pending', 'verified', 'failed'] as const, path);
  const profileValue = nullable(item, 'profile', path);
  if (status === 'verified' && profileValue === null) fail(`${path}.profile`);
  return {
    attemptId: text(item, 'attemptId', path),
    intent: enumeration(item, 'intent', ['login', 'register', 'join'] as const, path),
    status,
    expiresAt: instant(item, 'expiresAt', path),
    profile: profileValue === null ? null : decodeGoogleProfile(profileValue, `${path}.profile`),
    errorCode: nullableText(item, 'errorCode', path),
    message: stringValue(item, 'message', path),
    calendarAccess: enumeration(
      item,
      'calendarAccess',
      ['notRequested', 'granted', 'declined', 'unavailable'] as const,
      path,
    ),
  };
};

export const decodeInvitePreview: Decoder<InvitePreview> = (value, path = 'data') => {
  const item = record(value, path);
  return {
    companyId: text(item, 'companyId', path),
    companyName: text(item, 'companyName', path),
    groupName: text(item, 'groupName', path),
    isProfessional: boolean(item, 'isProfessional', path),
    googleCalendarAvailable: boolean(item, 'googleCalendarAvailable', path),
    expiresAt: instant(item, 'expiresAt', path),
  };
};

export const decodeAuthenticationSession: Decoder<AuthenticationSession> = (
  value,
  path = 'data',
) => {
  const item = record(value, path);
  return {
    ...decodeSessionProjection(value, path),
    access_token: text(item, 'access_token', path),
    ...(typeof item['refresh_token'] === 'string' ? { refresh_token: item['refresh_token'] } : {}),
    ...(typeof item['selectedCompanyId'] === 'string'
      ? { selectedCompanyId: item['selectedCompanyId'] }
      : {}),
  };
};

export const decodeCompanyCreationResult: Decoder<CompanyCreationResult> = (
  value,
  path = 'data',
) => {
  const item = record(value, path);
  return { id: text(item, 'id', path) };
};

export const decodeSessionProjection: Decoder<SessionProjection> = (value, path = 'data') => {
  const item = record(value, path);
  const user = record(item['user'], `${path}.user`);
  return {
    user: {
      id: text(user, 'id', `${path}.user`),
      name: text(user, 'name', `${path}.user`),
      email: text(user, 'email', `${path}.user`),
      avatarUrl: nullableText(user, 'avatarUrl', `${path}.user`),
      preferredLocale: optionalLocale(user, 'preferredLocale', `${path}.user`),
    },
    companies: arrayOf(decodeSessionCompany)(item['companies'], `${path}.companies`),
  };
};

export const decodeUserPreferences: Decoder<UserPreferences> = (value, path = 'data') => {
  const item = record(value, path);
  return {
    preferredLocale: locale(item, 'preferredLocale', path),
    updatedAt: instant(item, 'updatedAt', path),
  };
};

export const decodeAgendaProfessionalOption: Decoder<AgendaProfessionalOption> = (
  value,
  path = 'data',
) => {
  const item = record(value, path);
  const access = record(item['access'], `${path}.access`);
  return {
    professionalId: text(item, 'professionalId', path),
    professionalName: text(item, 'professionalName', path),
    access: {
      canReadAppointments: boolean(access, 'canReadAppointments', `${path}.access`),
      canCreateAppointments: boolean(access, 'canCreateAppointments', `${path}.access`),
      canEditAppointments: boolean(access, 'canEditAppointments', `${path}.access`),
      canDeleteAppointments: boolean(access, 'canDeleteAppointments', `${path}.access`),
      canManageGoogleCalendar: boolean(access, 'canManageGoogleCalendar', `${path}.access`),
      canAuthorizeGoogleCalendar: boolean(access, 'canAuthorizeGoogleCalendar', `${path}.access`),
      canRevokeGoogleGrantEverywhere: boolean(
        access,
        'canRevokeGoogleGrantEverywhere',
        `${path}.access`,
      ),
    },
  };
};

export const decodeProfessional: Decoder<Professional> = (value, path = 'data') => {
  const item = record(value, path);
  return {
    id: text(item, 'id', path),
    memberId: text(item, 'memberId', path),
    displayName: text(item, 'displayName', path),
    active: boolean(item, 'active', path),
  };
};

export const decodeGoogleCalendarAuthorization: Decoder<GoogleCalendarAuthorization> = (
  value,
  path = 'data',
) => {
  const item = record(value, path);
  return {
    connectionId: text(item, 'connectionId', path),
    authorizationUrl: text(item, 'authorizationUrl', path),
    expiresAt: instant(item, 'expiresAt', path),
  };
};

export const decodeGoogleCalendarConnection: Decoder<GoogleCalendarConnection> = (
  value,
  path = 'data',
) => {
  const item = record(value, path);
  const professionalName = optionalText(item, 'professionalName', path);
  return {
    id: text(item, 'id', path),
    professionalId: text(item, 'professionalId', path),
    ...(professionalName === undefined ? {} : { professionalName }),
    provider: enumeration(item, 'provider', ['googleCalendar'] as const, path),
    status: enumeration(item, 'status', googleStatuses, path),
    accountLabel: stringValue(item, 'accountLabel', path),
    calendarName: stringValue(item, 'calendarName', path),
    syncMode: enumeration(item, 'syncMode', ['chips_wins'] as const, path),
    externalConflictPolicy: enumeration(
      item,
      'externalConflictPolicy',
      ['off', 'warn', 'block'] as const,
      path,
    ),
    importManualBlocks: boolean(item, 'importManualBlocks', path),
    enabled: boolean(item, 'enabled', path),
    requiresReconnect: boolean(item, 'requiresReconnect', path),
    syncInProgress: boolean(item, 'syncInProgress', path),
    grantedFeatures: stringArray(item, 'grantedFeatures', path),
    lastSuccessfulSyncAt: nullableInstant(item, 'lastSuccessfulSyncAt', path),
    reconnectReason: nullableText(item, 'reconnectReason', path),
    lastErrorCode: nullableText(item, 'lastErrorCode', path),
  };
};

export const decodeGoogleCalendarLinkStatus: Decoder<GoogleCalendarLinkStatus> = (
  value,
  path = 'data',
) => {
  const item = record(value, path);
  const outcome = enumeration(item, 'outcome', ['pending', 'success', 'error'] as const, path);
  const connected = boolean(item, 'connected', path);
  if ((outcome === 'success') !== connected) fail(`${path}.connected`);
  return {
    connectionId: text(item, 'connectionId', path),
    outcome,
    connected,
    connectionStatus: enumeration(item, 'connectionStatus', googleStatuses, path),
    accountLabel: stringValue(item, 'accountLabel', path),
    calendarName: stringValue(item, 'calendarName', path),
    checkedAt: instant(item, 'checkedAt', path),
    message: text(item, 'message', path),
    errorCode: nullableText(item, 'errorCode', path),
    retryable: boolean(item, 'retryable', path),
    recommendedAction: enumeration(
      item,
      'recommendedAction',
      ['none', 'wait', 'reconnect', 'repair', 'resume'] as const,
      path,
    ),
  };
};

export const decodeGoogleCalendarConflict: Decoder<GoogleCalendarConflict> = (
  value,
  path = 'data',
) => {
  const item = record(value, path);
  const appointmentId = optionalText(item, 'appointmentId', path);
  const resolution = optionalText(item, 'resolution', path);
  const resolvedAt = optionalInstant(item, 'resolvedAt', path);
  return {
    id: text(item, 'id', path),
    connectionId: text(item, 'connectionId', path),
    ...(appointmentId === undefined ? {} : { appointmentId }),
    type: text(item, 'type', path),
    status: enumeration(item, 'status', ['open', 'restoring', 'resolved'] as const, path),
    ...(resolution === undefined ? {} : { resolution }),
    message: text(item, 'message', path),
    detectedAt: instant(item, 'detectedAt', path),
    ...(resolvedAt === undefined ? {} : { resolvedAt }),
  };
};

export const decodeWhatsappAuthorization: Decoder<WhatsappAuthorization> = (
  value,
  path = 'data',
) => {
  const item = record(value, path);
  return {
    connectionId: text(item, 'connectionId', path),
    appId: text(item, 'appId', path),
    configurationId: text(item, 'configurationId', path),
    sdkVersion: text(item, 'sdkVersion', path),
    sessionToken: text(item, 'sessionToken', path),
    expiresAt: instant(item, 'expiresAt', path),
  };
};

export function whatsappConnectionDecoder(expectedTenant: string): Decoder<WhatsappConnection> {
  return (value, path = 'data') => {
    const item = record(value, path);
    const companyId = text(item, 'companyId', path);
    if (companyId !== expectedTenant) fail(`${path}.companyId`);
    return {
      id: text(item, 'id', path),
      companyId,
      status: enumeration(item, 'status', whatsappStatuses, path),
      enabled: boolean(item, 'enabled', path),
      businessAccountLabel: stringValue(item, 'businessAccountLabel', path),
      phoneNumberLabel: stringValue(item, 'phoneNumberLabel', path),
      coexistenceMode: stringValue(item, 'coexistenceMode', path),
      templateReadiness: enumeration(
        item,
        'templateReadiness',
        ['pending', 'ready', 'degraded'] as const,
        path,
      ),
      qualityRating: nullableText(item, 'qualityRating', path),
      messagingLimit: nullableText(item, 'messagingLimit', path),
      lastWebhookAt: nullableInstant(item, 'lastWebhookAt', path),
      lastSendAt: nullableInstant(item, 'lastSendAt', path),
      lastErrorCode: nullableText(item, 'lastErrorCode', path),
      createdAt: instant(item, 'createdAt', path),
      updatedAt: instant(item, 'updatedAt', path),
    };
  };
}

export const decodeWhatsappLinkStatus: Decoder<WhatsappLinkStatus> = (value, path = 'data') => {
  const item = record(value, path);
  const outcome = enumeration(item, 'outcome', ['pending', 'success', 'error'] as const, path);
  const connected = boolean(item, 'connected', path);
  if ((outcome === 'success') !== connected) fail(`${path}.connected`);
  const rawProvisioningSteps = item['provisioningSteps'];
  if (!Array.isArray(rawProvisioningSteps)) fail(`${path}.provisioningSteps`);
  if (rawProvisioningSteps.length !== whatsappProvisioningSteps.length)
    fail(`${path}.provisioningSteps`);
  const provisioningSteps = rawProvisioningSteps.map((step, index) => {
    const decoded = decodeWhatsappProvisioningStep(step, `${path}.provisioningSteps[${index}]`);
    if (decoded.code !== whatsappProvisioningSteps[index])
      fail(`${path}.provisioningSteps[${index}].code`);
    return decoded;
  });
  const errorCode = nullableText(item, 'errorCode', path);
  if (outcome !== 'error' && errorCode !== null) fail(`${path}.errorCode`);
  return {
    connectionId: text(item, 'connectionId', path),
    outcome,
    connected,
    connectionStatus: enumeration(item, 'connectionStatus', whatsappStatuses, path),
    phoneNumberLabel: stringValue(item, 'phoneNumberLabel', path),
    templateReadiness: enumeration(
      item,
      'templateReadiness',
      ['pending', 'ready', 'degraded'] as const,
      path,
    ),
    provisioningSteps,
    checkedAt: instant(item, 'checkedAt', path),
    message: text(item, 'message', path),
    errorCode,
    retryable: boolean(item, 'retryable', path),
    recommendedAction: enumeration(
      item,
      'recommendedAction',
      ['none', 'wait', 'resume', 'repair', 'reconnect'] as const,
      path,
    ),
  };
};

function decodeWhatsappProvisioningStep(value: unknown, path: string): WhatsappProvisioningStep {
  const item = record(value, path);
  const code = enumeration(item, 'code', whatsappProvisioningSteps, path);
  const status = enumeration(item, 'status', whatsappProvisioningStatuses, path);
  const attemptCount = integer(item, 'attemptCount', path);
  if (attemptCount < 0) fail(path + '.attemptCount');
  const failureCodeValue = nullableText(item, 'failureCode', path);
  if (
    failureCodeValue !== null &&
    !whatsappProvisioningFailureCodes.includes(
      failureCodeValue as (typeof whatsappProvisioningFailureCodes)[number],
    )
  )
    fail(path + '.failureCode');
  if ((status === 'failed') !== (failureCodeValue !== null)) fail(path + '.failureCode');
  const messageKey = text(item, 'messageKey', path);
  if (messageKey !== 'whatsapp.provisioning.step.' + code) fail(path + '.messageKey');
  const startedAt = nullableInstant(item, 'startedAt', path);
  const completedAt = nullableInstant(item, 'completedAt', path);
  if (status === 'running' && (startedAt === null || completedAt !== null)) fail(path);
  if ((status === 'passed' || status === 'failed') && (startedAt === null || completedAt === null))
    fail(path);
  if (status === 'skipped' && completedAt === null) fail(path + '.completedAt');
  if (startedAt !== null && completedAt !== null && Date.parse(completedAt) < Date.parse(startedAt))
    fail(path + '.completedAt');
  return {
    code,
    status,
    attemptCount,
    failureCode: failureCodeValue,
    messageKey,
    messageParams: record(item['messageParams'], path + '.messageParams'),
    startedAt,
    completedAt,
    updatedAt: instant(item, 'updatedAt', path),
  };
}

export const decodeWhatsappTemplate: Decoder<WhatsappTemplate> = (value, path = 'data') => {
  const item = record(value, path);
  return {
    id: text(item, 'id', path),
    connectionId: text(item, 'connectionId', path),
    templateType: enumeration(
      item,
      'templateType',
      [
        'appointmentReminder',
        'appointmentRescheduled',
        'appointmentCancelled',
        'billingReminder',
        'billingDueDate',
        'billingOverdue',
      ] as const,
      path,
    ),
    providerName: text(item, 'providerName', path),
    language: text(item, 'language', path),
    category: text(item, 'category', path),
    version: integer(item, 'version', path),
    status: enumeration(
      item,
      'status',
      ['pending', 'approved', 'rejected', 'paused', 'disabled', 'unknown'] as const,
      path,
    ),
    rejectionCode: nullableText(item, 'rejectionCode', path),
    current: boolean(item, 'current', path),
    createdAt: instant(item, 'createdAt', path),
    updatedAt: instant(item, 'updatedAt', path),
  };
};

export const decodeWhatsappExternalTemplate: Decoder<WhatsappExternalTemplate> = (
  value,
  path = 'data',
) => {
  const item = record(value, path);
  const status = enumeration(
    item,
    'status',
    ['pending', 'approved', 'rejected', 'paused', 'disabled', 'unknown'] as const,
    path,
  );
  const rejectionCode = nullableText(item, 'rejectionCode', path);
  if ((status === 'rejected') !== (rejectionCode !== null)) fail(path + '.rejectionCode');
  return {
    id: text(item, 'id', path),
    connectionId: text(item, 'connectionId', path),
    providerName: text(item, 'providerName', path),
    language: text(item, 'language', path),
    category: enumeration(
      item,
      'category',
      ['UTILITY', 'MARKETING', 'AUTHENTICATION', 'UNKNOWN'] as const,
      path,
    ),
    status,
    rejectionCode,
    syncedAt: instant(item, 'syncedAt', path),
  };
};

export const decodeWhatsappTestReceipt: Decoder<WhatsappTestReceipt> = (value, path = 'data') => {
  const item = record(value, path);
  return {
    id: text(item, 'id', path),
    status: text(item, 'status', path),
    recipientLabel: text(item, 'recipientLabel', path),
    queuedAt: instant(item, 'queuedAt', path),
  };
};

export function patientOptionDecoder(expectedTenant: string): Decoder<PatientOption> {
  return (value, path = 'data') => {
    const item = record(value, path);
    const companyId = text(item, 'companyId', path);
    if (companyId !== expectedTenant) fail(`${path}.companyId`);
    return {
      id: text(item, 'id', path),
      companyId,
      name: text(item, 'name', path),
      socialName: nullableText(item, 'socialName', path),
      status: text(item, 'status', path),
    };
  };
}

export const decodePublicBillingLink: Decoder<PublicBillingLink> = (value, path = 'data') => {
  const item = record(value, path);
  return {
    companyName: text(item, 'companyName', path),
    referenceMonth: text(item, 'referenceMonth', path),
    dueDate: text(item, 'dueDate', path),
    currency: text(item, 'currency', path),
    totalCents: integer(item, 'totalCents', path),
    balanceCents: integer(item, 'balanceCents', path),
    status: text(item, 'status', path),
    deepLink: text(item, 'deepLink', path),
  };
};

function decodeMeta(value: unknown, path: string): ApiMeta {
  const item = record(value, path);
  const warningsValue = item['warnings'];
  let warnings: ApiWarning[] | undefined;
  if (warningsValue !== undefined) {
    if (!Array.isArray(warningsValue)) fail(`${path}.warnings`);
    warnings = warningsValue.map((warning, index) =>
      decodeWarning(warning, `${path}.warnings[${index}]`),
    );
  }
  const nextCursor = optionalNullableText(item, 'nextCursor', path);
  const hasMore = optionalBoolean(item, 'hasMore', path);
  if (hasMore && !nextCursor) fail(`${path}.nextCursor`);
  return {
    requestId: text(item, 'requestId', path),
    serverTime: instant(item, 'serverTime', path),
    ...(nextCursor === undefined ? {} : { nextCursor }),
    ...(hasMore === undefined ? {} : { hasMore }),
    ...(warnings === undefined ? {} : { warnings }),
  };
}

function decodeWarning(value: unknown, path: string): ApiWarning {
  if (typeof value === 'string') return value;
  const item = record(value, path);
  const code = optionalText(item, 'code', path);
  const message = optionalText(item, 'message', path);
  const messageKey = optionalText(item, 'messageKey', path);
  const messageParams =
    item['messageParams'] === undefined
      ? undefined
      : record(item['messageParams'], `${path}.messageParams`);
  const details =
    item['details'] === undefined ? undefined : record(item['details'], `${path}.details`);
  if (code === undefined && message === undefined) fail(path);
  return {
    ...(code === undefined ? {} : { code }),
    ...(message === undefined ? {} : { message }),
    ...(messageKey === undefined ? {} : { messageKey }),
    ...(messageParams === undefined ? {} : { messageParams }),
    ...(details === undefined ? {} : { details }),
  };
}

function decodeGoogleProfile(value: unknown, path: string): GoogleAuthProfile {
  const item = record(value, path);
  return {
    name: text(item, 'name', path),
    email: text(item, 'email', path),
    avatarUrl: nullableText(item, 'avatarUrl', path),
  };
}

function decodeSessionCompany(value: unknown, path = 'data.companies[]'): SessionCompany {
  const item = record(value, path);
  const capabilities = record(item['capabilities'], `${path}.capabilities`);
  const permissions = record(item['permissions_matrix'], `${path}.permissions_matrix`);
  const scopes = record(permissions['scopes'], `${path}.permissions_matrix.scopes`);
  return {
    companyId: text(item, 'companyId', path),
    companyName: text(item, 'companyName', path),
    membershipId: text(item, 'membershipId', path),
    defaultLocale: optionalLocale(item, 'defaultLocale', path),
    capabilities: {
      googleCalendarSync: boolean(capabilities, 'googleCalendarSync', `${path}.capabilities`),
      whatsappMessaging: boolean(capabilities, 'whatsappMessaging', `${path}.capabilities`),
      whatsappInbox:
        optionalBoolean(capabilities, 'whatsappInbox', `${path}.capabilities`) ?? false,
      whatsappCampaigns:
        optionalBoolean(capabilities, 'whatsappCampaigns', `${path}.capabilities`) ?? false,
      whatsappAiAgent:
        optionalBoolean(capabilities, 'whatsappAiAgent', `${path}.capabilities`) ?? false,
    },
    permissions_matrix: {
      empresa: actions(permissions['empresa'], `${path}.permissions_matrix.empresa`),
      agenda: actions(permissions['agenda'], `${path}.permissions_matrix.agenda`),
      clientes: actions(permissions['clientes'], `${path}.permissions_matrix.clientes`),
      comunicacoes: optionalActions(
        permissions['comunicacoes'],
        `${path}.permissions_matrix.comunicacoes`,
      ),
      scopes: {
        manageGoogleCalendarConnections: boolean(
          scopes,
          'manageGoogleCalendarConnections',
          `${path}.permissions_matrix.scopes`,
        ),
        manageCommunicationConnections: boolean(
          scopes,
          'manageCommunicationConnections',
          `${path}.permissions_matrix.scopes`,
        ),
      },
    },
  };
}

function locale(object: JsonObject, key: string, path: string): SupportedLocale {
  return enumeration(object, key, ['pt-BR', 'en', 'es'] as const, path);
}

function optionalLocale(object: JsonObject, key: string, path: string): SupportedLocale {
  return object[key] === undefined ? 'pt-BR' : locale(object, key, path);
}

function actions(value: unknown, path: string) {
  const item = record(value, path);
  return {
    read: boolean(item, 'read', path),
    create: boolean(item, 'create', path),
    edit: boolean(item, 'edit', path),
    delete: boolean(item, 'delete', path),
  };
}

function optionalActions(value: unknown, path: string) {
  if (value === undefined) return { read: false, create: false, edit: false, delete: false };
  return actions(value, path);
}

function record(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path);
  return value as JsonObject;
}

function text(object: JsonObject, key: string, path: string): string {
  const value = object[key];
  if (typeof value !== 'string' || value.trim() === '') fail(`${path}.${key}`);
  return value;
}

function stringValue(object: JsonObject, key: string, path: string): string {
  const value = object[key];
  if (typeof value !== 'string') fail(`${path}.${key}`);
  return value;
}

function boolean(object: JsonObject, key: string, path: string): boolean {
  const value = object[key];
  if (typeof value !== 'boolean') fail(`${path}.${key}`);
  return value;
}

function optionalBoolean(object: JsonObject, key: string, path: string): boolean | undefined {
  if (!(key in object)) return undefined;
  return boolean(object, key, path);
}

function integer(object: JsonObject, key: string, path: string): number {
  const value = object[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(`${path}.${key}`);
  return value;
}

function nullable(object: JsonObject, key: string, path: string): unknown | null {
  if (!(key in object) || object[key] === undefined) fail(`${path}.${key}`);
  return object[key];
}

function nullableText(object: JsonObject, key: string, path: string): string | null {
  const value = nullable(object, key, path);
  if (value === null) return null;
  if (typeof value !== 'string') fail(`${path}.${key}`);
  return value;
}

function optionalText(object: JsonObject, key: string, path: string): string | undefined {
  const value = object[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') fail(`${path}.${key}`);
  return value;
}

function optionalNullableText(
  object: JsonObject,
  key: string,
  path: string,
): string | null | undefined {
  if (!(key in object)) return undefined;
  return nullableText(object, key, path);
}

function instant(object: JsonObject, key: string, path: string): string {
  const value = text(object, key, path);
  if (!validInstant(value)) fail(`${path}.${key}`);
  return value;
}

function nullableInstant(object: JsonObject, key: string, path: string): string | null {
  const value = nullableText(object, key, path);
  if (value !== null && !validInstant(value)) fail(`${path}.${key}`);
  return value;
}

function optionalInstant(object: JsonObject, key: string, path: string): string | undefined {
  const value = optionalText(object, key, path);
  if (value !== undefined && !validInstant(value)) fail(`${path}.${key}`);
  return value;
}

function stringArray(object: JsonObject, key: string, path: string): string[] {
  const value = object[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail(`${path}.${key}`);
  }
  return value as string[];
}

function enumeration<const T extends readonly string[]>(
  object: JsonObject,
  key: string,
  allowed: T,
  path: string,
): T[number] {
  const value = object[key];
  if (typeof value !== 'string' || !allowed.includes(value)) fail(`${path}.${key}`);
  return value as T[number];
}

function fail(path: string): never {
  throw new ContractError(path);
}

function validInstant(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
