import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ShopifyOAuthService } from './shopify-oauth.service.js';
import { ConfigService } from '@nestjs/config';

@Controller('shopify')
export class ShopifyOAuthController {
  private readonly logger = new Logger(ShopifyOAuthController.name);

  constructor(
    private readonly oauthService: ShopifyOAuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Step 1: Begin OAuth.
   * Browser hits /api/shopify/auth?shop=<shop-domain>
   * We validate the shop, generate a state nonce, and redirect to Shopify.
   */
  @Get('auth')
  beginAuth(@Query('shop') shop: string, @Res() res: Response): void {
    if (!shop) {
      res.status(400).json({ error: 'shop param is required' });
      return;
    }

    const authUrl = this.oauthService.buildAuthUrl(shop);
    res.redirect(authUrl);
  }

  /**
   * Step 2: OAuth callback from Shopify.
   * Shopify redirects here with ?code=...&shop=...&hmac=...&state=...
   * We verify HMAC + state, exchange code for token, store the integration,
   * then redirect the browser to the frontend.
   */
  @Get('callback')
  async handleCallback(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const { workspaceId } = await this.oauthService.handleCallback(query);

      const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
      res.redirect(`${frontendUrl}/integrations?connected=shopify&workspace=${workspaceId}`);
    } catch (err) {
      this.logger.error('Shopify OAuth callback failed', err);

      const status = (err as any).status ?? 500;
      const message = (err as any).message ?? 'OAuth failed';

      // Don't redirect on error — return JSON so it's debuggable
      res.status(status).json({ error: message });
    }
  }
}
