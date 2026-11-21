import { Migration } from '@mikro-orm/migrations';

export class Migration20261025010953_sad_retention_snapshot extends Migration {

  override name = 'Migration20261025010953_sad_retention_snapshot';

  override up(): void | Promise<void> {
    this.addSql(`alter table "sad_version" add "retention_snapshot" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "sad_version" drop column "retention_snapshot";`);
  }

}
