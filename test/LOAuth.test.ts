const queryString = require('query-string');
const ClientOAuth2 = require('client-oauth2');
const globals = require('../src/globals');
import LOAuth, { AUTH_STORAGE_KEY } from '../src/LOAuth';

const consoleWarn = jest.fn();
global.console = {
  ...console,
  warn: consoleWarn
};

jest.mock('client-oauth2', () =>
  jest.fn().mockImplementation((...params) => {
    ClientOAuth2Ctor(...params);
    return clientOAuth2;
  })
);

jest.mock('../src/globals', () => ({
  window: {
    location: {
      href: 'set-in-before-each!',
      search: 'set-in-before-each!',
      protocol: 'https:',
      hostname: 'unit-test',
      pathname: ''
    },
    history: {
      replaceState: jest.fn()
    },
    document: {
      title: 'title'
    },
    localStorage: {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn()
    },
    setInterval: jest.fn(),
    clearInterval: jest.fn(),
    fetch: jest
      .fn()
      .mockResolvedValue({ json: async () => tokenResponseJson, ok: true })
  },
  document: {
    cookie: ''
  }
}));

let mockToken, tokenResponseJson, ctorParams, auth;

const clientOAuth2 = {
  code: {
    getToken: jest.fn(),
    getUri: jest.fn()
  },
  createToken: jest.fn()
};
const ClientOAuth2Ctor = jest.fn();

beforeEach(() => {
  globals.window.location = {};
  tokenResponseJson = {
    access_token: 'access_token',
    expires_in: 3600,
    id_token: 'id_token',
    refresh_token: 'refresh_token',
    token_type: 'Bearer'
  };
  mockToken = {
    refreshToken: 'refresh-token',
    sign: jest.fn(),
    expiresIn: jest.fn(),
    expires: {
      getTime: jest.fn(() => 100)
    },
    data: {
      ...tokenResponseJson
    }
  };
  clientOAuth2.code.getToken.mockResolvedValue(mockToken);
  clientOAuth2.code.getUri.mockReturnValue('http://integ-test/oauth-uri');
  clientOAuth2.createToken.mockReturnValue(mockToken);
  globals.window.localStorage.getItem.mockReturnValue(null);
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

  globals.document.cookie = '';
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
  globals.window.location.search = '?account=myaccount&projectId=myproject';
  const expectedState = btoa(
    JSON.stringify({ account: 'myaccount', projectId: 'myproject' })
  );
  auth = new LOAuth(ctorParams);
  expect(ClientOAuth2Ctor.mock.calls[0][0].state).toEqual(expectedState);
});

test('ctor captures LO query string parameters for application state but fails on JSON.parse', async () => {
  globals.window.location.search =
    '?account=myaccount&projectId=myproject&state=hello';
  const expectedState = btoa(
    JSON.stringify({ account: 'myaccount', projectId: 'myproject' })
  );
  auth = new LOAuth(ctorParams);
  expect(ClientOAuth2Ctor.mock.calls[0][0].state).toEqual(expectedState);
  expect(consoleWarn).toHaveBeenCalledWith(
    new DOMException('The string to be decoded contains invalid characters'),
    'Error occurred parsing state query string parameter'
  );
});

test('ctor captures application state from OAuth state param', async () => {
  ctorParams.appState = {
    account: 'myaccount', // This will override queryString params (account lock down for app)
    myField: 'myValue'
  };
  const expectedState = btoa(JSON.stringify(ctorParams.appState));
  globals.window.location.href = `https://unit-test?account=otheraccount`;
  auth = new LOAuth(ctorParams);
  expect(ClientOAuth2Ctor).toBeCalledTimes(1);
  expect(ClientOAuth2Ctor.mock.calls[0][0].state).toEqual(expectedState);
});

test('ctor passes empty state when appropriate', async () => {
  delete ctorParams.appState;
  const expectedState = undefined;
  globals.window.location.href = 'https://unit-test';
  globals.window.location.search = '';
  auth = new LOAuth(ctorParams);
  expect(ClientOAuth2Ctor.mock.calls[0][0].state).toEqual(expectedState);
});

