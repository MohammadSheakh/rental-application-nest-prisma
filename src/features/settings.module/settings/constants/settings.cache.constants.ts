export const SETTINGS_CACHE_CONFIG = {
  PREFIX: 'settings',
  TTL: 3600, // 1 hour
  INVALIDATION_PATTERNS: {
    SETTINGS_UPDATED: (type: string) => [`settings:${type}`, 'settings:all'],
  },
};

export const SETTINGS_RATE_LIMITS = {
  GET_SETTINGS: { limit: 100, window: 60 },
  MANAGE_SETTINGS: { limit: 10, window: 60 },
};
