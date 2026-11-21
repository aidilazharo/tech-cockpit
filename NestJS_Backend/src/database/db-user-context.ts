import type { EntityManager } from '@mikro-orm/postgresql';

export interface DbUserContext {
  userId: string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Runs `work` in a transaction where PostgreSQL row-level-security policies can read
 * the current user via current_setting('app.user_id'). The setting is
 * transaction-local, so it never leaks to the next query on a pooled connection.
 */
export async function withDbUserContext<T>(
  em: EntityManager,
  context: DbUserContext,
  work: (em: EntityManager) => Promise<T>,
): Promise<T> {
  if (!UUID.test(context.userId)) {
    throw new Error('Invalid user id for database context');
  }
  return em.transactional(async (tx) => {
    await tx.execute("select set_config('app.user_id', ?, true)", [
      context.userId,
    ]);
    return work(tx);
  });
}
