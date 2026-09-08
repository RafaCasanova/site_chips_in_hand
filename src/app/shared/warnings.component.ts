import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ApiWarning, warningText } from '../core/api.models';

@Component({
  selector: 'app-warnings',
  template: `
    @if (warnings().length) {
      <div class="notice notice-warning" role="status">
        <strong>Concluído com avisos</strong>
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
  protected readonly text = warningText;
}
