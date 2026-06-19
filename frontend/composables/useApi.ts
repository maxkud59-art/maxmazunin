import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';

export const apiInstance = axios.create({
  baseURL: 'http://localhost:3001',
});

apiInstance.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Orval mutator
export const useApiInstance = <T>(config: AxiosRequestConfig): Promise<T> =>
  apiInstance(config).then(({ data }) => data);
