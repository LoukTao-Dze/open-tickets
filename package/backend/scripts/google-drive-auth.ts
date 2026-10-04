import { authenticate } from '@google-cloud/local-auth';
import path from 'node:path';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

async function main() {
  const auth = await authenticate({
    keyfilePath: path.resolve(
      process.cwd(),
      'credentials/google-oauth-client.json',
    ),
    scopes: SCOPES,
  });

  const tokens = auth.credentials;

  console.log('\nGoogle OAuth completed.\n');

  console.log('Refresh Token:');
  console.log(tokens.refresh_token);

  console.log('\nAccess Token:');
  console.log(tokens.access_token);
}

main().catch(console.error);
//? [CMD RUN] npx tsx scripts/google-drive-auth.ts
