import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiClientService } from '../core/api-client.service';
import { PublicBillingLink } from '../core/api.models';

@Component({
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
            <h1>Consultando cobrança…</h1>
            <p>Estamos validando este link com segurança.</p>
          </div>
        } @else if (billing(); as item) {
          <p class="eyebrow">Cobrança compartilhada</p>
          <h1>{{ item.companyName }}</h1>
          <div class="amount-block">
            <span>Saldo atual</span>
            <strong>{{ money(item.balanceCents, item.currency) }}</strong>
          </div>
          <dl class="billing-details">
            <div>
              <dt>Competência</dt>
              <dd>{{ referenceMonth(item.referenceMonth) }}</dd>
            </div>
            <div>
              <dt>Vencimento</dt>
              <dd>{{ date(item.dueDate) }}</dd>
            </div>
            <div>
              <dt>Valor total</dt>
              <dd>{{ money(item.totalCents, item.currency) }}</dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd>
                <span class="status-pill">{{ status(item.status) }}</span>
              </dd>
            </div>
          </dl>
          @if (safeDeepLink(item.deepLink); as deepLink) {
            <a class="button button-primary button-full" [href]="deepLink" rel="noreferrer"
              >Abrir no aplicativo</a
            >
          }
          <p class="privacy-note">
            Esta página mostra somente os dados essenciais fornecidos pela clínica.
          </p>
        } @else {
          <div class="empty-state" role="status">
            <div class="empty-icon" aria-hidden="true">!</div>
            <h1>Link indisponível</h1>
            <p>Este link é inválido, expirou ou não está mais disponível.</p>
            <p>Solicite um novo link diretamente à clínica.</p>
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
    const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'BRL';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: safeCurrency }).format(
      cents / 100,
    );
  }

  protected date(value: string): string {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.valueOf())) return value;
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(parsed);
  }

  protected referenceMonth(value: string): string {
    if (!/^\d{4}-\d{2}$/.test(value)) return value;
    const [year, month] = value.split('-');
    return `${month}/${year}`;
  }

  protected status(value: string): string {
    const labels: Record<string, string> = {
      issued: 'Em aberto',
      partially_paid: 'Parcialmente paga',
      paid: 'Paga',
      overdue: 'Vencida',
      cancelled: 'Cancelada',
    };
    return labels[value] ?? 'Atualizada';
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
