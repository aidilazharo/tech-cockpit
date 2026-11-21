import { expect, test, type Locator, type Page } from "@playwright/test";
import { calls as applicationCalls } from "../src/features/sad/calls/fixtures";
import {
  FLOWS_DRAWIO,
  INFRA_DRAWIO,
  SOLUTION_DRAWIO,
} from "../src/features/sad/diagrams/drawio/fixtures";
import {
  autoFit,
  BOX_HEIGHT,
  BOX_WIDTH,
  emptyContent,
} from "../src/features/sad/diagrams/model";
import {
  APP_CRM,
  apiRow,
  CURRENT_ID,
  diagramSlots,
  listItem,
  overview,
  retention,
  template,
  version,
  VERSION_ID,
} from "../src/features/sad/fixtures";
import { SAD_ANY } from "../src/features/sad/permissions";
import { expectNoA11yViolations } from "./support/a11y";
import { mockApi } from "./support/mock-api";

const page = <T>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
});

test("an application lead writes a SAD section and reviews the draft", async ({
  page: browser,
}) => {
  let saved: Record<string, unknown> | null = null;
  const calls = await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    "GET /api/v1/sad/documents": {
      status: 200,
      body: page([
        listItem({ open: { versionId: VERSION_ID, status: "draft" } }),
      ]),
    },
    [`GET /api/v1/sad/applications/${APP_CRM}`]: {
      status: 200,
      body: overview(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: () => ({
      status: 200,
      body: version(
        saved
          ? {
              sections: version().sections.map((s) =>
                s.key === "solution-integration"
                  ? { ...s, answers: saved, rowVersion: 1 }
                  : s,
              ),
            }
          : {},
      ),
    }),
    [`PUT /api/v1/sad/versions/${VERSION_ID}/sections/solution-integration`]: (
      call,
    ) => {
      saved = (call.body as { answers: Record<string, unknown> }).answers;
      return {
        status: 200,
        body: {
          section: "solution-integration",
          rowVersion: 1,
          answers: saved,
          completion: version().completion,
          hidden: version().hidden,
        },
      };
    },
  });

  await browser.goto("/sad");
  await expect(browser.getByRole("link", { name: "CRM" })).toBeVisible();
  await expectNoA11yViolations(browser);
  await browser.getByRole("link", { name: "CRM" }).click();
  await expect(
    browser.getByRole("heading", { level: 1, name: "SAD: CRM" }),
  ).toBeVisible();
  await expectNoA11yViolations(browser);
  await browser.getByRole("link", { name: "Edit the draft" }).click();

  await browser
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: /Solution & Integration Architecture/ })
    .click();
  const editor = browser.getByRole("textbox", { name: "General overview" });
  await editor.click();
  await browser.keyboard.type("Azure App Service behind Front Door");
  await browser
    .getByRole("group", { name: "Application hosting location" })
    .getByRole("checkbox", { name: "AIA Azure" })
    .click();
  await expect(
    browser.getByRole("heading", {
      name: "Application hosted in AIA Azure and PDC/SDC",
    }),
  ).toBeVisible();
  await expectNoA11yViolations(browser);
  await browser.getByRole("button", { name: "Save section" }).click();
  await expect(browser.getByText("Section saved.")).toBeVisible();
  const body = calls.find((call) => call.method === "PUT")?.body as {
    answers: Record<string, { value: unknown }>;
    version: number;
  };
  expect(body.version).toBe(0);
  expect(body.answers["hosting-location"]).toEqual({
    value: { selected: ["aia-azure"] },
  });
  expect(JSON.stringify(body.answers["solution-overview"])).toContain(
    "Azure App Service behind Front Door",
  );

  await browser.getByRole("link", { name: "Review and submit" }).click();
  await expect(
    browser.getByRole("heading", { level: 1, name: "CRM: Draft of version 2" }),
  ).toBeVisible();
  await expect(
    browser.getByRole("region", {
      name: "Solution & Integration Architecture",
    }),
  ).toContainText("Azure App Service behind Front Door");
  await expectNoA11yViolations(browser);
});

const BILLING = {
  id: "ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1",
  number: "APM-Billing",
  name: "Billing",
};
const solutionSlot = (extra: object) => ({ ...diagramSlots()[0], ...extra });
/** Answers a file added under a diagram (the imported draw.io file, kept when its diagram is saved). */
const keptFile = (slot: string, diagramId: string) => ({
  status: 201,
  body: {
    id: "90000000-0000-4000-8000-000000000009",
    slot,
    diagramId,
    name: "kept.drawio",
    type: "drawio",
    size: 100,
    scan: "unscanned",
    uploadedBy: null,
    uploadedAt: "2026-10-24T02:00:00.000Z",
  },
});
/** No files under the diagrams (journeys about files answer this themselves). */
const noFiles = {
  [`GET /api/v1/sad/versions/${VERSION_ID}/uploads`]: {
    status: 200,
    body: { items: [] },
  },
};
const echoDiagram = (call: { body: unknown }) => ({
  status: 200,
  body: {
    slot: "solution",
    rowVersion: 1,
    content: (call.body as { content: unknown }).content,
    completion: version().completion,
    hidden: version().hidden,
  },
});
const echoSection = (section: string) => (call: { body: unknown }) => ({
  status: 200,
  body: {
    section,
    rowVersion: 1,
    answers: (call.body as { answers: unknown }).answers,
    completion: version().completion,
    hidden: version().hidden,
  },
});

