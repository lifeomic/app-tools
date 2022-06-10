import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { DEFAULT_BASE_URL } from './utils/helper';

export const API_AUTH_STORAGE_KEY = 'lo-app-tools-api-auth';
const SESSION_KEYS = ['session', 'username'];
const TOKEN_KEYS = [
  'accessToken',
  'expiresIn',
  'idToken',
  'refreshToken',
  'tokenType'
];
const DEFAULT_STORAGE_KEYS: APIBasedAuth.StorageKeys = {
  accessToken: `${API_AUTH_STORAGE_KEY}.accessToken`,
  expiresIn: `${API_AUTH_STORAGE_KEY}.expiresIn`,
  idToken: `${API_AUTH_STORAGE_KEY}.idToken`,
  refreshToken: `${API_AUTH_STORAGE_KEY}.refreshToken`,
  session: `${API_AUTH_STORAGE_KEY}.session`,
  tokenType: `${API_AUTH_STORAGE_KEY}.tokenType`,
  username: `${API_AUTH_STORAGE_KEY}.username`
};

/**
 * This class performs basic API based authentication based on our apps-auth repo
 *
 * Example storage differences
 *
 * Web:
 * const auth = new APIBasedAuth({
 *   clientId: 'client_id',
 *   storage: {
 *     getItem: (key) => Promise.resolve(window.localStorage.getItem(key)),
 *     removeItem: (key) => Promise.resolve(window.localStorage.removeItem(key)),
 *     setItem: (key, value) => Promise.resolve(window.localStorage.setItem(key, value)),
 *   },
 *   storageKeys: {
 *     accessToken: 'custom_access_token_key',
 *     expiresIn: 'custom_expires_in_key',
 *     idToken: 'custom_identity_token_key',
 *     refreshToken: 'custom_refresh_token_key',
 *     session: 'custom_session_key',
 *     tokenType: 'custom_token_type_key',
 *     username: 'custom_username_key',
 *   },
 * });
 *
 * Mobile (Expo):
 * import * as SecureStore from 'expo-secure-store';
 *
 * const auth = new APIBasedAuth({
 *   clientId: 'client_id',
 *   storage: {
 *     getItem: async (key) => {
 *       const value = await SecureStore.getItemAsync(key);
 *       return value;
 *     },
 *     removeItem: async (key) => {
 *       await SecureStore.deleteItemAsync(key);
 *     },
 *     setItem: async (key, value) => {
 *       await SecureStore.setItemAsync(key, value);
 *     },
 *   },
 *   storageKeys: {
 *     accessToken: 'custom_access_token_key',
 *     expiresIn: 'custom_expires_in_key',
 *     idToken: 'custom_identity_token_key',
 *     refreshToken: 'custom_refresh_token_key',
 *     session: 'custom_session_key',
 *     tokenType: 'custom_token_type_key',
 *     username: 'custom_username_key',
 *   },
 * });
 *
 * If you do not want to store certain values, explicitly mark them as undefined.
 * If nothing is passed in, all of the default keys will be used and values stored.
 *   storageKeys = {
 *     expiresIn: undefined,
 *     tokenType: undefined,
 *   };
 *
 * Reasoning for decisions made:
 * - Storage of session/token values are individual and not JSON.stringify'd together to
 *   preserve compatibility with potential React Native storage implementations that have
 *   maximum storage limitations per key-value pair
 */

class APIBasedAuth {
  private client: AxiosInstance;
  private clientOptions: APIBasedAuth.Config;
  private session?: APIBasedAuth.Session;

