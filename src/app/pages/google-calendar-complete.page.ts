import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { TranslatePipe } from '../shared/translate.pipe';

@Component({
  imports: [TranslatePipe],
  template: `
    <main class="public-page">
      <section class="card narrow empty-state">
        <span class="empty-icon" aria-hidden="true">↻</span>
        <h1>{{ 'callback.calendarReturnReceived' | t }}</h1>
        <p class="muted">{{ 'callback.calendarReturnDescription' | t }}</p>
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleCalendarCompletePage implements OnInit {
  private readonly window = inject(DOCUMENT).defaultView;

  ngOnInit(): void {
    const window = this.window;
    if (!window) return;
    window.opener?.postMessage({ type: 'chips.google-calendar.complete' }, window.location.origin);
    window.setTimeout(() => window.close(), 350);
  }
}
