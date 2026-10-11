// Turns a failed request into a message that says what went wrong. Axios
// errors often carry an empty message (a connect timeout surfaces as an
// AggregateError with no text), so the code, status and URL are read instead.

export interface RequestErrorDetails {
  // A readable sentence for logs and the UI
  message: string;
  code?: string;
  status?: number;
  url?: string;
  timedOut: boolean;
  // True when no HTTP response came back at all
  unreachable: boolean;
}

const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ESOCKETTIMEDOUT']);

const CODE_REASONS: Record<string, string> = {
  ECONNREFUSED: 'connection refused',
  ECONNRESET: 'connection reset',
  ENOTFOUND: 'host not found',
  EAI_AGAIN: 'host lookup failed',
  EHOSTUNREACH: 'host unreachable',
  ENETUNREACH: 'network unreachable',
  EPROTO: 'TLS handshake failed',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'self-signed TLS certificate',
  SELF_SIGNED_CERT_IN_CHAIN: 'self-signed TLS certificate',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'untrusted TLS certificate',
  CERT_HAS_EXPIRED: 'expired TLS certificate',
  ERR_TLS_CERT_ALTNAME_INVALID: 'TLS certificate does not match the host',
};

interface ErrorLike {
  message?: string;
  code?: string;
  errors?: { code?: string; message?: string }[];
  response?: { status?: number };
  config?: { baseURL?: string; url?: string };
}

// The query string can hold API keys, so only the origin and path are kept
const cleanUrl = (config?: ErrorLike['config']): string | undefined => {
  if (!config) {
    return undefined;
  }

  const { baseURL, url } = config;
  let full: string | undefined;

  if (url && /^https?:\/\//i.test(url)) {
    full = url;
  } else if (baseURL) {
    full = `${baseURL.replace(/\/+$/, '')}${
      url ? `/${url.replace(/^\/+/, '')}` : ''
    }`;
  } else {
    full = url;
  }

  if (!full) {
    return undefined;
  }

  try {
    const parsed = new URL(full);
    return `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return full.split('?')[0];
  }
};

export const describeRequestError = (
  error: unknown,
  { service, url: fallbackUrl }: { service?: string; url?: string } = {}
): RequestErrorDetails => {
  const e = (error ?? {}) as ErrorLike;
  const code = e.code ?? e.errors?.find((inner) => inner.code)?.code;
  const status = e.response?.status;
  const url = cleanUrl(e.config) ?? fallbackUrl;
  const rawMessage =
    e.message || e.errors?.find((inner) => inner.message)?.message || '';
  const timedOut =
    (code !== undefined && TIMEOUT_CODES.has(code)) ||
    /timeout|timed out/i.test(rawMessage);
  const unreachable = status === undefined && (code !== undefined || timedOut);
  const target = `${service ?? 'the server'}${url ? ` at ${url}` : ''}`;

  let message: string;

  if (status !== undefined) {
    message = `${service ?? 'The server'}${
      url ? ` at ${url}` : ''
    } responded with status ${status}`;
  } else if (timedOut) {
    message = `Could not reach ${target} (timed out)`;
  } else if (code) {
    message = `Could not reach ${target} (${CODE_REASONS[code] ?? code})`;
  } else if (rawMessage) {
    message = rawMessage;
  } else {
    message = `Unknown error${url ? ` for ${url}` : ''}`;
  }

  return { message, code, status, url, timedOut, unreachable };
};

// Fields for a log line, so the cause is never an empty string
export const requestErrorLogFields = (
  error: unknown,
  options?: { service?: string; url?: string }
): Record<string, unknown> => {
  const details = describeRequestError(error, options);

  return {
    errorMessage: details.message,
    ...(details.code ? { code: details.code } : {}),
    ...(details.status !== undefined ? { status: details.status } : {}),
    ...(details.url ? { url: details.url } : {}),
  };
};
