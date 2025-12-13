import { z } from 'zod';

export const ImapConfigSchema = z.object({
  userEmail: z.string().email(),
  accessToken: z.string().min(1), // OAuth Token
  refreshToken: z.string().min(1),
  provider: z.enum(['gmail', 'outlook']),
});


export const EmailSchema = z.object({
  id: z.string(), 
  uid: z.number(), 
  seq: z.number(),
  subject: z.string().default('(No Subject)'),
  from: z.string(),
  to: z.array(z.string()).optional(),
  bodyText: z.string(),
  bodyHtml: z.string().optional(),
  receivedAt: z.date(),
  threadId: z.string().optional(),
});

export type ImapConfig = z.infer<typeof ImapConfigSchema>;
export type EmailData = z.infer<typeof EmailSchema>;