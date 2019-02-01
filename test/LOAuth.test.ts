const queryString = require('query-string');
const ClientOAuth2 = require('client-oauth2');
const globals = require('../src/globals');
import LOAuth from '../src/LOAuth';

jest.mock('client-oauth2', () => jest.fn().mockImplementation((...params) => {
  ClientOAuth2Ctor(...params)
  return clientOAuth2;
}));

jest.mock('../src/globals', () => ({
  window: {
    location: {
      href: 'set-in-before-each!',
      search: 'set-in-before-each!',
      protocol: 'https:',
      hostname: 'unit-test'
    },
    history: {
      replaceState: jest.fn()
    },
    document: {
      title: 'title'
    },
    setInterval: jest.fn(),
    clearInterval: jest.fn(),
    fetch: jest.fn().mockResolvedValue({ json: async () => tokenResponseJson })
  }
}));

let mockToken,
  tokenResponseJson,
  ctorParams,
  auth;

const clientOAuth2 = {
  code: {
    getToken: jest.fn(),
    getUri: jest.fn()
  },
  createToken: jest.fn()
};
const ClientOAuth2Ctor = jest.fn();

beforeEach(() => {
  mockToken = {
    refreshToken: 'refresh-token',
    sign: jest.fn()
  };
  clientOAuth2.code.getToken.mockResolvedValue(mockToken);
  clientOAuth2.code.getUri.mockResolvedValue('http://integ-test/oauth-uri');
  clientOAuth2.createToken.mockResolvedValue(mockToken);
  tokenResponseJson = {
    access_token: 'access_token',
    expires_in: 3600,
    id_token: 'id_token',
    refresh_token: 'refresh_token',
    token_type: 'Bearer'
  };
  ctorParams = {
    clientId: '7cbji8hkta84ons79j34qcfdci',
    authorizationUri: 'https://integ-test/authorize',
    accessTokenUri: 'https://integ-test/token',
    logoutUri: 'https://integ-test/logout',
    redirectUri: 'http://localhost:3000/callback',
    logoutRedirectUri: 'http://localhost:3000/logout',
    scopes: ['openid']
  };

  Object.assign(globals.window.location, {
    href: 'https://unit-test?client_id=foo&authorization_code=bar',
    search: '?client_id=foo&authorization_code=bar'
  });
});

const ctorRequired = [
  'clientId',
  'authorizationUri',
  'accessTokenUri',
  'redirectUri',
  'logoutUri',
  'logoutRedirectUri',
  'scopes'
];

for (const param of ctorRequired) {
  test(`ctor throws if param ${param} is missing`, async () => {
    // eslint-disable-next-line security/detect-object-injection
    delete ctorParams[param];
    expect(() => new LOAuth(ctorParams)).toThrow(new RegExp(param));
  });
}

test('ctor captures LO query string parameters for application state', async () => {
  globals.window.location.href = 'https://unit-test?account=myaccount&projectId=myproject';
  globals.window.location.search = '?account=myaccount&projectId=myproject';
  const expectedState = encodeURIComponent(JSON.stringify({ account: 'myaccount', projectId: 'myproject' }));
  auth = new LOAuth(ctorParams);
  expect(ClientOAuth2Ctor.mock.calls[0][0].state).toEqual(expectedState);
});

test('ctor captures application state from OAuth state param', async () => {
  ctorParams.appState = {
    account: 'myaccount', // This will override queryString params (account lock down for app)
    myField: 'myValue'
  };
  const expectedState = encodeURIComponent(JSON.stringify(ctorParams.appState));
  globals.window.location.href = `https://unit-test?account=otheraccount`;
  auth = new LOAuth(ctorParams);
  expect(ClientOAuth2Ctor.mock.calls.length).toBe(1);
  expect(ClientOAuth2Ctor.mock.calls[0][0].state).toEqual(expectedState);
});

test('ctor passes empty state when appropriate', async () => {
  delete ctorParams.appState;
  const expectedState = encodeURIComponent(JSON.stringify({}));
  globals.window.location.href = 'https://unit-test';
  globals.window.location.search = '';
  auth = new LOAuth(ctorParams);
  expect(ClientOAuth2Ctor.mock.calls[0][0].state).toEqual(expectedState);
});