  constructor({
    baseURL,
    clientId,
    storage,
    storageKeys
  }: APIBasedAuth.Config) {
    if (!clientId) {
      throw new Error('APIBasedAuth param clientId is required');
    }

    this.client = axios.create({ baseURL: baseURL || DEFAULT_BASE_URL });

    this.clientOptions = {
      clientId,
      storage,
      storageKeys: { ...DEFAULT_STORAGE_KEYS, ...storageKeys }
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
    const { data } = await this.client.post<
      Omit<APIBasedAuth.Tokens, '_type'>,
      AxiosResponse<Omit<APIBasedAuth.Tokens, '_type'>>,
      Required<APIBasedAuth.VerifyPasswordlessAuthData>
    >('/passwordless-auth/verify', {
      clientId: this.clientOptions.clientId,
      code: input.code,
      session: input.session,
      username: input.username
    });
    await this._store({ _type: 'token', ...data });
    return data;
  }

  public async initiatePasswordAuth(
    input: Omit<APIBasedAuth.SignInData, 'clientId'>
  ) {
    const { data } = await this.client.post<
      Omit<APIBasedAuth.Tokens, '_type'>,
      AxiosResponse<Omit<APIBasedAuth.Tokens, '_type'>>,
      APIBasedAuth.SignInData
    >('/login', {
      clientId: this.clientOptions.clientId,
      ...input
    });
    await this._store({ _type: 'token', ...data });
    return data;
  }

  public async initiatePasswordlessAuth({
    appsBaseUri,
    loginAppBasePath,
    username
  }: Omit<APIBasedAuth.PasswordlessAuthData, 'clientId'>) {
    const { data } = await this.client.post<
      APIBasedAuth.PasswordlessAuthResponse,
      AxiosResponse<APIBasedAuth.PasswordlessAuthResponse>,
      APIBasedAuth.PasswordlessAuthData
    >('/passwordless-auth', {
      appsBaseUri,
      clientId: this.clientOptions.clientId,
      loginAppBasePath,
      username
    });
    await this._store({ _type: 'session', session: data.session, username });
    return data;
  }

  public async logout() {
    await Promise.all([
      this._removeFromStorage('session'),
      this._removeFromStorage('token')
    ]);
  }

  private async _getFromStorage(): Promise<
    Omit<APIBasedAuth.Session, '_type'>
  > {
    if (this.session) {
      return this.session;
    }

    const { storage, storageKeys } = this.clientOptions;

    const storedValues = {} as APIBasedAuth.Session;
    if (storage) {
      for (const key of SESSION_KEYS) {
        const storageKey = storageKeys[key];
        if (storageKey) {
          storedValues[key] = await storage.getItem(storageKey);
        }
      }

      this.session = storedValues;
    }

    return storedValues;
  }

  private async _removeFromStorage<T extends APIBasedAuth.StorageTypeName>(
    type: T
  ) {
    if (type === 'session') {
      this.session = undefined;
    }

    const { storage, storageKeys } = this.clientOptions;
    if (storage) {
      for (const key of type === 'session' ? SESSION_KEYS : TOKEN_KEYS) {
        const storageKey = storageKeys[key];
        if (storageKey) {
          await storage.removeItem(storageKey);
        }
      }
    }
  }

  private async _store(
    valuesToStore: APIBasedAuth.Session | APIBasedAuth.Tokens
  ) {
    if (valuesToStore._type === 'session') {
      this.session = valuesToStore;
    }

    const { storage, storageKeys } = this.clientOptions;
    if (storage) {
      for (const key of valuesToStore._type === 'session'
        ? SESSION_KEYS
        : TOKEN_KEYS) {
        const storageKey = storageKeys[key];
        if (storageKey) {
          await storage.setItem(storageKey, valuesToStore[key]);
        }
      }
    }
  }
}

declare namespace APIBasedAuth {
  export type Config = {
    /* LO clientId associated with API requests */
    clientId: string;
    /* base URL for the endpoint used to make API requests */
    baseURL?: string;
    /* interface for storage that can persist session/token values */
    storage?: Storage;
    /* custom key names that can be used to store session/token values */
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

  type Session = {
    _type: 'session';
    session: string;
    username: string;
  };

  export type SignInData = {
    clientId: string;
    password: string;
    username: string;
  };

  export type Storage = {
    getItem(key: StorageKeys[StorageKey]): Promise<string>;
    removeItem(key: StorageKeys[StorageKey]): Promise<void>;
    setItem(key: StorageKeys[StorageKey], value: string): Promise<void>;
  };

  type StorageKey = keyof Omit<Session, '_type'> | keyof Omit<Tokens, '_type'>;

  export type StorageKeys = Partial<Record<StorageKey, string | undefined>>;

  type StorageTypeName = 'session' | 'token';

  type Tokens = {
    _type: 'token';
    accessToken: string;
    expiresIn: number;
    idToken: string;
    refreshToken: string;
    tokenType: string;
  };

  export type VerifyPasswordlessAuthData = {
    clientId: string;
    code: string;
    session?: string;
    username?: string;
  };
}

export default APIBasedAuth;
