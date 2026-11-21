import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { drawioFile, drawioModel, edge, vertex } from './fixtures'
import { checkFile, readDrawio } from './read'

const model = drawioModel
const file = drawioFile
/** draw.io's compressed page: the model, URI-encoded, raw-deflated, in base64. */
const compressed = (xml: string) => Buffer.from(deflateRawSync(Buffer.from(encodeURIComponent(xml)))).toString('base64')

const SOLUTION = model(
  [
    vertex('group', 'CRM', 'swimlane;whiteSpace=wrap;html=1;', [0, 0, 400, 300]),
    vertex('web', 'CRM &lt;b&gt;web&lt;/b&gt;&lt;br&gt;portal', 'image;html=1;image=img/lib/azure2/app_services/App_Services.svg;', [40, 60, 50, 50], 'group'),
    vertex('customer', 'Customer', 'shape=umlActor;verticalLabelPosition=bottom;', [-200, 80, 30, 60]),
    vertex('check', 'Within policy?', 'rhombus;whiteSpace=wrap;', [500, 80, 80, 80]),
    vertex('start', 'Code change', 'strokeWidth=2;html=1;shape=mxgraph.flowchart.terminator;', [500, 200, 100, 60]),
    vertex('bank', 'Bank', 'rounded=1;whiteSpace=wrap;', [700, 80, 120, 60]),
    vertex('sql', 'Orders DB', 'shape=mxgraph.azure.sql_database;', [700, 200, 50, 50]),
    vertex('note', 'Draft only', 'text;html=1;', [0, 400, 100, 30]),
    vertex('blank', '', 'rounded=0;whiteSpace=wrap;', [900, 80, 120, 60]),
    vertex('odd', 'Oval', 'ellipse;', [900, 200, 80, 80]),
    edge('e1', 'Payment API', 'endArrow=classic;dashed=1;', 'web', 'bank'),
    edge('e2', '', 'startArrow=classic;endArrow=none;', 'customer', 'web'),
    edge('e3', '', 'startArrow=classic;endArrow=classic;', 'web', 'sql'),
    `<mxCell id="e3-label" value="Orders" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e3"><mxGeometry x="-0.2" relative="1" as="geometry"/></mxCell>`,
    edge('e4', 'Nowhere', 'endArrow=classic;', 'web'),
    edge('e6', '', ''),
    `<UserObject label="Billing" tooltip="TRM app" id="billing"><mxCell style="rounded=0;" vertex="1" parent="1"><mxGeometry x="700" y="300" width="120" height="60" as="geometry"/></mxCell></UserObject>`,
    vertex('lamp', 'Lamp', 'image;image=img/lib/azure2/other/Not_An_Icon.svg;', [900, 300, 50, 50]),
    `<mxCell id="tools" value="Tools" style="group" vertex="1" parent="1"><mxGeometry width="200" height="100" as="geometry"/></mxCell>`,
    edge('e5', '', 'rounded=0;', 'customer', 'bank'),
    // Broken wrappers: without a cell, or without an id.
    `<object id="lost" label="No cell"/><object label="No id"><mxCell vertex="1" parent="1"/></object>`,
  ].join(''),
)