test("a section 2 author draws the solution diagram: blocks from TRM, described connections, the logical matrix", async ({
  page: browser,
}) => {
  const applicationBox = {
    id: "zone-1",
    label: "CRM",
    kind: "This application",
    x: 0,
    y: 0,
    width: 228,
    height: 40,
  };
  const calls = await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: {
        items: [
          solutionSlot({
            content: {
              diagrams: [
                {
                  id: "solution",
                  title: "Solution diagram",
                  sizing: "auto",
                  zones: [applicationBox],
                  boxes: [],
                  lines: [],
                },
              ],
            },
          }),
          diagramSlots()[1],
        ],
        apis: [],
      },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/business-applications`]: {
      status: 200,
      body: { items: [BILLING] },
    },
    [`GET /api/v1/sad/applications/${APP_CRM}/calls`]: {
      status: 200,
      body: { items: applicationCalls },
    },
    [`PUT /api/v1/sad/versions/${VERSION_ID}/diagrams/solution`]: echoDiagram,
    [`PUT /api/v1/sad/versions/${VERSION_ID}/sections/solution-integration`]:
      echoSection("solution-integration"),
  });

  await browser.goto(
    `/sad/versions/${VERSION_ID}/edit?section=solution-integration`,
  );
  const solution = browser.getByRole("region", {
    name: "Solution diagram",
    exact: true,
  });
  await expect(solution).toBeVisible();
  await expect(
    browser.getByRole("region", {
      name: "Infrastructure diagram: Integration view",
    }),
  ).toContainText("Shown here read-only.");

  const form = (name: string) => solution.getByRole("group", { name });
  const choose = async (
    scope: ReturnType<typeof form>,
    label: string,
    option: string,
  ) => {
    await scope.getByRole("combobox", { name: label }).click();
    await browser.getByRole("option", { name: option }).click();
  };
  const addBlock = async (
    fill: (block: ReturnType<typeof form>) => Promise<void>,
  ) => {
    await solution.getByRole("button", { name: "Add block" }).click();
    await fill(form("Add block"));
    await form("Add block").getByRole("button", { name: "Add" }).click();
  };
  await addBlock((block) => block.getByLabel("Name").fill("Core services"));
  await addBlock(async (block) => {
    await choose(block, "Type", "Business application");
    await block
      .getByRole("combobox", { name: "Business application in TRM" })
      .fill("bill");
    await browser.getByRole("option", { name: /Billing/ }).click();
  });
  await addBlock(async (block) => {
    await choose(block, "Type", "External party");
    await block.getByLabel("Name").fill("Bank");
  });
  const addConnection = async (to: string, what: string, does?: string) => {
    await solution.getByRole("button", { name: "Add connection" }).click();
    const connection = form("Add connection");
    await choose(connection, "From", "Core services");
    await choose(connection, "To", to);
    await connection.getByLabel("What it calls").fill(what);
    if (does) await connection.getByLabel("What it does").fill(does);
    await connection.getByRole("button", { name: "Add" }).click();
  };
  await addConnection("Billing", "Billing API", "Bills premiums");
  await addConnection("Bank", "Payment API");

  await expect(solution.getByRole("alert")).toContainText(
    "Core services → Bank: what it does",
  );
  const canvas = solution.getByRole("application", {
    name: "Solution diagram: diagram canvas",
  });
  await expect(
    canvas.getByText("Business application · TRM APM-Billing"),
  ).toBeVisible();
  await expect(
    canvas.getByRole("button", { name: "Payment API (facts still missing)" }),
  ).toBeVisible();
  await expect(
    solution
      .getByRole("table", { name: "Logical communication matrix" })
      .getByRole("row", {
        name: /Core services Billing Billing API Bills premiums One-way/,
      }),
  ).toBeVisible();
  // Under the diagram, read-only: the calls to CRM that other applications' approved SADs describe.
  await expect(
    browser
      .getByRole("region", { name: "Calls from other applications" })
      .getByRole("row", { name: /Customer Portal/ }),
  ).toContainText("Customer Portal's SAD v4, approved 2 Jun 2026");
  await expectNoA11yViolations(browser);

  // Drag the bank on the canvas (centred, so the sticky Save bar does not cover it); its new place is saved.
  const bank = canvas.locator('.react-flow__node[data-id="box-3"]');
  await bank.evaluate((node) => node.scrollIntoView({ block: "center" }));
  // Hovering waits until the box is still and nothing covers it, so the drag starts on it.
  await bank.hover();
  const from = (await bank.boundingBox())!;
  await browser.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await browser.mouse.down();
  await browser.mouse.move(
    from.x + from.width / 2 + 120,
    from.y + from.height / 2 + 60,
    { steps: 8 },
  );
  await browser.mouse.up();

  await browser.getByRole("button", { name: "Save section" }).click();
  await expect(browser.getByText("Section saved.")).toBeVisible();
  const puts = calls.filter((call) => call.method === "PUT");
  expect(puts.map((call) => call.path.split("/").slice(-2).join("/"))).toEqual([
    "diagrams/solution",
    "sections/solution-integration",
  ]);
  const drawn = (
    puts[0].body as {
      content: {
        diagrams: {
          boxes: {
            label: string;
            type: string;
            parentId?: string;
            application?: unknown;
            x: number;
          }[];
          lines: unknown[];
        }[];
      };
    }
  ).content.diagrams[0];
  expect(
    drawn.boxes.map((box) => [
      box.label,
      box.type,
      box.parentId ?? null,
      box.application ?? null,
    ]),
  ).toEqual([
    ["Core services", "part", "zone-1", null],
    ["Billing", "business", null, { id: BILLING.id, number: "APM-Billing" }],
    ["Bank", "external", null, null],
  ]);
  // The bank started in the right-hand column under Billing; the drag moved it further right.
  expect(drawn.boxes[2].x).toBeGreaterThan(drawn.boxes[1].x);
  expect(drawn.lines).toEqual([
    {
      id: "line-1",
      from: "box-1",
      to: "box-2",
      calls: "Billing API",
      does: "Bills premiums",
    },
    { id: "line-2", from: "box-1", to: "box-3", calls: "Payment API" },
  ]);
});

test("a section 9 editor records the data flow facts of the solution diagram's connections", async ({
  page: browser,
}) => {
  const drawn = {
    id: "solution",
    title: "Solution diagram",
    sizing: "auto",
    zones: [],
    boxes: [
      { id: "box-1", label: "Core services", type: "part", x: 0, y: 0 },
      {
        id: "box-2",
        label: "Billing",
        type: "business",
        application: { id: BILLING.id, number: "APM-Billing" },
        x: 300,
        y: 0,
      },
    ],
    lines: [{ id: "line-1", from: "box-1", to: "box-2" }],
  };
  const calls = await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    // A section 9 editor who cannot read section 2: what connections call and do is left out.
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: {
        items: [
          solutionSlot({
            readableViews: ["data-flow"],
            editableViews: ["data-flow"],
            rowVersion: 2,
            content: { diagrams: [drawn] },
          }),
        ],
        apis: [],
      },
    },
    [`PUT /api/v1/sad/versions/${VERSION_ID}/diagrams/solution`]: echoDiagram,
    [`PUT /api/v1/sad/versions/${VERSION_ID}/sections/data-architecture`]:
      echoSection("data-architecture"),
  });

  await browser.goto(
    `/sad/versions/${VERSION_ID}/edit?section=data-architecture`,
  );
  const dataFlow = browser.getByRole("region", {
    name: "Solution diagram: Data flow view",
  });
  await expect(dataFlow).toContainText(
    "Record the data flow facts of its connections here.",
  );
  await expect(dataFlow.getByRole("status")).toContainText(
    "These connections have none: Core services → Billing.",
  );
  await expect(dataFlow.getByRole("button", { name: "Add block" })).toHaveCount(
    0,
  );

  await dataFlow
    .getByRole("table", { name: "Connections" })
    .getByRole("button", { name: "Core services → Billing" })
    .click();
  const details = dataFlow.getByRole("complementary", { name: "Details" });
  await details
    .getByLabel("Data objects and key attributes")
    .fill("Invoice: policy no., amount");
  await expect(dataFlow.getByRole("alert")).toContainText(
    "Core services → Billing: classification, frequency / volume",
  );
  await details.getByRole("combobox", { name: "Classification" }).click();
  await browser
    .getByRole("option", { name: "Confidential", exact: true })
    .click();
  await details.getByLabel("Frequency / volume").fill("Daily batch");
  await expect(dataFlow.getByRole("alert")).toHaveCount(0);
  await expect(
    dataFlow
      .getByRole("application")
      .getByRole("button", {
        name: "Invoice: policy no., amount · Confidential · Daily batch",
      }),
  ).toBeVisible();
  await expectNoA11yViolations(browser);

  await browser.getByRole("button", { name: "Save section" }).click();
  await expect(browser.getByText("Section saved.")).toBeVisible();
  const put = calls.find(
    (call) => call.method === "PUT" && call.path.endsWith("/diagrams/solution"),
  )!;
  expect(put.body).toEqual({
    version: 2,
    content: {
      diagrams: [
        {
          ...drawn,
          lines: [
            {
              id: "line-1",
              from: "box-1",
              to: "box-2",
              data: "Invoice: policy no., amount",
              classification: "confidential",
              frequency: "Daily batch",
            },
          ],
        },
      ],
    },
  });
});

test("a section 3 author sets the hosting names, draws the infrastructure from TRM servers and copies it to non-production", async ({
  page: browser,
}) => {
  const SRV_01 = {
    id: "5a27be1d-59d9-47d2-8070-6f33504dd0fb",
    name: "SRV-CRM-01",
  };
  const infrastructure = {
    ...diagramSlots()[1],
    editableViews: ["infrastructure"],
  };
  const calls = await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: { items: [infrastructure], apis: [] },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/servers`]: {
      status: 200,
      body: { items: [SRV_01] },
    },
    [`PUT /api/v1/sad/versions/${VERSION_ID}/diagrams/infrastructure`]: (
      call,
    ) => ({
      status: 200,
      body: {
        slot: "infrastructure",
        rowVersion: 3,
        content: (call.body as { content: unknown }).content,
        completion: version().completion,
        hidden: version().hidden,
      },
    }),
    [`PUT /api/v1/sad/versions/${VERSION_ID}/sections/network`]:
      echoSection("network"),
  });

  await browser.goto(`/sad/versions/${VERSION_ID}/edit?section=network`);
  const region = browser.getByRole("region", {
    name: "Infrastructure diagram",
  });
  const hosting = region.getByRole("group", { name: "Hosting settings" });
  await hosting.getByLabel("Subscription").fill("MY02");
  const choose = async (
    scope: ReturnType<typeof region.getByRole>,
    label: string,
    option: string,
  ) => {
    await scope.getByRole("combobox", { name: label }).click();
    await browser.getByRole("option", { name: option, exact: true }).click();
  };
  const add = async (
    button: string,
    fill: (form: ReturnType<typeof region.getByRole>) => Promise<void>,
  ) => {
    await region.getByRole("button", { name: button }).click();
    const form = region.getByRole("group", { name: button });
    await fill(form);
    await form.getByRole("button", { name: "Add" }).click();
  };
  await add("Add zone", (form) => form.getByLabel("Name").fill("vnet-crm"));
  await add("Add zone", async (form) => {
    await choose(form, "Kind", "Subnet");
    await form.getByLabel("Name").fill("snet-app");
  });
  await add("Add box", async (form) => {
    await choose(form, "TRM server", "SRV-CRM-01");
    await choose(form, "Inside", "snet-app");
  });
  await add("Add box", async (form) => {
    await choose(form, "Kind", "Azure service");
    await form.getByLabel("Name").fill("CRM DB");
    await form
      .getByRole("combobox", { name: "Azure service" })
      .fill("sql data");
    await browser.getByText("SQL Database", { exact: true }).click();
  });
  // A VNet holds Azure services, servers and network devices straight, not only through a subnet.
  await add("Add box", async (form) => {
    await choose(form, "Kind", "Azure service");
    await form.getByLabel("Name").fill("CRM gateway");
    await form
      .getByRole("combobox", { name: "Azure service" })
      .fill("application gateways");
    await browser.getByText("Application Gateways", { exact: true }).click();
    await choose(form, "Inside", "vnet-crm");
  });
  const canvas = region.getByRole("application", {
    name: "Production: diagram canvas",
  });
  await expect(canvas.getByText("MY02")).toBeVisible();
  await expect(canvas.getByText("Server / VM · TRM")).toBeVisible();
  // Microsoft's icon, served by the web app, with its product name.
  const icon = canvas.locator('img[src$="azure-icons/sql-database.svg"]');
  await expect(icon).toBeVisible();
  expect(
    await icon.evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(canvas.getByText("SQL Database", { exact: true })).toBeVisible();
  // Centred, so the sticky header does not cover the canvas's zoom buttons while the page is checked.
  await canvas.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await expectNoA11yViolations(browser);

  await region.getByRole("tab", { name: "Non-production" }).click();
  await region.getByRole("button", { name: "Copy from production" }).click();
  await expect(
    region
      .getByRole("table", { name: "Boxes" })
      .getByRole("button", { name: "SRV-CRM-01" }),
  ).toBeVisible();

  await browser.getByRole("button", { name: "Save section" }).click();
  await expect(browser.getByText("Section saved.")).toBeVisible();
  const puts = calls.filter((call) => call.method === "PUT");
  expect(puts.map((call) => call.path.split("/").slice(-2).join("/"))).toEqual([
    "diagrams/infrastructure",
    "sections/network",
  ]);
  type Saved = {
    hosting: { subscription: string };
    diagrams: {
      zones: { label: string }[];
      boxes: { label: string; server?: unknown; parentId?: string }[];
    }[];
  };
  const content = (puts[0].body as { content: Saved }).content;
  expect(content.hosting.subscription).toBe("MY02");
  expect(content.diagrams[0].zones.map((zone) => zone.label)).toEqual([
    "MY02",
    "Southeast Asia",
    "East Asia",
    "PDC",
    "SDC",
    "Office network",
    "vnet-crm",
    "snet-app",
  ]);
  expect(content.diagrams[0].boxes.at(-3)).toMatchObject({
    label: "SRV-CRM-01",
    server: { id: SRV_01.id },
    parentId: "zone-2",
  });
  expect(content.diagrams[0].boxes.at(-2)).toMatchObject({
    label: "CRM DB",
    type: "azure",
    icon: "sql-database",
    parentId: "zone-2",
  });
  expect(content.diagrams[0].boxes.at(-1)).toMatchObject({
    label: "CRM gateway",
    type: "azure",
    icon: "application-gateways",
    parentId: "zone-1",
  });
  // The copy keeps the server as typed text: the author links the right non-production server.
  expect(content.diagrams[1].boxes.at(-3)).toMatchObject({
    label: "SRV-CRM-01",
    parentId: "zone-2",
  });
  expect(content.diagrams[1].boxes.at(-3)).not.toHaveProperty("server");
});

