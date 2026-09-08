export type ApiWarning = string | { code?: string; message?: string };

export interface ApiMeta {
  requestId: string;
  serverTime: string;
  warnings?: ApiWarning[];
}

export interface ObjectEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

export interface CanonicalErrorBody {
  code: string;
  message: string;
  fields: Record<string, string[]>;
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

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  company: {
    name: string;
    legalName: string;
    taxId: string;
    timezone: string;
    currency: string;
    address: AddressInput;
  };
}

export interface LoginInput {
  email: string;
  password: string;
}

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
  capabilities: {
    whatsappMessaging: boolean;
    [key: string]: unknown;
  };
  permissions_matrix: {
    empresa: PermissionActionSet;
    scopes: {
      manageCommunicationConnections: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface BackendSession {
  access_token: string;
  refresh_token?: string;
  user: {
    id: string;
    name: string;
    email?: string;
  };
  companies: SessionCompany[];
}

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

export interface WhatsappConnection {
  id: string;
  companyId: string;
  status: string;
  enabled: boolean;
  businessAccountLabel: string;
  phoneNumberLabel: string;
  templateReadiness: string;
  [key: string]: unknown;
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
