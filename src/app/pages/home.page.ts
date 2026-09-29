import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteShellComponent } from '../shared/site-shell.component';
import { TranslatePipe } from '../shared/translate.pipe';

@Component({
  imports: [RouterLink, SiteShellComponent, TranslatePipe],
  template: `
    <app-site-shell>
      <section class="hero">
        <div class="hero-copy-block">
          <p class="eyebrow"><span aria-hidden="true"></span> {{ 'home.eyebrow' | t }}</p>
          <h1>
            {{ 'home.headline' | t }} <em>{{ 'home.headlineEmphasis' | t }}</em>
          </h1>
          <p class="hero-copy">
            {{ 'home.lead' | t }}
          </p>
          <div class="button-row hero-actions">
            <a class="button button-primary" routerLink="/register">{{ 'home.startGoogle' | t }}</a>
            <a class="button button-secondary" routerLink="/login">{{ 'home.haveAccount' | t }}</a>
          </div>
          <p class="hero-note">
            <span aria-hidden="true">✓</span> {{ 'home.noPassword' | t }}
            <span aria-hidden="true">✓</span> {{ 'home.integrationsControlled' | t }}
          </p>
        </div>

        <div class="hero-product" [attr.aria-label]="'home.previewLabel' | t">
          <div class="product-window">
            <div class="product-window-bar">
              <span class="product-window-label"
                ><i aria-hidden="true"></i> {{ 'home.todaySchedule' | t }}</span
              >
              <span class="live-status"><i aria-hidden="true"></i> {{ 'home.synced' | t }}</span>
            </div>
            <div class="product-content">
              <div class="product-title">
                <div>
                  <small>{{ 'home.exampleDate' | t }}</small
                  ><strong>{{ 'home.organizedMorning' | t }}</strong>
                </div>
                <span class="schedule-count"><strong>6</strong> {{ 'home.appointments' | t }}</span>
              </div>

              <div class="schedule-preview" aria-hidden="true">
                <div class="schedule-row">
                  <time>08:00</time>
                  <article class="appointment-card appointment-green">
                    <span class="appointment-avatar">AM</span>
                    <span
                      ><strong>Ana Martins</strong
                      ><small>{{ 'home.physiotherapyInPerson' | t }}</small></span
                    >
                    <i>50 min</i>
                  </article>
                </div>

                <div class="schedule-row schedule-row-group">
                  <time>09:00</time>
                  <div class="parallel-appointments">
                    <article class="appointment-card appointment-sage">
                      <span class="appointment-avatar">RC</span>
                      <span
                        ><strong>Rafael Costa</strong><small>{{ 'home.care' | t }}</small></span
                      >
                    </article>
                    <article class="appointment-card appointment-cream">
                      <span class="appointment-avatar">LS</span>
                      <span
                        ><strong>Luiza Silva</strong><small>{{ 'home.care' | t }}</small></span
                      >
                    </article>
                  </div>
                  <span class="parallel-label">{{ 'home.patientsAtTime' | t }}</span>
                </div>

                <div class="schedule-row">
                  <time>10:30</time>
                  <article class="appointment-card appointment-outline">
                    <span class="appointment-avatar">MC</span>
                    <span
                      ><strong>Marina Castro</strong
                      ><small>{{ 'home.psychologyOnline' | t }}</small></span
                    >
                    <i>50 min</i>
                  </article>
                </div>
              </div>

              <div class="product-security">
                <span><i aria-hidden="true"></i> {{ 'home.googleConnected' | t }}</span>
                <span><i aria-hidden="true"></i> {{ 'home.remindersActive' | t }}</span>
              </div>
            </div>
          </div>
          <span class="floating-feedback" aria-hidden="true"
            ><i>✓</i> {{ 'home.timeConfirmed' | t }}</span
          >
          <span class="hero-orbit orbit-one" aria-hidden="true"></span>
          <span class="hero-orbit orbit-two" aria-hidden="true"></span>
        </div>
      </section>

      <section class="trust-strip" [attr.aria-label]="'home.productPrinciples' | t">
        <span><i>01</i> {{ 'home.googleIdentity' | t }}</span>
        <span><i>02</i> {{ 'home.schedulePerProfessional' | t }}</span>
        <span><i>03</i> {{ 'home.officialWhatsapp' | t }}</span>
        <span><i>04</i> {{ 'home.backendSecurity' | t }}</span>
      </section>

      <section class="landing-section">
        <div class="landing-heading">
          <p class="eyebrow">{{ 'home.integrationsEyebrow' | t }}</p>
          <h2>{{ 'home.connectOnlyNeeded' | t }}</h2>
          <p>
            {{ 'home.authorizationDescription' | t }}
          </p>
        </div>
        <div class="feature-grid">
          <article>
            <span class="feature-number">01</span>
            <div class="integration-logo google-logo">
              <img src="/google-g.svg" alt="" width="22" height="22" />
            </div>
            <h3>{{ 'shell.googleCalendar' | t }}</h3>
            <p>
              {{ 'home.googleDescription' | t }}
            </p>
          </article>
          <article>
            <span class="feature-number">02</span>
            <div class="integration-logo whatsapp-logo">W</div>
            <h3>WhatsApp Business</h3>
            <p>
              {{ 'home.whatsappDescription' | t }}
            </p>
          </article>
          <article>
            <span class="feature-number">03</span>
            <div class="integration-logo neutral-logo" aria-hidden="true">∞</div>
            <h3>{{ 'home.continuity' | t }}</h3>
            <p>
              {{ 'home.continuityDescription' | t }}
            </p>
          </article>
        </div>
      </section>

      <section class="security-section">
        <div class="security-art" aria-hidden="true">
          <div class="shield-shape">C</div>
          <span>Google</span><span>Meta</span><span>Chips</span>
        </div>
        <div>
          <p class="eyebrow">{{ 'home.securityEyebrow' | t }}</p>
          <h2>{{ 'home.securityTitle' | t }}</h2>
          <div class="security-list">
            <div>
              <span>✓</span>
              <p>
                <strong>{{ 'home.noFrontendSecret' | t }}</strong
                >{{ 'home.noFrontendSecretDescription' | t }}
              </p>
            </div>
            <div>
              <span>✓</span>
              <p>
                <strong>{{ 'home.tenantConfirmed' | t }}</strong
                >{{ 'home.tenantConfirmedDescription' | t }}
              </p>
            </div>
            <div>
              <span>✓</span>
              <p>
                <strong>{{ 'home.noAssumedSuccess' | t }}</strong
                >{{ 'home.noAssumedSuccessDescription' | t }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="landing-cta">
        <div>
          <p class="eyebrow">{{ 'home.firstSteps' | t }}</p>
          <h2>{{ 'home.createClinic' | t }}</h2>
        </div>
        <a class="button button-light" routerLink="/register">{{ 'login.createWithGoogle' | t }}</a>
      </section>
    </app-site-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {}
