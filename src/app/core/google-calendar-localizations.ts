import type { GoogleCalendarConflict, GoogleCalendarLinkStatus } from './api.models';
import type { TranslationKey } from './i18n.service';

export function googleCalendarLinkMessageKey(status: GoogleCalendarLinkStatus): TranslationKey {
  if (status.outcome === 'success') {
    return status.recommendedAction === 'resume' || status.connectionStatus === 'paused'
      ? 'calendar.link.paused'
      : 'calendar.link.ready';
  }
  if (status.outcome === 'pending') return 'calendar.link.preparing';

  const errorKey = googleCalendarLinkErrorKey(status);
  if (errorKey) return errorKey;

  switch (status.recommendedAction) {
    case 'repair':
      return 'calendar.link.needsRepair';
    case 'reconnect':
      return status.connectionStatus === 'revoked' || status.connectionStatus === 'revoking'
        ? 'calendar.link.notConnected'
        : 'calendar.link.needsReconnect';
    case 'resume':
      return 'calendar.link.paused';
    case 'wait':
      return 'calendar.link.preparing';
    case 'none':
      return 'calendar.link.genericError';
  }
}

function googleCalendarLinkErrorKey(status: GoogleCalendarLinkStatus): TranslationKey | null {
  switch (status.errorCode) {
    case 'google_calendar_scope_missing':
      return 'calendar.link.scopeMissing';
    case 'oauth_access_denied':
      return 'calendar.link.authorizationCancelled';
    case 'oauth_identity_invalid':
      return 'calendar.link.identityInvalid';
    case 'google_calendar_provisioning_failed':
      return status.recommendedAction === 'repair'
        ? 'calendar.link.needsRepair'
        : 'calendar.link.provisioningFailed';
    case 'google_calendar_reconnect_required':
      return 'calendar.link.needsReconnect';
    case 'google_calendar_not_connected':
      return 'calendar.link.notConnected';
    default:
      return null;
  }
}

export function googleCalendarConflictMessageKey(conflict: GoogleCalendarConflict): TranslationKey {
  switch (conflict.type) {
    case 'external_edit_detected':
      return 'calendar.conflict.externalEdit';
    case 'external_delete_detected':
      return 'calendar.conflict.externalDelete';
    default:
      return 'calendar.conflict.unknown';
  }
}
