import { quoteStatusLabel, type QuoteStatus } from '@mybusiness/shared';
import type { BadgeTone } from '../../components/ui';

export const quoteTone: Record<QuoteStatus, BadgeTone> = { draft: 'grey', sent: 'blue', accepted: 'green', expired: 'red' };
export { quoteStatusLabel };
