import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiClientService, ApiError, TransportError } from '../core/api-client.service';
import { ApiWarning, RegisterInput } from '../core/api.models';
import { SiteSessionService } from '../core/site-session.service';
import { SiteShellComponent } from '../shared/site-shell.component';

@Component({
  imports: [ReactiveFormsModule, RouterLink, SiteShellComponent],
  template: `
    <app-site-shell>
      <section class="card form-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Nova clínica</p>
            <h1>Crie sua conta</h1>
            <p class="muted">Os dados são enviados diretamente ao backend Chips in Hand.</p>
          </div>
          <a routerLink="/login">Já tenho conta</a>
        </div>

        @if (message()) {
          <div class="notice notice-error" role="alert">
            <strong>{{ message() }}</strong>
            @if (uncertain()) {
              <p>
                Para evitar uma clínica duplicada, não reenvie o cadastro agora. Tente entrar com os
                mesmos dados.
              </p>
              <a routerLink="/login">Ir para o login</a>
            }
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <fieldset>
            <legend>Responsável</legend>
            <div class="form-grid">
              <label class="field field-wide">
                <span>Nome completo</span>
                <input formControlName="name" autocomplete="name" required />
                @if (fieldMessage('name')) {
                  <small class="field-error">{{ fieldMessage('name') }}</small>
                }
              </label>
              <label class="field">
                <span>E-mail</span>
                <input formControlName="email" type="email" autocomplete="email" required />
                @if (fieldMessage('email')) {
                  <small class="field-error">{{ fieldMessage('email') }}</small>
                }
              </label>
              <label class="field">
                <span>Senha</span>
                <input
                  formControlName="password"
                  type="password"
                  autocomplete="new-password"
                  minlength="8"
                  required
                />
                <small>Use pelo menos 8 caracteres.</small>
                @if (fieldMessage('password')) {
                  <small class="field-error">{{ fieldMessage('password') }}</small>
                }
              </label>
            </div>
          </fieldset>

          <fieldset formGroupName="company">
            <legend>Clínica</legend>
            <div class="form-grid">
              <label class="field">
                <span>Nome da clínica</span>
                <input formControlName="name" autocomplete="organization" required />
              </label>
              <label class="field">
                <span>Razão social</span>
                <input formControlName="legalName" required />
              </label>
              <label class="field">
                <span>CNPJ ou documento fiscal</span>
                <input formControlName="taxId" inputmode="numeric" required />
              </label>
              <label class="field">
                <span>Fuso horário</span>
                <select formControlName="timezone" required>
                  <option value="America/Sao_Paulo">Brasília — America/Sao_Paulo</option>
                </select>
              </label>
              <label class="field">
                <span>Moeda</span>
                <select formControlName="currency" required>
                  <option value="BRL">Real brasileiro (BRL)</option>
                </select>
              </label>
            </div>

            <details>
              <summary>Endereço da clínica</summary>
              <div class="form-grid address-grid" formGroupName="address">
                <label class="field">
                  <span>CEP</span>
                  <input formControlName="zipCode" inputmode="numeric" autocomplete="postal-code" />
                </label>
                <label class="field field-wide">
                  <span>Logradouro</span>
                  <input formControlName="street" autocomplete="address-line1" />
                </label>
                <label class="field">
                  <span>Número</span>
                  <input formControlName="number" />
                </label>
                <label class="field">
                  <span>Complemento</span>
                  <input formControlName="complement" autocomplete="address-line2" />
                </label>
                <label class="field">
                  <span>Bairro</span>
                  <input formControlName="district" />
                </label>
                <label class="field">
                  <span>Cidade</span>
                  <input formControlName="city" autocomplete="address-level2" />
                </label>
                <label class="field">
                  <span>UF</span>
                  <input formControlName="state" maxlength="2" autocomplete="address-level1" />
                </label>
                <label class="field">
                  <span>País</span>
                  <input formControlName="country" maxlength="2" autocomplete="country" />
                </label>
              </div>
            </details>
          </fieldset>

          <button
            class="button button-primary button-full"
            type="submit"
            [disabled]="pending() || uncertain()"
          >
            {{ pending() ? 'Criando conta…' : 'Criar conta e clínica' }}
          </button>
        </form>
      </section>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiClientService);
  private readonly session = inject(SiteSessionService);
  private readonly router = inject(Router);

  protected readonly pending = signal(false);
  protected readonly uncertain = signal(false);
  protected readonly message = signal('');
  protected readonly apiFields = signal<Record<string, string[]>>({});
  protected readonly warnings = signal<ApiWarning[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(1024)]],
    company: this.fb.nonNullable.group({
      name: ['', [Validators.required]],
      legalName: ['', [Validators.required]],
      taxId: ['', [Validators.required]],
      timezone: ['America/Sao_Paulo', [Validators.required]],
      currency: ['BRL', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]],
      address: this.fb.nonNullable.group({
        zipCode: [''],
        street: [''],
        number: [''],
        complement: [''],
        district: [''],
        city: [''],
        state: [''],
        country: ['BR'],
      }),
    }),
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.pending() || this.uncertain()) {
      this.form.markAllAsTouched();
      return;
    }
    this.pending.set(true);
    this.message.set('');
    this.apiFields.set({});

    const value = this.form.getRawValue();
    const input: RegisterInput = {
      name: value.name.trim(),
      email: value.email.trim().toLowerCase(),
      password: value.password,
      company: {
        name: value.company.name.trim(),
        legalName: value.company.legalName.trim(),
        taxId: value.company.taxId.trim(),
        timezone: value.company.timezone,
        currency: value.company.currency,
        address: {
          zipCode: value.company.address.zipCode.trim(),
          street: value.company.address.street.trim(),
          number: value.company.address.number.trim(),
          complement: value.company.address.complement.trim() || null,
          district: value.company.address.district.trim(),
          city: value.company.address.city.trim(),
          state: value.company.address.state.trim().toUpperCase(),
          country: value.company.address.country.trim().toUpperCase(),
        },
      },
    };

    try {
      const response = await firstValueFrom(this.api.register(input));
      this.session.acceptBackendSession(response.data);
      this.warnings.set(response.meta.warnings ?? []);
      await this.router.navigateByUrl('/settings/integrations/whatsapp', {
        state: { registrationWarnings: this.warnings() },
      });
    } catch (error) {
      if (error instanceof TransportError) {
        this.uncertain.set(true);
        this.message.set('O resultado do cadastro ficou incerto.');
      } else if (error instanceof ApiError) {
        this.apiFields.set(error.fields);
        this.message.set(error.message);
      } else {
        this.message.set('Não foi possível criar a conta.');
      }
    } finally {
      this.pending.set(false);
    }
  }

  protected fieldMessage(name: string): string {
    const backend = this.apiFields()[name]?.join(' ') ?? '';
    if (backend) return backend;
    const control = this.form.get(name);
    if (!control?.touched || !control.errors) return '';
    if (control.errors['required']) return 'Campo obrigatório.';
    if (control.errors['email']) return 'Informe um e-mail válido.';
    if (control.errors['minlength']) return 'Use pelo menos 8 caracteres.';
    return 'Confira este campo.';
  }
}
