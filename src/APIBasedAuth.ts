import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';

// exporting just for jest test coverage
export const DEFAULT_BASE_URL = 'https://apps.us.lifeomic.com/auth/v1/api';

// exporting just for jest test coverage
export const formatAxiosError = <ErrorResponse = any>(
  error: AxiosError<ErrorResponse> | unknown
) => {
  if (!axios.isAxiosError(error)) {
    throw new AxiosError(String(error));
  }
  throw error.response?.data;
};

class APIBasedAuth {
  private client: AxiosInstance;
  private clientId: APIBasedAuth.Config['clientId'];
  private session?: APIBasedAuth.Session;

  constructor({ clientId, ...options }: APIBasedAuth.Config) {
    if (!clientId) {
      throw new Error('APIBasedAuth param clientId is required');
    }

    this.client = axios.create({
      ...options,
      baseURL: options.baseURL || DEFAULT_BASE_URL
    });

    this.clientId = clientId;
  }

  public confirmPasswordlessAuth(
    baseInput: Omit<APIBasedAuth.VerifyPasswordlessAuthData, 'clientId'>
  ) {
    const input = {
      ...baseInput,
      // if session or username is not present get stored properties
      ...(!baseInput.session || !baseInput.username ? this.session : null)
    };
    return this.client
      .post<
        APIBasedAuth.SuccessfulAuthResponse,
        AxiosResponse<APIBasedAuth.SuccessfulAuthResponse>,
        APIBasedAuth.VerifyPasswordlessAuthData
      >('/passwordless-auth/verify', {
        clientId: this.clientId,
        code: input.code,
        session: input.session,
        username: input.username
      })
      .then(({ data }) => {
        // TODO: add storage
        return data;
      })
      .catch(formatAxiosError);
  }

  public initiatePasswordAuth(
    input: Omit<APIBasedAuth.SignInData, 'clientId'>
  ) {
    return this.client
      .post<
        APIBasedAuth.SuccessfulAuthResponse,
        AxiosResponse<APIBasedAuth.SuccessfulAuthResponse>,
        APIBasedAuth.SignInData
      >('/login', {
        clientId: this.clientId,
        ...input
      })
      .then(({ data }) => {
        // TODO: add storage
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
        clientId: this.clientId,
        loginAppBasePath,
        username
      })
      .then(({ data }) => {
        this.session = {
          session: data.session,
          username
        };
        return data;
      })
      .catch(formatAxiosError);
  }

  public logout() {
    this.session = undefined;
  }
}

declare namespace APIBasedAuth {
  export type Config = {
    clientId: string;
    baseURL?: string;
    withCredentials?: boolean;
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

  export type Session = {
    session: string;
    username: string;
  };

  export type SignInData = {
    clientId: string;
    password: string;
    username: string;
  };

  export type SuccessfulAuthResponse = {
    accessToken: string;
    idToken: string;
    refreshToken: string;
  };

  export type VerifyPasswordlessAuthData = {
    clientId: string;
    code: string;
    session?: string;
    username?: string;
  };
}

export default APIBasedAuth;
