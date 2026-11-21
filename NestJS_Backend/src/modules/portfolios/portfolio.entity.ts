import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';

/** Minimal portfolio list maintained by system admins (TRM uses it now; PMO extends it later). */
export const PortfolioSchema = defineEntity({
  name: 'Portfolio',
  tableName: 'portfolio',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    name: p.string().length(200).unique(),
    active: p.boolean().default(true),
  },
});
export class Portfolio extends PortfolioSchema.class {}
PortfolioSchema.setClass(Portfolio);
