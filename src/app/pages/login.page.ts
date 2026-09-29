import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiClientService, ApiError, TransportError } from '../core/api-client.service';
import {
  GoogleAuthFlowService,
  GoogleAuthPopupBlockedError,
} from '../core/google-auth-flow.service';
import { I18nService } from '../core/i18n.service';
import { SiteSessionService } from '../core/site-session.service';
import { SiteShellComponent } from '../shared/site-shell.component';
import { TranslatePipe } from '../shared/translate.pipe';

@Component({
  imports: [RouterLink, SiteShellComponent, TranslatePipe],
  template: `
    <app-site-shell>
      <div class="auth-layout">
        <section class="auth-context" aria-labelledby="login-title">
          <p class="eyebrow">{{ 'login.eyebrow' | t }}</p>
          <h1 id="login-title">{{ 'login.welcome' | t }}</h1>
          <p class="lead">{{ 'login.lead' | t }}</p>
          <ul class="check-list">
            <li>{{ 'login.googleProtected' | t }}</li>
            <li>{{ 'login.noPasswordStored' | t }}</li>
            <li>{{ 'login.calendarSeparate' | t }}</li>
          </ul>
        </section>

        <section class="card auth-card" [attr.aria-label]="'login.cardLabel' | t">
          <div class="auth-card-heading">
            <span class="step-icon" aria-hidden="true">→</span>
            <div>
              <h2>{{ 'login.title' | t }}</h2>
              <p>{{ 'login.sameAccount' | t }}</p>
            </div>
          </div>

          @if (successMessage()) {
            <div class="notice notice-success" role="status">{{ successMessage() }}</div>
          }
          @if (message()) {
            <div class="notice notice-error" role="alert">
              <strong>{{ message() }}</strong>
              @if (messageCode() === 'google_account_not_linked') {
                <p>
                  {{ 'login.identityNotLinked' | t }}
                </p>
              }
            </div>
          }

          <button
            class="button button-google button-full"
            type="button"
            [disabled]="googlePending()"
            [attr.aria-busy]="googlePending()"
            (click)="loginWithGoogle()"
          >
            <img src="/google-g.svg" alt="" width="18" height="18" />
            {{ (googlePending() ? 'login.waitingGoogle' : 'login.continueGoogle') | t }}
          </button>

          <p class="auth-disclaimer">
            {{ 'login.identityOnly' | t }}
          </p>
          <p class="form-footnote">
            {{ 'login.noAccount' | t }}
            <a routerLink="/register">{{ 'login.createWithGoogle' | t }}</a>
          </p>
        </section>
      </div>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiClientService);
  private readonly session = inject(SiteSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly googleAuth = inject(GoogleAuthFlowService);
  private readonly i18n = inject(I18nService);
  private googleAbort?: AbortController;

  protected readonly googlePending = signal(false);
  protected readonly message = signal('');
  protected readonly messageCode = signal('');
  protected readonly successMessage = signal('');

  async ngOnInit(): Promise<void> {
    const historyState = globalThis.history.state as {
      logoutMessage?: unknown;
      logoutWarning?: unknown;
    };
    if (typeof historyState.logoutMessage === 'string') {
      this.successMessage.set(historyState.logoutMessage);
    } else if (typeof historyState.logoutWarning === 'string') {
      this.message.set(historyState.logoutWarning);
    } else if (this.route.snapshot.queryParamMap.get('reason') === 'session-check') {
      this.message.set(this.i18n.translate('login.sessionCheckFailed'));
    } else if (this.route.snapshot.queryParamMap.get('reason') === 'expired') {
      this.message.set(this.i18n.translate('login.sessionExpired'));
    }

    if (await this.session.initialize()) await this.navigateAfterAuthentication();
  }

  protected async loginWithGoogle(): Promise<void> {
    if (this.googlePending()) return;
    this.googleAbort?.abort();
    this.googleAbort = new AbortController();
    this.googlePending.set(true);
    this.message.set('');
    this.messageCode.set('');
    this.successMessage.set('');
    try {
      const flow = await this.googleAuth.start({ intent: 'login' }, this.googleAbort.signal);
      const status = await this.googleAuth.waitForTerminal(flow, this.googleAbort.signal);
      if (status.status !== 'verified') {
        this.message.set(status.message);
        this.messageCode.set(status.errorCode ?? 'google_auth_failed');
        return;
      }
      const response = await firstValueFrom(
        this.api.loginWithGoogle({
          attemptId: flow.authorization.attemptId,
          exchangeToken: flow.authorization.exchangeToken,
        }),
      );
      if (this.googleAbort.signal.aborted) return;
      this.session.acceptAuthenticationSession(response.data);
      await this.navigateAfterAuthentication();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof ApiError) {
        this.message.set(error.message);
        this.messageCode.set(error.code);
      } else if (error instanceof GoogleAuthPopupBlockedError) {
        this.message.set(error.message);
      } else if (error instanceof TransportError) {
        this.message.set(this.i18n.translate('login.confirmFailed'));
      } else {
        this.message.set(this.i18n.translate('login.failed'));
      }
    } finally {
      this.googlePending.set(false);
    }
  }

  ngOnDestroy(): void {
    this.googleAbort?.abort();
  }

  private async navigateAfterAuthentication(): Promise<void> {
    await this.router.navigateByUrl(
      this.session.hasCompanies() ? '/settings/integrations' : '/register?clinic=required',
    );
  }
}
