import * as ClientOAuth2 from 'client-oauth2';
const queryString = require('query-string');
import { window } from './globals';

// Defaults:
const AUTH_TOKEN_INTERVAL = 30 * 1000; // every 30 seconds
const AUTH_REFRESH_WINDOW = 5; // minutes before token expiration that we renew
const AUTH_STORAGE_KEY = 'lo-app-tools-auth';

const LO_QUERY_STRING_PARAMS = [
  'account',
  'projectId',
  'cohortId'
];

class LOAuth {
  private client: ClientOAuth2;
  private clientOptions: LOAuth.Config;
  private token: LOAuth.Token;
  private refreshInterval: number;
  appState: Record<string, string>;

  constructor(options: LOAuth.Config) {
    const required = [
      'clientId',
      'authorizationUri',
      'accessTokenUri',
      'redirectUri',
      'logoutUri',
      'logoutRedirectUri',
      'scopes'
    ];
    for (const param of required) {
      // eslint-disable-next-line security/detect-object-injection
      if (!options[param]) {
        throw new Error(`LOAuth ctor param ${param} is required`);
      }
    }

    const state = this._getStateForClientOAuth(options);

    this.client = new ClientOAuth2({
      clientId: options.clientId,
      authorizationUri: options.authorizationUri,
      accessTokenUri: options.accessTokenUri,
      redirectUri: options.redirectUri,
      scopes: options.scopes,
      state
    });
    this.clientOptions = options;
    this.clientOptions.storageKey = options.storageKey || AUTH_STORAGE_KEY;
    this.clientOptions.storage = options.storage || window.localStorage;
  }

  _getAppUri () {
    this._decodeAppState();
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port ? ':' + window.location.port : '';
    const queryParameters = new URLSearchParams();
    LO_QUERY_STRING_PARAMS.forEach(param => {
      if (this.appState[param]) {
        queryParameters.set(param, this.appState[param]);
      }
    });
    let queryString = queryParameters.toString();
    queryString = queryString.length ? `?${queryString}` : '';
    const pathname = this.appState.pathname || '';
    return `${protocol}//${hostname}${port}${pathname}${queryString}`;
  }

  _decodeAppState () {
    const queryParameters = new URLSearchParams(window.location.search);
    try {
      this.appState = {};

      // If initial load, read from queryStrings
      LO_QUERY_STRING_PARAMS.forEach(param => {
        if (queryParameters.get(param)) {
          this.appState[param] = queryParameters.get(param);
        }
      });

      // After redirect pathname will be the root directory, but don't add that to
      // the appState object because it messes up the Object key ordering and causes
      // the state comparison to fail
      if (window.location.pathname && window.location.pathname !== '/') {
        this.appState.pathname = window.location.pathname;
      }

      // If after login flow, decode from state
      const queryState = queryParameters.get('state');
      if (queryState) {
        Object.assign(this.appState, JSON.parse(atob(queryState)));
      }
    } catch (error) {
      console.warn(error, 'Error occurred parsing state query string parameter');
    }
  }

  private _getStateForClientOAuth(options: LOAuth.Config) {
    this._decodeAppState();

    const state = {
      ...this.appState,
      ...options.appState
    };

    if (Object.keys(state).length === 0) {
      return undefined;
    }

    return btoa(JSON.stringify(state));
  }

  private _storeTokenData(token: LOAuth.Token) {
    const { storage, storageKey } = this.clientOptions;
    const data: LOAuth.TokenData = {
      ...token.data,
      expires: token.expires.getTime()
    };
    storage.setItem(storageKey, JSON.stringify(data));
  }

  private _getTokenDataFromStorage(): LOAuth.TokenData {
    const { storage, storageKey } = this.clientOptions;
    const value = storage.getItem(storageKey);

    return value ? JSON.parse(value) : null;
  }

  private _removeTokenDataFromStorage() {
    const { storage, storageKey } = this.clientOptions;
    storage.removeItem(storageKey);
  }

  private _isTokenExpiring(options: LOAuth.RefreshOptions = {}) {
    const refreshWindow =
      options.refreshWindow !== undefined
        ? options.refreshWindow
        : AUTH_REFRESH_WINDOW;
    return (
      Math.floor((this.token.expires.getTime() - Date.now()) / 1000 / 60) <=
      refreshWindow
    );
  }

