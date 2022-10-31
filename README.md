# LifeOmic App Tools

[![Build
Status](https://travis-ci.org/lifeomic/app-tools.svg?branch=master)](https://travis-ci.org/lifeomic/app-tools)

Provides a set of utilities for developing custom web apps against the LifeOmic PHC API.

## Installation

```bash
yarn install @lifeomic/app-tools
```

## Using "Hosted" Authentication

```javascript
import { LOAuth } from '@lifeomic/app-tools';

// Setup
const appAuth = new LOAuth({
  clientId: '<clientId>',
  authorizationUri:
    'https://lifeomic-prod-us.auth.us-east-2.amazoncognito.com/oauth2/authorize',
  accessTokenUri:
    'https://lifeomic-prod-us.auth.us-east-2.amazoncognito.com/oauth2/token',
  redirectUri: 'http://localhost:3000/callback',
  logoutUri: 'https://lifeomic-prod-us.auth.us-east-2.amazoncognito.com/logout',
  logoutRedirectUri: 'http://localhost:3000/logout',
  scopes: ['openid']
});

appAuth.startAutomaticTokenRefresh().then(() => {
  const account = '<myaccountid>';
  const resourceType = 'Patient';
  const project = '<myprojectId>';

  // Sign adds access_token etc. to your request options
  const request = await appAuth.sign({
    method: 'GET',
    url: `https://fhir.us.lifeomic.com/${account}/dstu3/${resourceType}?_tag=http%3A%2F%2Flifeomic.com%2Ffhir%2Fdataset%${project}&pageSize=5`
  });

  const response = await fetch(request.url, request);
  console.log(response);
});
```

### Token Storage

By default `LOAuth` will store the token in local storage and hydrate any existing session from there. To overwrite the storage location you can pass a storage object in options along with a custom storage key.

```ts
import { LOAuth } from '@lifeomic/app-tools';

const appAuth = new LOAuth({
  ...oauthConfig,
  storageKey: 'my-super-awesome-key',
  storage: {
    getItem(key: string) {
      return sessionStorage.getItem(key);
    },
    setItem(key: string, value: string) {
      return sessionStorage.setItem(key, value);
    },
    removeItem(key: string) {
      return sessionStorage.removeItem(key);
    }
  }
});

// or simply
const appAuth = new LOAuth({
  ...oauthConfig,
  storageKey: 'my-super-awesome-key',
  storage: sessionStorage
});
```

To opt-out of storing the token, you can pass in noop functions for storage

```ts
const noop = () => null;

const appAuth = new LOAuth({
  ...oauthConfig,
  storageKey: 'my-super-awesome-key',
  storage: {
    getItem: noop,
    setItem: noop,
    removeItem: noop
  }
});
```

## Using API-based Authentication

```ts
import { APIBasedAuth } from '@lifeomic/app-tools';

// Setup
const auth = new APIBasedAuth({
  clientId: '<clientId>',
  storage: {
    // Provide a mechanism for storing + retrieving tokens.
  }
});
```

### Passwordless Login

```ts
// Initiate login
await auth.initiatePasswordlessAuth({
  username: '<username-or-email>'
  appsBaseUri: 'use-bogus-value',
  loginAppBasePath: 'use-bogus-value',
});

// Confirm login using code
const res = await auth.confirmPasswordlessLogin({
  username: '<username-or-email>',
  code: '<code>'
})

res.accessToken;
```

### Perform Custom App Token Exchange

```ts
const res = await auth.redeemCustomAppCode('<code>');

res.accessToken;
```
