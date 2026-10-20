import { all, run, type Db } from '../db/connection.ts';
import type { Clock } from '../clock.ts';

export interface Email {
  to: string;
  subject: string;
  body: string;
}

export interface OutboxRow {
  id: number;
  to_email: string;
  subject: string;
  body: string;
  created_at: string;
}

export interface Outbox {
  send(email: Email): Promise<void>;
  list(limit?: number): OutboxRow[];
}

// In production this calls the email provider's API. Locally it writes to the
// outbox table so you can see what would have been sent, after a delay that
// matches the provider's typical response time.
export function createOutbox(db: Db, clock: Clock, latencyMs: number): Outbox {
  return {
    async send(email) {
      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }
      run(
        db,
        'INSERT INTO outbox (to_email, subject, body, created_at) VALUES (?, ?, ?, ?)',
        email.to,
        email.subject,
        email.body,
        clock.now().toISOString(),
      );
    },
    list(limit = 50) {
      return all<OutboxRow>(db, 'SELECT * FROM outbox ORDER BY id DESC LIMIT ?', limit);
    },
  };
}
