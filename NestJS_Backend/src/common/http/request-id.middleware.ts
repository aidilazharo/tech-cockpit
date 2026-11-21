import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Every request gets a server-generated id (never trusted from the client), echoed in x-request-id. */
export function requestIdMiddleware(req: Request & { id?: string }, res: Response, next: NextFunction): void {
  req.id = randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
