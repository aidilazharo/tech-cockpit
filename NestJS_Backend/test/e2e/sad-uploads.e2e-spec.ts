import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessService } from '../../src/modules/access/access.service.js';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { Notification } from '../../src/modules/notifications/notification.entity.js';
import { SadPdfService } from '../../src/modules/sad/sad-pdf.service.js';
import { SadUploadsService } from '../../src/modules/sad/sad-uploads.service.js';
import { emptyContent } from '../../src/modules/sad/domain/diagrams.js';
import { SadFile, SadUpload, SadVersion } from '../../src/modules/sad/sad.entities.js';
import { TrmApplication } from '../../src/modules/trm/trm.entities.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';
import { MemoryStorage } from './support/memory-storage.js';
import { resetTrm, SYS, trmExports } from './support/trm-fixtures.js';

const PDF = Buffer.from('%PDF-1.7\nDesign');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const storage = new MemoryStorage();
let t: TestApp;
let admin: Actor;
let lead: Actor;
let network: Actor;
let dataEditor: Actor;
let vendor: Actor;
let billingLead: Actor;
let nobody: Actor;
let crm = '';
let draft = '';
/** The version the current draft was started from (after the carry test) */
let previous = '';

const http = () => t.http();
const get = (actor: Actor, path: string, status = 200) => http().get(`/api/v1${path}`).set(actor.auth).expect(status);
const post = (actor: Actor, path: string, body: object = {}, status = 200) => http().post(`/api/v1${path}`).set(actor.auth).send(body).expect(status);
const put = (actor: Actor, path: string, body: object, status = 200) => http().put(`/api/v1${path}`).set(actor.auth).send(body).expect(status);
const remove = (actor: Actor, path: string, status = 204) => http().delete(`/api/v1${path}`).set(actor.auth).expect(status);
const upload = (actor: Actor, versionId: string, slot: string, diagram: string, file: Buffer, name: string, status = 201) =>
  http().post(`/api/v1/sad/versions/${versionId}/diagrams/${slot}/${diagram}/uploads`).set(actor.auth).attach('file', file, name).expect(status);
const list = async (actor: Actor, versionId = draft) => (await get(actor, `/sad/versions/${versionId}/uploads`)).body.items as { id: string; slot: string; diagramId: string; name: string; scan: string; uploadedBy: { name: string } | null }[];
const keyOf = async (uploadId: string) => (await t.orm.em.fork().findOneOrFail(SadUpload, uploadId, { populate: ['file'] })).file.storageKey;
const checkScans = () => t.app.get(SadUploadsService).checkScans();

beforeAll(async () => {
  t = await createTestApp({ storage });
  await resetTrm(t.orm);
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'uploads-admin' });
  const run = (await post(admin, '/trm/sync-runs', {}, 201)).body;
  const expected: Record<string, number> = {};
  for (const [file, records] of Object.entries(trmExports())) {
    expected[file] = records.length;
    await put(admin, `/trm/sync-runs/${run.id}/records`, { file, records });
  }
  await post(admin, `/trm/sync-runs/${run.id}/complete`, { expected });
  const em = t.orm.em.fork();
  crm = (await em.findOneOrFail(TrmApplication, { snSysId: SYS.appCrm })).id;
  const billing = (await em.findOneOrFail(TrmApplication, { snSysId: SYS.appBilling })).id;
  const scope = { scopeType: 'application' as const, scopeId: crm };
  lead = await createActor(t.orm, [{ code: 'application-lead', ...scope }], { label: 'uploads-lead' });
  network = await createActor(t.orm, [{ code: await createRole(t.orm, ['sad:network:update']), ...scope }], { label: 'uploads-network' });
  // Section 9 sees the solution diagram (its Data flow view) but does not draw it.
  dataEditor = await createActor(t.orm, [{ code: await createRole(t.orm, ['sad:data-architecture:update']), ...scope }], { label: 'uploads-data' });
  vendor = await createActor(t.orm, [{ code: await createRole(t.orm, ['sad:solution-integration:read']), ...scope }], { label: 'uploads-vendor', isExternal: true });
  billingLead = await createActor(t.orm, [{ code: 'application-lead', scopeType: 'application', scopeId: billing }], { label: 'uploads-billing' });
  nobody = await createActor(t.orm, [], { label: 'uploads-nobody' });
  draft = (await post(lead, `/sad/applications/${crm}/drafts`, {}, 201)).body.id;
  // Files go under saved diagrams only: the solution diagram and both infrastructure tabs are saved as they start.
  for (const slot of ['solution', 'infrastructure'] as const) await put(lead, `/sad/versions/${draft}/diagrams/${slot}`, { content: emptyContent(slot, 'CRM'), version: 0 });
});

