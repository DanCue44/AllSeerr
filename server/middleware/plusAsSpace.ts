/**
 * Rewrites a `+` in the query string as `%20`. Form encoding, which
 * URLSearchParams and most HTTP clients use, writes a space as `+`, and the
 * query parser already reads it as one. The OpenAPI validator checks the
 * raw query string though, and turns `+` away as a reserved character. A
 * literal plus is sent as `%2B`, so it is left alone.
 */
export const encodePlusInQuery = (url: string): string => {
  const start = url.indexOf('?');

  if (start === -1 || !url.includes('+', start)) {
    return url;
  }

  const end = url.indexOf('#', start);
  const query = url.slice(start, end === -1 ? undefined : end);

  return (
    url.slice(0, start) +
    query.replace(/\+/g, '%20') +
    (end === -1 ? '' : url.slice(end))
  );
};

const plusAsSpace: Middleware = (req, _res, next) => {
  req.url = encodePlusInQuery(req.url);
  req.originalUrl = encodePlusInQuery(req.originalUrl);
  next();
};

export default plusAsSpace;
