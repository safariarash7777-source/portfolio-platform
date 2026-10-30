/** DO NOT MERGE: isolated real-public-data integration, product UI remains 345@0a0ee36. */
import { integrationError, readPublicFoolad } from './public-integration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams;
  if (query.getAll('symbol').length > 1 || [...query.keys()].some(key => key !== 'symbol')) {
    return integrationError('only_one_foolad_symbol_parameter_is_allowed', 400, 'admission');
  }
  // Only the string symbol is passed; incoming headers/auth/cookies are never forwarded.
  return readPublicFoolad(query.get('symbol'));
}
