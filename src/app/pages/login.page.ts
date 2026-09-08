import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiClientService, ApiError, TransportError } from '../core/api-client.service';
import { SiteSessionService } from '../core/site-session.service';
import { SiteShellComponent } from '../shared/site-shell.component';

@Component({
  imports: [ReactiveFormsModule, RouterLink, SiteShellComponent],
  template: `
    <app-site-shell>
      <section class="card narrow form-card">
        <p class="eyebrow">Área autenticada</p>
        <h1>Entre para gerenciar o WhatsApp</h1>
        <p class="muted">Nenhuma credencial é recebida pela URL.</p>

        @if (message()) {
          <div class="notice notice-error" role="alert">{{ message() }}</div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label class="field">
            <span>E-mail</span>
            <input formControlName="email" type="email" autocomplete="email" required />
          </label>
          <label class="field">
            <span>Senha</span>
            <input
              formControlName="password"
              type="password"
              autocomplete="current-password"
              required
            />
          </label>
          <button class="button button-primary button-full" type="submit" [disabled]="pending()">
            {{ pending() ? 'Entrando…' : 'Entrar' }}
          </button>
        </form>
        <p class="form-footnote">Ainda não tem conta? <a routerLink="/register">Criar conta</a></p>
      </section>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiClientService);
  private readonly session = inject(SiteSessionService);
  private readonly router = inject(Router);

  protected readonly pending = signal(false);
  protected readonly message = signal('');
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.pending()) {
      this.form.markAllAsTouched();
      return;
    }
    this.pending.set(true);
    this.message.set('');
    const value = this.form.getRawValue();
    try {
      const response = await firstValueFrom(
        this.api.login({ email: value.email.trim().toLowerCase(), password: value.password }),
      );
      this.session.acceptBackendSession(response.data);
      await this.router.navigateByUrl('/settings/integrations/whatsapp');
    } catch (error) {
      if (error instanceof ApiError) this.message.set(error.message);
      else if (error instanceof TransportError)
        this.message.set('Não foi possível confirmar o login. Tente novamente.');
      else this.message.set('Não foi possível entrar.');
    } finally {
      this.pending.set(false);
    }
  }
}
