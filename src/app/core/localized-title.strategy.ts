import { effect, inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { I18nService, isTranslationKey, TranslationKey } from './i18n.service';

@Injectable()
export class LocalizedTitleStrategy extends TitleStrategy {
  private readonly documentTitle = inject(Title);
  private readonly i18n = inject(I18nService);
  private activeKey?: TranslationKey;

  constructor() {
    super();
    effect(() => {
      this.i18n.locale();
      if (this.activeKey) this.documentTitle.setTitle(this.i18n.translate(this.activeKey));
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);
    if (!title) return;
    if (isTranslationKey(title)) {
      this.activeKey = title;
      this.documentTitle.setTitle(this.i18n.translate(title));
      return;
    }
    this.activeKey = undefined;
    this.documentTitle.setTitle(title);
  }
}
