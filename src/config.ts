export interface Config {
  port: number;
  dbPath: string;
  staffToken: string;
  // Simulated delay for sending email, to mimic the real SMTP provider.
  emailLatencyMs: number;
  // How long catalog availability counts are cached.
  availabilityTtlMs: number;
  // Allow POST /api/admin/clock. Never on in production.
  allowClockOverride: boolean;
  fakeNow?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? 'data/stacks.db',
    staffToken: env.STAFF_TOKEN ?? 'desk-dev-token',
    emailLatencyMs: Number(env.EMAIL_LATENCY_MS ?? 250),
    availabilityTtlMs: Number(env.AVAILABILITY_TTL_MS ?? 6 * 60 * 60 * 1000),
    allowClockOverride: !production,
    fakeNow: env.FAKE_NOW,
  };
}
