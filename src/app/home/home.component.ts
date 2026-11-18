import { Component, OnInit } from '@angular/core';

import { AuthService, UserProfile } from '../auth/auth.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html'
})
export class HomeComponent implements OnInit {

  user: UserProfile;

  constructor(private auth: AuthService) { }

  ngOnInit(): void {
    this.user = this.auth.getUser();
  }

  logout(): void {
    this.auth.logout();
  }
}
