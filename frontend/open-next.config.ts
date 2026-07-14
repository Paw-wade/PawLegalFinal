import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Cache Next.js optionnel : décommenter + binding R2 NEXT_INC_CACHE_R2_BUCKET
 * dans wrangler.jsonc (voir https://opennext.js.org/cloudflare/caching).
 */
export default defineCloudflareConfig({});
