import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/map';

import { AuthService } from './auth.service';

/** Sends signed-out users to Keycloak's login page, then back to the page they asked for. */
@Injectable()
export class AuthGuard implements CanActivate {

  constructor(private auth: AuthService) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.auth.ensureLoggedIn().map(loggedIn => {
      if (!loggedIn) {
        this.auth.login(state.url);
      }
      return loggedIn;
    });
  }
}
