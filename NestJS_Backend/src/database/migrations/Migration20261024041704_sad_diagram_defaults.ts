import { Migration } from '@mikro-orm/migrations';

export class Migration20261024041704_sad_diagram_defaults extends Migration {

  override name = 'Migration20261024041704_sad_diagram_defaults';

  override up(): void | Promise<void> {
    this.addSql(`create table "sad_diagram_defaults" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "subscription" varchar(100) not null, "primary_region" varchar(50) not null, "dr_region" varchar(50) not null, "primary_dc" varchar(100) not null, "dr_dc" varchar(100) not null, "office_network" varchar(100) not null, primary key ("id"));`);
    // One row, with the defaults the product owner gave (docs/modules/sad.md, 2026-10-23).
    this.addSql(`insert into "sad_diagram_defaults" ("id", "created_at", "updated_at", "version", "subscription", "primary_region", "dr_region", "primary_dc", "dr_dc", "office_network")
      values (gen_random_uuid(), now(), now(), 1, 'MY01', 'southeastasia', 'eastasia', 'PDC', 'SDC', 'Office network');`);
    // "Maintain SAD diagram defaults": system admins (who hold every permission) and enterprise architects.
    this.addSql(`update "role" set "permissions" = array_append("permissions", 'sad:diagram-defaults:manage') where "code" = 'enterprise-architect' and not ('sad:diagram-defaults:manage' = any("permissions"));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`update "role" set "permissions" = array_remove("permissions", 'sad:diagram-defaults:manage');`);
    this.addSql(`drop table if exists "sad_diagram_defaults" cascade;`);
  }

}
