import { ROUTE_LABELS, type Route } from '@rytm/dosing';

const WORD_JOINER = '\u2060';

export function formatRouteShortLabel(route: Route): string {
  return ROUTE_LABELS[route].short.replace(/\//g, `/${WORD_JOINER}`);
}
