import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api"
});

// nginx answers an oversized upload with an HTML page: give the screens a readable message.
api.interceptors.response.use(undefined, (error) => {
  if (error?.response?.status === 413 && !error.response.data?.message) {
    error.response.data = { message: "Файлы слишком большие. Выберите меньше фото за раз." };
  }
  return Promise.reject(error);
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function imageUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return url;
}
