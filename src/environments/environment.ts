// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

export const environment = {
  production: false,
  keycloak: {
    // Keycloak base URL. Keycloak 17+ (Quarkus): 'http://localhost:8080'
    // Keycloak 16 and older (WildFly):           'http://localhost:8080/auth'
    url: 'http://localhost:8080',
    // Realm + client imported by keycloak.testApp/compose.yaml (keycloak/test-realm-realm.json).
    // Public client, Standard flow + PKCE S256, redirect/post-logout URIs http://localhost:4200/*
    realm: 'test-realm',
    clientId: 'keycloak-test-app'
  }
};
