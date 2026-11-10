import { formatDateKey } from '../lib/time.ts';
import { formatMoney } from '../lib/money.ts';
import type { Email } from './outbox.ts';
import type { Branch, Patron, Title } from '../types.ts';

export function holdReadyEmail(patron: Patron, title: Title, branch: Branch, expiresOn: string): Email {
  return {
    to: patron.email,
    subject: `Your hold is ready: ${title.title}`,
    body: [
      `Hi ${patron.name},`,
      '',
      `"${title.title}" by ${title.author} is waiting for you at ${branch.name}.`,
      `Please pick it up by ${formatDateKey(expiresOn)}. After that it goes to the next person in line.`,
      '',
      'Stacks',
    ].join('\n'),
  };
}

export function dueSoonEmail(patron: Patron, titles: Title[], dueDate: string): Email {
  return {
    to: patron.email,
    subject: 'Items due tomorrow',
    body: [
      `Hi ${patron.name},`,
      '',
      `These items are due ${formatDateKey(dueDate)}:`,
      ...titles.map((title) => `  - ${title.title}`),
      '',
      'You can renew them from your account if no one is waiting for them.',
      '',
      'Stacks',
    ].join('\n'),
  };
}

export function fineNoticeEmail(patron: Patron, balance: number): Email {
  return {
    to: patron.email,
    subject: 'You have a balance on your library account',
    body: [
      `Hi ${patron.name},`,
      '',
      `Your account balance is ${formatMoney(balance)}.`,
      'You can pay online or at any branch desk.',
      '',
      'Stacks',
    ].join('\n'),
  };
}

export function holdExpiredEmail(patron: Patron, title: Title): Email {
  return {
    to: patron.email,
    subject: `Hold expired: ${title.title}`,
    body: [
      `Hi ${patron.name},`,
      '',
      `Your hold on "${title.title}" was not picked up in time, so it went to the next person in line.`,
      'You can place a new hold at any time.',
      '',
      'Stacks',
    ].join('\n'),
  };
}
