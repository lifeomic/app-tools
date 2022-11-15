import axios from 'axios';
import APIBasedAuth, { API_AUTH_STORAGE_KEY } from '../src/APIBasedAuth';
import {
  DEFAULT_BASE_API_URL,
  DEFAULT_BASE_APPS_URL
} from '../src/utils/helper';
const globals = require('../src/globals');

jest.mock('../src/globals', () => ({
  window: {
    localStorage: {
      getItem: jest.fn(() => null),
      removeItem: jest.fn(),
      setItem: jest.fn()
    }
  }
}));

jest.mock('axios');
const isAxiosError = jest.fn();
axios.isAxiosError = isAxiosError as unknown as typeof axios.isAxiosError;
axios.create = jest.fn(() => clientAxios);

let auth: APIBasedAuth;
let params: APIBasedAuth.Config;
const code = '123';
const DEFAULT_SESSION_KEY = `${API_AUTH_STORAGE_KEY}.session`;
const DEFAULT_USERNAME_KEY = `${API_AUTH_STORAGE_KEY}.username`;
const DEFAULT_ACCESS_TOKEN_KEY = `${API_AUTH_STORAGE_KEY}.accessToken`;
const DEFAULT_ID_TOKEN_KEY = `${API_AUTH_STORAGE_KEY}.idToken`;
const DEFAULT_REFRESH_TOKEN_KEY = `${API_AUTH_STORAGE_KEY}.refreshToken`;
const mockLoginMethods = [
  {
    type: 'OIDC',
    account: 'account-id-1'
  },
  {
    type: 'OIDC',
    account: 'account-id-2'
  }
];
const mockSession = { session: 'session' };
const mockToken = {
  accessToken: 'access_token',
  idToken: 'id_token',
  refreshToken: 'refresh_token'
};
const promiseWrapStorage = (storage: typeof globals.window.localStorage) => ({
  getItem: (key) => Promise.resolve(storage.getItem(key)),
  removeItem: (key) => Promise.resolve(storage.removeItem(key)),
  setItem: (key, value) => Promise.resolve(storage.setItem(key, value))
});

const clientAxios = { get: jest.fn(), post: jest.fn() };

beforeEach(() => {
  clientAxios.get = jest.fn(
    (path: string, data: { params: { login: string } }) => {
      if (path === '/login-methods') {
        return Promise.resolve({
          data: mockLoginMethods.map((method, index) => ({
            ...method,
            accountName: `${data.params.login} ${index}`
          }))
        });
      }
      return Promise.reject('invalid path');
    }
  );
  clientAxios.post = jest.fn((path: string, data: Record<string, string>) => {
    if (path === '/login') {
      if (!!data.clientId && !!data.password && !!data.username) {
        return Promise.resolve({ data: mockToken });
      }
      return Promise.reject('invalid credentials');
    }
    if (path === '/passwordless-auth/verify') {
      if (
        !!data.clientId &&
        !!data.code &&
        (!!data.session || !!data.username)
      ) {
        return Promise.resolve({ data: mockToken });
      }
      return Promise.reject('invalid credentials');
    }

    return Promise.resolve({ data: mockSession });
  });
  globals.window.localStorage.getItem.mockReturnValue(null);
  globals.window.localStorage.removeItem.mockImplementation(() => {});
  globals.window.localStorage.setItem.mockImplementation(() => {});
  params = {
    clientId: '7cbji8hkta84ons79j34qcfdci',
    storage: promiseWrapStorage(globals.window.localStorage)
  };
});

test('throws if param clientId is missing', async () => {
  delete params.clientId;
  expect(() => new APIBasedAuth(params)).toThrow(new RegExp('clientId'));
});

describe('axios create initializations', () => {
  test('axios create called with DEFAULT_BASE_URL', () => {
    auth = new APIBasedAuth(params);
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: DEFAULT_BASE_APPS_URL
    });
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: DEFAULT_BASE_API_URL
    });
  });

  test('axios create called with passed in baseURL', () => {
    auth = new APIBasedAuth({
      ...params,
      baseURLs: {
        apps: 'http://localhost:3000/apps',
        api: 'http://localhost:3000/api'
      }
    });
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: 'http://localhost:3000/apps'
    });
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: 'http://localhost:3000/api'
    });
  });
});

