import { readFile } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

type GscTokenFile = {
  token?: string;
  refresh_token?: string;
  token_uri?: string;
  client_id?: string;
  client_secret?: string;
  expiry?: string;
};

export type GscRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type SearchAnalyticsResponse = {
  rows?: GscRow[];
};

const GSC_API_BASE = 'https://searchconsole.googleapis.com';

@Injectable()
export class GscApiService {
  private readonly logger = new Logger(GscApiService.name);

  constructor(private readonly config: ConfigService) {}

  async querySearchAnalytics(
    siteUrl: string,
    dimensions: string[],
    startDate: string,
    endDate: string,
    rowLimit = 1000,
  ): Promise<GscRow[]> {
    const client = await this.getAuthClient();
    const { token } = await client.getAccessToken();

    const response = await fetch(
      `${GSC_API_BASE}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startDate, endDate, dimensions, rowLimit, dataState: 'final' }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GSC API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as SearchAnalyticsResponse;
    return data.rows ?? [];
  }

  private async getAuthClient(): Promise<OAuth2Client> {
    const tokenJson = this.config.get<string>('GSC_TOKEN_JSON');
    let tokenData: GscTokenFile;

    if (tokenJson) {
      tokenData = JSON.parse(tokenJson) as GscTokenFile;
    } else {
      const tokenPath = this.config.get<string>('GSC_TOKEN') ?? this.expandHome('~/.config/gsc/token.json');
      tokenData = JSON.parse(await readFile(this.expandHome(tokenPath), 'utf8')) as GscTokenFile;
    }

    const client = new OAuth2Client({
      clientId: tokenData.client_id,
      clientSecret: tokenData.client_secret,
      eagerRefreshThresholdMillis: 5 * 60 * 1000,
    });

    client.setCredentials({
      access_token: tokenData.token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry ? new Date(tokenData.expiry).getTime() : undefined,
      token_type: 'Bearer',
    });

    return client;
  }

  private expandHome(path: string): string {
    if (path === '~') return process.env.HOME ?? path;
    if (path.startsWith('~/')) return `${process.env.HOME}${path.slice(1)}`;
    return path;
  }
}
