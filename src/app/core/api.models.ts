import type { SupportedLocale } from './i18n.service';

export type ApiWarning =
  | string
  | {
      code?: string;
      message?: string;
      messageKey?: string;
      messageParams?: Record<string, unknown>;
      details?: Record<string, unknown>;
    };

export interface MessageReference {
  key: string;
  params: Record<string, unknown>;
}

export interface ApiMeta {
  requestId: string;
  serverTime: string;
  nextCursor?: string | null;
  hasMore?: boolean;
  warnings?: ApiWarning[];
}

export interface ObjectEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

export interface CanonicalErrorBody {
  code: string;
  message: string;
  messageKey: string;
  messageParams: Record<string, unknown>;
  fields: Record<string, string[]>;
  fieldMessages: Record<string, MessageReference[]>;
  retryable: boolean;
  requestId: string;
  details: Record<string, unknown>;
}

export interface ErrorEnvelope {
  error: CanonicalErrorBody;
}

export interface AddressInput {
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  country: string;
}

export interface CompanyRegistrationInput {
  name: string;
  legalName: string;
  taxId: string;
  timezone: string;
  currency: string;
  defaultLocale: SupportedLocale;
  address: AddressInput;
}

export type GoogleAuthIntent = 'login' | 'register' | 'join';
export type GoogleOwnerMode = 'admin' | 'adminProfessional';
export type GoogleCalendarAccess = 'notRequested' | 'granted' | 'declined' | 'unavailable';

export interface CompanyCreateInput extends CompanyRegistrationInput {
  ownerMode: GoogleOwnerMode;
  googleCalendarAuthorization?: GoogleAuthAttemptInput;
}

export interface CompanyCreationResult {
  id: string;
}

export interface GoogleAuthAuthorizeInput {
  intent: GoogleAuthIntent;
  ownerMode?: GoogleOwnerMode;
  inviteCode?: string;
  requestCalendar?: boolean;
}

export interface GoogleAuthAuthorization {
  attemptId: string;
  authorizationUrl: string;
  exchangeToken: string;
  expiresAt: string;
}

export interface GoogleAuthAttemptInput {
  attemptId: string;
  exchangeToken: string;
}

