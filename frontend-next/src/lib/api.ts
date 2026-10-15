import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";

/**
 * Axios client for the (unchanged) CodeMentor backend. Behavior is identical to
 * the previous frontend: base URL `/` (so `/api/*` calls hit the Next rewrite →
 * Express), a Bearer token injected from localStorage on every request, and a
 * single transparent refresh on 401 via `/api/auth/refresh` with a wait queue
 * for concurrent requests.
 */
const api = axios.create({ baseURL: "/" });

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// Inject token on every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) {
      config.headers = config.headers ?? {};
      config.headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return config;
});

let isRefreshing = false;
let waitQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null) => {
  waitQueue.forEach((p) => (token ? p.resolve(token) : p.reject(error)));
  waitQueue = [];
};

// On 401: try refresh once, retry original request, else logout
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    // The server says this session must set a new password first (e.g. the saved profile was out of date).
    const body = error.response?.data as { code?: string } | undefined;
    if (error.response?.status === 403 && body?.code === "PASSWORD_CHANGE_REQUIRED" && typeof window !== "undefined") {
      try {
        const u = JSON.parse(localStorage.getItem("user") || "null");
        if (u) localStorage.setItem("user", JSON.stringify({ ...u, must_change_password: true }));
      } catch { /* a corrupt saved profile: the redirect below still sends them to the right page */ }
      if (!window.location.pathname.startsWith("/change-password")) window.location.href = "/change-password";
      return Promise.reject(error);
    }
    if (!original || error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    // Don't loop on the refresh call itself
    if (original.url?.includes("/api/auth/refresh")) {
      localStorage.clear();
      window.location.href = "/login";
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        waitQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers["Authorization"] = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) throw new Error("No refresh token");
      const { data } = await axios.post("/api/auth/refresh", { refreshToken });
      const newToken: string = data.accessToken;
      localStorage.setItem("accessToken", newToken);
      processQueue(null, newToken);
      original.headers["Authorization"] = `Bearer ${newToken}`;
      return api(original);
    } catch (err) {
      processQueue(err, null);
      localStorage.clear();
      window.location.href = "/login";
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
