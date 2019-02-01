import * as ClientOAuth2 from 'client-oauth2';
const queryString = require('query-string');
const { window } = require('./globals');

// Defaults:
const AUTH_TOKEN_INTERVAL = 30 * 1000; // every 30 seconds
const AUTH_REFRESH_WINDOW = 5; // minutes before token expiration that we renew

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
  appState: any;

  constructor (options: LOAuth.Config) {
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

    this._decodeAppState();
    const queryParameters = new URLSearchParams(window.location.search);
    const initialState = {};
    LO_QUERY_STRING_PARAMS.forEach(param => {
      if (queryParameters.get(param)) {
        initialState[param] = queryParameters.get(param);
      }
    });
    const state = {
      // If initial load of app, pull allowed query string parameters
      ...initialState,

      // If authenticated, and we just decoded state above
      ...this.appState,

      // Allowing for overrides
      ...options.appState
    };
    const encodedState = encodeURIComponent(JSON.stringify(state));

    this.client = new ClientOAuth2({
      clientId: options.clientId,
      authorizationUri: options.authorizationUri,
      accessTokenUri: options.accessTokenUri,
      redirectUri: options.redirectUri,
      scopes: options.scopes,
      state: encodedState
    });
    this.clientOptions = options;
  }

  _getAppUri () {
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
    return `${protocol}//${hostname}${port}${queryString}`;
  }

  _decodeAppState () {
    const queryParameters = new URLSearchParams(window.location.search);
    try {
      const decodedState = decodeURIComponent(queryParameters.get('state') || '{}');
      this.appState = JSON.parse(decodedState);
    } catch (error) {
      console.warn(error, 'Error occurred parsing state query string parameter');
    }
  }

  async refreshAccessToken (options: LOAuth.RefreshOptions) {
    options = Object.assign({}, this.clientOptions, options);
    try {
      if (!this.token) {
        // Initial auth token exchange
        this.token = await this.client.code.getToken(
          window.location.href,
          options
        );

        this._decodeAppState();

        // Remove client_id / code from URL
        window.history.replaceState({}, window.document.title, this._getAppUri());
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
        const responseJson = await response.json();
        this.token = await this.client.createToken(Object.assign({
          refresh_token: this.token.refreshToken
        }, responseJson));
      }
    } catch (error) {
      console.warn(error, 'Error refreshing access token - redirecting');
      window.location.href = await this.client.code.getUri();
    }
  }

  async startAutomaticTokenRefresh (options: LOAuth.RefreshOptions) {
    if (!this.token) {
      // Initiate initial auth token exchange
      await this.refreshAccessToken(options);
    }

    options = options || {};
    if (!this.refreshInterval) {
      this.refreshInterval = window.setInterval(async () => {
        try {
          const refreshWindow = options.refreshWindow !== undefined ? options.refreshWindow : AUTH_REFRESH_WINDOW;
          const expiring = Math.floor((this.token.expires - Date.now()) / 1000 / 60) <= refreshWindow;
          if (expiring) {
            await this.refreshAccessToken({ expiringRefresh: true });
          }
        } catch (error) {
          console.warn(error, 'Error in automatic token refresh');
        }
      }, options.interval || AUTH_TOKEN_INTERVAL);
    }
  }

  async stopAutomaticTokenRefresh () {
    if (this.refreshInterval) {
      window.clearInterval(this.refreshInterval);
    }
  }

  async sign (options: LOAuth.SignOptions) {
    if (!this.token) {
      throw new Error('Cannot sign request before receiving access token - wait for refreshAccessToken');
    }
    return this.token.sign(options);
  }

  async logout () {
    await this.stopAutomaticTokenRefresh();
    const qs = queryString.stringify({
      client_id: this.clientOptions.clientId,
      logout_uri: this.clientOptions.logoutRedirectUri
    });
    window.location.href = `${this.clientOptions.logoutUri}?${qs}`;
  }
}

declare namespace LOAuth {
  export interface Config {
    clientId: string,
    authorizationUri: string,
    accessTokenUri: string,
    redirectUri: string,
    logoutUri: string,
    logoutRedirectUri: string,
    scopes: string[],

    // An object containing application state
    appState?: any
  }

  export interface Token extends ClientOAuth2.Token {
    expires?: number
  }

  export interface RefreshOptions extends ClientOAuth2.Options {
    expiringRefresh?: boolean,
    refreshWindow?: number,
    interval?: number
  }

  export interface SignOptions extends ClientOAuth2.RequestObject {}
}

export default LOAuth;