afterAll(async () => {
  await t.close();
});

describe('files under a diagram', () => {
  it('are added by the editors who draw the diagram, listed to everyone who sees it, and sent as attachments', async () => {
    const added = (await upload(lead, draft, 'solution', 'solution', PDF, 'Design v2.pdf')).body;
    expect(added).toMatchObject({ slot: 'solution', diagramId: 'solution', name: 'Design v2.pdf', type: 'pdf', size: PDF.length, scan: 'unscanned', uploadedBy: { id: lead.id } });
    expect(storage.files.get(await keyOf(added.id))).toEqual({ data: PDF, contentType: 'application/pdf' });
    // Section 3 draws the infrastructure diagram: its tabs take section 3's files.
    await upload(network, draft, 'infrastructure', 'production', PNG, 'network.png');

    expect((await list(lead)).map((item) => [item.slot, item.diagramId, item.name])).toEqual([
      ['solution', 'solution', 'Design v2.pdf'],
      ['infrastructure', 'production', 'network.png'],
    ]);
    // The vendor reads section 2, which shows both diagrams; it may not see people's names.
    expect((await list(vendor)).map((item) => [item.name, item.uploadedBy])).toEqual([
      ['Design v2.pdf', null],
      ['network.png', null],
    ]);
    const file = await http().get(`/api/v1/sad/versions/${draft}/uploads/${added.id}/file`).set(vendor.auth).buffer(true).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['content-disposition']).toBe(`attachment; filename="Design v2.pdf"; filename*=UTF-8''Design%20v2.pdf`);
    expect(file.headers['cache-control']).toBe('no-store');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(file.body)).toEqual(PDF);
    // Every download is in the audit trail: who, which file, when.
    const downloads = await t.orm.em.fork().find(AuditLog, { action: 'http.request', path: `/api/v1/sad/versions/${draft}/uploads/${added.id}/file`, statusCode: 200 });
    expect(downloads.map((row) => row.actorUserId)).toEqual([vendor.id]);

    // The exact name in UTF-8, and a plain one for older clients.
    const odd = (await upload(lead, draft, 'solution', 'solution', PDF, 'Café "plan" (v2).pdf')).body;
    const named = await http().get(`/api/v1/sad/versions/${draft}/uploads/${odd.id}/file`).set(lead.auth).expect(200);
    expect(named.headers['content-disposition']).toBe(`attachment; filename="Caf_ _plan_ (v2).pdf"; filename*=UTF-8''Caf%C3%A9%20%22plan%22%20%28v2%29.pdf`);
    await remove(lead, `/sad/versions/${draft}/uploads/${odd.id}`);

    await get(nobody, `/sad/versions/${draft}/uploads`, 404);
    await get(billingLead, `/sad/versions/${draft}/uploads`, 404);
    await get(billingLead, `/sad/versions/${draft}/uploads/${added.id}/file`, 404);
    await get(lead, `/sad/versions/${draft}/uploads/${randomUUID()}/file`, 404);
    expect(await t.orm.em.fork().count(AuditLog, { action: 'sad.upload.added', resourceId: draft })).toBe(3);
  });

  it('refuses other formats, renamed files, diagrams not yet saved, other sections and a 21st file', async () => {
    // A slot never saved holds no diagram yet, whatever the editor shows before saving it.
    expect((await upload(lead, draft, 'monitoring', 'monitoring-1', PDF, 'early.pdf', 409)).body.detail).toBe('Save the diagram first, then add files to it.');
    await put(lead, `/sad/versions/${draft}/diagrams/monitoring`, { content: emptyContent('monitoring'), version: 0 });
    const refused = async (file: Buffer, name: string) => (await upload(lead, draft, 'monitoring', 'monitoring-1', file, name, 400)).body.errors;
    expect(await refused(Buffer.from('MZ'), 'tool.exe')).toEqual([{ path: 'file', message: 'Choose a Word, Excel, PowerPoint, PDF, PNG, JPG, Visio or draw.io file.' }]);
    expect(await refused(Buffer.from('MZ'), 'invoice.pdf')).toEqual([{ path: 'file', message: 'This file is not really a PDF file.' }]);
    expect((await http().post(`/api/v1/sad/versions/${draft}/diagrams/monitoring/monitoring-1/uploads`).set(lead.auth).expect(400)).body.errors).toEqual([{ path: 'file', message: 'Choose a file.' }]);
    expect((await upload(lead, draft, 'monitoring', 'not-saved', PDF, 'a.pdf', 409)).body.detail).toBe('Save the diagram first, then add files to it.');
    // Section 2 draws the solution diagram, not section 3.
    await upload(network, draft, 'solution', 'solution', PDF, 'a.pdf', 403);
    await upload(dataEditor, draft, 'solution', 'solution', PDF, 'a.pdf', 403);
    await upload(vendor, draft, 'solution', 'solution', PDF, 'a.pdf', 403);
    await upload(lead, draft, 'nowhere', 'solution', PDF, 'a.pdf', 400);
    await upload(lead, randomUUID(), 'solution', 'solution', PDF, 'a.pdf', 404);
    for (let i = 0; i < 20; i++) await upload(lead, draft, 'monitoring', 'monitoring-1', PNG, `screen-${i}.png`);
    expect((await upload(lead, draft, 'monitoring', 'monitoring-1', PNG, 'one-more.png', 409)).body.detail).toBe('A diagram holds up to 20 files.');
  });

  it('refuses a file over 25 MB, and any file while the draft is in approval', async () => {
    const huge = Buffer.concat([PDF, Buffer.alloc(25 * 1024 * 1024)]);
    await upload(lead, draft, 'solution', 'solution', huge, 'huge.pdf', 413);
    const em = t.orm.em.fork();
    await em.nativeUpdate(SadVersion, { id: draft }, { status: 'in_approval' });
    try {
      expect((await upload(lead, draft, 'solution', 'solution', PDF, 'late.pdf', 409)).body.detail).toMatch(/draft/i);
    } finally {
      await em.nativeUpdate(SadVersion, { id: draft }, { status: 'draft' });
    }
  });

  it('are removed at once by the editors who draw the diagram; the stored copy goes when no version uses it', async () => {
    const [first] = await list(lead);
    const key = await keyOf(first.id);
    // Section 3 does not see the solution diagram's files; section 9 sees them but does not draw the diagram.
    await remove(network, `/sad/versions/${draft}/uploads/${first.id}`, 404);
    await remove(dataEditor, `/sad/versions/${draft}/uploads/${first.id}`, 403);
    await remove(lead, `/sad/versions/${draft}/uploads/${randomUUID()}`, 404);
    await remove(lead, `/sad/versions/${draft}/uploads/${first.id}`);
    expect((await list(lead)).some((item) => item.id === first.id)).toBe(false);
    expect(storage.files.has(key)).toBe(false);
    // The oddly named file in the first test, then this one.
    expect(await t.orm.em.fork().count(AuditLog, { action: 'sad.upload.removed', resourceId: draft })).toBe(2);
  });

  it('go with a diagram removed from its slot, and with a slot saved as Not applicable', async () => {
    const two = (titles: string[]) => ({ diagrams: titles.map((title, index) => ({ id: index === 0 ? 'ci-cd-1' : `diagram-${index}`, title, sizing: 'auto', zones: [], boxes: [], lines: [] })) });
    await put(lead, `/sad/versions/${draft}/diagrams/ci-cd`, { content: two(['CI flow', 'CD flow']), version: 0 });
    const kept = (await upload(lead, draft, 'ci-cd', 'ci-cd-1', PDF, 'ci.pdf')).body;
    const gone = (await upload(lead, draft, 'ci-cd', 'diagram-1', PDF, 'cd.pdf')).body;
    const goneKey = await keyOf(gone.id);
    await put(lead, `/sad/versions/${draft}/diagrams/ci-cd`, { content: two(['CI flow']), version: 1 });
    const names = (await list(lead)).map((item) => item.name);
    expect(names).toContain(kept.name);
    expect(names).not.toContain('cd.pdf');
    expect(storage.files.has(goneKey)).toBe(false);

    // Section 10's files are not the vendor's to see.
    await get(vendor, `/sad/versions/${draft}/uploads/${kept.id}/file`, 404);
    // A stored copy that is gone, or a storage that fails.
    storage.failing.add(await keyOf(kept.id));
    await get(lead, `/sad/versions/${draft}/uploads/${kept.id}/file`, 500);
    storage.failing.clear();
    storage.files.delete(await keyOf(kept.id));
    await get(lead, `/sad/versions/${draft}/uploads/${kept.id}/file`, 404);

    await put(lead, `/sad/versions/${draft}/diagrams/monitoring`, { content: { notApplicable: true, reason: 'Monitored by the vendor' }, version: 1 });
    expect((await list(lead)).filter((item) => item.slot === 'monitoring')).toEqual([]);
  });

  it('are carried into a new draft; removing one there leaves the earlier version its own', async () => {
    const em = t.orm.em.fork();
    await em.nativeUpdate(SadVersion, { id: draft }, { status: 'current' });
    const before = await list(lead, draft);
    await upload(lead, draft, 'solution', 'solution', PDF, 'late.pdf', 409);
    await remove(lead, `/sad/versions/${draft}/uploads/${before[0].id}`, 409);

    const next = (await post(lead, `/sad/applications/${crm}/drafts`, {}, 201)).body.id;
    const carried = await list(lead, next);
    expect(carried.map((item) => item.name)).toEqual(before.map((item) => item.name));
    const key = await keyOf(carried[0].id);
    await remove(lead, `/sad/versions/${next}/uploads/${carried[0].id}`);
    expect((await list(lead, draft)).map((item) => item.name)).toEqual(before.map((item) => item.name));
    expect(storage.files.has(key)).toBe(true);
    previous = draft;
    draft = next;
  });
});

