// Display only the backend's rush classification for a confirmed open shop.
// A cached queue must never add a rush indicator to a closed shop.
export function shopRushLevel(shop) {
  if (!shop || shop.shop_status === 'closed' || shop.is_currently_open === false) return null;
  const open = shop.shop_status === 'open' || shop.shop_status === 'busy' || shop.is_currently_open === true;
  const level = shop.queue?.rush_level;
  return open && ['low', 'medium', 'high'].includes(level) ? level : null;
}
