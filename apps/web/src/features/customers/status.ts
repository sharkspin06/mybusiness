import { customerStatusLabel, type CustomerStatus } from '@mybusiness/shared';
import type { BadgeTone } from '../../components/ui';

export const statusTone: Record<CustomerStatus, BadgeTone> = { active: 'green', lead: 'teal', inactive: 'grey' };
export { customerStatusLabel };