describe('malware scanning (deployed: Defender for Storage)', () => {
  it('holds a file until it is reported clean', async () => {
    storage.scanned = true;
    const added = (await upload(lead, draft, 'solution', 'solution', PDF, 'scanned.pdf')).body;
    expect(added.scan).toBe('scanning');
    expect((await get(lead, `/sad/versions/${draft}/uploads/${added.id}/file`, 409)).body.detail).toBe('This file is still being checked for malware.');
    await checkScans();
    expect((await list(lead)).find((item) => item.id === added.id)!.scan).toBe('scanning');
    storage.verdicts.set(await keyOf(added.id), 'clean');
    await checkScans();
    expect((await list(lead)).find((item) => item.id === added.id)!.scan).toBe('clean');
    await get(lead, `/sad/versions/${draft}/uploads/${added.id}/file`);
  });

  it('keeps holding a file Defender could not scan', async () => {
    const added = (await upload(lead, draft, 'solution', 'solution', PDF, 'unscannable.pdf')).body;
    storage.verdicts.set(await keyOf(added.id), 'failed');
    await checkScans();
    expect((await get(lead, `/sad/versions/${draft}/uploads/${added.id}/file`, 409)).body.detail).toBe('This file could not be checked for malware.');
  });

  it('keeps checking the other files when one cannot be checked, and holds a file whose stored copy is gone', async () => {
    const unreachable = (await upload(lead, draft, 'solution', 'solution', PDF, 'unreachable.pdf')).body;
    const vanished = (await upload(lead, draft, 'solution', 'solution', PDF, 'vanished.pdf')).body;
    const fine = (await upload(lead, draft, 'solution', 'solution', PDF, 'fine.pdf')).body;
    storage.failingScans.add(await keyOf(unreachable.id));
    storage.files.delete(await keyOf(vanished.id));
    storage.verdicts.set(await keyOf(fine.id), 'clean');
    await checkScans();
    const scans = Object.fromEntries((await list(lead)).map((item) => [item.name, item.scan]));
    expect([scans['unreachable.pdf'], scans['vanished.pdf'], scans['fine.pdf']]).toEqual(['scanning', 'failed', 'clean']);
    storage.failingScans.clear();
    for (const id of [unreachable.id, vanished.id, fine.id]) await remove(lead, `/sad/versions/${draft}/uploads/${id}`);
  });

  it("deletes a blocked file's stored copy on a later check when storage refused at first", async () => {
    const added = (await upload(lead, draft, 'solution', 'solution', PDF, 'stubborn.pdf')).body;
    const key = await keyOf(added.id);
    storage.verdicts.set(key, 'malicious');
    storage.failingRemoves.add(key);
    await checkScans();
    expect((await list(lead)).find((item) => item.id === added.id)!.scan).toBe('malicious');
    expect(storage.files.has(key)).toBe(true);
    storage.failingRemoves.clear();
    await checkScans();
    expect(storage.files.has(key)).toBe(false);
    await remove(lead, `/sad/versions/${draft}/uploads/${added.id}`);
  });

  it('blocks a malicious file, deletes its stored copy, and tells its uploader and every system administrator', async () => {
    const added = (await upload(lead, draft, 'solution', 'solution', PDF, 'invoice.pdf')).body;
    const key = await keyOf(added.id);
    storage.verdicts.set(key, 'malicious');
    await checkScans();
    expect((await list(lead)).find((item) => item.id === added.id)!.scan).toBe('malicious');
    expect(storage.files.has(key)).toBe(false);
    expect((await get(lead, `/sad/versions/${draft}/uploads/${added.id}/file`, 409)).body.detail).toBe('This file was blocked: malware was found in it.');
    const told = await t.orm.em.fork().find(Notification, { type: 'sad.upload.malicious' }, { populate: ['recipient'] });
    expect(told.map((n) => n.recipient.id)).toEqual(expect.arrayContaining([lead.id, admin.id]));
    expect(told.find((n) => (n.params as { file: string }).file === 'invoice.pdf')).toMatchObject({ params: { file: 'invoice.pdf', application: 'CRM' }, link: `/sad/versions/${draft}` });
    // Checking again changes nothing; the blocked file can still be removed from the draft.
    await checkScans();
    await remove(lead, `/sad/versions/${draft}/uploads/${added.id}`);
  });
});