type Drawn = {
  id: string;
  label: string;
  parentId?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};
type DrawnDiagram = { zones: Drawn[]; boxes: Drawn[] };
/** Production with a VNet in the primary region: a subnet holding the given servers in a row, API Management under it. */
function vnetDiagram(servers: number, sizing: "auto" | "manual") {
  const { hosting, diagrams } = emptyContent("infrastructure", "CRM");
  const drawn = autoFit({
    ...diagrams[0],
    zones: [
      ...diagrams[0].zones,
      {
        id: "vnet",
        label: "vnet-crm",
        kind: "vnet",
        parentId: "primary-region",
        x: 20,
        y: 40,
        width: 0,
        height: 0,
      },
      {
        id: "snet",
        label: "snet-app",
        kind: "subnet",
        parentId: "vnet",
        x: 20,
        y: 40,
        width: 0,
        height: 0,
      },
    ],
    boxes: [
      ...Array.from({ length: servers }, (_, n) => ({
        id: `box-${n + 1}`,
        label: `vm-${n + 1}`,
        type: "server",
        parentId: "snet",
        x: 20 + n * (BOX_WIDTH + 30),
        y: 40,
      })),
      {
        id: "apim",
        label: "apim-crm",
        type: "azure",
        icon: "api-management-services",
        parentId: "vnet",
        x: 20,
        y: 40 + BOX_HEIGHT + 20 + 30 + 40,
      },
    ],
  });
  return { hosting, diagrams: [{ ...drawn, sizing }, diagrams[1]] };
}
/** Pairs of zones or boxes in the same place that are closer than 30px (none, when the editor keeps them apart). */
function tooClose({ zones, boxes }: DrawnDiagram) {
  const items = [
    ...zones,
    ...boxes.map((box) => ({ ...box, width: BOX_WIDTH, height: BOX_HEIGHT })),
  ];
  const apart = (a: (typeof items)[number], b: (typeof items)[number]) =>
    a.x + a.width! + 30 <= b.x ||
    b.x + b.width! + 30 <= a.x ||
    a.y + a.height! + 30 <= b.y ||
    b.y + b.height! + 30 <= a.y;
  return items.flatMap((a, i) =>
    items
      .slice(i + 1)
      .filter((b) => b.parentId === a.parentId && !apart(a, b))
      .map((b) => `${a.label} / ${b.label}`),
  );
}
/** The section 3 editor with the given infrastructure content; returns the calls made. */
async function drawInfrastructure(browser: Page, content: object) {
  const calls = await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: {
        items: [
          { ...diagramSlots()[1], editableViews: ["infrastructure"], content },
        ],
        apis: [],
      },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/servers`]: {
      status: 200,
      body: { items: [] },
    },
    [`PUT /api/v1/sad/versions/${VERSION_ID}/diagrams/infrastructure`]: (
      call,
    ) => ({
      status: 200,
      body: {
        slot: "infrastructure",
        rowVersion: 3,
        content: (call.body as { content: unknown }).content,
        completion: version().completion,
        hidden: version().hidden,
      },
    }),
    [`PUT /api/v1/sad/versions/${VERSION_ID}/sections/network`]:
      echoSection("network"),
  });
  await browser.goto(`/sad/versions/${VERSION_ID}/edit?section=network`);
  const region = browser.getByRole("region", {
    name: "Infrastructure diagram",
  });
  const canvas = region.getByRole("application", {
    name: "Production: diagram canvas",
  });
  await expect(canvas).toBeVisible();
  const saved = async () => {
    await browser.getByRole("button", { name: "Save section" }).click();
    await expect(browser.getByText("Section saved.")).toBeVisible();
    const put = calls.find(
      (call) =>
        call.method === "PUT" && call.path.endsWith("/diagrams/infrastructure"),
    )!;
    const production = (put.body as { content: { diagrams: DrawnDiagram[] } })
      .content.diagrams[0];
    const find = (label: string) =>
      [...production.zones, ...production.boxes].find(
        (item) => item.label === label,
      )!;
    return { production, find };
  };
  return { region, canvas, saved };
}
/** Presses the mouse on the middle of an element and lets go where `to` says (scrolled clear of the sticky bars first). */
async function drag(
  browser: Page,
  from: Locator,
  to: (start: { x: number; y: number }) => Promise<{ x: number; y: number }>,
) {
  await from.evaluate((element) => element.scrollIntoView({ block: "center" }));
  // Hovering waits until it is still and nothing covers it, so the drag starts on it.
  await from.hover();
  const box = (await from.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const end = await to(start);
  await browser.mouse.move(start.x, start.y);
  await browser.mouse.down();
  await browser.mouse.move(end.x, end.y, { steps: 10 });
  await browser.mouse.up();
}

test("a section 3 author adds and drags boxes, which take free slots and never land on each other", async ({
  page: browser,
}) => {
  const { region, canvas, saved } = await drawInfrastructure(
    browser,
    vnetDiagram(4, "auto"),
  );
  await region.getByRole("button", { name: "Add box" }).click();
  const form = region.getByRole("group", { name: "Add box" });
  // The radio itself is visually hidden; its label is what the author clicks.
  await form.getByText("Not in TRM: type the name").click();
  await form.getByRole("textbox", { name: "Name" }).fill("vm-5");
  await form.getByRole("combobox", { name: "Inside" }).click();
  await browser.getByRole("option", { name: "snet-app", exact: true }).click();
  await form.getByRole("button", { name: "Add" }).click();

  // The row of four is full, so vm-5 starts the next row; the subnet grows and moves API Management down.
  const node = (label: string) =>
    canvas.locator(".react-flow__node-box", { hasText: label });
  await expect(node("vm-5")).toBeVisible();
  // Dropped on vm-4, it snaps to the nearest free spot: under vm-4.
  await drag(browser, node("vm-5"), async () => {
    const target = (await node("vm-4").boundingBox())!;
    return { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  });

  const { production, find } = await saved();
  // Straight down from where it was dropped; the zoomed-out canvas makes the drop land near, not exactly on, vm-4.
  expect(find("vm-5")).toMatchObject({
    parentId: "snet",
    y: 40 + BOX_HEIGHT + 30,
  });
  expect(Math.abs(find("vm-5").x - (20 + 3 * (BOX_WIDTH + 30)))).toBeLessThan(
    BOX_WIDTH / 2,
  );
  const subnet = find("snet-app");
  expect(find("apim-crm").y).toBeGreaterThanOrEqual(
    subnet.y + subnet.height! + 30,
  );
  expect(tooClose(production)).toEqual([]);
});

test("a section 3 author sizing zones by hand drags a subnet corner outward, and every zone around it grows", async ({
  page: browser,
}) => {
  const before = vnetDiagram(1, "manual")
    .diagrams[0] as unknown as DrawnDiagram;
  const was = (id: string) => before.zones.find((zone) => zone.id === id)!;
  const { region, canvas, saved } = await drawInfrastructure(
    browser,
    vnetDiagram(1, "manual"),
  );
  await region
    .getByRole("table", { name: "Zones" })
    .getByRole("button", { name: "snet-app" })
    .click();
  const corner = canvas.locator(
    '.react-flow__node[data-id="snet"] .react-flow__resize-control.handle.bottom.right',
  );
  await drag(browser, corner, async (start) => ({
    x: start.x + 80,
    y: start.y + 80,
  }));

  const { production, find } = await saved();
  const [subnet, vnet, primary, dr, subscription, pdc] = [
    "snet-app",
    "vnet-crm",
    "Southeast Asia",
    "East Asia",
    "MY01",
    "PDC",
  ].map(find);
  expect(subnet.width).toBeGreaterThan(was("snet").width!);
  expect(subnet.height).toBeGreaterThan(was("snet").height!);
  // Each zone around it keeps at least 20px right of and below what it holds.
  expect(vnet.width).toBeGreaterThanOrEqual(subnet.x + subnet.width! + 20);
  expect(vnet.height).toBeGreaterThanOrEqual(
    find("apim-crm").y + BOX_HEIGHT + 20,
  );
  expect(primary.width).toBeGreaterThan(was("primary-region").width!);
  expect(primary.width).toBeGreaterThanOrEqual(vnet.x + vnet.width! + 20);
  expect(subscription.height).toBeGreaterThanOrEqual(
    primary.y + primary.height! + 20,
  );
  // East Asia moves right and PDC moves down, clear of the zones that grew.
  expect(dr.x).toBeGreaterThanOrEqual(primary.x + primary.width! + 30);
  expect(subscription.width).toBeGreaterThanOrEqual(dr.x + dr.width! + 20);
  expect(pdc.y).toBeGreaterThanOrEqual(
    subscription.y + subscription.height! + 30,
  );
  expect(find("apim-crm").y).toBeGreaterThanOrEqual(
    subnet.y + subnet.height! + 30,
  );
  expect(tooClose(production)).toEqual([]);
});

test("the SAD pages use the screen up to 1920px, while question fields and diagram forms keep a readable width", async ({
  page: browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Page widths are checked on the desktop project only",
  );
  await mockApi(browser, [...SAD_ANY, "apikey:own:manage"], {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/me/api-keys": { status: 200, body: { items: [] } },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: {
        items: [{ ...diagramSlots()[1], editableViews: ["infrastructure"] }],
        apis: [],
      },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/servers`]: {
      status: 200,
      body: { items: [] },
    },
  });
  const width = async (locator: Locator) =>
    (await locator.boundingBox())!.width;
  const main = browser.getByRole("main");

  await browser.goto(`/sad/versions/${VERSION_ID}/edit?section=network`);
  const region = browser.getByRole("region", {
    name: "Infrastructure diagram",
  });
  await expect(region).toBeVisible();
  // At 1440px the editor takes all the side navigation leaves; other pages stop at 1152px.
  expect(await width(main)).toBeGreaterThan(1152);
  await browser.setViewportSize({ width: 2560, height: 1000 });
  await expect.poll(() => width(main)).toBe(1920);
  expect(
    await width(
      browser.getByRole("group", {
        name: "Physical and Network Architecture notes",
      }),
    ),
  ).toBeLessThanOrEqual(768);
  expect(
    await width(region.getByRole("group", { name: "Hosting settings" })),
  ).toBeLessThanOrEqual(768);
  expect(
    await width(
      region.getByRole("application", { name: "Production: diagram canvas" }),
    ),
  ).toBeGreaterThan(768);
  await expectNoA11yViolations(browser);

  await browser.goto("/me/api-keys");
  await expect(browser.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await width(main)).toBe(1152);
});

