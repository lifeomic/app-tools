import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { window } from './globals';
import { DEFAULT_BASE_URL, formatAxiosError } from './utils/helper';

export const API_AUTH_STORAGE_KEY = 'lo-app-tools-api-auth';
const SESSION_KEYS = ['session', 'username'];
const TOKEN_KEYS = ['accessToken', 'idToken', 'refreshToken'];

class APIBasedAuth {
  private client: AxiosInstance;
  private clientOptions: APIBasedAuth.Config;
  private session?: APIBasedAuth.Session;

  constructor({
    baseURL,
    clientId,
    storage,
    storageKeys = {}
  }: APIBasedAuth.Config) {
    if (!clientId) {
      throw new Error('APIBasedAuth param clientId is required');
    }

    this.client = axios.create({ baseURL: baseURL || DEFAULT_BASE_URL });

    this.clientOptions = {
      clientId,
      storage: storage || window.localStorage,
      storageKeys
    };
  }

  public async confirmPasswordlessAuth(
    baseInput: Omit<APIBasedAuth.VerifyPasswordlessAuthData, 'clientId'>
  ) {
    const input = {
      ...baseInput,
      // if session or username is not present get stored properties
      ...(!baseInput.session || !baseInput.username
        ? await this._getFromStorage()
        : null)
    };
    return this.client
      .post<
        APIBasedAuth.Tokens,
        AxiosResponse<APIBasedAuth.Tokens>,
        APIBasedAuth.VerifyPasswordlessAuthData
      >('/passwordless-auth/verify', {
        clientId: this.clientOptions.clientId,
        code: input.code,
        session: input.session,
        username: input.username
      })
      .then(async ({ data }) => {
        await this._store('token', data);
        return data;
      })
      .catch(formatAxiosError);
  }

  public initiatePasswordAuth(
    input: Omit<APIBasedAuth.SignInData, 'clientId'>
  ) {
    return this.client
      .post<
        APIBasedAuth.Tokens,
        AxiosResponse<APIBasedAuth.Tokens>,
        APIBasedAuth.SignInData
      >('/login', {
        clientId: this.clientOptions.clientId,
        ...input
      })
      .then(async ({ data }) => {
        await this._store('token', data);
        return data;
      })
      .catch(formatAxiosError);
  }

  public initiatePasswordlessAuth({
    appsBaseUri,
    loginAppBasePath,
    username
  }: Omit<APIBasedAuth.PasswordlessAuthData, 'clientId'>) {
    return this.client
      .post<
        APIBasedAuth.PasswordlessAuthResponse,
        AxiosResponse<APIBasedAuth.PasswordlessAuthResponse>,
        APIBasedAuth.PasswordlessAuthData
      >('/passwordless-auth', {
        appsBaseUri,
        clientId: this.clientOptions.clientId,
        loginAppBasePath,
        username
      })
      .then(async ({ data }) => {
        await this._store('session', { session: data.session, username });
        return data;
      })
      .catch(formatAxiosError);
  }

  public async logout() {
    await this._removeFromStorage('session');
    await this._removeFromStorage('token');
  }

  private async _getFromStorage(): Promise<APIBasedAuth.Session> {
    if (this.session) {
      return this.session;
    }

    const { storage, storageKeys } = this.clientOptions;

    const storedValues = {} as APIBasedAuth.Session;
    for (const key of SESSION_KEYS) {
      const value = storage.getItem(
        storageKeys[key] || `${API_AUTH_STORAGE_KEY}.${key}`
      );
      storedValues[key] = value instanceof Promise ? await value : value;
    }

    this.session = storedValues;
    return storedValues;
  }

  private async _removeFromStorage<T extends APIBasedAuth.StorageTypeName>(
    type: T
  ) {
    if (type === 'session') {
      this.session = undefined;
    }

    const { storage, storageKeys } = this.clientOptions;
    for (const key of type === 'session' ? SESSION_KEYS : TOKEN_KEYS) {
      const value = storage.removeItem(
        storageKeys[key] || `${API_AUTH_STORAGE_KEY}.${key}`
      );
      if (value instanceof Promise) {
        await value;
      }
    }
  }

  private async _store<T extends APIBasedAuth.StorageTypeName>(
    type: T,
    valuesToStore: APIBasedAuth.StorageType<T>
  ) {
    const { storage, storageKeys } = this.clientOptions;
    if (type === 'session') {
      this.session = valuesToStore as APIBasedAuth.Session;
    }

    for (const key of type === 'session' ? SESSION_KEYS : TOKEN_KEYS) {
      const value = storage.setItem(
        storageKeys[key] || `${API_AUTH_STORAGE_KEY}.${key}`,
        valuesToStore[key]
      );
      if (value instanceof Promise) {
        await value;
      }
    }
  }
}

declare namespace APIBasedAuth {
  export type Config = {
    clientId: string;
    baseURL?: string;
    storage?: Storage;
    storageKeys?: StorageKeys;
  };

  export type PasswordlessAuthData = {
    appsBaseUri: string;
    clientId: string;
    loginAppBasePath: string;
    username: string;
  };

  export type PasswordlessAuthResponse = {
    session?: string;
  };

  type Session = Record<SessionKey, string>;

  type SessionKey = 'session' | 'username';

  export type SignInData = {
    clientId: string;
    password: string;
    username: string;
  };

  export type Storage = {
    getItem(key: StorageKeys[StorageKey]): string | Promise<string>;
    removeItem(key: StorageKeys[StorageKey]): void | Promise<void>;
    setItem(key: StorageKeys[StorageKey], value: string): void | Promise<void>;
  };

  type StorageKey = SessionKey | TokenKey;

  export type StorageKeys = Partial<Record<StorageKey, string>>;

  type StorageTypeName = 'session' | 'token';
  type StorageType<T = StorageTypeName> = T extends 'session'
    ? Session
    : T extends 'token'
    ? Tokens
    : never;

  type TokenKey = 'accessToken' | 'idToken' | 'refreshToken';

  type Tokens = Record<TokenKey, string>;

  export type VerifyPasswordlessAuthData = {
    clientId: string;
    code: string;
    session?: string;
    username?: string;
  };
}

export default APIBasedAuth;