describe('the SAD PDF', () => {
  const pdfOf = (actor: Actor) =>
    http()
      .get(`/api/v1/sad/versions/${draft}/pdf`)
      .set(actor.auth)
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (chunk: Buffer) => chunk && chunks.push(chunk));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
  /** What the PDF holds for a reader (its text is glyph-coded in the file itself). */
  const documentFor = async (actor: Actor) => {
    const principal = (await t.app.get(AccessService).loadPrincipal(actor.id, { method: 'session' }))!;
    return JSON.stringify((await t.app.get(SadPdfService).document(principal, draft)).definition.content);
  };

  it('draws each diagram the reader sees on a landscape page, with its facts and files, and nothing they may not see', async () => {
    const rows = Object.fromEntries(((await get(lead, `/sad/versions/${draft}/diagrams`)).body.items as { slot: string; rowVersion: number }[]).map((item) => [item.slot, item.rowVersion]));
    const page = (id: string, title: string, boxes: object[], lines: object[] = []) => ({ id, title, sizing: 'auto', zones: [], boxes, lines });
    await put(lead, `/sad/versions/${draft}/diagrams/solution`, {
      content: {
        diagrams: [
          page(
            'solution',
            'Solution diagram',
            [
              { id: 'box-1', label: 'Portal', type: 'part', icon: 'app-services', x: 0, y: 0 },
              { id: 'box-2', label: 'Agent', type: 'actor', x: -300, y: 0 },
            ],
            [{ id: 'line-1', from: 'box-2', to: 'box-1', calls: 'Portal UI', does: 'Serves agents', data: 'Customer records', classification: 'confidential', frequency: 'Daily' }],
          ),
        ],
      },
      version: rows.solution,
    });
    await put(lead, `/sad/versions/${draft}/diagrams/monitoring`, { content: { diagrams: [page('monitoring-1', 'Alerts', [{ id: 'box-1', label: 'Dynatrace', type: 'monitoring', x: 0, y: 0 }])] }, version: rows.monitoring });

    const all = await documentFor(lead);
    expect(all).toContain('"pageOrientation":"landscape"');
    expect(all).toContain('Monitoring diagram — Alerts');
    expect(all).toContain('Customer records');
    expect(all).toContain('scanned.pdf');
    expect(all).toContain('app-services-');

    // Section 2 only: the solution diagram without its data flow facts, and no monitoring diagram.
    const vendorView = await documentFor(vendor);
    expect(vendorView).toContain('Portal UI');
    expect(vendorView).toContain('scanned.pdf');
    expect(vendorView).not.toContain('Customer records');
    expect(vendorView).not.toContain('Data objects and key attributes');
    expect(vendorView).not.toContain('Alerts');
    // Names the vendor may not see: "Restricted" for who uploaded and in the Version Control rows.
    expect(all).toContain('uploads-lead User');
    expect(vendorView).not.toContain('uploads-lead User');
    expect(vendorView).toContain('Restricted');

    const file = (await pdfOf(lead)).body as Buffer;
    expect(file.toString('latin1')).toContain('/MediaBox [0 0 841.89 595.28]');
    await get(nobody, `/sad/versions/${draft}/pdf`, 404);
  });
});

