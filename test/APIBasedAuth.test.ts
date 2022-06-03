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
let params;
const authPaths = ['/login', '/passwordless-auth/verify'];
const code = '123';
const DEFAULT_SESSION_KEY = `${API_AUTH_STORAGE_KEY}.session`;
const DEFAULT_USERNAME_KEY = `${API_AUTH_STORAGE_KEY}.username`;
const DEFAULT_ACCESS_TOKEN_KEY = `${API_AUTH_STORAGE_KEY}.accessToken`;
const DEFAULT_ID_TOKEN_KEY = `${API_AUTH_STORAGE_KEY}.idToken`;
const DEFAULT_REFRESH_TOKEN_KEY = `${API_AUTH_STORAGE_KEY}.refreshToken`;
const mockSession = {
  session: 'session'
};
const mockToken = {
  accessToken: 'access_token',
  idToken: 'id_token',
  refreshToken: 'refresh_token'
};

const clientAxios = {
  post: jest.fn((path: string) => {
    if (authPaths.some((authPath) => authPath === path)) {
      return Promise.resolve({
        data: mockToken
      });
    }

    return Promise.resolve({ data: mockSession });
  })
};

beforeEach(() => {
  globals.window.localStorage.getItem.mockReturnValue(null);
  globals.window.localStorage.removeItem.mockImplementation(() => {});
  globals.window.localStorage.setItem.mockImplementation(() => {});
  params = {
    clientId: '7cbji8hkta84ons79j34qcfdci'
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

  test('confirmPasswordlessAuth without initiating or stored values gets passed incorrect params', async () => {
    await auth.confirmPasswordlessAuth({ code });

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(2);
    expect(globals.window.localStorage.getItem).toHaveBeenNthCalledWith(
      1,
      DEFAULT_SESSION_KEY
    );
    expect(globals.window.localStorage.getItem).toHaveBeenNthCalledWith(
      2,
      DEFAULT_USERNAME_KEY
    );

    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth/verify', {
      clientId: params.clientId,
      code,
      session: null,
      username: null
    });
  });

  test('confirmPasswordlessAuth without initiating or stored values but with proper params passed', async () => {
    await auth.confirmPasswordlessAuth({
      code,
      ...mockSession,
      username: 'email'
    });

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(0);

    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth/verify', {
      clientId: params.clientId,
      code,
      ...mockSession,
      username: 'email'
    });
  });

  test('confirmPasswordlessAuth without initiating or params passed but with stored values', async () => {
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

    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth/verify', {
      clientId: params.clientId,
      code,
      ...mockSession,
      username: 'email'
    });
  });

  test('confirmPasswordlessAuth without initiating or params passed but with stored values from promise based storage', async () => {
    auth = new APIBasedAuth({
      ...params,
      storage: {
        getItem: (key: string) => {
          if (key === DEFAULT_SESSION_KEY) {
            return Promise.resolve(mockSession.session);
          }
          if (key === DEFAULT_USERNAME_KEY) {
            return Promise.resolve('email');
          }
        },
        removeItem: () => {},
        setItem: () => {}
      }
    });

    await auth.confirmPasswordlessAuth({
      code
    });

    expect(globals.window.localStorage.getItem).toHaveBeenCalledTimes(0);

    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth/verify', {
      clientId: params.clientId,
      code,
      ...mockSession,
      username: 'email'
    });
  });

  test('confirmPasswordlessAuth without initiating or params passed but with stored values with custom StorageKeys', async () => {
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
  });

  test('initiatePasswordAuth success', async () => {
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
  });

  test('initiatePasswordAuth success with promise storage', async () => {
    globals.window.localStorage.setItem.mockImplementation(
      async (_key: string, value: string) => {
        await Promise.resolve(value);
      }
    );

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
  });

  test('logout does not crash for coverage', async () => {
    await auth.logout();
    expect(globals.window.localStorage.removeItem).toHaveBeenCalledTimes(5);
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      1,
      DEFAULT_SESSION_KEY
    );
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      2,
      DEFAULT_USERNAME_KEY
    );
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      3,
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

  test('logout does not crash for coverage with promise based remoteItem', async () => {
    globals.window.localStorage.removeItem.mockImplementation(async () => {
      await Promise.resolve();
    });
    await auth.logout();
    expect(globals.window.localStorage.removeItem).toHaveBeenCalledTimes(5);
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      1,
      DEFAULT_SESSION_KEY
    );
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      2,
      DEFAULT_USERNAME_KEY
    );
    expect(globals.window.localStorage.removeItem).toHaveBeenNthCalledWith(
      3,
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
        isAxiosError: true,
        response: undefined,
      } as AxiosError)
    ).toThrowError('unknown axios error');
  });

  test('not isAxiosError', () => {
    isAxiosError.mockReturnValueOnce(false);
    expect(() => formatAxiosError('some error')).toThrowError(
      new AxiosError('some error')
    );
  });
});
