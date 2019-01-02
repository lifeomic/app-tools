# LifeOmic App Tools

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
