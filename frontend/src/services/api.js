export const API_BASE_URL = import.meta.env.VITE_API_URL;
export const SOCKET_BASE_URL = import.meta.env.VITE_SOCKET_URL;

export const fetchApi = async (endpoint, options = {}) => {
  const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return response;
}