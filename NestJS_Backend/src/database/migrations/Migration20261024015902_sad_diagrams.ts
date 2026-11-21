import { Migration } from '@mikro-orm/migrations';

export class Migration20261024015902_sad_diagrams extends Migration {

  override name = 'Migration20261024015902_sad_diagrams';

  override up(): void | Promise<void> {
    this.addSql(`create table "sad_diagram" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "sad_version_id" uuid not null, "slot" text not null, "content" jsonb not null, primary key ("id"));`);
    this.addSql(`create index "sad_diagram_sad_version_id_index" on "sad_diagram" ("sad_version_id");`);
    this.addSql(`alter table "sad_diagram" add constraint "sad_diagram_sad_version_id_slot_unique" unique ("sad_version_id", "slot");`);

    this.addSql(`alter table "sad_diagram" add constraint "sad_diagram_sad_version_id_foreign" foreign key ("sad_version_id") references "sad_version" ("id") on delete cascade;`);
    this.addSql(`alter table "sad_diagram" add constraint "sad_diagram_slot_check" check ("slot" in ('solution', 'infrastructure', 'ci-cd', 'monitoring'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "sad_diagram" cascade;`);
  }

}
