import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { canViewClass, type VisibilityContext } from './data-visibility.js';
import { FieldClassOverride, type FieldClass } from './field-class.entity.js';
import type { Principal } from './principal.js';

/** A structured field (or group of fields) whose class decides who sees it. */
export interface ClassifiedField {
  /** <module>.<record>.<field>, e.g. trm.application.licenceCost */
  key: string;
  module: string;
  label: string;
  /** The class in code, used until an administrator changes it */
  defaultClass: FieldClass;
}

const KEY = /^[a-z][a-z0-9-]*(\.[a-zA-Z][a-zA-Z0-9_-]*)+$/;

/** Every classified field, registered in code by the module that owns it. */
@Injectable()
export class FieldClassRegistry {
  private readonly fields = new Map<string, ClassifiedField>();

  register(...fields: ClassifiedField[]): void {
    for (const field of fields) {
      if (!KEY.test(field.key) || field.key.length > 100) throw new Error(`Invalid field key "${field.key}"`);
      const known = this.fields.get(field.key);
      if (known && known.defaultClass !== field.defaultClass) throw new Error(`Field "${field.key}" is already registered with another class`);
      this.fields.set(field.key, field);
    }
  }

  get(key: string): ClassifiedField | undefined {
    return this.fields.get(key);
  }

  list(): ClassifiedField[] {
    return [...this.fields.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
}

/** Whether the principal may see data of this class: internal data goes with the record. */
export function canViewField(principal: Principal, dataClass: FieldClass, context: VisibilityContext): boolean {
  return dataClass === 'internal' || canViewClass(principal, dataClass, context);
}

/** The effective classes at one moment: an administrator's choice, else the default from code. */
export class FieldClasses {
  constructor(private readonly classes: ReadonlyMap<string, FieldClass>) {}

  /** A field nobody registered is treated as financial (fail closed). */
  of(key: string): FieldClass {
    return this.classes.get(key) ?? 'financial';
  }

  /** Whether the principal may see each field of a record. */
  viewer(principal: Principal, context: VisibilityContext): (key: string) => boolean {
    return (key) => canViewField(principal, this.of(key), context);
  }
}

/** The administrator-maintained field classification list (permission access:field-class:manage). */
@Injectable()
export class FieldClassService {
  constructor(
    private readonly em: EntityManager,
    private readonly registry: FieldClassRegistry,
    private readonly audit: AuditService,
  ) {}

  /** Read once per request: changes apply at once. */
  async classes(em: EntityManager = this.em.fork()): Promise<FieldClasses> {
    const overrides = new Map((await em.find(FieldClassOverride, {})).map((row) => [row.fieldKey, row.dataClass]));
    return new FieldClasses(new Map(this.registry.list().map((field) => [field.key, overrides.get(field.key) ?? field.defaultClass])));
  }

  async list() {
    const classes = await this.classes();
    return { items: this.registry.list().map((field) => ({ ...field, dataClass: classes.of(field.key) })) };
  }

  /** Sets a field's class; null goes back to the default from code. */
  async set(principal: Principal, key: string, dataClass: FieldClass | null) {
    const field = this.registry.get(key);
    if (!field) throw new NotFoundException('Field not found');
    const em = this.em.fork();
    const before = (await this.classes(em)).of(key);
    const after = dataClass ?? field.defaultClass;
    await em.transactional(async (tx) => {
      const row = await tx.findOne(FieldClassOverride, { fieldKey: key });
      if (dataClass === null || dataClass === field.defaultClass) {
        if (row) tx.remove(row);
      } else if (row) {
        row.dataClass = dataClass;
      } else {
        tx.create(FieldClassOverride, { fieldKey: key, dataClass });
      }
    });
    if (before !== after) {
      await this.audit.recordChange(principal, 'access.field-class.updated', 'field-class', key, { before: { dataClass: before }, after: { dataClass: after } });
    }
    return { ...field, dataClass: after };
  }
}
