import { z } from 'zod';

export const ROLES = ['owner', 'admin', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export const PASSWORD_MIN = 10;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email')
  .max(254)
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address');

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  businessName: z.string().trim().min(1, 'Enter your business name').max(200),
  email,
  password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`).max(200),
});
export type SignupInput = z.input<typeof signupSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(200),
});
export type LoginInput = z.input<typeof loginSchema>;

/** The signed-in user, the business they're working in, and every business they belong to. */
export interface Me {
  user: { id: string; name: string; email: string };
  business: { id: string; name: string; plan: string };
  role: Role;
  businesses: { id: string; name: string; role: Role }[];
}
