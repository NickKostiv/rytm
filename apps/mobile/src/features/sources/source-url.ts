import { ALLOWED_SOURCE_HOSTS } from '@/features/sources/constants';

const ALLOWED_SOURCE_PROTOCOL = 'https:';

export function isAllowedSourceUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === ALLOWED_SOURCE_PROTOCOL && ALLOWED_SOURCE_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

export function isAllowedWebSourceUrl(url: string): boolean {
  try {
    return new URL(url).protocol === ALLOWED_SOURCE_PROTOCOL;
  } catch {
    return false;
  }
}