test("a section 2 author adds integration connections with their facts, linked to the API inventory, and reads the technical matrix", async ({
  page: browser,
}) => {
  const CUSTOMER_API = {
    id: "0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f",
    name: "Customer API",
  };
  const [, fixture] = diagramSlots();
  const content = fixture.content as {
    hosting: object;
    diagrams: { boxes: object[] }[];
  };
  // CRM web in the primary region (from the fixture) and its database beside it.
  content.diagrams[0].boxes.push({
    id: "box-2",
    label: "CRM DB",
    type: "database",
    parentId: "primary-region",
    x: 220,
    y: 40,
  });
  const infrastructure = {
    ...fixture,
    readableViews: ["integration"],
    editableViews: ["integration"],
    content,
  };
  const calls = await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: { items: [infrastructure], apis: [CUSTOMER_API] },
    },
    [`PUT /api/v1/sad/versions/${VERSION_ID}/diagrams/infrastructure`]: (
      call,
    ) => ({
      status: 200,
      body: {
        slot: "infrastructure",
        rowVersion: 3,
        content: (call.body as { content: unknown }).content,
        completion: version().completion,
        hidden: version().hidden,
      },
    }),
    [`PUT /api/v1/sad/versions/${VERSION_ID}/sections/solution-integration`]:
      echoSection("solution-integration"),
  });

  await browser.goto(
    `/sad/versions/${VERSION_ID}/edit?section=solution-integration`,
  );
  const region = browser.getByRole("region", {
    name: "Infrastructure diagram: Integration view",
  });
  const choose = async (
    scope: ReturnType<typeof region.getByRole>,
    label: string,
    option: string,
  ) => {
    await scope.getByRole("combobox", { name: label, exact: true }).click();
    await browser.getByRole("option", { name: option, exact: true }).click();
  };
  await region.getByRole("button", { name: "Add connection" }).click();
  const form = region.getByRole("group", { name: "Add connection" });
  await choose(form, "From", "CRM web");
  await choose(form, "To", "CRM DB");
  await form.getByLabel("Protocol").fill("HTTPS");
  await form.getByLabel("Port").fill("443");
  await form.getByRole("button", { name: "Add" }).click();

  const details = region.getByRole("complementary", { name: "Details" });
  await expect(region.getByRole("alert").first()).toContainText(
    "CRM web → CRM DB: TLS version, pattern",
  );
  await choose(details, "TLS", "TLS 1.1 (not compliant)");
  await choose(details, "Pattern", "API");
  await choose(details, "API", "Customer API");
  await details.getByLabel("Authentication").fill("OAuth 2.0");
  await choose(details, "Classification", "Confidential");
  await details.getByLabel("Purpose").fill("Read customers");
  await choose(details, "Flow type", "Service-to-service");
  await expect(
    region.getByRole("alert", { name: "TLS 1.1 and 1.0 are not compliant" }),
  ).toBeVisible();
  const matrix = region.getByRole("table", {
    name: "Technical communication matrix",
  });
  await expect(
    matrix.getByRole("row", {
      name: /Production CRM web MY01 › Southeast Asia CRM DB MY01 › Southeast Asia HTTPS 443 1.1 \(not compliant\)/,
    }),
  ).toBeVisible();
  await expectNoA11yViolations(browser);

  await browser.getByRole("button", { name: "Save section" }).click();
  await expect(browser.getByText("Section saved.")).toBeVisible();
  const put = calls.find(
    (call) =>
      call.method === "PUT" && call.path.endsWith("/diagrams/infrastructure"),
  )!;
  const saved = (put.body as { content: { diagrams: { lines: object[] }[] } })
    .content.diagrams[0].lines;
  expect(saved).toEqual([
    {
      id: "line-1",
      from: "box-1",
      to: "box-2",
      layer: "integration",
      protocol: "HTTPS",
      port: 443,
      tls: "1.1",
      pattern: "api",
      api: { id: CUSTOMER_API.id },
      authentication: "OAuth 2.0",
      classification: "confidential",
      purpose: "Read customers",
      flow: "service",
    },
  ]);
});

