import {
  LOGO_MIME_TYPES,
  getIconFile,
  getLogoFile,
  getSplashFile,
  isIconName,
  parseSplashName,
} from '@server/lib/branding';
import { getSettings } from '@server/lib/settings';
import type { Request, Response } from 'express';
import { Router } from 'express';

// Public, as the sign in page shows the logo before anyone is signed in
const brandingRoutes = Router();

const setCacheHeaders = (req: Request, res: Response) => {
  const { applicationLogoVersion } = getSettings().main;

  // Versioned links never change; anything else is checked every time
  res.setHeader(
    'Cache-Control',
    applicationLogoVersion && req.query.v === applicationLogoVersion
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'
  );
};

brandingRoutes.get('/logo', (req, res) => {
  const logo = getLogoFile();

  if (!logo) {
    res.setHeader('Cache-Control', 'no-cache');
    return res.redirect(302, '/allseerr-logo.png');
  }

  setCacheHeaders(req, res);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (logo.type === 'svg') {
    // Opened directly, an SVG is a document; keep it inert
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    );
  }

  return res.type(LOGO_MIME_TYPES[logo.type]).sendFile(logo.path);
});

brandingRoutes.get<{ name: string }>('/icon/:name', (req, res, next) => {
  const { name } = req.params;

  if (!isIconName(name)) {
    return next({ status: 404, message: 'Icon not found.' });
  }

  const icon = getIconFile(name);

  if (!icon) {
    res.setHeader('Cache-Control', 'no-cache');
    return res.redirect(302, `/${name}`);
  }

  setCacheHeaders(req, res);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  return res
    .type(name.endsWith('.ico') ? 'image/x-icon' : 'image/png')
    .sendFile(icon);
});

brandingRoutes.get<{ name: string }>(
  '/splash/:name',
  async (req, res, next) => {
    const { name } = req.params;

    if (!parseSplashName(name)) {
      return next({ status: 404, message: 'Launch screen not found.' });
    }

    const splash = await getSplashFile(name);

    if (!splash) {
      res.setHeader('Cache-Control', 'no-cache');
      return res.redirect(302, `/${name}`);
    }

    setCacheHeaders(req, res);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.type('image/jpeg').sendFile(splash);
  }
);

export default brandingRoutes;
