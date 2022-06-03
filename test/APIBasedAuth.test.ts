import axios, { AxiosError } from 'axios';
import APIBasedAuth, {
  DEFAULT_BASE_URL,
  formatAxiosError
} from '../src/APIBasedAuth';

jest.mock('axios');
const isAxiosError = jest.fn();
axios.isAxiosError = isAxiosError as unknown as typeof axios.isAxiosError;
axios.create = jest.fn(() => clientAxios);

let auth: APIBasedAuth;
let params;
const authPaths = ['/login', '/passwordless-auth/verify'];
const code = '123';
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

  test('confirmPasswordlessAuth without initiating gets passed incorrect params', async () => {
    await auth.confirmPasswordlessAuth({ code });

    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth/verify', {
      clientId: params.clientId,
      code
    });
  });

  test('confirmPasswordlessAuth without initiating but with proper params passed', async () => {
    await auth.confirmPasswordlessAuth({
      code,
      ...mockSession,
      username: 'email'
    });

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
    expect(clientAxios.post).toHaveBeenCalledWith('/passwordless-auth', {
      appsBaseUri: 'api-base-uri',
      clientId: params.clientId,
      loginAppBasePath: 'login-app-base-path',
      username: 'email'
    });

    await auth.confirmPasswordlessAuth({ code });

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
  });

  test('logout does not crash for coverage', () => {
    auth.logout();
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

  test('not isAxiosError', () => {
    isAxiosError.mockReturnValueOnce(false);
    expect(() => formatAxiosError('some error')).toThrowError(
      new AxiosError('some error')
    );
  });
});
