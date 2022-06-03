import axios, { AxiosError } from 'axios';

export const DEFAULT_BASE_URL = 'https://apps.us.lifeomic.com/auth/v1/api';

export const formatAxiosError = <ErrorResponse = any>(
  error: AxiosError<ErrorResponse> | unknown
) => {
  if (!axios.isAxiosError(error)) {
    throw new AxiosError(String(error));
  }
  throw error.response?.data || 'unknown axios error';
};
