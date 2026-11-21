import type { Request } from 'express';
import type { Principal } from '../../modules/access/principal.js';

/** Express request as seen by TechCockpit handlers. */
export interface AppRequest extends Request {
  id: string;
  principal?: Principal;
}