describe('with auth successfully created', () => {
  beforeEach(() => {
    auth = new APIBasedAuth(params);
  });

  test('confirmPasswordlessAuth throws error on failed post', async () => {
    clientAxios.post = jest.fn((_path: string) => {
      return Promise.reject('test error');
    });
    try {
      await auth.confirmPasswordlessAuth({ code });
    } catch (error) {
      expect(error).toEqual('test error');
    }

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(2);
  });

  test('confirmPasswordlessAuth throws error with no storage', async () => {
    delete params.storage;
    auth = new APIBasedAuth(params);
    clientAxios.post = jest.fn((_path: string) => {
      return Promise.reject('test error');
    });
    try {
      await auth.confirmPasswordlessAuth({ code });
    } catch (error) {
      expect(error).toEqual('test error');
    }

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(0);
    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(0);
  });

  test('confirmPasswordlessAuth without initiating nor stored values gets passed incorrect params', async () => {
    try {
      await auth.confirmPasswordlessAuth({ code });
    } catch (_error) {}

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(2);
    expect(globals.window.localStorage.getItem).toHaveBeenNthCalledWith(
      1,
      DEFAULT_SESSION_KEY
    );
    expect(globals.window.localStorage.getItem).toHaveBeenNthCalledWith(
      2,
      DEFAULT_USERNAME_KEY
    );
    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(0);

    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth/verify', {
      clientId: params.clientId,
      code,
      session: undefined,
      username: undefined
    });
  });

  test('confirmPasswordlessAuth without initiating nor stored values but with proper params passed', async () => {
    await auth.confirmPasswordlessAuth({
      code,
      ...mockSession,
      username: 'email'
    });

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(0);
    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(3);

    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth/verify', {
      clientId: params.clientId,
      code,
      ...mockSession,
      username: 'email'
    });
  });

  test('confirmPasswordlessAuth without initiating nor params passed but with stored values', async () => {
    globals.window.localStorage.getItem.mockImplementation((type: string) => {
      if (type === DEFAULT_SESSION_KEY) {
        return mockSession.session;
      }
      if (type === DEFAULT_USERNAME_KEY) {
        return 'email';
      }
    });

    await auth.confirmPasswordlessAuth({
      code
    });

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(2);
    expect(globals.window.localStorage.getItem).toHaveBeenNthCalledWith(
      1,
      DEFAULT_SESSION_KEY
    );
    expect(globals.window.localStorage.getItem).toHaveBeenNthCalledWith(
      2,
      DEFAULT_USERNAME_KEY
    );
    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(3);

    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth/verify', {
      clientId: params.clientId,
      code,
      ...mockSession,
      username: 'email'
    });
  });

  test('confirmPasswordlessAuth without initiating nor params passed but with storageKeys removed', async () => {
    auth = new APIBasedAuth({
      ...params,
      storageKeys: { session: undefined, username: undefined }
    });

    try {
      await auth.confirmPasswordlessAuth({
        code
      });
    } catch (error) {
      expect(error).toEqual('invalid credentials');
      expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(0);
      expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(0);

      expect(clientAxios.post).toHaveBeenCalledWith(
        '/passwordless-auth/verify',
        {
          clientId: params.clientId,
          code
        }
      );
    }
  });

  test('confirmPasswordlessAuth without initiating nor params passed but with stored values with custom StorageKeys', async () => {
    auth = new APIBasedAuth({
      ...params,
      storageKeys: { session: 'custom_session', username: 'custom_username' }
    });
    globals.window.localStorage.getItem.mockImplementation((type: string) => {
      if (type === 'custom_session') {
        return mockSession.session;
      }
      if (type === 'custom_username') {
        return 'email';
      }
    });

    await auth.confirmPasswordlessAuth({
      code
    });

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(2);
    expect(globals.window.localStorage.getItem).toHaveBeenNthCalledWith(
      1,
      'custom_session'
    );
    expect(globals.window.localStorage.getItem).toHaveBeenNthCalledWith(
      2,
      'custom_username'
    );
    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(3);
    assertTokenStorage();

    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth/verify', {
      clientId: params.clientId,
      code,
      ...mockSession,
      username: 'email'
    });
  });

  test('confirmPasswordlessAuth after initiating gets passed correct params', async () => {
    await auth.initiatePasswordlessAuth({
      appsBaseUri: 'api-base-uri',
      loginAppBasePath: 'login-app-base-path',
      username: 'email'
    });

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(0);
    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(2);
    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth', {
      appsBaseUri: 'api-base-uri',
      clientId: params.clientId,
      loginAppBasePath: 'login-app-base-path',
      username: 'email'
    });

    await auth.confirmPasswordlessAuth({ code });

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(0);

    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth/verify', {
      clientId: params.clientId,
      code,
      ...mockSession,
      username: 'email'
    });
    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(5);
  });

  test('getLoginMethods calls API to get login methods and refetches if called again', async () => {
    expect(clientAxios.get).toHaveBeenCalledTimes(0);

    const loginMethods = await auth.getLoginMethods('test_username');

    expect(loginMethods).toEqual(
      mockLoginMethods.map((method, index) => ({
        ...method,
        accountName: `test_username ${index}`
      }))
    );
    expect(clientAxios.get).toHaveBeenCalledTimes(1);
    expect(clientAxios.get).toHaveBeenNthCalledWith(1, '/login-methods', {
      params: {
        login: 'test_username',
        clientId: auth.clientOptions.clientId
      }
    });

    const loginMethods2 = await auth.getLoginMethods('test_username');

    expect(loginMethods2).toEqual(
      mockLoginMethods.map((method, index) => ({
        ...method,
        accountName: `test_username ${index}`
      }))
    );
    expect(clientAxios.get).toHaveBeenCalledTimes(2);
    expect(clientAxios.get).toHaveBeenNthCalledWith(2, '/login-methods', {
      params: {
        login: 'test_username',
        clientId: auth.clientOptions.clientId
      }
    });
  });

  test('initPasswordlessAuth with session storageKey removed', async () => {
    auth = new APIBasedAuth({
      ...params,
      storageKeys: { session: undefined }
    });

    await auth.initiatePasswordlessAuth({
      appsBaseUri: 'api-base-uri',
      loginAppBasePath: 'login-app-base-path',
      username: 'email'
    });

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(0);
    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(globals.window.localStorage.setItem).toHaveBeenNthCalledWith(
      1,
      DEFAULT_USERNAME_KEY,
      'email'
    );
    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth', {
      appsBaseUri: 'api-base-uri',
      clientId: params.clientId,
      loginAppBasePath: 'login-app-base-path',
      username: 'email'
    });
  });

  test('initiatePasswordlessAuth throws error on failed post', async () => {
    clientAxios.post = jest.fn((_path: string) => {
      return Promise.reject('test error');
    });
    try {
      await auth.initiatePasswordlessAuth({
        appsBaseUri: 'api-base-uri',
        loginAppBasePath: 'login-app-base-path',
        username: 'email'
      });
    } catch (error) {
      expect(error).toEqual('test error');
    }

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(0);
    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(0);
  });

  test('initiatePasswordAuth success with no JSON.stringify usage', async () => {
    const jsonSpy = jest.spyOn(JSON, 'stringify');
    await auth.initiatePasswordAuth({
      password: 'password',
      username: 'email'
    });

    expect(clientAxios.post).toHaveBeenCalledWith('/login', {
      clientId: params.clientId,
      password: 'password',
      username: 'email'
    });

    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(3);
    expect(globals.window.localStorage.setItem).toHaveBeenNthCalledWith(
      1,
      DEFAULT_ACCESS_TOKEN_KEY,
      mockToken.accessToken
    );
    expect(globals.window.localStorage.setItem).toHaveBeenNthCalledWith(
      2,
      DEFAULT_ID_TOKEN_KEY,
      mockToken.idToken
    );
    expect(globals.window.localStorage.setItem).toHaveBeenNthCalledWith(
      3,
      DEFAULT_REFRESH_TOKEN_KEY,
      mockToken.refreshToken
    );
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  test('initiatePasswordAuth success with no storage', async () => {
    delete params.storage;
    auth = new APIBasedAuth(params);

    await auth.initiatePasswordAuth({
      password: 'password',
      username: 'email'
    });

    expect(clientAxios.post).toHaveBeenCalledWith('/login', {
      clientId: params.clientId,
      password: 'password',
      username: 'email'
    });

    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(0);
  });

  test('initiatePasswordAuth throws error on failed post', async () => {
    clientAxios.post = jest.fn((_path: string) => {
      return Promise.reject('test error');
    });
    try {
      await auth.initiatePasswordAuth({
        password: 'password',
        username: 'email'
      });
    } catch (error) {
      expect(error).toEqual('test error');
    }

    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(0);
  });

  test('initiatePasswordAuth throws error with no storage', async () => {
    delete params.storage;
    auth = new APIBasedAuth(params);
    clientAxios.post = jest.fn((_path: string) => {
      return Promise.reject('test error');
    });
    try {
      await auth.initiatePasswordAuth({
        password: 'password',
        username: 'email'
      });
    } catch (error) {
      expect(error).toEqual('test error');
    }

    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(0);
  });

  test('logout does not crash calling removeItem', async () => {
    await auth.logout();
    expect(globals.window.localStorage.removeItem).toHaveBeenCalledTimes(5);
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      1,
      DEFAULT_SESSION_KEY
    );
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      3,
      DEFAULT_USERNAME_KEY
    );
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      2,
      DEFAULT_ACCESS_TOKEN_KEY
    );
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      4,
      DEFAULT_ID_TOKEN_KEY
    );
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      5,
      DEFAULT_REFRESH_TOKEN_KEY
    );
  });

  test('logout does not crash calling removeItem with session storageKey removed', async () => {
    auth = new APIBasedAuth({
      ...params,
      storageKeys: { session: undefined }
    });

    await auth.logout();
    expect(globals.window.localStorage.removeItem).toHaveBeenCalledTimes(4);
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      1,
      DEFAULT_USERNAME_KEY
    );
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      2,
      DEFAULT_ACCESS_TOKEN_KEY
    );
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      3,
      DEFAULT_ID_TOKEN_KEY
    );
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      4,
      DEFAULT_REFRESH_TOKEN_KEY
    );
  });

  test('logout does not crash calling removeItem with no storage', async () => {
    delete params.storage;
    auth = new APIBasedAuth(params);

    await auth.logout();
    expect(globals.window.localStorage.removeItem).toHaveBeenCalledTimes(0);
  });

  test('redeemCustomAppCode calls the correct', async () => {
    const mockResponse = {
      accessToken: 'mock-access-token',
      identityToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token'
    };
    jest.spyOn(clientAxios, 'post').mockResolvedValue({ data: mockResponse });

    const result = await auth.redeemCustomAppCode('mock-code');

    expect(result).toStrictEqual(mockResponse);

    expect(clientAxios.post).toHaveBeenCalledTimes(1);
    expect(clientAxios.post).toHaveBeenCalledWith('/client-tokens/redeem', {
      clientId: params.clientId,
      code: 'mock-code'
    });
  });

  test('initiateSignup makes expected request', async () => {
    const mockResponse: APIBasedAuth.InitiateSignupResponse = {
      userConfirmed: false
    };
    jest.spyOn(clientAxios, 'post').mockResolvedValue({ data: mockResponse });

    const input: Omit<APIBasedAuth.InitiateSignupData, 'clientId'> = {
      email: 'test.user@test.com',
      phone: undefined,
      username: 'test.user',
      password: 'test-password',
      familyName: 'test',
      givenName: 'user',
      originalUrl: 'https://test.com'
    };

    const result = await auth.initiateSignup(input);

    expect(result).toStrictEqual(mockResponse);

    expect(clientAxios.post).toHaveBeenCalledTimes(1);
    expect(clientAxios.post).toHaveBeenCalledWith('/signup', {
      clientId: params.clientId,
      ...input
    });
  });

  test('getAccessToken returns undefined with no storage set', async () => {
    delete params.storage;
    auth = new APIBasedAuth(params);

    const initialize = () => {
      let accessToken = '';

      globals.window.localStorage.getItem.mockImplementation((key: string) => {
        if (key === DEFAULT_ACCESS_TOKEN_KEY && accessToken) {
          return accessToken;
        }
        return null;
      });

      globals.window.localStorage.setItem.mockImplementation(
        (key: string, value: string) => {
          if (key === DEFAULT_ACCESS_TOKEN_KEY) {
            accessToken = value;
          }
        }
      );
    };
    initialize();

    const result = await auth.getAccessToken();

    expect(result).toBeUndefined();

    await auth.initiatePasswordAuth({
      password: 'password',
      username: 'email'
    });

    const newAccessToken = await auth.getAccessToken();

    expect(newAccessToken).toBeUndefined();
  });

  test('getAccessToken returns with the correct value when set', async () => {
    const initialize = () => {
      let accessToken = '';

      globals.window.localStorage.getItem.mockImplementation((key: string) => {
        if (key === DEFAULT_ACCESS_TOKEN_KEY && accessToken) {
          return accessToken;
        }
        return null;
      });

      globals.window.localStorage.setItem.mockImplementation(
        (key: string, value: string) => {
          if (key === DEFAULT_ACCESS_TOKEN_KEY) {
            accessToken = value;
          }
        }
      );
    };
    initialize();
    const result = await auth.getAccessToken();

    expect(result).toBeNull();

    await auth.initiatePasswordAuth({
      password: 'password',
      username: 'email'
    });

    const newAccessToken = await auth.getAccessToken();

    expect(newAccessToken).toBe(mockToken.accessToken);
  });

  test('setTokens sets tokens into storage', async () => {
    auth.clientOptions.storage.getItem('');
    await auth.setTokens(mockToken);
    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(3);
    assertTokenStorage();
  });
});

const assertTokenStorage = () => {
  expect(globals.window.localStorage.setItem).toHaveBeenNthCalledWith(
    1,
    DEFAULT_ACCESS_TOKEN_KEY,
    mockToken.accessToken
  );
  expect(globals.window.localStorage.setItem).toHaveBeenNthCalledWith(
    2,
    DEFAULT_ID_TOKEN_KEY,
    mockToken.idToken
  );
  expect(globals.window.localStorage.setItem).toHaveBeenNthCalledWith(
    3,
    DEFAULT_REFRESH_TOKEN_KEY,
    mockToken.refreshToken
  );
};