test("a section 10 author draws a CI flow: lanes, steps of each kind, an approval saying who approves", async ({
  page: browser,
}) => {
  // Section 10 shows the CI and CD flows (the shared template fixture has no diagram there).
  const withFlows = {
    ...template,
    sections: template.sections.map((s) =>
      s.key === "deployment"
        ? {
            ...s,
            groups: [
              {
                ...s.groups[0],
                diagrams: [{ slot: "ci-cd", view: "process" }],
              },
            ],
          }
        : s,
    ),
  };
  const flowSlot = {
    slot: "ci-cd",
    owner: "deployment",
    readableViews: ["process"],
    editableViews: ["process"],
    rowVersion: 0,
    hidden: [],
    content: {
      diagrams: [
        {
          id: "ci-cd-1",
          title: "CI and CD flow",
          sizing: "auto",
          zones: [],
          boxes: [],
          lines: [],
        },
      ],
    },
  };
  const calls = await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: withFlows },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: { items: [flowSlot], apis: [] },
    },
    [`PUT /api/v1/sad/versions/${VERSION_ID}/diagrams/ci-cd`]: (call) => ({
      status: 200,
      body: {
        slot: "ci-cd",
        rowVersion: 1,
        content: (call.body as { content: unknown }).content,
        completion: version().completion,
        hidden: version().hidden,
      },
    }),
    [`PUT /api/v1/sad/versions/${VERSION_ID}/sections/deployment`]:
      echoSection("deployment"),
  });

  await browser.goto(`/sad/versions/${VERSION_ID}/edit?section=deployment`);
  const flows = browser.getByRole("region", { name: "CI and CD flows" });
  await flows.getByLabel("Diagram title").fill("CI flow");
  const form = (name: string) => flows.getByRole("group", { name });
  const choose = async (
    scope: ReturnType<typeof form>,
    label: string,
    option: string,
  ) => {
    await scope.getByRole("combobox", { name: label }).click();
    await browser.getByRole("option", { name: option, exact: true }).click();
  };
  for (const lane of ["Developer", "Azure DevOps"]) {
    await flows.getByRole("button", { name: "Add lane" }).click();
    await form("Add lane").getByLabel("Name").fill(lane);
    await form("Add lane").getByRole("button", { name: "Add" }).click();
  }
  const addStep = async (name: string, kind: string, lane: string) => {
    await flows.getByRole("button", { name: "Add step" }).click();
    const step = form("Add step");
    await step.getByLabel("Name").fill(name);
    await choose(step, "Kind", kind);
    await choose(step, "Lane", lane);
    await step.getByRole("button", { name: "Add" }).click();
  };
  await addStep("Code change", "Start", "Developer");
  await addStep("Build and scan", "Step", "Azure DevOps");
  await addStep("Within policy?", "Decision", "Azure DevOps");
  await addStep("Change approved?", "Approval", "Azure DevOps");
  await expect(flows.getByRole("alert")).toContainText(
    "Before submit, say who approves: Change approved?",
  );
  await flows
    .getByRole("complementary", { name: "Details" })
    .getByLabel("Who approves")
    .fill("CAB");
  await expect(flows.getByRole("alert")).toHaveCount(0);
  await addStep("Released", "End", "Azure DevOps");
  const connect = async (from: string, to: string, label?: string) => {
    await flows.getByRole("button", { name: "Add connection" }).click();
    const connection = form("Add connection");
    await choose(connection, "From", from);
    await choose(connection, "To", to);
    if (label) await connection.getByLabel("Label").fill(label);
    await connection.getByRole("button", { name: "Add" }).click();
  };
  await connect("Code change", "Build and scan");
  await connect("Build and scan", "Within policy?");
  await connect("Within policy?", "Change approved?", "Yes");
  await connect("Within policy?", "Code change", "No: fix findings");
  await connect("Change approved?", "Released");

  const canvas = flows.getByRole("application", {
    name: "CI flow: diagram canvas",
  });
  await expect(canvas.getByText("Approval · CAB")).toBeVisible();
  await expect(
    canvas.getByRole("button", { name: "No: fix findings" }),
  ).toBeVisible();
  await flows.getByRole("button", { name: "Move Azure DevOps up" }).click();
  await expect(
    flows.getByRole("table", { name: "Lanes" }).getByRole("row").nth(1),
  ).toContainText("Azure DevOps");
  // Centred, so the sticky header does not cover the canvas's zoom buttons while the page is checked.
  await canvas.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await expectNoA11yViolations(browser);

  await browser.getByRole("button", { name: "Save section" }).click();
  await expect(browser.getByText("Section saved.")).toBeVisible();
  const put = calls.find(
    (call) => call.method === "PUT" && call.path.endsWith("/diagrams/ci-cd"),
  )!;
  const saved = (
    put.body as {
      content: {
        diagrams: {
          title: string;
          zones: { label: string; kind: string; y: number }[];
          boxes: {
            label: string;
            type: string;
            parentId: string;
            approver?: string;
          }[];
          lines: unknown[];
        }[];
      };
    }
  ).content.diagrams[0];
  expect(saved.title).toBe("CI flow");
  expect(saved.zones.map((lane) => [lane.label, lane.kind, lane.y])).toEqual([
    ["Azure DevOps", "lane", 0],
    ["Developer", "lane", 140],
  ]);
  expect(
    saved.boxes.map((step) => [
      step.label,
      step.type,
      step.parentId,
      step.approver ?? null,
    ]),
  ).toEqual([
    ["Code change", "start", "zone-1", null],
    ["Build and scan", "step", "zone-2", null],
    ["Within policy?", "decision", "zone-2", null],
    ["Change approved?", "approval", "zone-2", "CAB"],
    ["Released", "end", "zone-2", null],
  ]);
  expect(saved.lines).toHaveLength(5);
});

