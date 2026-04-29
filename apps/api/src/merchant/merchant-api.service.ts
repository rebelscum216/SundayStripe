import { readFile } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';

type MerchantDestinationStatus = {
  reportingContext?: string;
  approvedCountries?: string[];
  disapprovedCountries?: string[];
  pendingCountries?: string[];
};

export type MerchantProduct = {
  name?: string;
  offerId?: string;
  productAttributes?: {
    title?: string;
    link?: string;
    availability?: string;
    brand?: string;
  };
  productStatus?: {
    destinationStatuses?: MerchantDestinationStatus[];
    itemLevelIssues?: Array<Record<string, unknown>>;
    lastUpdateDate?: string;
  };
  customAttributes?: Array<{
    name?: string;
    value?: string;
  }>;
};

type MerchantProductsResponse = {
  products?: MerchantProduct[];
  nextPageToken?: string;
};

const MERCHANT_API_BASE_URL = 'https://merchantapi.googleapis.com';
const MERCHANT_API_SCOPE = 'https://www.googleapis.com/auth/content';

@Injectable()
export class MerchantApiService {
  constructor(private readonly config: ConfigService) {}

  async listProducts(accountId: string, pageSize = 250, maxPages = 10): Promise<MerchantProduct[]> {
    const products: MerchantProduct[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({ pageSize: String(pageSize) });
      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const data = await this.get<MerchantProductsResponse>(
        `/products/v1/accounts/${accountId}/products?${params.toString()}`,
      );
      products.push(...(data.products ?? []));

      pageToken = data.nextPageToken;
      if (!pageToken) {
        break;
      }
    }

    return products;
  }

  private async get<T>(path: string): Promise<T> {
    const client = await this.getAuthClient();
    const response = await client.request<T>({
      url: `${MERCHANT_API_BASE_URL}${path}`,
      method: 'GET',
    });

    return response.data;
  }

  private async getAuthClient() {
    const credentialsJson = this.config.get<string>('GOOGLE_MERCHANT_CREDENTIALS_JSON');

    if (credentialsJson) {
      const auth = new GoogleAuth({
        credentials: JSON.parse(credentialsJson) as Record<string, unknown>,
        scopes: [MERCHANT_API_SCOPE],
      });
      return auth.getClient();
    }

    const credentialsPath =
      this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS') ??
      this.config.getOrThrow<string>('GOOGLE_MERCHANT_CREDENTIALS');
    const credentials = JSON.parse(await readFile(this.expandHome(credentialsPath), 'utf8')) as Record<
      string,
      unknown
    >;
    const auth = new GoogleAuth({
      credentials,
      scopes: [MERCHANT_API_SCOPE],
    });

    return auth.getClient();
  }

  private expandHome(path: string): string {
    if (path === '~') {
      return process.env.HOME ?? path;
    }

    if (path.startsWith('~/')) {
      return `${process.env.HOME}${path.slice(1)}`;
    }

    return path;
  }
}