describe('with auth successfully created', () => {
  beforeEach(() => {
    auth = new LOAuth(ctorParams);
  });

  test('refreshAccessToken attempts to exchange authorization code for access token', async () => {
    await auth.refreshAccessToken();

    const client = ClientOAuth2.mock.results[0].value;
    expect(client.code.getToken.mock.calls.length).toBe(1);
    expect(client.code.getToken.mock.calls[0][0]).toBe('https://unit-test?client_id=foo&authorization_code=bar');
    expect(globals.window.history.replaceState.mock.calls.length).toBe(1);
    expect(globals.window.history.replaceState.mock.calls[0][2]).toBe('https://unit-test');
  });

  test('refreshAccessToken decodes and exposes appState', async () => {
    const appState = { account: 'myaccount', projectId: 'myproject', customAppField: 'val' };
    const encodedState = encodeURIComponent(JSON.stringify(appState));
    globals.window.location.search = `?client_id=foo&authorization_code=bar&state=${encodedState}`;
    globals.window.location.href = `https://unit-test${globals.window.location.search}`;
    await auth.refreshAccessToken();

    expect(auth.appState.account).toBe('myaccount');
    expect(auth.appState.projectId).toBe('myproject');
    expect(auth.appState.customAppField).toBe('val');
  });

  test('refreshAccessToken does nothing if token already captured', async () => {
    await auth.refreshAccessToken(); // token captured
    await auth.refreshAccessToken(); // no-op

    expect(ClientOAuth2.mock.results[0].value.code.getToken.mock.calls.length).toBe(1);
    expect(globals.window.fetch.mock.calls.length).toBe(0);
  });

  test('refreshAccessToken performs refresh_token if called with expiringRefresh', async () => {
    await auth.refreshAccessToken(); // token captured
    await auth.refreshAccessToken({ expiringRefresh: true });

    expect(globals.window.fetch.mock.calls.length).toBe(1);
    expect(globals.window.fetch.mock.calls[0][0]).toBe(ctorParams.accessTokenUri);
    expect(globals.window.fetch.mock.calls[0][1].body).toEqual(queryString.stringify({
      client_id: ctorParams.clientId,
      grant_type: 'refresh_token',
      refresh_token: mockToken.refreshToken,
      redirect_uri: ctorParams.redirectUri
    }));
    expect(ClientOAuth2.mock.results[0].value.createToken.mock.calls.length).toBe(1);
  });

  test('refreshAccessToken redirects to login upon error', async () => {
    globals.window.location.href = 'https://unit-test'; // No client_id etc.
    clientOAuth2.code.getToken.mockRejectedValue(new Error('unit test'));
    await auth.refreshAccessToken();

    const loginUri = await ClientOAuth2.mock.results[0].value.code.getUri();
    expect(globals.window.location.href).toBe(loginUri);
  });

  const startAutomaticTokenRefreshConfigs = [
    {
      interval: 5,
      refreshWindow: 5 * 1000,
      override: true,
      testTitle: 'startAutomaticTokenRefresh gets token and automatically refreshes before expiration with overrides'
    },
    {
      // Defaults
      interval: 30 * 1000,
      refreshWindow: 5,
      testTitle: 'startAutomaticTokenRefresh gets token and automatically refreshes before expiration with defaults'
    }
  ];
  for (const config of startAutomaticTokenRefreshConfigs) {
    test(config.testTitle, async () => {
      auth.refreshAccessToken = jest.fn();
      const options = config.override ? {
        interval: config.interval,
        refreshWindow: config.refreshWindow
      } : {};
      await auth.startAutomaticTokenRefresh(options);
      mockToken.expires = new Date(Date.now() + ((config.refreshWindow + 2) * 60 * 1000));
      auth.token = mockToken;

      expect(auth.refreshAccessToken.mock.calls.length).toBe(1); // Initial retrieval of token from URL
      expect(globals.window.setInterval.mock.calls.length).toBe(1);
      expect(globals.window.setInterval.mock.calls[0][1]).toBe(config.interval);
      // Mock setInterval func invocation
      globals.window.setInterval.mock.calls[0][0].bind(auth)();
      expect(auth.refreshAccessToken.mock.calls.length).toBe(1); // Hasn't expired yet

      mockToken.expires = new Date(Date.now() + ((config.refreshWindow - 1) * 60 * 1000));
      globals.window.setInterval.mock.calls[0][0].bind(auth)();
      expect(auth.refreshAccessToken.mock.calls.length).toBe(2); // Expired and called
      expect(auth.refreshAccessToken.mock.calls[1][0]).toEqual({ expiringRefresh: true });
    });
  }

  test('stopAutomaticTokenRefresh calls clearInterval if refreshInterval is set', async () => {
    await auth.stopAutomaticTokenRefresh();
    expect(globals.window.clearInterval.mock.calls.length).toBe(0);

    auth.refreshInterval = () => {};

    await auth.stopAutomaticTokenRefresh();
    expect(globals.window.clearInterval.mock.calls.length).toBe(1);
    expect(globals.window.clearInterval.mock.calls[0][0]).toBe(auth.refreshInterval);
  });

  test('sign uses client-oauth2 sign if token present', async () => {
    auth.token = mockToken;
    const requestOptions = {
      method: 'GET',
      url: 'https://integ-test/api'
    };
    await auth.sign(requestOptions);
    expect(mockToken.sign.mock.calls.length).toBe(1);
    expect(mockToken.sign.mock.calls[0][0]).toEqual(requestOptions);
  });

  test('sign throws if not token captured', async () => {
    auth.token = null;
    const requestOptions = {
      method: 'GET',
      url: 'https://integ-test/api'
    };
    expect(auth.sign(requestOptions)).rejects.toThrow();
  });

  test('logout redirects to the logoutUri', async () => {
    auth.stopAutomaticTokenRefresh = jest.fn()
    await auth.logout();

    expect(auth.stopAutomaticTokenRefresh.mock.calls.length).toBe(1);
    const qs = queryString.stringify({
      client_id: ctorParams.clientId,
      logout_uri: ctorParams.logoutRedirectUri
    });
    expect(globals.window.location.href).toBe(`${ctorParams.logoutUri}?${qs}`);
  });

});
