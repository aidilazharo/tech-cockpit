import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, Injectable } from '@nestjs/common';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import type { AzureRegion } from './domain/azure-regions.js';
import type { Hosting } from './domain/infrastructure.js';
import { SadDiagramDefaults } from './sad.entities.js';
import type { SaveSadDiagramDefaults } from './sad.schemas.js';

const hostingOf = (row: SadDiagramDefaults): Hosting => ({
  subscription: row.subscription,
  primaryRegion: row.primaryRegion as AzureRegion,
  drRegion: row.drRegion as AzureRegion,
  primaryDc: row.primaryDc,
  drDc: row.drDc,
  officeNetwork: row.officeNetwork,
});

/**
 * The hosting names a new infrastructure diagram starts with (the "Diagram defaults" screen). A change applies to
 * applications whose hosting is set up afterwards; diagrams already saved keep theirs.
 */
@Injectable()
export class SadDiagramDefaultsService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  /** The one row (the migration seeds it). */
  private async row(em: EntityManager): Promise<SadDiagramDefaults> {
    const [row] = await em.find(SadDiagramDefaults, {}, { limit: 1 });
    return row;
  }

  /** The defaults now. */
  async current(em: EntityManager): Promise<Hosting> {
    return hostingOf(await this.row(em));
  }

  async get() {
    const row = await this.row(this.em.fork());
    return { ...hostingOf(row), version: row.version };
  }

  async update(principal: Principal, body: SaveSadDiagramDefaults) {
    const em = this.em.fork();
    const row = await this.row(em);
    if (row.version !== body.version) throw new ConflictException('Someone else changed the diagram defaults. Reload to see their changes.');
    const before = hostingOf(row);
    const { version: _, ...hosting } = body;
    em.assign(row, { ...hosting, updatedBy: principal.user.id });
    await em.flush();
    await this.audit.recordChange(principal, 'sad.diagram-defaults.updated', 'sad-diagram-defaults', row.id, { before, after: hosting });
    return { ...hostingOf(row), version: row.version };
  }
}