describe('reading a draw.io file', () => {
  it('reads containers, shapes and their labels as text, with where they are and what their shape says', async () => {
    const [page] = await readDrawio(file(['Solution', SOLUTION]))
    expect(page.name).toBe('Solution')
    expect(page.items.map((item) => [item.id, item.label, item.container, item.parentId ?? null, item.shape, item.icon ?? null])).toEqual([
      ['group', 'CRM', true, null, 'swimlane', null],
      ['web', 'CRM web portal', false, 'group', 'image', 'app-services'],
      ['customer', 'Customer', false, null, 'person', null],
      ['check', 'Within policy?', false, null, 'rhombus', null],
      ['start', 'Code change', false, null, 'terminator', null],
      ['bank', 'Bank', false, null, 'rectangle', null],
      ['sql', 'Orders DB', false, null, 'image', 'sql-database'],
      ['blank', '', false, null, 'rectangle', null],
      ['odd', 'Oval', false, null, 'terminator', null],
      ['billing', 'Billing', false, null, 'rectangle', null],
      // A picture from the Azure library that is not in Microsoft's set has no icon.
      ['lamp', 'Lamp', false, null, 'image', null],
      ['tools', 'Tools', true, null, 'group', null],
    ])
    // x and y left out when 0.
    expect(page.items.find((item) => item.id === 'tools')).toMatchObject({ x: 0, y: 0, width: 200, height: 100 })
    expect(page.items[1]).toMatchObject({ x: 40, y: 60, width: 50, height: 50 })
  })

  it('reads arrows with their direction, style and text, and lists what it cannot use', async () => {
    const [page] = await readDrawio(file(['Solution', SOLUTION]))
    expect(page.arrows).toEqual([
      { id: 'e1', label: 'Payment API', from: 'web', to: 'bank', dashed: true, twoWay: false },
      // An arrow pointing at its start is turned round.
      { id: 'e2', label: '', from: 'web', to: 'customer', dashed: false, twoWay: false },
      { id: 'e3', label: 'Orders', from: 'web', to: 'sql', dashed: false, twoWay: true },
      // No arrow style: draw.io's default, an arrow at the end.
      { id: 'e5', label: '', from: 'customer', to: 'bank', dashed: false, twoWay: false },
    ])
    expect(page.skipped).toEqual([
      { label: 'Draft only', reason: 'text' },
      { label: 'Nowhere', reason: 'loose-arrow' },
      { label: '', reason: 'loose-arrow' },
    ])
  })

  it('reads compressed pages, several pages, and a bare model saved as .xml', async () => {
    const pages = await readDrawio(file(['CI flow', compressed(model(vertex('a', 'Build', 'rounded=0;', [0, 0, 120, 60])))], ['CD flow', model('')], ['Empty', '']))
    expect(pages.map((page) => [page.name, page.items.map((item) => item.label)])).toEqual([
      ['CI flow', ['Build']],
      ['CD flow', []],
      ['Empty', []],
    ])
    expect((await readDrawio(model(vertex('a', 'Build', '', [0, 0, 120, 60]))))[0]).toMatchObject({ name: 'Page-1', items: [{ label: 'Build', shape: 'rectangle' }] })
    // A page without a name is named by its place; a model without a root is empty.
    expect(await readDrawio(`<mxfile><diagram id="x"><mxGraphModel/></diagram></mxfile>`)).toEqual([{ name: 'Page-1', items: [], arrows: [], skipped: [] }])
  })

  it.each<[string, string, string]>([
    ['not XML', 'hello', 'not-drawio'],
    ['another XML document', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'not-drawio'],
    ['a document type, which could expand entities', '<!DOCTYPE mxfile [<!ENTITY a "a">]><mxfile/>', 'not-drawio'],
    ['a page that will not decompress', file(['Broken', 'bm90IGRlZmxhdGU=']), 'unreadable'],
    // A small file can unpack to a huge page.
    ['a page that unpacks to more than 50 MB', file(['Huge', Buffer.from(deflateRawSync(Buffer.alloc(51 * 1024 * 1024, 'a'))).toString('base64')]), 'unreadable'],
    ['a page that unpacks to something other than a model', file(['Odd', compressed('<svg/>')]), 'unreadable'],
  ])('refuses %s', async (_, text, reason) => {
    await expect(readDrawio(text)).rejects.toMatchObject({ reason })
  })
})

describe('the files that can be imported', () => {
  it('are .drawio and .xml files up to 5 MB', () => {
    expect([checkFile({ name: 'crm.drawio', size: 1000 }), checkFile({ name: 'CRM.XML', size: 5 * 1024 * 1024 })]).toEqual([null, null])
    expect([checkFile({ name: 'crm.drawio.png', size: 1000 }), checkFile({ name: 'crm.vsdx', size: 1000 }), checkFile({ name: 'crm.drawio', size: 5 * 1024 * 1024 + 1 })]).toEqual([
      'not-drawio',
      'not-drawio',
      'too-big',
    ])
  })
})
