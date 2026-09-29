import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ApiWarning } from '../core/api.models';
import { I18nService } from '../core/i18n.service';
import { TranslatePipe } from './translate.pipe';

@Component({
  selector: 'app-warnings',
  imports: [TranslatePipe],
  template: `
    @if (warnings().length) {
      <div class="notice notice-warning" role="status">
        <strong>{{ 'warnings.completed' | t }}</strong>
        <ul>
          @for (warning of warnings(); track $index) {
            <li>{{ text(warning) }}</li>
          }
        </ul>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarningsComponent {
  readonly warnings = input<ApiWarning[]>([]);
  private readonly i18n = inject(I18nService);

  protected text(warning: ApiWarning): string {
    if (typeof warning === 'string') return warning;
    const fallback = warning.message || warning.code || this.i18n.translate('core.warningFallback');
    const key = warning.messageKey || (warning.code ? `warning.${warning.code}` : '');
    const params =
      warning.messageParams ||
      (warning.code === 'google_calendar_not_connected' &&
      typeof warning.details?.['professionalName'] === 'string'
        ? { professionalName: warning.details['professionalName'] }
        : {});
    return key ? this.i18n.translateMessage(key, params, fallback) : fallback;
  }
}