test('ctor encodes pathname in state object', async () => {
  const pathname = '/deep/client/path';
  const expectedState = btoa(JSON.stringify({ pathname }));
  globals.window.location.pathname = pathname;
  auth = new LOAuth(ctorParams);
  expect(ClientOAuth2Ctor.mock.calls[0][0].state).toEqual(expectedState);
});

describe('with auth successfully created', () => {
  beforeEach(() => {
    auth = new LOAuth(ctorParams);
  });

  test('refreshAccessToken attempts to exchange authorization code for access token', async () => {
    globals.window.location.protocol = 'https:';
    globals.window.location.hostname = 'unit-test';
    globals.window.location.pathname = '/test/deep/links/';
    auth = new LOAuth(ctorParams);

    await auth.refreshAccessToken();

    const client = ClientOAuth2.mock.results[0].value;
    expect(client.code.getToken).toBeCalledTimes(1);
    expect(client.code.getToken.mock.calls[0][0]).toBe(
      'https://unit-test?client_id=foo&authorization_code=bar'
    );
    expect(globals.window.history.replaceState).toBeCalledTimes(1);
    expect(globals.window.history.replaceState.mock.calls[0][2]).toBe(
      'https://unit-test/test/deep/links/'
    );
    expect(globals.window.localStorage.setItem.mock.calls).toMatchSnapshot();
  });

  test('refreshAccessToken attempts to exchange authorization code for access token with localhost:3000', async () => {
    globals.window.location.protocol = 'https:';
    globals.window.location.hostname = 'localhost';
    globals.window.location.href =
      'https://localhost:3000?client_id=foo&authorization_code=bar';
    globals.window.location.port = '3000';
    globals.window.location.pathname = '/test/deep/links/';
    auth = new LOAuth(ctorParams);

    await auth.refreshAccessToken();

    const client = ClientOAuth2.mock.results[0].value;
    expect(client.code.getToken).toBeCalledTimes(1);
    expect(client.code.getToken.mock.calls[0][0]).toBe(
      'https://localhost:3000?client_id=foo&authorization_code=bar'
    );
    expect(globals.window.history.replaceState).toBeCalledTimes(1);
    expect(globals.window.history.replaceState.mock.calls[0][2]).toBe(
      'https://localhost:3000/test/deep/links/'
    );
    expect(globals.window.localStorage.setItem.mock.calls).toMatchSnapshot();
  });

  test('refreshAccessToken decodes and exposes appState', async () => {
    const appState = {
      account: 'myaccount',
      projectId: 'myproject',
      customAppField: 'val',
      pathname: '/client/deep/link/url/'
    };
    const encodedState = btoa(JSON.stringify(appState));
    globals.window.location.search = `?client_id=foo&authorization_code=bar&state=${encodedState}`;
    globals.window.location.href = `https://unit-test${globals.window.location.search}`;
    await auth.refreshAccessToken();

    expect(auth.appState.account).toBe('myaccount');
    expect(auth.appState.projectId).toBe('myproject');
    expect(auth.appState.customAppField).toBe('val');
    expect(auth.appState.pathname).toBe('/client/deep/link/url/');
  });

  test('refreshAccessToken does nothing if token already captured', async () => {
    await auth.refreshAccessToken(); // token captured
    await auth.refreshAccessToken(); // no-op

    expect(clientOAuth2.code.getToken.mock.calls.length).toBe(1);
    expect(globals.window.fetch).toBeCalledTimes(0);
  });

  test('refreshAccessToken performs refresh_token if called with expiringRefresh', async () => {
    await auth.refreshAccessToken(); // token captured
    await auth.refreshAccessToken({ expiringRefresh: true });

    expect(globals.window.fetch).toBeCalledTimes(1);
    expect(globals.window.fetch.mock.calls[0][0]).toBe(
      ctorParams.accessTokenUri
    );
    expect(globals.window.fetch.mock.calls[0][1].body).toEqual(
      queryString.stringify({
        client_id: ctorParams.clientId,
        grant_type: 'refresh_token',
        refresh_token: mockToken.refreshToken,
        redirect_uri: ctorParams.redirectUri
      })
    );
    expect(clientOAuth2.createToken).toBeCalledTimes(1);
    expect(globals.window.localStorage.setItem.mock.calls).toMatchSnapshot();
  });

  test('refreshAccessToken expiringRefresh handles refresh error', async () => {
    await auth.refreshAccessToken(); // token captured

    expect(globals.window.localStorage.setItem).toBeCalledTimes(1);

    globals.window.fetch.mockReturnValueOnce({
      ok: false,
      status: 400,
      error: 'invalid_grant'
    });

    await auth.refreshAccessToken({ expiringRefresh: true });

    expect(globals.window.fetch).toBeCalledTimes(1);
    expect(globals.window.fetch.mock.calls[0][0]).toBe(
      ctorParams.accessTokenUri
    );
    expect(globals.window.fetch.mock.calls[0][1].body).toEqual(
      queryString.stringify({
        client_id: ctorParams.clientId,
        grant_type: 'refresh_token',
        refresh_token: mockToken.refreshToken,
        redirect_uri: ctorParams.redirectUri
      })
    );
    expect(clientOAuth2.createToken).toBeCalledTimes(0);
    expect(globals.window.localStorage.setItem).toBeCalledTimes(2);
    expect(globals.window.localStorage.removeItem).toBeCalledTimes(1);

    expect(globals.window.localStorage.setItem.mock.calls).toMatchSnapshot();
  });

  test('refreshAccessToken redirects to login upon error if no token is in storage', async () => {
    globals.window.location.href = 'https://unit-test'; // No client_id etc.
    clientOAuth2.code.getToken.mockRejectedValue(new Error('unit test'));
    await auth.refreshAccessToken();

    const loginUri = await ClientOAuth2.mock.results[0].value.code.getUri();

    expect(globals.window.location.href).toBe(loginUri);
  });

  test('refreshAccessToken redirects to loginRedirectUri if set', async () => {
    clientOAuth2.code.getToken.mockRejectedValue(new Error('unit test'));

    globals.window.location.href = 'https://console.dev.skillspring.com';
    const loginRedirectUri = 'https://apps.dev.lifeomic.com/login';
    auth = new LOAuth({ ...ctorParams, loginRedirectUri });

    const expected = `${loginRedirectUri}?originalUrl=${encodeURIComponent(
      globals.window.location.href
    )}`;
    await auth.refreshAccessToken();

    expect(globals.window.location.href).toBe(expected);
  });

  test('refreshAccessToken preserves existing query string in loginRedirectUri', async () => {
    clientOAuth2.code.getToken.mockRejectedValue(new Error('unit test'));
    globals.window.location.href = 'https://console.dev.skillspring.com';
    const loginRedirectUri =
      'https://apps.dev.lifeomic.com/skillspring-login/signup/?email=user%40example.com';
    const expected =
      'https://apps.dev.lifeomic.com/skillspring-login/signup/?email=user%40example.com&originalUrl=https%3A%2F%2Fconsole.dev.skillspring.com';

    await new LOAuth({ ...ctorParams, loginRedirectUri }).refreshAccessToken();

    expect(globals.window.location.href).toBe(expected);
  });

  test('refreshAccessToken uses token from storage upon error', async () => {
    const appUrl = 'https://unit-test';
    globals.window.location.href = appUrl;
    clientOAuth2.code.getToken.mockRejectedValue(new Error('unit test'));
    clientOAuth2.createToken.mockReturnValue({
      ...mockToken,
      expires: {
        getTime: () => Date.now() * 2
      }
    });
    globals.window.localStorage.getItem.mockReturnValueOnce(
      JSON.stringify({
        ...tokenResponseJson,
        expires: 100
      })
    );
    await auth.refreshAccessToken();

    expect(globals.window.location.href).toBe(appUrl);
    expect(globals.window.fetch).not.toBeCalled();
  });

  test('refreshAccessToken refresh token from storage upon error if it is expired 1', async () => {
    globals.window.location.href = 'https://unit-test'; // No client_id etc.
    clientOAuth2.code.getToken.mockRejectedValue(new Error('unit test'));
    globals.window.localStorage.getItem.mockReturnValueOnce(
      JSON.stringify({
        ...tokenResponseJson,
        expires: 0
      })
    );

    await auth.refreshAccessToken({
      expiringRefresh: true
    });
    expect(globals.window.fetch).toBeCalled();
  });

  test('refreshAccessToken refresh token from storage upon error if it is expired 2', async () => {
    globals.window.location.href = 'https://unit-test'; // No client_id etc.
    clientOAuth2.code.getToken.mockRejectedValue(new Error('unit test'));
    globals.window.localStorage.getItem.mockReturnValueOnce(
      JSON.stringify({
        ...tokenResponseJson,
        expires: 0
      })
    );

    await auth.refreshAccessToken({
      refreshWindow: 1
    });
    expect(globals.window.fetch).toBeCalled();
  });

  test('refreshAccessToken refresh token from storage upon error if it is expired 3', async () => {
    globals.window.location.href = 'https://unit-test'; // No client_id etc.
    clientOAuth2.code.getToken.mockRejectedValue(new Error('unit test'));
    globals.window.localStorage.getItem.mockReturnValueOnce(
      JSON.stringify({
        ...tokenResponseJson,
        expires: 0
      })
    );

    await auth.refreshAccessToken({
      interval: 1
    });
    expect(globals.window.fetch).toBeCalled();
  });

  test('refreshAccessToken returns early from _getDomainCookieAuthState if the cookie is bad', async () => {
    globals.document.cookie = 'fake cookie';
    await auth.refreshAccessToken();

    expect(clientOAuth2.code.getToken).toBeCalledTimes(1);
    expect(globals.window.fetch).toBeCalledTimes(0);
  });

  test('refreshAccessToken fails _getDomainCookieAuthState', async () => {
    globals.document.cookie = `${AUTH_STORAGE_KEY}=${JSON.stringify({
      access_token: 'foo',
      refresh_token: 'bar'
    })}`;
    clientOAuth2.createToken.mockImplementation(() => {
      throw new Error('unit test');
    });

    await auth.refreshAccessToken();
    expect(consoleWarn).toHaveBeenCalledWith(
      'Failed to parse domain cookie for authentication tokens',
      new Error('unit test')
    );
  });

  test('LOAuth uses storage passed to it', async () => {
    const mockStorageKey = 'mock-storage-key';
    const mockStorage: LOAuth.Storage = {
      getItem: jest.fn(() => {
        JSON.stringify({
          ...tokenResponseJson,
          expires: 0
        });
      }),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };
    const mockAuth = new LOAuth({
      ...ctorParams,
      storageKey: mockStorageKey,
      storage: mockStorage
    });

    globals.window.location.href = 'https://unit-test'; // No client_id etc.
    clientOAuth2.code.getToken.mockRejectedValueOnce(new Error('unit test'));

    await mockAuth.refreshAccessToken();
    expect(consoleWarn).toBeCalledWith(
      new Error('unit test'),
      'Error refreshing access token - redirecting'
    );
    await mockAuth.refreshAccessToken({ expiringRefresh: true });
    await mockAuth.logout();
    expect(mockStorage.setItem).toBeCalledWith(
      mockStorageKey,
      expect.any(String)
    );
    expect(mockStorage.getItem).toBeCalledWith(mockStorageKey);
    expect(mockStorage.removeItem).toBeCalledWith(mockStorageKey);
  });

  test('refreshAccessToken does nothing if token already captured', async () => {
    await auth.refreshAccessToken(); // token captured
    await auth.refreshAccessToken(); // no-op

    expect(clientOAuth2.code.getToken).toBeCalledTimes(1);
    expect(globals.window.fetch).toBeCalledTimes(0);
  });

  test('refreshAccessToken uses the token from the domain document cookie if it exists', async () => {
    const expires = Date.now() + 100000;
    const expiresDate = new Date(expires);
    globals.document.cookie = `${AUTH_STORAGE_KEY}=${JSON.stringify({
      access_token: 'foo',
      refresh_token: 'bar',
      cookieDomain: 'us.skillspring.com',
      expires
    })}`;

    await auth.refreshAccessToken();

    expect(auth.token.expiresIn).toHaveBeenCalledWith(expiresDate);
    expect(clientOAuth2.createToken).toBeCalledTimes(1);
    expect(globals.window.fetch).toBeCalledTimes(0);
    expect(globals.document.cookie).toBe(
      `${AUTH_STORAGE_KEY}=;domain=.us.skillspring.com;Max-Age=-9999;path=/;secure`
    );
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
      testTitle:
        'startAutomaticTokenRefresh gets token and automatically refreshes before expiration with overrides'
    },
    {
      // Defaults
      interval: 30 * 1000,
      refreshWindow: 5,
      testTitle:
        'startAutomaticTokenRefresh gets token and automatically refreshes before expiration with defaults'
    },
    {
      failedRefresh: true,
      interval: 30 * 1000,
      refreshWindow: 5,
      testTitle:
        'startAutomaticTokenRefresh gets token and fails when automatically refreshing before expiration with defaults'
    }
  ];
  for (const config of startAutomaticTokenRefreshConfigs) {
    test(config.testTitle, async () => {
      auth.refreshAccessToken = jest.fn();
      const options = config.override
        ? {
            interval: config.interval,
            refreshWindow: config.refreshWindow
          }
        : {};
      await auth.startAutomaticTokenRefresh(options);
      mockToken.expires = new Date(
        Date.now() + (config.refreshWindow + 2) * 60 * 1000
      );
      auth.token = mockToken;

      expect(auth.refreshAccessToken).toBeCalledTimes(1); // Initial retrieval of token from URL
      expect(globals.window.setInterval).toBeCalledTimes(1);
      expect(globals.window.setInterval.mock.calls[0][1]).toBe(config.interval);
      // Mock setInterval func invocation
      globals.window.setInterval.mock.calls[0][0].bind(auth)();
      expect(auth.refreshAccessToken).toBeCalledTimes(1); // Hasn't expired yet

      if (config.failedRefresh) {
        auth.refreshAccessToken.mockImplementationOnce(() => {
          throw new Error('unit test');
        });
      }
      mockToken.expires = new Date(
        Date.now() + (config.refreshWindow - 1) * 60 * 1000
      );
      globals.window.setInterval.mock.calls[0][0].bind(auth)();
      expect(auth.refreshAccessToken).toBeCalledTimes(2); // Expired and called
      expect(auth.refreshAccessToken.mock.calls[1][0]).toEqual({
        expiringRefresh: true
      });
      if (config.failedRefresh) {
        expect(consoleWarn).toHaveBeenCalled();
      }
    });
  }

  for (const config of [
    {
      options: undefined,
      title:
        'startAutomaticTokenRefresh test without options and a token already set and a stored refreshInterval executed without options'
    },
    {
      options: {
        expiringRefresh: true,
        refreshWindow: 1,
        interval: 1
      },
      title:
        'startAutomaticTokenRefresh test without options and a token already set and a stored refreshInterval executed without options'
    }
  ]) {
    test(config.title, async () => {
      auth.refreshAccessToken = jest.fn(async (cb) => {
        await cb();
        return 1;
      });
      auth.token = mockToken;
      globals.window.setInterval.mockReturnValue(1);

      await auth.startAutomaticTokenRefresh(config.options);

      expect(auth.refreshAccessToken).toHaveBeenCalledTimes(0);
      expect(globals.window.setInterval).toBeCalledTimes(1);
      expect(globals.window.setInterval.mock.calls[0][1]).toBe(
        config.options?.interval || 30000
      );
      globals.window.setInterval.mock.calls[0][0].bind(auth)();

      await auth.startAutomaticTokenRefresh();
      expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
      expect(globals.window.setInterval).toBeCalledTimes(1);
    });
  }

  test('stopAutomaticTokenRefresh calls clearInterval if refreshInterval is set', async () => {
    await auth.stopAutomaticTokenRefresh();
    expect(globals.window.clearInterval).toBeCalledTimes(0);

    auth.refreshInterval = () => {};

    await auth.stopAutomaticTokenRefresh();
    expect(globals.window.clearInterval).toBeCalledTimes(1);
    expect(globals.window.clearInterval.mock.calls[0][0]).toBe(
      auth.refreshInterval
    );
  });

  test('sign uses client-oauth2 sign if token present', async () => {
    auth.token = mockToken;
    const requestOptions = {
      method: 'GET',
      url: 'https://integ-test/api'
    };
    await auth.sign(requestOptions);
    expect(mockToken.sign).toBeCalledTimes(1);
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
    auth.stopAutomaticTokenRefresh = jest.fn();
    await auth.logout();

    expect(auth.stopAutomaticTokenRefresh).toBeCalledTimes(1);
    const qs = queryString.stringify({
      client_id: ctorParams.clientId,
      logout_uri: ctorParams.logoutRedirectUri
    });
    expect(globals.window.location.href).toBe(`${ctorParams.logoutUri}?${qs}`);
  });

  test('logout redirects to the logoutUri that already includes a query param', async () => {
    const logoutUri = `${ctorParams.logoutUri}?logout=pending`;
    auth = new LOAuth({
      ...ctorParams,
      logoutUri
    });

    auth.stopAutomaticTokenRefresh = jest.fn();
    await auth.logout();

    expect(auth.stopAutomaticTokenRefresh).toBeCalledTimes(1);
    const qs = queryString.stringify({
      client_id: ctorParams.clientId,
      logout_uri: ctorParams.logoutRedirectUri
    });
    expect(globals.window.location.href).toBe(`${logoutUri}&${qs}`);
  });

  test('logout makes a request to the globalLogoutUri on global logout if one was provided', async () => {
    const globalLogoutUri = 'https://example.com/global-logout';
    auth = new LOAuth({ ...ctorParams, globalLogoutUri });
    auth.token = { ...mockToken, accessToken: 'some-token' };
    auth.stopAutomaticTokenRefresh = jest.fn();
    await auth.logout(true);

    expect(globals.window.fetch).toBeCalledTimes(1);
    expect(globals.window.fetch.mock.calls[0][0]).toBe(globalLogoutUri);
    expect(globals.window.fetch.mock.calls[0][1].headers).toEqual({
      Authorization: `Bearer some-token`
    });
  });

  test('setDomainCookieAuthState does not set a cookie without token being set', async () => {
    const cookieDomain = 'us.lifeomic.com';

    auth.setDomainCookieAuthState(cookieDomain);

    expect(globals.document.cookie).toBe('');
  });

  test('static setDomainCookieAuthState sets a cookie with the provided token data', async () => {
    const accessToken = 'foobar';
    const refreshToken = 'barbuzz';
    const clientId = 'someclientid';
    const cookieDomain = 'us.lifeomic.com';
    const expires = Date.now() + 1000;

    const params = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires,
      clientId,
      cookieDomain
    };

    LOAuth.setDomainCookieAuthState(params);

    expect(globals.document.cookie).toBe(
      `${AUTH_STORAGE_KEY}=${JSON.stringify(
        params
      )};domain=.${cookieDomain};Max-Age=10;path=/;secure`
    );
  });

  test('setDomainCookieAuthState sets a cookie with the current token data', async () => {
    const cookieDomain = 'us.lifeomic.com';
    await auth.refreshAccessToken();

    auth.setDomainCookieAuthState(cookieDomain);

    expect(globals.document.cookie).toBe(
      `${AUTH_STORAGE_KEY}=${JSON.stringify({
        access_token: auth.token.accessToken,
        refresh_token: auth.token.refreshToken,
        expires: auth.token.expires.getTime(),
        clientId: ctorParams.clientId,
        cookieDomain
      })};domain=.${cookieDomain};Max-Age=10;path=/;secure`
    );
  });
});
