import {
  AMBIENT_PALETTE,
  parseInterfaceStyle,
} from '@app/context/InterfaceStyleContext';
import type { DocumentContext, DocumentInitialProps } from 'next/document';
import Document, { Head, Html, Main, NextScript } from 'next/document';

import type { JSX } from 'react';

interface MyDocumentProps extends DocumentInitialProps {
  palette?: string;
}

class MyDocument extends Document<MyDocumentProps> {
  static async getInitialProps(ctx: DocumentContext): Promise<MyDocumentProps> {
    const initialProps = await Document.getInitialProps(ctx);

    // Paint the chosen interface's palette on the first frame
    const palette =
      parseInterfaceStyle(ctx.req?.headers.cookie) === 'ambient'
        ? AMBIENT_PALETTE
        : undefined;

    return { ...initialProps, palette };
  }

  render(): JSX.Element {
    return (
      <Html data-palette={this.props.palette}>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
