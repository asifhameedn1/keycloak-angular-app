import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../auth/auth.service';

/** Keycloak redirects here after login; finishes the login and moves on. */
@Component({
  selector: 'app-callback',
  template: `
    <div class="callback">
      <p *ngIf="!error">Signing you in…</p>
      <div *ngIf="error" role="alert">
        <p class="error">{{ error }}</p>
        <button type="button" (click)="retry()">Sign in again</button>
      </div>
    </div>
  `,
  styles: [`
    .callback { max-width: 420px; margin: 64px auto; text-align: center; }
    .error { padding: 10px 12px; border-radius: 4px; background: #fdecea; color: #8e1c1c; }
  `]
})
export class CallbackComponent implements OnInit {

  error: string = null;

  constructor(private auth: AuthService, private route: ActivatedRoute, private router: Router) { }

  ngOnInit(): void {
    this.auth.handleCallback(this.route.snapshot.queryParams).subscribe(
      returnUrl => this.router.navigateByUrl(returnUrl),
      (message: string) => this.error = message
    );
  }

  retry(): void {
    this.auth.login('/');
  }
}
