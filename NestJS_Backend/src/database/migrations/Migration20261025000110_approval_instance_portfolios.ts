import { Migration } from '@mikro-orm/migrations';

export class Migration20261025000110_approval_instance_portfolios extends Migration {

  override name = 'Migration20261025000110_approval_instance_portfolios';

  override up(): void | Promise<void> {
    this.addSql(`alter table "approval_instance" add "portfolio_ids" text[] not null default '{}';`);
    // Approvals already in progress for an application: every portfolio TRM puts it in.
    this.addSql(`update "approval_instance" set "portfolio_ids" = coalesce((select array_agg(distinct "portfolio_id"::text order by "portfolio_id"::text) from "trm_application_portfolio" where "application_id" = "approval_instance"."application_id"), '{}') where "application_id" is not null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "approval_instance" drop column "portfolio_ids";`);
  }

}
