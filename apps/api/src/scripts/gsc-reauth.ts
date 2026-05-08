import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { OAuth2Client } from 'google-auth-library';

const CREDENTIALS_PATH = process.env.GSC_CREDENTIALS ?? `${process.env.HOME}/Downloads/client_secret_109775157063-v4i6tfvebedmkro2gi5ri7kjei1bi0nc.apps.googleusercontent.com.json`;
const TOKEN_PATH = process.env.GSC_TOKEN ?? `${process.env.HOME}/.config/gsc/token.json`;
const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const REDIRECT_PORT = 8080;

const raw = JSON.parse(await readFile(CREDENTIALS_PATH, 'utf8'));
const creds = (raw.installed ?? raw.web) as { client_id: string; client_secret: string };

const client = new OAuth2Client({
  clientId: creds.client_id,
  clientSecret: creds.client_secret,
  redirectUri: `http://localhost:${REDIRECT_PORT}`,
});

const url = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
console.log('\nOpen this URL in your browser:\n');
console.log(url);
console.log('\nWaiting for OAuth callback...\n');

const code = await new Promise<string>((resolve) => {
  const server = createServer((req, res) => {
    const qs = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`).searchParams;
    res.end('Auth complete — you can close this tab.');
    server.close();
    resolve(qs.get('code')!);
  }).listen(REDIRECT_PORT);
});

const { tokens } = await client.getToken(code);
client.setCredentials(tokens);

const tokenData = {
  token: tokens.access_token,
  refresh_token: tokens.refresh_token,
  token_uri: 'https://oauth2.googleapis.com/token',
  client_id: creds.client_id,
  client_secret: creds.client_secret,
  scopes: SCOPES,
  universe_domain: 'googleapis.com',
  account: '',
  expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
};

await writeFile(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
console.log(`\nToken saved to: ${TOKEN_PATH}`);
console.log('\nPaste this as GSC_TOKEN_JSON in Render:\n');
console.log(JSON.stringify(tokenData));
