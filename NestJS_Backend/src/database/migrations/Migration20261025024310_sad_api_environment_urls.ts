import { Migration } from '@mikro-orm/migrations';

export class Migration20261025024310_sad_api_environment_urls extends Migration {

  override name = 'Migration20261025024310_sad_api_environment_urls';

  override up(): void | Promise<void> {
    // The inventory is rebuilt from approved answers at each approval (no real SADs yet, 2026-10-25): the environment,
    // single URL and free-text data of rows already there go; their URLs and data objects come with the next approval.
    this.addSql(`drop index "sad_api_environment_index";`);
    this.addSql(`alter table "sad_api" drop column "environment", drop column "url";`);
    this.addSql(`alter table "sad_api" add "production_url" text null, add "uat_url" text null, add "dev_url" text null;`);
    this.addSql(`alter table "sad_api" alter column "data" type jsonb using null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "sad_api" drop column "production_url", drop column "uat_url", drop column "dev_url";`);
    this.addSql(`alter table "sad_api" add "environment" text null, add "url" text null;`);
    this.addSql(`alter table "sad_api" alter column "data" type text using ("data"::text);`);
    this.addSql(`create index "sad_api_environment_index" on "sad_api" ("environment");`);
  }

}
