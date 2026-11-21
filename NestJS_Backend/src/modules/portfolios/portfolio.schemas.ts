import { z } from 'zod';

export const PortfolioSchemaOut = z
  .object({ id: z.uuid(), name: z.string(), active: z.boolean(), version: z.number().int() })
  .meta({ id: 'Portfolio' });

export const PortfolioListSchema = z.object({ items: z.array(PortfolioSchemaOut) }).meta({ id: 'PortfolioList' });

export const CreatePortfolioSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict().meta({ id: 'CreatePortfolio' });
export type CreatePortfolio = z.infer<typeof CreatePortfolioSchema>;

export const UpdatePortfolioSchema = z
  .object({ name: z.string().trim().min(1).max(200).optional(), active: z.boolean().optional(), version: z.number().int().min(1) })
  .strict()
  .meta({ id: 'UpdatePortfolio' });
export type UpdatePortfolio = z.infer<typeof UpdatePortfolioSchema>;
