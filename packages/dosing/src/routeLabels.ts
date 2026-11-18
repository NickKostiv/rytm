import type { Route } from '#dosingRule';

export type RouteLabel = { short: string; spoken: string };

export const ROUTE_LABELS: Readonly<Record<Route, RouteLabel>> = {
  im: { short: 'в/м', spoken: 'внутрішньом’язово' },
  iv: { short: 'в/в', spoken: 'внутрішньовенно' },
  io: { short: 'в/к', spoken: 'внутрішньокістково' },
  po: { short: 'перорально', spoken: 'перорально' },
  nebulized: { short: 'небулайзер', spoken: 'через небулайзер' },
  iv_infusion: { short: 'в/в інфузія', spoken: 'внутрішньовенна інфузія' },
};
