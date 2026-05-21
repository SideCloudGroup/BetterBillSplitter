export type PublicBootstrap = {
  driver?: string;
  site_key?: string;
  captcha_image_url?: string;
  cap_custom_url?: string;
  general_name?: string;
};

const DEFAULT_SITE_NAME = 'BetterBillSplitter';

export function defaultSiteName(): string {
  return DEFAULT_SITE_NAME;
}

export async function fetchPublicBootstrap(): Promise<PublicBootstrap> {
  try {
    const r = await fetch('/api/auth/bootstrap', {credentials: 'same-origin'});
    const j = (await r.json()) as { ret?: number; data?: PublicBootstrap };
    return j.data || {driver: 'none', general_name: DEFAULT_SITE_NAME};
  } catch {
    return {driver: 'none', general_name: DEFAULT_SITE_NAME};
  }
}
