import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiClientService } from '../core/api-client.service';
import { PublicBillingLink } from '../core/api.models';
import { I18nService } from '../core/i18n.service';
import { TranslatePipe } from '../shared/translate.pipe';

@Component({
  imports: [TranslatePipe],
  template: `
    <main class="public-page">
      <section class="public-brand" aria-label="Chips in Hand">
        <span class="brand-mark" aria-hidden="true">C</span>
        <strong>Chips in Hand</strong>
      </section>

      <section class="card billing-card" aria-live="polite">
        @if (loading()) {
          <div class="loading-state">
            <span class="spinner" aria-hidden="true"></span>
            <h1>{{ 'billing.loadingTitle' | t }}</h1>
            <p>{{ 'billing.loadingDescription' | t }}</p>
          </div>
        } @else if (billing(); as item) {
          <p class="eyebrow">{{ 'billing.shared' | t }}</p>
          <h1>{{ item.companyName }}</h1>
          <div class="amount-block">
            <span>{{ 'billing.currentBalance' | t }}</span>
            <strong>{{ money(item.balanceCents, item.currency) }}</strong>
          </div>
          <dl class="billing-details">
            <div>
              <dt>{{ 'billing.referenceMonth' | t }}</dt>
              <dd>{{ referenceMonth(item.referenceMonth) }}</dd>
            </div>
            <div>
              <dt>{{ 'billing.dueDate' | t }}</dt>
              <dd>{{ date(item.dueDate) }}</dd>
            </div>
            <div>
              <dt>{{ 'billing.total' | t }}</dt>
              <dd>{{ money(item.totalCents, item.currency) }}</dd>
            </div>
            <div>
              <dt>{{ 'billing.status' | t }}</dt>
              <dd>
                <span class="status-pill">{{ status(item.status) }}</span>
              </dd>
            </div>
          </dl>
          @if (safeDeepLink(item.deepLink); as deepLink) {
            <a class="button button-primary button-full" [href]="deepLink" rel="noreferrer">{{
              'billing.openApp' | t
            }}</a>
          }
          <p class="privacy-note">
            {{ 'billing.privacy' | t }}
          </p>
        } @else {
          <div class="empty-state" role="status">
            <div class="empty-icon" aria-hidden="true">!</div>
            <h1>{{ 'billing.unavailable' | t }}</h1>
            <p>{{ 'billing.unavailableDescription' | t }}</p>
            <p>{{ 'billing.requestNew' | t }}</p>
          </div>
        }
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillingPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiClientService);
  private readonly i18n = inject(I18nService);

  protected readonly loading = signal(true);
  protected readonly billing = signal<PublicBillingLink | null>(null);

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token')?.trim() ?? '';
    if (!token) {
      this.loading.set(false);
      return;
    }
    try {
      const response = await firstValueFrom(this.api.getPublicBillingLink(token));
      this.billing.set(response.data);
    } catch {
      this.billing.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  protected money(cents: number, currency: string): string {
    return this.i18n.formatCurrency(cents, currency);
  }

  protected date(value: string): string {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.valueOf())) return value;
    return this.i18n.formatDate(parsed, { timeZone: 'UTC' });
  }

  protected referenceMonth(value: string): string {
    if (!/^\d{4}-\d{2}$/.test(value)) return value;
    const [year, month] = value.split('-').map(Number);
    return this.i18n.formatDate(new Date(Date.UTC(year, month - 1, 1)), {
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  protected status(value: string): string {
    const labels = {
      issued: 'billing.status.issued',
      partially_paid: 'billing.status.partiallyPaid',
      paid: 'billing.status.paid',
      overdue: 'billing.status.overdue',
      cancelled: 'billing.status.cancelled',
    } as const;
    const key = labels[value as keyof typeof labels] ?? 'billing.status.updated';
    return this.i18n.translate(key);
  }

  protected safeDeepLink(value: string): string | null {
    try {
      const url = new URL(value);
      return url.protocol === 'chipsinhand:' ? value : null;
    } catch {
      return null;
    }
  }
}
