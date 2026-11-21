import type { MikroORM } from '@mikro-orm/core';
import { Migrator as BaseMigrator } from '@mikro-orm/migrations';
import type { SqlSchemaGenerator } from '@mikro-orm/sql';

/**
 * Works around MikroORM 7.2 storing the migration snapshot WITHOUT wildcard-schema
 * tables while diffing WITH them (every `create` would otherwise regenerate all
 * tables). Snapshot and diff both include wildcard tables here.
 *
 * The class must be named `Migrator`: MikroORM auto-registers its own Migrator
 * unless an extension with that class name is already in `extensions`.
 */
export class Migrator extends BaseMigrator {
  static override register(orm: MikroORM): void {
    orm.config.registerExtension(
      '@mikro-orm/migrator',
      () => new Migrator(orm.em as never),
    );
  }

  private get sqlSchemaGenerator(): SqlSchemaGenerator {
    return this.config.getExtension(
      '@mikro-orm/schema-generator',
    ) as SqlSchemaGenerator;
  }

  /** Always snapshot the entity metadata (never a database), wildcard tables included. */
  protected override async storeCurrentSchema(): Promise<void> {
    await super.storeCurrentSchema(this.sqlSchemaGenerator.getTargetSchema(undefined, true));
  }

  /** True when entity definitions differ from the committed snapshot. */
  async hasPendingEntityChanges(): Promise<boolean> {
    const diff = await this.sqlSchemaGenerator.getUpdateSchemaMigrationSQL({
      wrap: false,
      safe: false,
      dropTables: true,
      fromSchema: await this.getSchemaFromSnapshot(),
      includeWildcardSchema: true,
    });
    return diff.up.trim().length > 0;
  }
}
