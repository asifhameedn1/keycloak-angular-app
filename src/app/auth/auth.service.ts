import { Injectable } from '@angular/core';
import { Http, Headers, RequestOptions, Response } from '@angular/http';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/of';
import 'rxjs/add/observable/throw';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/map';

import { environment } from '../../environments/environment';

const SESSION_KEY = 'kc_session';
const PENDING_LOGIN_KEY = 'kc_pending_login';

/** Path Keycloak redirects back to after login. Must match the `callback` route. */
const CALLBACK_PATH = '/callback';

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  /** Epoch ms when the refresh token expires (0 = no expiry, e.g. offline token). */
  refreshExpiresAt: number;
}

/** What we remember between leaving for Keycloak and coming back. */
interface PendingLogin {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnUrl: string;
}

export interface UserProfile {
  username: string;
  name: string;
  email: string;
  roles: string[];
}

/**
 * Login by redirecting to Keycloak's login page, using the OpenID Connect
 * Authorization Code flow with PKCE (for public browser clients).
 */
@Injectable()
export class AuthService {

  private readonly realmUrl =
    `${environment.keycloak.url}/realms/${environment.keycloak.realm}/protocol/openid-connect`;

  constructor(private http: Http) { }

  /** Leaves the app for Keycloak's login page; comes back to `returnUrl` afterwards. */
  login(returnUrl: string = '/'): void {
    const pending: PendingLogin = {
      state: this.randomString(),
      nonce: this.randomString(),
      codeVerifier: this.randomString(),
      returnUrl: returnUrl
    };
    sessionStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify(pending));

    this.codeChallenge(pending.codeVerifier).then(challenge => {
      window.location.href = `${this.realmUrl}/auth?` + this.toQuery({
        client_id: environment.keycloak.clientId,
        redirect_uri: this.redirectUri(),
        response_type: 'code',
        scope: 'openid',
        state: pending.state,
        nonce: pending.nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256'
      });
    });
  }

  /**
   * Finishes the login on the callback route: checks `state`, exchanges the
   * authorization code for tokens, and returns the URL to continue to.
   */
  handleCallback(params: { [key: string]: string }): Observable<string> {
    const pending = this.read<PendingLogin>(PENDING_LOGIN_KEY);
    sessionStorage.removeItem(PENDING_LOGIN_KEY);

    if (params['error']) {
      return Observable.throw(params['error_description'] || params['error']);
    }
    if (!pending || !params['code'] || params['state'] !== pending.state) {
      return Observable.throw('The login response was invalid or expired. Please sign in again.');
    }

    return this.postForm(`${this.realmUrl}/token`, {
      grant_type: 'authorization_code',
      client_id: environment.keycloak.clientId,
      code: params['code'],
      redirect_uri: this.redirectUri(),
      code_verifier: pending.codeVerifier
    })
      .map(res => {
        const tokens = res.json();
        if (this.decodeJwt(tokens.id_token)['nonce'] !== pending.nonce) {
          throw new Error('nonce mismatch');
        }
        this.storeTokens(tokens);
        return pending.returnUrl;
      })
      .catch(err => Observable.throw(this.toMessage(err)));
  }

  /** Exchanges the refresh token for a new access token. */
  refresh(): Observable<boolean> {
    const session = this.getSession();
    if (!session) {
      return Observable.of(false);
    }
    return this.postForm(`${this.realmUrl}/token`, {
      grant_type: 'refresh_token',
      client_id: environment.keycloak.clientId,
      refresh_token: session.refreshToken
    })
      .map(res => {
        this.storeTokens(res.json());
        return true;
      })
      .catch(() => {
        this.clear();
        return Observable.of(false);
      });
  }

  /** True when the access token is valid, refreshing it first if it has expired. */
  ensureLoggedIn(): Observable<boolean> {
    const session = this.getSession();
    if (!session) {
      return Observable.of(false);
    }
    const now = Date.now();
    if (session.expiresAt > now + 5000) {
      return Observable.of(true);
    }
    if (session.refreshExpiresAt === 0 || session.refreshExpiresAt > now) {
      return this.refresh();
    }
    this.clear();
    return Observable.of(false);
  }

  isLoggedIn(): boolean {
    const session = this.getSession();
    return !!session && session.expiresAt > Date.now();
  }

  /** Clears the local session and ends the Keycloak session via its logout page. */
  logout(): void {
    const session = this.getSession();
    this.clear();
    const params: { [key: string]: string } = {
      client_id: environment.keycloak.clientId,
      post_logout_redirect_uri: window.location.origin + '/'
    };
    if (session && session.idToken) {
      params['id_token_hint'] = session.idToken;
    }
    window.location.href = `${this.realmUrl}/logout?` + this.toQuery(params);
  }

  getAccessToken(): string {
    const session = this.getSession();
    return session ? session.accessToken : null;
  }

  getUser(): UserProfile {
    const token = this.getAccessToken();
    if (!token) {
      return null;
    }
    const claims = this.decodeJwt(token);
    const realmAccess = claims['realm_access'] || {};
    return {
      username: claims['preferred_username'] || claims['sub'],
      name: claims['name'] || '',
      email: claims['email'] || '',
      roles: realmAccess['roles'] || []
    };
  }

  private redirectUri(): string {
    return window.location.origin + CALLBACK_PATH;
  }

  /** PKCE S256 challenge: base64url(SHA-256(verifier)). */
  private codeChallenge(verifier: string): PromiseLike<string> {
    // The verifier is base64url, i.e. plain ASCII, so char codes are its bytes.
    const bytes = new Uint8Array(verifier.split('').map(c => c.charCodeAt(0)));
    return window.crypto.subtle.digest('SHA-256', bytes)
      .then((hash: ArrayBuffer) => this.base64Url(new Uint8Array(hash)));
  }

  private randomString(): string {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return this.base64Url(bytes);
  }

  private base64Url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private toQuery(fields: { [key: string]: string }): string {
    return Object.keys(fields)
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(fields[key]))
      .join('&');
  }

  private postForm(url: string, fields: { [key: string]: string }): Observable<Response> {
    const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' });
    return this.http.post(url, this.toQuery(fields), new RequestOptions({ headers: headers }));
  }

  private storeTokens(res: any): void {
    const now = Date.now();
    const session: StoredSession = {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      idToken: res.id_token,
      expiresAt: now + res.expires_in * 1000,
      refreshExpiresAt: res.refresh_expires_in ? now + res.refresh_expires_in * 1000 : 0
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  private getSession(): StoredSession {
    return this.read<StoredSession>(SESSION_KEY);
  }

  private read<T>(key: string): T {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  private clear(): void {
    sessionStorage.removeItem(SESSION_KEY);
  }

  private decodeJwt(token: string): any {
    try {
      let payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) {
        payload += '=';
      }
      // Percent-encode each byte so decodeURIComponent restores UTF-8 characters in names
      const utf8 = atob(payload).split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('');
      return JSON.parse(decodeURIComponent(utf8));
    } catch (e) {
      return {};
    }
  }

  private toMessage(err: any): string {
    if (err instanceof Response) {
      if (err.status === 0) {
        return 'Cannot reach the login server. Check that Keycloak is running and that ' +
          'this app\'s origin is listed in the client\'s Web origins.';
      }
      let body: any = {};
      try {
        body = err.json();
      } catch (e) { }
      if (body.error_description) {
        return body.error_description;
      }
      return `Login failed (HTTP ${err.status}).`;
    }
    if (err instanceof Error && err.message === 'nonce mismatch') {
      return 'The login response was invalid. Please sign in again.';
    }
    return 'Login failed.';
  }
}
