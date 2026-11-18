import { KeycloakAngularAppPage } from './app.po';

describe('keycloak-angular-app App', () => {
  let page: KeycloakAngularAppPage;

  beforeEach(() => {
    page = new KeycloakAngularAppPage();
  });

  it('should display message saying app works', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('app works!');
  });
});