test("a section 12 author draws the monitoring diagram: Dynatrace, an Azure service with its icon, ServiceNow from TRM, a team", async ({
  page: browser,
}) => {
  // Section 12 shows the monitoring diagram (the shared template fixture has no diagram there).
  const withMonitoring = {
    ...template,
    sections: template.sections.map((s) =>
      s.key === "logging"
        ? {
            ...s,
            groups: [
              {
                ...s.groups[0],
                diagrams: [{ slot: "monitoring", view: "monitoring" }],
              },
            ],
          }
        : s,
    ),
  };
  const monitoringSlot = {
    slot: "monitoring",
    owner: "logging",
    readableViews: ["monitoring"],
    editableViews: ["monitoring"],
    rowVersion: 0,
    hidden: [],
    content: {
      diagrams: [
        {
          id: "monitoring-1",
          title: "Monitoring",
          sizing: "auto",
          zones: [],
          boxes: [],
          lines: [],
        },
      ],
    },
  };
  const SERVICENOW = {
    id: "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
    number: "APM-0300",
    name: "ServiceNow",
  };
  const calls = await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: withMonitoring },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: { items: [monitoringSlot], apis: [] },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/business-applications`]: {
      status: 200,
      body: { items: [SERVICENOW] },
    },
    [`PUT /api/v1/sad/versions/${VERSION_ID}/diagrams/monitoring`]: (call) => ({
      status: 200,
      body: {
        slot: "monitoring",
        rowVersion: 1,
        content: (call.body as { content: unknown }).content,
        completion: version().completion,
        hidden: version().hidden,
      },
    }),
    [`PUT /api/v1/sad/versions/${VERSION_ID}/sections/logging`]:
      echoSection("logging"),
  });

  await browser.goto(`/sad/versions/${VERSION_ID}/edit?section=logging`);
  const monitoring = browser.getByRole("region", {
    name: "Monitoring diagram",
  });
  const form = (name: string) => monitoring.getByRole("group", { name });
  const choose = async (
    scope: ReturnType<typeof form>,
    label: string,
    option: string,
  ) => {
    await scope.getByRole("combobox", { name: label }).click();
    await browser.getByRole("option", { name: option, exact: true }).click();
  };
  const addBlock = async (
    fill: (block: ReturnType<typeof form>) => Promise<void>,
  ) => {
    await monitoring.getByRole("button", { name: "Add block" }).click();
    await fill(form("Add block"));
    await form("Add block").getByRole("button", { name: "Add" }).click();
  };
  await addBlock((block) => block.getByLabel("Service").fill("Dynatrace"));
  await addBlock((block) =>
    block.getByLabel("Service").fill("Application Insights"),
  );
  await addBlock(async (block) => {
    await choose(block, "Kind", "Other system");
    await block
      .getByRole("combobox", { name: "Other system in TRM" })
      .fill("Ser");
    await browser.getByRole("option", { name: /ServiceNow/ }).click();
  });
  await addBlock(async (block) => {
    await choose(block, "Kind", "Team / person");
    await block.getByLabel("Name").fill("Support team");
  });
  const connect = async (from: string, to: string, label: string) => {
    await monitoring.getByRole("button", { name: "Add connection" }).click();
    const connection = form("Add connection");
    await choose(connection, "From", from);
    await choose(connection, "To", to);
    await connection.getByLabel("Label").fill(label);
    await connection.getByRole("button", { name: "Add" }).click();
  };
  await connect("Dynatrace", "ServiceNow", "Incident");
  await connect("Application Insights", "ServiceNow", "Alert");
  await connect("ServiceNow", "Support team", "Assigned");

  const canvas = monitoring.getByRole("application", {
    name: "Monitoring: diagram canvas",
  });
  await expect(
    canvas.getByText("Application Insights · Monitoring service"),
  ).toBeVisible();
  await expect(canvas.getByText("Other system · TRM APM-0300")).toBeVisible();
  await expect(
    canvas.locator('img[src$="azure-icons/application-insights.svg"]'),
  ).toBeVisible();
  // Centred, so the sticky header does not cover the canvas's zoom buttons while the page is checked.
  await canvas.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await expectNoA11yViolations(browser);

  await browser.getByRole("button", { name: "Save section" }).click();
  await expect(browser.getByText("Section saved.")).toBeVisible();
  const put = calls.find(
    (call) =>
      call.method === "PUT" && call.path.endsWith("/diagrams/monitoring"),
  )!;
  const saved = (
    put.body as {
      content: {
        diagrams: {
          boxes: {
            label: string;
            type: string;
            icon?: string;
            application?: unknown;
          }[];
          lines: { label?: string }[];
        }[];
      };
    }
  ).content.diagrams[0];
  expect(
    saved.boxes.map((box) => [
      box.label,
      box.type,
      box.icon ?? null,
      box.application ?? null,
    ]),
  ).toEqual([
    ["Dynatrace", "monitoring", null, null],
    ["Application Insights", "monitoring", "application-insights", null],
    ["ServiceNow", "system", null, { id: SERVICENOW.id, number: "APM-0300" }],
    ["Support team", "team", null, null],
  ]);
  expect(saved.lines.map((line) => line.label)).toEqual([
    "Incident",
    "Alert",
    "Assigned",
  ]);
});

test("a section 2 author imports a draw.io file into the solution diagram, reviewing what each shape becomes", async ({
  page: browser,
}) => {
  const calls = await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: { items: [solutionSlot({}), diagramSlots()[1]], apis: [] },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/business-applications`]: (
      call,
    ) => ({
      status: 200,
      body: { items: call.path.includes("q=Billing") ? [BILLING] : [] },
    }),
    [`PUT /api/v1/sad/versions/${VERSION_ID}/diagrams/solution`]: echoDiagram,
    [`POST /api/v1/sad/versions/${VERSION_ID}/diagrams/solution/solution/uploads`]:
      keptFile("solution", "solution"),
    [`PUT /api/v1/sad/versions/${VERSION_ID}/sections/solution-integration`]:
      echoSection("solution-integration"),
  });
  await browser.goto(
    `/sad/versions/${VERSION_ID}/edit?section=solution-integration`,
  );
  const solution = browser.getByRole("region", {
    name: "Solution diagram",
    exact: true,
  });
  await solution.getByRole("button", { name: "Import draw.io" }).click();
  const panel = solution.getByRole("group", { name: "Import from draw.io" });
  await panel
    .getByLabel("draw.io file")
    .setInputFiles({
      name: "crm.drawio",
      mimeType: "application/xml",
      buffer: Buffer.from(SOLUTION_DRAWIO),
    });
  const table = panel.getByRole("table", { name: "What is on “Solution”" });
  await expect(table.getByRole("row", { name: /^Portal/ })).toContainText(
    "Azure icon: App Services",
  );
  await expect(panel.getByRole("status")).toContainText(
    "Not imported: free text “Draft only”.",
  );
  const becomes = async (name: string, option: string) => {
    await table.getByRole("combobox", { name: `Becomes: ${name}` }).click();
    await browser.getByRole("option", { name: option, exact: true }).click();
  };
  await becomes("Bank", "External party");
  await becomes("Billing", "Business application");
  await expect(
    table.getByRole("checkbox", { name: "Link to TRM: Billing (APM-Billing)" }),
  ).toBeChecked();
  await expectNoA11yViolations(browser);
  await panel.getByRole("button", { name: "Import" }).click();
  await expect(solution.getByText("Imported from “crm.drawio”.")).toBeVisible();
  await expect(
    solution
      .getByRole("table", { name: "Logical communication matrix" })
      .getByRole("row", { name: /Portal Billing Billing API/ }),
  ).toBeVisible();

  await browser.getByRole("button", { name: "Save section" }).click();
  await expect(browser.getByText("Section saved.")).toBeVisible();
  const put = calls.find(
    (call) => call.method === "PUT" && call.path.endsWith("/diagrams/solution"),
  )!;
  const saved = (
    put.body as {
      content: {
        diagrams: {
          boxes: {
            label: string;
            type: string;
            application?: { id: string };
          }[];
        }[];
      };
    }
  ).content.diagrams[0];
  expect(
    saved.boxes.map((box) => [
      box.label,
      box.type,
      box.application?.id ?? null,
    ]),
  ).toEqual([
    ["Portal", "part", null],
    ["Customer", "actor", null],
    ["Bank", "external", null],
    ["Billing", "business", BILLING.id],
  ]);
  // The draw.io file is kept under the diagram it made, once the diagram is saved.
  const kept = calls.findIndex(
    (call) =>
      call.method === "POST" &&
      call.path.endsWith("/diagrams/solution/solution/uploads"),
  );
  expect(kept).toBeGreaterThan(calls.indexOf(put));
  expect(String(calls[kept].body)).toContain('filename="crm.drawio"');
});