export interface GoogleAuthProfile {
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface GoogleAuthStatus {
  attemptId: string;
  intent: GoogleAuthIntent;
  status: 'pending' | 'verified' | 'failed';
  expiresAt: string;
  profile: GoogleAuthProfile | null;
  errorCode: string | null;
  message: string;
  calendarAccess: GoogleCalendarAccess;
}

export interface GoogleAuthRegisterInput extends GoogleAuthAttemptInput {
  preferredLocale: SupportedLocale;
  company: CompanyRegistrationInput;
}

export interface GoogleAccountInput extends GoogleAuthAttemptInput {
  preferredLocale: SupportedLocale;
}

export interface GoogleIdentityLinkInput extends GoogleAuthAttemptInput {
  password: string;
}

export interface UserPreferences {
  preferredLocale: SupportedLocale;
  updatedAt: string;
}

export interface InvitePreview {
  companyId: string;
  companyName: string;
  groupName: string;
  isProfessional: boolean;
  googleCalendarAvailable: boolean;
  expiresAt: string;
}

export interface AgendaProfessionalAccess {
  canReadAppointments: boolean;
  canCreateAppointments: boolean;
  canEditAppointments: boolean;
  canDeleteAppointments: boolean;
  canManageGoogleCalendar: boolean;
  canAuthorizeGoogleCalendar: boolean;
  canRevokeGoogleGrantEverywhere: boolean;
}

export interface AgendaProfessionalOption {
  professionalId: string;
  professionalName: string;
  access: AgendaProfessionalAccess;
}

export interface ProfessionalInput {
  clientReference: string;
  memberId: string;
  displayName: string;
  registration: { council: string; number: string; state: string };
  specialties: string[];
  unitIds: string[];
  roomIds: string[];
  serviceIds: string[];
  allowedModalities: string[];
  defaultSessionDurationMinutes: number;
  calendarColor: string;
  signatureUrl: string | null;
  acceptsOnlineBooking: boolean;
  commissionBasisPoints: number;
  active: boolean;
}

export interface Professional {
  id: string;
  memberId: string;
  displayName: string;
  active: boolean;
}

export type GoogleCalendarConnectionStatus =
  | 'pending_oauth'
  | 'provisioning'
  | 'active'
  | 'degraded'
  | 'reconnect_required'
  | 'paused'
  | 'revoking'
  | 'revoked';

export type GoogleCalendarConflictPolicy = 'off' | 'warn' | 'block';

export interface GoogleCalendarAuthorization {
  connectionId: string;
  authorizationUrl: string;
  expiresAt: string;
}

export interface GoogleCalendarConnection {
  id: string;
  professionalId: string;
  professionalName?: string;
  provider: 'googleCalendar';
  status: GoogleCalendarConnectionStatus;
  accountLabel: string;
  calendarName: string;
  syncMode: 'chips_wins';
  externalConflictPolicy: GoogleCalendarConflictPolicy;
  importManualBlocks: boolean;
  enabled: boolean;
  requiresReconnect: boolean;
  syncInProgress: boolean;
  grantedFeatures: string[];
  lastSuccessfulSyncAt: string | null;
  reconnectReason: string | null;
  lastErrorCode: string | null;
}

export interface GoogleCalendarConnectionPatch {
  enabled?: boolean;
  externalConflictPolicy?: GoogleCalendarConflictPolicy;
  importManualBlocks?: boolean;
}

export type GoogleRecommendedAction = 'none' | 'wait' | 'reconnect' | 'repair' | 'resume';

export interface GoogleCalendarLinkStatus {
  connectionId: string;
  outcome: 'pending' | 'success' | 'error';
  connected: boolean;
  connectionStatus: GoogleCalendarConnectionStatus;
  accountLabel: string;
  calendarName: string;
  checkedAt: string;
  message: string;
  errorCode: string | null;
  retryable: boolean;
  recommendedAction: GoogleRecommendedAction;
}

export interface GoogleCalendarConflict {
  id: string;
  connectionId: string;
  appointmentId?: string;
  type: string;
  status: 'open' | 'restoring' | 'resolved';
  resolution?: string;
  message: string;
  detectedAt: string;
  resolvedAt?: string;
}

export type GoogleCalendarConflictResolution = 'retry_restore' | 'acknowledge';

export interface PermissionActionSet {
  read: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export interface SessionCompany {
  companyId: string;
  companyName: string;
  membershipId: string;
  defaultLocale: SupportedLocale;
  capabilities: {
    googleCalendarSync: boolean;
    whatsappMessaging: boolean;
    whatsappInbox: boolean;
    whatsappCampaigns: boolean;
    whatsappAiAgent: boolean;
  };
  permissions_matrix: {
    empresa: PermissionActionSet;
    agenda: PermissionActionSet;
    clientes: PermissionActionSet;
    comunicacoes: PermissionActionSet;
    scopes: {
      manageGoogleCalendarConnections: boolean;
      manageCommunicationConnections: boolean;
    };
  };
}

export interface SessionProjection {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    preferredLocale: SupportedLocale;
  };
  companies: SessionCompany[];
}

export interface AuthenticationSession extends SessionProjection {
  access_token: string;
  refresh_token?: string;
  selectedCompanyId?: string;
}

export type BackendSession = AuthenticationSession;

export interface WhatsappAuthorization {
  connectionId: string;
  appId: string;
  configurationId: string;
  sdkVersion: string;
  sessionToken: string;
  expiresAt: string;
}

export interface WhatsappCompleteInput {
  sessionToken: string;
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

export type WhatsappConnectionStatus =
  | 'pending_signup'
  | 'provisioning'
  | 'active'
  | 'degraded'
  | 'reconnect_required'
  | 'paused'
  | 'revoking'
  | 'revoked';

export interface WhatsappConnection {
  id: string;
  companyId: string;
  status: WhatsappConnectionStatus;
  enabled: boolean;
  businessAccountLabel: string;
  phoneNumberLabel: string;
  coexistenceMode: string;
  templateReadiness: 'pending' | 'ready' | 'degraded';
  qualityRating: string | null;
  messagingLimit: string | null;
  lastWebhookAt: string | null;
  lastSendAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WhatsappProvisioningStepCode =
  | 'credentials'
  | 'two_step_verification'
  | 'system_user_access'
  | 'credit_line'
  | 'phone_registration'
  | 'webhook_subscription'
  | 'template_sync'
  | 'activation';

export type WhatsappProvisioningStepStatus =
  'pending' | 'running' | 'passed' | 'skipped' | 'failed' | 'not_available';

export interface WhatsappProvisioningStep {
  code: WhatsappProvisioningStepCode;
  status: WhatsappProvisioningStepStatus;
  attemptCount: number;
  failureCode: string | null;
  messageKey: string;
  messageParams: Readonly<Record<string, unknown>>;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface WhatsappLinkStatus {
  connectionId: string;
  outcome: 'pending' | 'success' | 'error';
  connected: boolean;
  connectionStatus: WhatsappConnectionStatus;
  phoneNumberLabel: string;
  templateReadiness: 'pending' | 'ready' | 'degraded';
  provisioningSteps: WhatsappProvisioningStep[];
  checkedAt: string;
  message: string;
  errorCode: string | null;
  retryable: boolean;
  recommendedAction: 'none' | 'wait' | 'resume' | 'repair' | 'reconnect';
}

export type WhatsappTemplateType =
  | 'appointmentReminder'
  | 'appointmentRescheduled'
  | 'appointmentCancelled'
  | 'billingReminder'
  | 'billingDueDate'
  | 'billingOverdue';

export interface WhatsappTemplate {
  id: string;
  connectionId: string;
  templateType: WhatsappTemplateType;
  providerName: string;
  language: string;
  category: string;
  version: number;
  status: 'pending' | 'approved' | 'rejected' | 'paused' | 'disabled' | 'unknown';
  rejectionCode: string | null;
  current: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsappExternalTemplate {
  id: string;
  connectionId: string;
  providerName: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | 'UNKNOWN';
  status: 'pending' | 'approved' | 'rejected' | 'paused' | 'disabled' | 'unknown';
  rejectionCode: string | null;
  syncedAt: string;
}

export interface WhatsappTestReceipt {
  id: string;
  status: string;
  recipientLabel: string;
  queuedAt: string;
}

export interface PatientOption {
  id: string;
  companyId: string;
  name: string;
  socialName: string | null;
  status: string;
}

export interface PublicBillingLink {
  companyName: string;
  referenceMonth: string;
  dueDate: string;
  currency: string;
  totalCents: number;
  balanceCents: number;
  status: string;
  deepLink: string;
}

export function warningText(warning: ApiWarning): string {
  if (typeof warning === 'string') return warning;
  return warning.message || warning.code || 'A operação foi concluída com um aviso.';
}
