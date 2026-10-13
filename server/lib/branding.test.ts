import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  ICON_SPECS,
  LOGO_MAX_BYTES,
  LogoValidationError,
  PUBLIC_LOGO_LIGHT_URL,
  PUBLIC_LOGO_URL,
  SPLASH_SIZES,
  brandingDirectory,
  buildIco,
  decodeLogoUpload,
  detectLogoType,
  getEmailLogo,
  parseSplashName,
  renderLogoFiles,
  renderSplash,
  validateLogo,
} from '@server/lib/branding';
import { getSettings } from '@server/lib/settings';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

const png = (width: number, height = width) =>
  sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 236, g: 112, b: 62, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

const webp = (size: number) =>
  sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .webp()
    .toBuffer();

const svg = (body = '<circle cx="50" cy="50" r="40" fill="#EC703E"/>') =>
  Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${body}</svg>`
  );

const dataUrl = (type: string, buffer: Buffer) =>
  `data:${type};base64,${buffer.toString('base64')}`;

const rejectsWith = (fn: () => unknown, code: string) =>
  assert.throws(
    fn,
    (e: unknown) => e instanceof LogoValidationError && e.code === code
  );

const rejectsAsyncWith = (promise: Promise<unknown>, code: string) =>
  assert.rejects(
    promise,
    (e: unknown) => e instanceof LogoValidationError && e.code === code
  );

describe('detectLogoType', () => {
  it('recognizes PNG, WebP and SVG by their contents', async () => {
    assert.equal(detectLogoType(await png(64)), 'png');
    assert.equal(detectLogoType(await webp(64)), 'webp');
    assert.equal(detectLogoType(svg()), 'svg');
  });

  it('rejects other files', async () => {
    const jpeg = await sharp(await png(64))
      .jpeg()
      .toBuffer();
    assert.equal(detectLogoType(jpeg), undefined);
    assert.equal(
      detectLogoType(Buffer.from('<html><svg></svg></html>')),
      undefined
    );
    assert.equal(detectLogoType(Buffer.from('')), undefined);
  });
});

describe('decodeLogoUpload', () => {
  it('accepts a data URL and bare base64', async () => {
    const image = await png(128);

    const fromDataUrl = decodeLogoUpload(dataUrl('image/png', image));
    assert.equal(fromDataUrl.type, 'png');
    assert.ok(fromDataUrl.buffer.equals(image));

    assert.equal(decodeLogoUpload(image.toString('base64')).type, 'png');
    assert.equal(decodeLogoUpload(dataUrl('image/svg+xml', svg())).type, 'svg');
  });

  it('rejects a missing or malformed value', () => {
    rejectsWith(() => decodeLogoUpload(undefined), 'INVALID_DATA');
    rejectsWith(() => decodeLogoUpload(''), 'INVALID_DATA');
    rejectsWith(() => decodeLogoUpload(42), 'INVALID_DATA');
    rejectsWith(() => decodeLogoUpload('not base64!'), 'INVALID_DATA');
    rejectsWith(
      () => decodeLogoUpload('data:image/png,plain-text'),
      'INVALID_DATA'
    );
  });

  it('rejects files over 2 MB', () => {
    const big = Buffer.alloc(LOGO_MAX_BYTES + 1024);
    big.write('\x89PNG\r\n\x1a\n', 'binary');
    rejectsWith(() => decodeLogoUpload(dataUrl('image/png', big)), 'TOO_LARGE');
  });

  it('rejects unsupported types and mismatched declarations', async () => {
    const jpeg = await sharp(await png(64))
      .jpeg()
      .toBuffer();
    rejectsWith(
      () => decodeLogoUpload(dataUrl('image/jpeg', jpeg)),
      'UNSUPPORTED_TYPE'
    );
    const image = await png(64);
    rejectsWith(
      () => decodeLogoUpload(dataUrl('image/webp', image)),
      'UNSUPPORTED_TYPE'
    );
  });

  it('rejects SVGs with scripts or embedded content', () => {
    for (const body of [
      '<script>alert(1)</script>',
      '<rect width="10" height="10" onload="alert(1)"/>',
      '<a href="javascript:alert(1)"><rect width="10" height="10"/></a>',
      '<foreignObject><div/></foreignObject>',
    ]) {
      rejectsWith(
        () => decodeLogoUpload(dataUrl('image/svg+xml', svg(body))),
        'UNSAFE_SVG'
      );
    }
  });
});

describe('validateLogo', () => {
  it('accepts square images', async () => {
    assert.deepEqual(await validateLogo(await png(256), 'png'), {
      width: 256,
      height: 256,
    });
    await validateLogo(await webp(128), 'webp');
    await validateLogo(svg(), 'svg');
  });

  it('allows a pixel or two off square', async () => {
    await validateLogo(await png(512, 505), 'png');
  });

  it('rejects images that are not square', async () => {
    await rejectsAsyncWith(
      validateLogo(await png(400, 200), 'png'),
      'NOT_SQUARE'
    );
  });

  it('rejects tiny bitmaps but not small SVGs', async () => {
    await rejectsAsyncWith(validateLogo(await png(32), 'png'), 'TOO_SMALL');
    await validateLogo(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>'
      ),
      'svg'
    );
  });

  it('rejects data that is not an image', async () => {
    await rejectsAsyncWith(
      validateLogo(Buffer.from('\x89PNG\r\n\x1a\nbroken', 'binary'), 'png'),
      'INVALID_DATA'
    );
  });
});

describe('renderLogoFiles', () => {
  it('renders every icon at its size', async () => {
    for (const [type, image] of [
      ['png', await png(300)],
      ['svg', svg()],
    ] as const) {
      const files = await renderLogoFiles(image, type);

      assert.ok(files[`logo.${type}`].equals(image));

      for (const [name, spec] of Object.entries(ICON_SPECS)) {
        const { width, height, format } = await sharp(files[name]).metadata();
        assert.equal(format, 'png', name);
        assert.equal(width, spec.size, name);
        assert.equal(height, spec.size, name);
      }

      const ico = files['favicon.ico'];
      assert.equal(ico.readUInt16LE(2), 1);
      assert.equal(ico.readUInt16LE(4), 2);
    }
  });

  it('fills maskable and Apple icons edge to edge', async () => {
    const transparent = await sharp({
      create: {
        width: 128,
        height: 128,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    const files = await renderLogoFiles(transparent, 'png');

    for (const name of [
      'apple-touch-icon.png',
      'android-chrome-512x512_maskable.png',
    ]) {
      const { channels, hasAlpha } = await sharp(files[name]).metadata();
      assert.ok(!hasAlpha || channels === 3, name);
    }
  });
});

describe('buildIco', () => {
  it('writes a directory entry per image followed by the images', () => {
    const a = Buffer.from('first');
    const b = Buffer.from('second!');
    const ico = buildIco([
      { size: 16, png: a },
      { size: 256, png: b },
    ]);

    assert.equal(ico.readUInt16LE(0), 0);
    assert.equal(ico.readUInt16LE(2), 1);
    assert.equal(ico.readUInt16LE(4), 2);
    assert.equal(ico.readUInt8(6), 16);
    assert.equal(ico.readUInt8(22), 0);
    assert.equal(ico.readUInt32LE(14), a.length);
    assert.equal(ico.readUInt32LE(18), 38);
    assert.equal(ico.readUInt32LE(34), 38 + a.length);
    assert.equal(ico.subarray(38).toString(), 'firstsecond!');
  });
});

describe('launch screens', () => {
  it('only accepts the sizes iOS asks for', () => {
    assert.deepStrictEqual(parseSplashName('apple-splash-1170-2532.jpg'), {
      width: 1170,
      height: 2532,
    });
    assert.deepStrictEqual(parseSplashName('apple-splash-2532-1170.jpg'), {
      width: 2532,
      height: 1170,
    });
    assert.strictEqual(parseSplashName('apple-splash-100-100.jpg'), undefined);
    assert.strictEqual(
      parseSplashName('apple-splash-1170-2532.png'),
      undefined
    );
    assert.strictEqual(parseSplashName('../settings.json'), undefined);
  });

  it('ships a bundled launch screen for every size', () => {
    for (const [width, height] of SPLASH_SIZES) {
      assert.ok(
        existsSync(
          path.join(
            __dirname,
            '../../public',
            `apple-splash-${width}-${height}.jpg`
          )
        ),
        `apple-splash-${width}-${height}.jpg`
      );
    }
  });

  it('centers the logo on the theme color', async () => {
    const image = await renderSplash(await png(256), 'png', 750, 1334);
    const { data, info } = await sharp(image)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };

    assert.strictEqual(info.width, 750);
    assert.strictEqual(info.height, 1334);
    assert.strictEqual((await sharp(image).metadata()).format, 'jpeg');

    const [cr, cg, cb] = pixel(375, 667);
    assert.ok(
      cr > 200 && cg > 80 && cg < 150 && cb < 100,
      'logo in the middle'
    );

    const [er, eg, eb] = pixel(5, 5);
    assert.ok(
      Math.abs(er - 32) < 6 && Math.abs(eg - 33) < 6 && Math.abs(eb - 36) < 6
    );
  });

  it('renders vector logos too', async () => {
    const image = await renderSplash(svg(), 'svg', 2732, 2048);
    const { width, height } = await sharp(image).metadata();

    assert.strictEqual(width, 2732);
    assert.strictEqual(height, 2048);
  });
});

describe('getEmailLogo', () => {
  const settings = getSettings();
  const emailOptions = settings.notifications.agents.email.options;

  afterEach(() => {
    settings.main.applicationUrl = '';
    settings.main.applicationTitle = 'AllSeerr';
    settings.main.applicationLogoVersion = '';
    emailOptions.usePublicLogo = false;
    rmSync(brandingDirectory(), { recursive: true, force: true });
  });

  it('sends the bundled wordmark with a dark text variant for light mode', () => {
    settings.main.applicationUrl = 'https://requests.example.com';

    assert.deepStrictEqual(getEmailLogo(), {
      logoUrl: 'https://requests.example.com/logo_full.png',
      logoLightUrl: 'https://requests.example.com/logo_full_dark.png',
    });
  });

  it('ships the light mode wordmark next to the default one', () => {
    for (const name of ['logo_full.png', 'logo_full_dark.png']) {
      assert.ok(
        existsSync(path.join(__dirname, '../../public', name)),
        `public/${name}`
      );
    }
  });

  it('uses both public wordmarks when asked to', () => {
    emailOptions.usePublicLogo = true;

    assert.deepStrictEqual(getEmailLogo(), {
      logoUrl: PUBLIC_LOGO_URL,
      logoLightUrl: PUBLIC_LOGO_LIGHT_URL,
    });
    assert.match(PUBLIC_LOGO_LIGHT_URL, /\/public\/logo_full_dark\.png$/);
  });

  it('shows an uploaded logo with the title and no light variant', () => {
    settings.main.applicationUrl = 'https://requests.example.com';
    settings.main.applicationLogoVersion = 'abc123';
    mkdirSync(brandingDirectory(), { recursive: true });
    writeFileSync(path.join(brandingDirectory(), 'logo.png'), 'png');

    assert.deepStrictEqual(getEmailLogo(), {
      logoIconUrl:
        'https://requests.example.com/api/v1/branding/icon/android-chrome-192x192.png?v=abc123',
    });
  });

  it('shows only the title for a renamed instance or without a URL', () => {
    assert.deepStrictEqual(getEmailLogo(), {});

    settings.main.applicationUrl = 'https://requests.example.com';
    settings.main.applicationTitle = 'Movie Night';

    assert.deepStrictEqual(getEmailLogo(), {});
  });
});