test("a section 10 author imports two draw.io pages as CI and CD flows, picking a lane for a step drawn outside the swimlanes", async ({
  page: browser,
}) => {
  const withFlows = {
    ...template,
    sections: template.sections.map((s) =>
      s.key === "deployment"
        ? {
            ...s,
            groups: [
              {
                ...s.groups[0],
                diagrams: [{ slot: "ci-cd", view: "process" }],
              },
            ],
          }
        : s,
    ),
  };
  const flowSlot = {
    slot: "ci-cd",
    owner: "deployment",
    readableViews: ["process"],
    editableViews: ["process"],
    rowVersion: 0,
    hidden: [],
    content: {
      diagrams: [
        {
          id: "ci-cd-1",
          title: "CI and CD flow",
          sizing: "auto",
          zones: [],
          boxes: [],
          lines: [],
        },
      ],
    },
  };
  await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: withFlows },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: { items: [flowSlot], apis: [] },
    },
  });
  await browser.goto(`/sad/versions/${VERSION_ID}/edit?section=deployment`);
  const flows = browser.getByRole("region", { name: "CI and CD flows" });
  await flows.getByRole("button", { name: "Import draw.io" }).click();
  const panel = flows.getByRole("group", { name: "Import from draw.io" });
  await panel
    .getByLabel("draw.io file")
    .setInputFiles({
      name: "flows.drawio",
      mimeType: "application/xml",
      buffer: Buffer.from(FLOWS_DRAWIO),
    });
  await expect(panel.getByRole("checkbox", { name: "CD flow" })).toBeChecked();
  await panel.getByLabel("New lane").fill("Release");
  await panel.getByRole("button", { name: "Add lane" }).click();
  await panel.getByRole("combobox", { name: "Lane: Deploy to UAT" }).click();
  await browser.getByRole("option", { name: "Release (new)" }).click();
  await panel
    .getByRole("combobox", { name: "Becomes: Change approved?" })
    .click();
  await browser.getByRole("option", { name: "Approval", exact: true }).click();
  await expectNoA11yViolations(browser);
  await panel.getByRole("button", { name: "Import" }).click();
  await expect(flows.getByRole("tab", { name: "CI flow" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(flows.getByRole("table", { name: "Lanes" })).toContainText(
    "Release",
  );
  await flows.getByRole("tab", { name: "CD flow" }).click();
  await expect(flows.getByRole("alert")).toContainText(
    "Before submit, say who approves: Change approved?",
  );
});

test("a section 3 author imports a draw.io network diagram into Production, mapping its containers to zones", async ({
  page: browser,
}) => {
  const infrastructure = {
    ...diagramSlots()[1],
    editableViews: ["infrastructure"],
  };
  const calls = await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: { items: [infrastructure], apis: [] },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/business-applications`]: {
      status: 200,
      body: { items: [] },
    },
    [`PUT /api/v1/sad/versions/${VERSION_ID}/diagrams/infrastructure`]: (
      call,
    ) => ({
      status: 200,
      body: {
        slot: "infrastructure",
        rowVersion: 3,
        content: (call.body as { content: unknown }).content,
        completion: version().completion,
        hidden: version().hidden,
      },
    }),
    [`PUT /api/v1/sad/versions/${VERSION_ID}/sections/network`]:
      echoSection("network"),
    [`POST /api/v1/sad/versions/${VERSION_ID}/diagrams/infrastructure/production/uploads`]:
      keptFile("infrastructure", "production"),
  });
  await browser.goto(`/sad/versions/${VERSION_ID}/edit?section=network`);
  const region = browser.getByRole("region", {
    name: "Infrastructure diagram",
  });
  await region.getByRole("button", { name: "Import draw.io" }).click();
  const panel = region.getByRole("group", { name: "Import from draw.io" });
  await panel
    .getByLabel("draw.io file")
    .setInputFiles({
      name: "network.drawio",
      mimeType: "application/xml",
      buffer: Buffer.from(INFRA_DRAWIO),
    });
  const table = panel.getByRole("table", { name: "What is on “Production”" });
  const becomes = async (name: string, option: string) => {
    await table.getByRole("combobox", { name: `Becomes: ${name}` }).click();
    await browser.getByRole("option", { name: option, exact: true }).click();
  };
  await becomes("MY01 subscription", "Into “MY01”");
  await becomes("Southeast Asia", "Into “Southeast Asia”");
  await becomes("vnet-crm", "VNet");
  await becomes("snet-app", "Subnet");
  await becomes("CRM VM", "Server / VM");
  await becomes("PDC", "Into “PDC”");
  await becomes("DB server", "Person");
  await becomes("Internet", "Internet");
  await panel.getByRole("button", { name: "Import" }).click();
  await expect(table.getByRole("row", { name: /^DB server/ })).toContainText(
    "A person sits in the office network or the Internet zone.",
  );
  await becomes("DB server", "Server / VM");
  await expectNoA11yViolations(browser);
  await panel.getByRole("button", { name: "Import" }).click();
  await browser
    .getByRole("alertdialog", { name: "Replace what is on “Production”?" })
    .getByRole("button", { name: "Replace" })
    .click();
  await expect(
    region.getByText("Imported from “network.drawio”."),
  ).toBeVisible();
  await expect(region.getByRole("table", { name: "Zones" })).toContainText(
    "vnet-crm",
  );

  await browser.getByRole("button", { name: "Save section" }).click();
  await expect(browser.getByText("Section saved.")).toBeVisible();
  const put = calls.find(
    (call) =>
      call.method === "PUT" && call.path.endsWith("/diagrams/infrastructure"),
  )!;
  const production = (
    put.body as {
      content: {
        diagrams: {
          boxes: { label: string; type: string; parentId: string }[];
        }[];
      };
    }
  ).content.diagrams[0];
  expect(
    production.boxes.map((box) => [box.label, box.type, box.parentId]),
  ).toEqual([
    ["CRM VM", "server", "zone-2"],
    ["Portal", "azure", "zone-2"],
    ["DB server", "server", "primary-dc"],
    ["Customer", "person", "zone-3"],
  ]);
});

test("a section 2 author adds a file under the solution diagram, which waits for its malware check, then downloads and removes it", async ({
  page: browser,
}) => {
  const FILE_ID = "90000000-0000-4000-8000-000000000001";
  let files: object[] = [];
  const added = (scan: string) => ({
    id: FILE_ID,
    slot: "solution",
    diagramId: "solution",
    name: "design.pdf",
    type: "pdf",
    size: 2048,
    scan,
    uploadedBy: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Ada Admin",
    },
    uploadedAt: "2026-10-24T02:00:00.000Z",
  });
  await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    // Files go under a saved diagram.
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: {
        items: [solutionSlot({ rowVersion: 1 }), diagramSlots()[1]],
        apis: [],
      },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/uploads`]: () => ({
      status: 200,
      body: { items: files },
    }),
    [`POST /api/v1/sad/versions/${VERSION_ID}/diagrams/solution/solution/uploads`]:
      () => {
        files = [added("scanning")];
        return { status: 201, body: files[0] };
      },
    [`GET /api/v1/sad/versions/${VERSION_ID}/uploads/${FILE_ID}/file`]: {
      status: 200,
      body: "%PDF-1.7",
    },
    [`DELETE /api/v1/sad/versions/${VERSION_ID}/uploads/${FILE_ID}`]: () => {
      files = [];
      return { status: 204 };
    },
  });
  await browser.goto(
    `/sad/versions/${VERSION_ID}/edit?section=solution-integration`,
  );
  const solution = browser.getByRole("region", {
    name: "Solution diagram",
    exact: true,
  });
  await expect(
    solution.getByText("No files under this diagram."),
  ).toBeVisible();
  await solution
    .getByLabel("Add a file")
    .setInputFiles({
      name: "design.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7"),
    });
  const table = solution.getByRole("table", { name: "Files (1 of 20)" });
  await expect(table.getByRole("row", { name: /design.pdf/ })).toContainText(
    "Being checked for malware",
  );
  await expect(table.getByRole("link", { name: "design.pdf" })).toHaveCount(0);
  await expectNoA11yViolations(browser);

  // Defender reports it clean: the list is looked at again while a file is being checked.
  files = [added("clean")];
  await expect(table.getByRole("link", { name: "design.pdf" })).toBeVisible({
    timeout: 20_000,
  });
  const download = browser.waitForEvent("download");
  await table.getByRole("link", { name: "design.pdf" }).click();
  expect((await download).suggestedFilename()).toBe("design.pdf");
  await table.getByRole("button", { name: "Remove design.pdf" }).click();
  await expect(
    solution.getByText("No files under this diagram."),
  ).toBeVisible();
});

