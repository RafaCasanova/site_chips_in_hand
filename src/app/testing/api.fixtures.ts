import {
  AgendaProfessionalOption,
  AuthenticationSession,
  GoogleCalendarConnection,
  GoogleCalendarLinkStatus,
  SessionCompany,
  WhatsappConnection,
  WhatsappExternalTemplate,
  WhatsappLinkStatus,
  WhatsappTemplate,
} from '../core/api.models';

export const meta = { requestId: 'request-1', serverTime: '2026-09-09T12:00:00Z' };
export const envelope = <T>(data: T) => ({ data, meta });
export function companyFixture(id = 'company-1'): SessionCompany {
  const actions = () => ({ read: true, create: true, edit: true, delete: true });
  return {
    companyId: id,
    companyName: 'Clínica Teste',
    membershipId: `member-${id}`,
    defaultLocale: 'pt-BR',
    capabilities: {
      whatsappMessaging: true,
      whatsappInbox: false,
      whatsappCampaigns: false,
      whatsappAiAgent: false,
      googleCalendarSync: true,
    },
    permissions_matrix: {
      empresa: actions(),
      agenda: actions(),
      clientes: actions(),
      comunicacoes: actions(),
      scopes: { manageCommunicationConnections: true, manageGoogleCalendarConnections: true },
    },
  };
}
export function sessionFixture(): AuthenticationSession {
  return {
    access_token: 'jwt-test-access-token',
    refresh_token: 'secret-refresh-must-not-persist',
    user: {
      id: 'user-1',
      name: 'Ana Silva',
      email: 'ana@example.com',
      avatarUrl: null,
      preferredLocale: 'pt-BR',
    },
    companies: [companyFixture()],
  };
}
export function professionalFixture(): AgendaProfessionalOption {
  return {
    professionalId: 'professional-1',
    professionalName: 'Ana Silva',
    access: {
      canReadAppointments: true,
      canCreateAppointments: true,
      canEditAppointments: true,
      canDeleteAppointments: true,
      canManageGoogleCalendar: true,
      canAuthorizeGoogleCalendar: true,
      canRevokeGoogleGrantEverywhere: true,
    },
  };
}
export function googleConnectionFixture(): GoogleCalendarConnection {
  return {
    id: 'google-1',
    professionalId: 'professional-1',
    professionalName: 'Ana Silva',
    provider: 'googleCalendar',
    status: 'active',
    accountLabel: 'a•••@gmail.com',
    calendarName: 'Chips — Clínica',
    syncMode: 'chips_wins',
    externalConflictPolicy: 'warn',
    importManualBlocks: true,
    enabled: true,
    requiresReconnect: false,
    syncInProgress: false,
    grantedFeatures: ['dedicatedCalendar', 'importManualBlocks'],
    lastSuccessfulSyncAt: meta.serverTime,
    reconnectReason: null,
    lastErrorCode: null,
  };
}
export function googleStatusFixture(): GoogleCalendarLinkStatus {
  return {
    connectionId: 'google-1',
    outcome: 'success',
    connected: true,
    connectionStatus: 'active',
    accountLabel: 'a•••@gmail.com',
    calendarName: 'Chips — Clínica',
    checkedAt: meta.serverTime,
    message: 'Calendário conectado.',
    errorCode: null,
    retryable: false,
    recommendedAction: 'none',
  };
}
export function whatsappFixture(): WhatsappConnection {
  return {
    id: 'whatsapp-1',
    companyId: 'company-1',
    status: 'active',
    enabled: true,
    businessAccountLabel: 'Cl••••',
    phoneNumberLabel: '+55••••9999',
    coexistenceMode: 'cloud',
    templateReadiness: 'ready',
    qualityRating: 'GREEN',
    messagingLimit: 'TIER_1000',
    lastWebhookAt: null,
    lastSendAt: null,
    lastErrorCode: null,
    createdAt: meta.serverTime,
    updatedAt: meta.serverTime,
  };
}
export function whatsappStatusFixture(): WhatsappLinkStatus {
  return {
    connectionId: 'whatsapp-1',
    outcome: 'success',
    connected: true,
    connectionStatus: 'active',
    phoneNumberLabel: '+55••••9999',
    templateReadiness: 'ready',
    provisioningSteps: [
      'credentials',
      'two_step_verification',
      'system_user_access',
      'credit_line',
      'phone_registration',
      'webhook_subscription',
      'template_sync',
      'activation',
    ].map((code) => ({
      code: code as WhatsappLinkStatus['provisioningSteps'][number]['code'],
      status: code === 'two_step_verification' ? 'skipped' : 'passed',
      attemptCount: code === 'two_step_verification' ? 0 : 1,
      failureCode: null,
      messageKey: 'whatsapp.provisioning.step.' + code,
      messageParams: {},
      startedAt: code === 'two_step_verification' ? null : meta.serverTime,
      completedAt: meta.serverTime,
      updatedAt: meta.serverTime,
    })),
    checkedAt: meta.serverTime,
    message: 'WhatsApp conectado.',
    errorCode: null,
    retryable: false,
    recommendedAction: 'none',
  };
}
export function templateFixture(): WhatsappTemplate {
  return {
    id: 'template-1',
    connectionId: 'whatsapp-1',
    templateType: 'appointmentReminder',
    providerName: 'chips_appointment_reminder',
    language: 'pt_BR',
    category: 'UTILITY',
    version: 1,
    status: 'approved',
    rejectionCode: null,
    current: true,
    createdAt: meta.serverTime,
    updatedAt: meta.serverTime,
  };
}
export function externalTemplateFixture(): WhatsappExternalTemplate {
  return {
    id: 'external-template-1',
    connectionId: 'whatsapp-1',
    providerName: 'clinic_service_follow_up',
    language: 'en_US',
    category: 'UTILITY',
    status: 'approved',
    rejectionCode: null,
    syncedAt: meta.serverTime,
  };
}
export function googleAuthorizationFixture() {
  return {
    attemptId: 'attempt-1',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque',
    exchangeToken: 'x'.repeat(43),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
}