describe('stored copies no version uses', () => {
  it('are deleted later when storage refused at first; removing the file still succeeds', async () => {
    storage.scanned = false;
    const added = (await upload(lead, draft, 'solution', 'solution', PDF, 'later.pdf')).body;
    const key = await keyOf(added.id);
    storage.failingRemoves.add(key);
    await remove(lead, `/sad/versions/${draft}/uploads/${added.id}`);
    expect(storage.files.has(key)).toBe(true);
    expect(await t.orm.em.fork().count(SadFile, { storageKey: key })).toBe(1);
    storage.failingRemoves.clear();
    await t.app.get(SadUploadsService).purgeUnused();
    expect(storage.files.has(key)).toBe(false);
    expect(await t.orm.em.fork().count(SadFile, { storageKey: key })).toBe(0);
  });

  it("go with a cancelled draft's own files; files other versions use are kept", async () => {
    // The draft, with a file, becomes the current version; a new draft carries that file and adds its own.
    const shared = (await upload(lead, draft, 'solution', 'solution', PDF, 'shared.pdf')).body;
    const sharedKey = await keyOf(shared.id);
    const em = t.orm.em.fork();
    await em.nativeUpdate(SadVersion, { id: previous }, { status: 'superseded' });
    await em.nativeUpdate(SadVersion, { id: draft }, { status: 'current' });
    const next = (await post(lead, `/sad/applications/${crm}/drafts`, {}, 201)).body.id;
    const own = (await upload(lead, next, 'solution', 'solution', PDF, 'draft-only.pdf')).body;
    const ownKey = await keyOf(own.id);
    await post(lead, `/sad/versions/${next}/cancel`);
    expect(storage.files.has(ownKey)).toBe(false);
    expect(storage.files.has(sharedKey)).toBe(true);
    expect(await t.orm.em.fork().count(SadUpload, { sadVersion: next })).toBe(0);
    expect((await list(lead, draft)).map((item) => item.name)).toContain('shared.pdf');
  });
});