test("a reader compares two versions: the diagrams that changed side by side, marked, with the list of changes", async ({
  page: browser,
}) => {
  const solution = (boxes: object[], lines: object[] = []) =>
    solutionSlot({
      content: {
        diagrams: [
          {
            id: "solution",
            title: "Solution diagram",
            sizing: "auto",
            zones: [],
            boxes,
            lines,
          },
        ],
      },
    });
  const agent = { id: "agent", label: "Agent", type: "actor", x: 0, y: 0 };
  const earlier = solution([
    agent,
    { id: "portal", label: "Portal", type: "part", x: 300, y: 0 },
  ]);
  const later = solution(
    [
      agent,
      { id: "portal", label: "Customer portal", type: "part", x: 300, y: 0 },
      { id: "sms", label: "SMS provider", type: "external", x: 600, y: 0 },
    ],
    [
      {
        id: "l1",
        from: "portal",
        to: "sms",
        calls: "SMS API",
        does: "Sends codes",
      },
    ],
  );
  const file = {
    id: "90000000-0000-4000-8000-000000000009",
    slot: "solution",
    diagramId: "solution",
    name: "Design.pdf",
    type: "pdf",
    size: 2048,
    scan: "clean",
    uploadedBy: null,
    uploadedAt: "2026-10-24T02:00:00.000Z",
  };
  await mockApi(browser, SAD_ANY, {
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${CURRENT_ID}`]: {
      status: 200,
      body: version({
        id: CURRENT_ID,
        status: "current",
        number: 1,
        draftOf: null,
        approvedAt: "2026-10-01T04:00:00.000Z",
        canSubmit: false,
        canCancel: false,
      }),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${CURRENT_ID}/diagrams`]: {
      status: 200,
      body: { items: [earlier, diagramSlots()[1]], apis: [] },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: { items: [later, diagramSlots()[1]], apis: [] },
    },
    [`GET /api/v1/sad/versions/${CURRENT_ID}/uploads`]: {
      status: 200,
      body: { items: [] },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/uploads`]: {
      status: 200,
      body: { items: [file] },
    },
  });
  await browser.goto(`/sad/compare?from=${CURRENT_ID}&to=${VERSION_ID}`);
  await expect(
    browser.getByRole("heading", {
      level: 1,
      name: "Version 1 compared with Draft of version 2",
    }),
  ).toBeVisible();
  const changed = browser.getByRole("region", {
    name: "Solution diagram",
    exact: true,
  });
  await expect(
    changed
      .getByRole("region", { name: "Solution diagram in Version 1" })
      .getByText("Portal", { exact: true }),
  ).toBeVisible();
  const now = changed.getByRole("region", {
    name: "Solution diagram in Draft of version 2",
  });
  await expect(now.getByText("SMS provider")).toBeVisible();
  await expect(
    now.getByRole("button", { name: "Added SMS API" }),
  ).toBeVisible();
  const list = changed.getByRole("table", { name: "Changes (4)" });
  await expect(list).toContainText("Block: Customer portal");
  await expect(list).toContainText("Name: Portal");
  await expect(list).toContainText("File: Design.pdf");
  // Section 9 shows the same diagram in its Data flow view; the unchanged infrastructure diagram is not shown.
  await expect(
    browser.getByRole("region", {
      name: "Solution diagram: Data flow view",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    browser.getByRole("heading", { name: /Infrastructure diagram/ }),
  ).toHaveCount(0);
  await expectNoA11yViolations(browser);
});

test("a maintainer changes the SAD diagram defaults", async ({
  page: browser,
}) => {
  const defaults = {
    subscription: "MY01",
    primaryRegion: "southeastasia",
    drRegion: "eastasia",
    primaryDc: "PDC",
    drDc: "SDC",
    officeNetwork: "Office network",
    version: 1,
  };
  const calls = await mockApi(browser, ["sad:diagram-defaults:manage"], {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/diagram-defaults": { status: 200, body: defaults },
    "PUT /api/v1/sad/diagram-defaults": (call) => ({
      status: 200,
      body: { ...(call.body as object), version: 2 },
    }),
  });
  await browser.goto("/admin/sad-diagram-defaults");
  await browser.getByLabel("Subscription").fill("MY02");
  await browser.getByRole("combobox", { name: "Primary region" }).click();
  await browser.getByRole("option", { name: "Malaysia West" }).click();
  await expectNoA11yViolations(browser);
  await browser.getByRole("button", { name: "Save" }).click();
  await expect(
    browser.getByText("Diagram defaults saved.", { exact: false }),
  ).toBeVisible();
  expect(calls.find((call) => call.method === "PUT")!.body).toEqual({
    ...defaults,
    subscription: "MY02",
    primaryRegion: "malaysiawest",
  });
});

test("an approver reads the version they approve, and the API inventory lists every API", async ({
  page: browser,
}) => {
  await mockApi(
    browser,
    ["approvals:task:act", "approvals:instance:read", "sad:api-inventory:read"],
    {
      ...noFiles,
      "GET /api/v1/me/notifications/unread-count": {
        status: 200,
        body: { unread: 0 },
      },
      "GET /api/v1/sad/template": { status: 200, body: template },
      [`GET /api/v1/sad/versions/${CURRENT_ID}`]: {
        status: 200,
        body: version({
          id: CURRENT_ID,
          status: "in_approval",
          asApprover: true,
          canSubmit: false,
          canCancel: false,
          sections: version().sections.map((s) => ({ ...s, editable: false })),
        }),
      },
      [`GET /api/v1/sad/applications/${APP_CRM}`]: {
        status: 200,
        body: overview(),
      },
      "GET /api/v1/sad/apis": { status: 200, body: page([apiRow()]) },
    },
  );
  await browser.goto(`/sad/versions/${CURRENT_ID}`);
  await expect(
    browser.getByText(/reviewing this version as an approver/),
  ).toBeVisible();
  await expect(
    browser.getByRole("link", { name: "Edit the draft" }),
  ).toHaveCount(0);
  await expectNoA11yViolations(browser);

  await browser.goto("/sad/apis");
  await expect(browser.getByRole("table", { name: "APIs" })).toContainText(
    "Policy API",
  );
  await expectNoA11yViolations(browser);
});

test("a system admin maintains the backup retention list", async ({
  page: browser,
}) => {
  const calls = await mockApi(browser, ["sad:retention:manage"], {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    "POST /api/v1/sad/retention-standards": { status: 201, body: retention[0] },
  });
  await browser.goto("/admin/sad-retention");
  await expect(
    browser.getByRole("table", { name: "Backup retention" }),
  ).toContainText("Database - MsSQL on VM");
  await expectNoA11yViolations(browser);
  await browser.getByRole("button", { name: "Add a row" }).click();
  const dialog = browser.getByRole("dialog", { name: "Add a retention row" });
  for (const [label, value] of [
    ["Service type", "Cosmos DB"],
    ["Data type hosted", "Others"],
    ["Yearly backup", "-"],
    ["Monthly backup", "12 months"],
    ["Weekly backup", "5 weeks"],
    ["Daily backup", "7 days"],
  ]) {
    await dialog.getByRole("textbox", { name: label }).fill(value);
  }
  await expectNoA11yViolations(browser);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({
    serviceType: "Cosmos DB",
    daily: "7 days",
  });
});

test("a reader downloads the PDF of a version, with its diagrams", async ({
  page: browser,
}) => {
  let asked = "";
  await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: template },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${CURRENT_ID}`]: {
      status: 200,
      body: version({
        id: CURRENT_ID,
        status: "current",
        number: 1,
        draftOf: null,
        approvedAt: "2026-10-01T04:00:00.000Z",
        canSubmit: false,
        canCancel: false,
      }),
    },
    [`GET /api/v1/sad/versions/${CURRENT_ID}/diagrams`]: {
      status: 200,
      body: { items: diagramSlots({ solutionEditable: false }), apis: [] },
    },
    [`GET /api/v1/sad/versions/${CURRENT_ID}/uploads`]: {
      status: 200,
      body: { items: [] },
    },
    [`GET /api/v1/sad/applications/${APP_CRM}`]: {
      status: 200,
      body: overview(),
    },
  });
  // The PDF is the API's file: the browser downloads it as the API names it.
  await browser.route(`**/api/v1/sad/versions/${CURRENT_ID}/pdf`, (route) => {
    asked = route.request().url();
    return route.fulfill({
      status: 200,
      contentType: "application/pdf",
      headers: {
        "content-disposition": 'attachment; filename="SAD-CRM-v1.pdf"',
      },
      body: "%PDF-1.7",
    });
  });
  await browser.goto(`/sad/versions/${CURRENT_ID}`);
  await expect(
    browser.getByRole("table", { name: "Version control" }),
  ).toBeVisible();
  await expectNoA11yViolations(browser);
  const download = browser.waitForEvent("download");
  await browser.getByRole("link", { name: "Download PDF" }).click();
  expect((await download).suggestedFilename()).toBe("SAD-CRM-v1.pdf");
  expect(asked).toContain(`/api/v1/sad/versions/${CURRENT_ID}/pdf`);
});

test("a section 4 author sees the infrastructure diagram read-only, drawn in section 3", async ({
  page: browser,
}) => {
  const withRef = {
    ...template,
    sections: template.sections.map((s) =>
      s.key === "resiliency"
        ? {
            ...s,
            groups: [
              {
                ...s.groups[0],
                diagrams: [
                  {
                    slot: "infrastructure" as const,
                    view: "infrastructure" as const,
                  },
                ],
              },
            ],
          }
        : s,
    ),
  };
  const [, infrastructureSlot] = diagramSlots();
  await mockApi(browser, SAD_ANY, {
    ...noFiles,
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
    "GET /api/v1/sad/template": { status: 200, body: withRef },
    "GET /api/v1/sad/retention-standards": {
      status: 200,
      body: { items: retention },
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}`]: {
      status: 200,
      body: version(),
    },
    [`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`]: {
      status: 200,
      body: {
        items: [{ ...infrastructureSlot, editableViews: ["infrastructure"] }],
        apis: [],
      },
    },
  });
  await browser.goto(`/sad/versions/${VERSION_ID}/edit?section=resiliency`);
  const infrastructure = browser.getByRole("region", {
    name: "Infrastructure diagram",
  });
  await expect(
    infrastructure.getByText(
      "Drawn in “Physical and Network Architecture”. Shown here read-only.",
    ),
  ).toBeVisible();
  await expect(
    infrastructure.getByRole("button", { name: "Add zone" }),
  ).toHaveCount(0);
  await expectNoA11yViolations(browser);
});

test("someone without SAD permissions is refused the SAD pages", async ({
  page: browser,
}) => {
  await mockApi(browser, ["trm:application:read"], {
    "GET /api/v1/me/notifications/unread-count": {
      status: 200,
      body: { unread: 0 },
    },
  });
  for (const path of [
    "/sad",
    "/sad/apis",
    `/sad/versions/${VERSION_ID}`,
    `/sad/versions/${VERSION_ID}/edit`,
  ]) {
    await browser.goto(path);
    await expect(
      browser.getByRole("heading", {
        level: 1,
        name: "You do not have access to this page",
      }),
    ).toBeVisible();
  }
  await expectNoA11yViolations(browser);
});
