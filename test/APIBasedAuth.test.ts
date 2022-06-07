import axios, { AxiosError } from 'axios';
import APIBasedAuth, { API_AUTH_STORAGE_KEY } from '../src/APIBasedAuth';
import { DEFAULT_BASE_URL, formatAxiosError } from '../src/utils/helper';
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

const clientAxios = { post: undefined };

beforeEach(() => {
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
      baseURL: DEFAULT_BASE_URL
    });
  });

  test('axios create called with passed in baseURL', () => {
    auth = new APIBasedAuth({ ...params, baseURL: 'http://localhost:3000' });
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: 'http://localhost:3000'
    });
  });
});

describe('with auth successfully created', () => {
  beforeEach(() => {
    auth = new APIBasedAuth(params);
  });

  test('confirmPasswordlessAuth throws error on failed post', async () => {
    clientAxios.post = jest.fn((_path: string) => {
      throw new Error('test error');
    });
    try {
      await auth.confirmPasswordlessAuth({ code });
    } catch (error) {
      expect(error).toEqual(new AxiosError('test error'));
    }

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(2);
  });

  test('confirmPasswordlessAuth throws error with no storage', async () => {
    delete params.storage;
    auth = new APIBasedAuth(params);
    clientAxios.post = jest.fn((_path: string) => {
      throw new Error('test error');
    });
    try {
      await auth.confirmPasswordlessAuth({ code });
    } catch (error) {
      expect(error).toEqual(new AxiosError('test error'));
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
      session: null,
      username: null
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

  test('initiatePasswordlessAuth throws error on failed post', async () => {
    clientAxios.post = jest.fn((_path: string) => {
      throw new Error('test error');
    });
    try {
      await auth.initiatePasswordlessAuth({
        appsBaseUri: 'api-base-uri',
        loginAppBasePath: 'login-app-base-path',
        username: 'email'
      });
    } catch (error) {
      expect(error).toEqual(new AxiosError('test error'));
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
      throw new Error('test error');
    });
    try {
      await auth.initiatePasswordAuth({
        password: 'password',
        username: 'email'
      });
    } catch (error) {
      expect(error).toEqual(new AxiosError('test error'));
    }

    expect(globals.window.localStorage.setItem).toHaveBeenCalledTimes(0);
  });

  test('initiatePasswordAuth throws error with no storage', async () => {
    delete params.storage;
    auth = new APIBasedAuth(params);
    clientAxios.post = jest.fn((_path: string) => {
      throw new Error('test error');
    });
    try {
      await auth.initiatePasswordAuth({
        password: 'password',
        username: 'email'
      });
    } catch (error) {
      expect(error).toEqual(new AxiosError('test error'));
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

  test('logout does not crash calling removeItem with no storage', async () => {
    delete params.storage;
    auth = new APIBasedAuth(params);

    await auth.logout();
    expect(globals.window.localStorage.removeItem).toHaveBeenCalledTimes(0);
  });
});

describe('formatAxios', () => {
  test('isAxiosError', () => {
    isAxiosError.mockReturnValueOnce(true);
    expect(() =>
      formatAxiosError({
        isAxiosError: true,
        response: { data: 'some error' }
      } as AxiosError)
    ).toThrowError('some error');
  });

  test('isAxiosError response undefined', () => {
    isAxiosError.mockReturnValueOnce(true);
    expect(() =>
      formatAxiosError({
        isAxiosError: true
      } as AxiosError)
    ).toThrowError(new AxiosError('unknown axios error'));
  });

  test('not isAxiosError', () => {
    isAxiosError.mockReturnValueOnce(false);
    expect(() => formatAxiosError('some error')).toThrowError(
      new AxiosError('some error')
    );
  });
});
