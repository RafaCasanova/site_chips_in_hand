import type { SupportedLocale } from './i18n.service';

const messages: Record<SupportedLocale, Readonly<Record<string, string>>> = {
  'pt-BR': {
    'error.invalid_credentials': 'E-mail ou senha incorretos.',
    'error.invalid_token': 'Sua sessão é inválida ou expirou.',
    'error.session_revoked': 'Sua sessão não está mais ativa.',
    'error.permission_denied': 'Você não tem permissão para realizar esta ação.',
    'error.capability_disabled': 'Este recurso não está disponível para esta clínica.',
    'error.required_field': 'Preencha os campos obrigatórios.',
    'error.invalid_json': 'Os dados enviados são inválidos.',
    'error.invalid_locale': 'O idioma informado é inválido.',
    'error.resource_not_found': 'Recurso não encontrado.',
    'error.registration_disabled': 'O cadastro está temporariamente indisponível.',
    'error.registration_conflict': 'Já existe uma conta ou clínica com estes dados.',
    'error.identity_link_required':
      'Este e-mail já pertence a uma conta Chips. Confirme a senha existente para vincular o Google e entrar.',
    'error.rate_limited': 'Muitas tentativas. Aguarde e tente novamente.',
    'error.internal_error': 'Não foi possível processar a solicitação.',
    'warning.external_calendar_conflict':
      'O horário também está ocupado no Google Agenda do profissional. O atendimento foi salvo mesmo assim.',
    'warning.google_calendar_not_connected':
      '{professionalName}: o atendimento foi salvo, mas o Google Agenda ainda não está conectado.',
    'warning.whatsapp_templates_pending':
      'Os novos textos serão usados após aprovação pela Meta; a última versão aprovada continua ativa.',
  },
  en: {
    'error.invalid_credentials': 'Incorrect email or password.',
    'error.invalid_token': 'Your session is invalid or has expired.',
    'error.session_revoked': 'Your session is no longer active.',
    'error.permission_denied': 'You do not have permission to perform this action.',
    'error.capability_disabled': 'This feature is not available for this clinic.',
    'error.required_field': 'Complete the required fields.',
    'error.invalid_json': 'The submitted data is invalid.',
    'error.invalid_locale': 'The selected language is invalid.',
    'error.resource_not_found': 'Resource not found.',
    'error.registration_disabled': 'Registration is temporarily unavailable.',
    'error.registration_conflict': 'An account or clinic with these details already exists.',
    'error.identity_link_required':
      'This email already belongs to a Chips account. Confirm the existing password to link Google and sign in.',
    'error.rate_limited': 'Too many attempts. Wait and try again.',
    'error.internal_error': 'We could not process the request.',
    'warning.external_calendar_conflict':
      'This time is also busy in the professional’s Google Calendar. The appointment was saved anyway.',
    'warning.google_calendar_not_connected':
      '{professionalName}: the appointment was saved, but Google Calendar is not connected yet.',
    'warning.whatsapp_templates_pending':
      'The new text will be used after Meta approves it; the last approved version remains active.',
  },
  es: {
    'error.invalid_credentials': 'Correo electrónico o contraseña incorrectos.',
    'error.invalid_token': 'Tu sesión no es válida o ha caducado.',
    'error.session_revoked': 'Tu sesión ya no está activa.',
    'error.permission_denied': 'No tienes permiso para realizar esta acción.',
    'error.capability_disabled': 'Esta función no está disponible para esta clínica.',
    'error.required_field': 'Completa los campos obligatorios.',
    'error.invalid_json': 'Los datos enviados no son válidos.',
    'error.invalid_locale': 'El idioma seleccionado no es válido.',
    'error.resource_not_found': 'Recurso no encontrado.',
    'error.registration_disabled': 'El registro no está disponible temporalmente.',
    'error.registration_conflict': 'Ya existe una cuenta o clínica con estos datos.',
    'error.identity_link_required':
      'Este correo ya pertenece a una cuenta de Chips. Confirma la contraseña existente para vincular Google e ingresar.',
    'error.rate_limited': 'Demasiados intentos. Espera e inténtalo de nuevo.',
    'error.internal_error': 'No pudimos procesar la solicitud.',
    'warning.external_calendar_conflict':
      'El horario también está ocupado en Google Calendar del profesional. La cita se guardó de todos modos.',
    'warning.google_calendar_not_connected':
      '{professionalName}: la cita se guardó, pero Google Calendar aún no está conectado.',
    'warning.whatsapp_templates_pending':
      'Los textos nuevos se usarán cuando Meta los apruebe; la última versión aprobada sigue activa.',
  },
};

export function translateCanonicalMessage(
  locale: SupportedLocale,
  key: string,
  parameters: Readonly<Record<string, unknown>>,
  fallback: string,
): string {
  let template = messages[locale][key] ?? messages['pt-BR'][key];
  if (!template && key.startsWith('error.')) {
    template =
      locale === 'en'
        ? 'We could not complete the request.'
        : locale === 'es'
          ? 'No pudimos completar la solicitud.'
          : fallback;
  }
  if (!template && key.startsWith('field.')) {
    template =
      locale === 'en'
        ? 'Review the {field} field.'
        : locale === 'es'
          ? 'Revisa el campo {field}.'
          : fallback;
  }
  template ||= fallback;
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, name: string) => {
    const value = parameters[name];
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : match;
  });
}