  public async refreshAccessToken(options: LOAuth.RefreshOptions = {}) {
    options = Object.assign({}, this.clientOptions, options);
    try {
      if (!this.token) {
        // Initial auth token exchange
        this.token = await this.client.code.getToken(
          window.location.href,
          options
        );

        this._storeTokenData(this.token);

        // Remove client_id / code from URL
        window.history.replaceState(
          {},
          window.document.title,
          this._getAppUri()
        );
      } else if (options.expiringRefresh) {
        // Token refresh
        const response = await window.fetch(this.clientOptions.accessTokenUri, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: queryString.stringify({
            client_id: options.clientId,
            grant_type: 'refresh_token',
            refresh_token: this.token.refreshToken,
            redirect_uri: this.clientOptions.redirectUri
          })
        });

        // Only create/store tokens from a valid response
        if (response.ok) {
          const responseJson = await response.json();

          this.token = this.client.createToken(
            Object.assign(
              {
                refresh_token: this.token.refreshToken
              },
              responseJson
            )
          );
          this._storeTokenData(this.token);
        } else {
          // Go back to the no token path if refresh failed
          // This will result in an auth redirect
          this.token = null;
          this._removeTokenDataFromStorage();
          await this.refreshAccessToken(options);
        }
      }
    } catch (error) {
      const tokenFromStorage = this._getTokenDataFromStorage();
      if (tokenFromStorage) {
        this.token = this.client.createToken(tokenFromStorage as any);
        this.token.expiresIn(new Date(tokenFromStorage.expires));
        if (this._isTokenExpiring(options)) {
          /**
           * Remove token from storage. It will be added back on successful token refresh
           * The other possibility is that there is an error refreshing the token and this
           * token should be thrown out until the user is authenticated again
           */
          this._removeTokenDataFromStorage();
          await this.refreshAccessToken({ expiringRefresh: true });
        }
      } else {
        console.warn(error, 'Error refreshing access token - redirecting');
        window.location.href = this.client.code.getUri();
      }
    }
  }

  public async startAutomaticTokenRefresh(options: LOAuth.RefreshOptions) {
    if (!this.token) {
      // Initiate initial auth token exchange
      await this.refreshAccessToken(options);
    }

    options = options || {};
    if (!this.refreshInterval) {
      this.refreshInterval = window.setInterval(async () => {
        try {
          if (this._isTokenExpiring(options)) {
            await this.refreshAccessToken({ expiringRefresh: true });
          }
        } catch (error) {
          console.warn(error, 'Error in automatic token refresh');
        }
      }, options.interval || AUTH_TOKEN_INTERVAL);
    }
  }

  public async stopAutomaticTokenRefresh() {
    if (this.refreshInterval) {
      window.clearInterval(this.refreshInterval);
    }
  }

  public getAccessToken() {
    return this.token && this.token.accessToken;
  }

  public async sign(options: LOAuth.SignOptions) {
    if (!this.token) {
      throw new Error(
        'Cannot sign request before receiving access token - wait for refreshAccessToken'
      );
    }
    return this.token.sign(options);
  }

  public async logout() {
    await this.stopAutomaticTokenRefresh();
    this._removeTokenDataFromStorage();
    const qs = queryString.stringify({
      client_id: this.clientOptions.clientId,
      logout_uri: this.clientOptions.logoutRedirectUri
    });
    window.location.href = `${this.clientOptions.logoutUri}?${qs}`;
  }
}

declare namespace LOAuth {
  export interface Config {
    clientId: string;
    authorizationUri: string;
    accessTokenUri: string;
    redirectUri: string;
    logoutUri: string;
    logoutRedirectUri: string;
    scopes: string[];
    storageKey?: string;
    storage?: Storage;

    // An object containing application state
    appState?: any;
  }

  export interface Token extends ClientOAuth2.Token {
    expires?: Date;
    data: any;
  }

  export interface RefreshOptions extends ClientOAuth2.Options {
    expiringRefresh?: boolean;
    refreshWindow?: number;
    interval?: number;
  }

  export interface SignOptions extends ClientOAuth2.RequestObject {}

  export interface Storage {
    getItem(key: string): string;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  }

  export interface TokenData {
    access_token: string;
    expires_in: number;
    id_token: string;
    refresh_token: string;
    token_type: string;
    expires?: number;
  }
}

export default LOAuth;
