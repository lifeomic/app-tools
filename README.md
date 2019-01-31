# LifeOmic App Tools

[![Build
Status](https://travis-ci.org/lifeomic/app-tools.svg?branch=master)](https://travis-ci.org/lifeomic/app-tools)

Provides a set of utilities for developing custom web apps against the LifeOmic PHC API.

## Installation

```bash
yarn install @lifeomic/app-tools
```

## Auth

```javascript
import { LOAuth } from '@lifeomic/app-tools';

// Setup
const appAuth = new LOAuth({
  clientId: '<clientId>',
  authorizationUri: 'https://lifeomic-prod.auth.us-east-1.amazoncognito.com/oauth2/authorize',
  accessTokenUri: 'https://lifeomic-prod.auth.us-east-1.amazoncognito.com/oauth2/token',
  redirectUri: 'http://localhost:3000/callback',
  logoutUri: 'https://lifeomic-prod.auth.us-east-1.amazoncognito.com/logout',
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
    url: `https://fhir.prod.lifeomic.com/${account}/dstu3/${resourceType}?_tag=http%3A%2F%2Flifeomic.com%2Ffhir%2Fdataset%${project}&pageSize=5`
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
      return sessionStorage.removeItem(key)
    }
  }
});

// or simply
const appAuth = new LOAuth({
  ...oauthConfig,
  storageKey: 'my-super-awesome-key',
  storage: sessionStorage,
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