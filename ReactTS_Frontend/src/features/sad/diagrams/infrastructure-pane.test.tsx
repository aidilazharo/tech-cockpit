import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../../test/harness";
import type {
  Box,
  Diagram,
  DiagramContent,
  DiagramView,
  Hosting,
} from "../schemas";
import { DiagramSlotEditor } from "./DiagramSlotEditor";
import { autoFit, BOX_WIDTH, emptyContent } from "./model";

// The real canvas needs a browser layout; this stand-in lists what is on the diagram.
vi.mock("./DiagramCanvas", () => ({
  DiagramCanvas: ({ diagram }: { diagram: Diagram }) => (
    <p data-testid="canvas">
      {diagram.zones.map((zone) => zone.label).join(", ")}
    </p>
  ),
}));

const VERSION = "7b000000-0000-4000-8000-000000000001";
const SRV_01 = {
  id: "5a27be1d-59d9-47d2-8070-6f33504dd0fb",
  name: "SRV-CRM-01",
};
const SRV_02 = {
  id: "144b735d-ef68-4b6e-933f-db60ee24a750",
  name: "SRV-CRM-02",
};
const BILLING = {
  id: "ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1",
  number: "APM-Billing",
  name: "Billing",
};
const POLICY: Box = {
  id: "box-9",
  label: "Policy Admin",
  type: "business",
  application: {
    id: "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
    number: "APM-0002",
  },
  x: 0,
  y: 0,
};

let api: ReturnType<typeof mockApi>;
let latest: DiagramContent | undefined;
beforeEach(() => {
  api = mockApi();
  api.on(
    `GET /api/v1/sad/versions/${VERSION}/servers`,
    json(200, { items: [SRV_01, SRV_02] }),
  );
  api.on(
    `GET /api/v1/sad/versions/${VERSION}/business-applications`,
    json(200, { items: [BILLING] }),
  );
  latest = undefined;
});

type Drawn = { hosting: Hosting; diagrams: Diagram[] };
function Harness({
  initial,
  view = "infrastructure",
  editable = true,
  offered = [POLICY],
}: {
  initial: DiagramContent;
  view?: DiagramView;
  editable?: boolean;
  offered?: Box[];
}) {
  const [content, setContent] = useState(initial);
  const change = (next: DiagramContent) => {
    latest = next;
    setContent(next);
  };
  return (
    <DiagramSlotEditor
      slot="infrastructure"
      view={view}
      content={content}
      onChange={editable ? change : undefined}
      versionId={VERSION}
      offered={offered}
    />
  );
}
const show = (props: Parameters<typeof Harness>[0]) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Harness {...props} />
    </QueryClientProvider>,
  );
const fresh = () => emptyContent("infrastructure", "CRM") as Drawn;
const saved = () => latest as Drawn;
const production = () => saved().diagrams[0];
const table = (name: string) => screen.getByRole("table", { name });
const details = () => screen.getByRole("complementary", { name: "Details" });
const choose = async (
  label: string,
  option: string,
  scope: HTMLElement = document.body,
) => {
  await userEvent.click(within(scope).getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
};
const options = async (label: string, scope: HTMLElement) => {
  await userEvent.click(within(scope).getByRole("combobox", { name: label }));
  const names = (await screen.findAllByRole("option")).map(
    (option) => option.textContent,
  );
  await userEvent.keyboard("{Escape}");
  return names;
};
const type = async (
  label: string,
  text: string,
  scope: HTMLElement = document.body,
) => {
  const field = within(scope).getByLabelText(label);
  await userEvent.clear(field);
  if (text) await userEvent.type(field, text);
};
const add = async (
  button: string,
  fill: (form: HTMLElement) => Promise<void>,
) => {
  await userEvent.click(screen.getByRole("button", { name: button }));
  const form = screen.getByRole("group", { name: button });
  await fill(form);
  await userEvent.click(within(form).getByRole("button", { name: "Add" }));
};

describe("removing a zone that still holds things", () => {
  it("asks to move or remove what is inside first when it could not sit where the zone was", async () => {
    const content = fresh();
    content.diagrams[0].zones.push(
      {
        id: "vnet",
        label: "vnet-crm",
        kind: "vnet",
        parentId: "primary-region",
        x: 20,
        y: 40,
        width: 400,
        height: 300,
      },
      {
        id: "snet",
        label: "snet-app",
        kind: "subnet",
        parentId: "vnet",
        x: 20,
        y: 40,
        width: 300,
        height: 200,
      },
      {
        id: "empty",
        label: "vnet-spare",
        kind: "vnet",
        parentId: "primary-region",
        x: 500,
        y: 40,
        width: 200,
        height: 40,
      },
    );
    show({ initial: content });
    await userEvent.click(
      within(table("Zones")).getByRole("button", { name: "vnet-crm" }),
    );
    expect(
      within(details()).getByText(
        "Move or remove what is inside “vnet-crm” first: it cannot sit in “Southeast Asia”.",
      ),
    ).toBeInTheDocument();
    expect(
      within(details()).queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(table("Zones")).getByRole("button", { name: "vnet-spare" }),
    );
    await userEvent.click(
      within(details()).getByRole("button", { name: "Remove" }),
    );
    expect(production().zones.map((zone) => zone.id)).not.toContain("empty");
  });
});

describe("infrastructure diagram, drawn in section 3", () => {
  it("keeps the hosting settings above the tabs: changing them renames the fixed zones on both tabs", async () => {
    show({ initial: fresh() });
    const hosting = screen.getByRole("group", { name: "Hosting settings" });
    expect(within(hosting).getByLabelText("Subscription")).toHaveValue("MY01");
    await type("Subscription", "MY02", hosting);
    await choose("DR region", "Japan East", hosting);
    expect(saved().hosting).toMatchObject({
      subscription: "MY02",
      drRegion: "japaneast",
    });
    expect(
      saved().diagrams.map((d) => d.zones.slice(0, 3).map((z) => z.label)),
    ).toEqual([
      ["MY02", "Southeast Asia", "Japan East"],
      ["MY02", "Southeast Asia", "Japan East"],
    ]);
    await choose("DR region", "Southeast Asia", hosting);
    expect(
      within(hosting).getByText("Choose a region other than the primary one"),
    ).toBeInTheDocument();
  });

  it("adds VNets, subnets and the optional zones only where they may sit, and the optional ones once", async () => {
    show({ initial: fresh() });
    await add("Add zone", async (form) => {
      expect(await options("Inside", form)).toEqual([
        "Southeast Asia",
        "East Asia",
      ]);
      await userEvent.click(within(form).getByRole("button", { name: "Add" }));
      expect(within(form).getByText("Enter a name")).toBeInTheDocument();
      await type("Name", "vnet-crm", form);
    });
    await add("Add zone", async (form) => {
      await choose("Kind", "Subnet", form);
      expect(await options("Inside", form)).toEqual(["vnet-crm"]);
      await type("Name", "snet-app", form);
    });
    await add("Add zone", async (form) => {
      await choose("Kind", "Internet", form);
      expect(
        within(form).queryByRole("combobox", { name: "Inside" }),
      ).not.toBeInTheDocument();
      await type("Name", "Internet", form);
    });
    expect(
      production()
        .zones.slice(6)
        .map((z) => [z.label, z.kind, z.parentId ?? null]),
    ).toEqual([
      ["vnet-crm", "vnet", "primary-region"],
      ["snet-app", "subnet", "zone-1"],
      ["Internet", "internet", null],
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Add zone" }));
    expect(
      await options("Kind", screen.getByRole("group", { name: "Add zone" })),
    ).toEqual(["VNet", "Subnet", "Azure global services", "3rd party"]);
  });

  it("keeps the hosting settings and the add forms at a readable width, beside the full-width diagram", async () => {
    show({ initial: fresh() });
    // jsdom has no layout: the width shows only as the readable-width class.
    expect(screen.getByRole("group", { name: "Hosting settings" })).toHaveClass(
      "max-w-3xl",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add box" }));
    expect(screen.getByRole("group", { name: "Add box" })).toHaveClass(
      "max-w-3xl",
    );
  });

  it("says when a zone has nowhere to sit yet", async () => {
    show({ initial: fresh() });
    await add("Add zone", async (form) => {
      await choose("Kind", "Subnet", form);
      expect(
        within(form).getByText(
          "Nowhere to put it yet: add the zone it sits in first.",
        ),
      ).toBeInTheDocument();
      await type("Name", "snet-app", form);
    });
    expect(latest).toBeUndefined();
  });

  it("adds servers from TRM or typed, people, network devices and Azure services in their places, and business applications outside the zones", async () => {
    show({ initial: fresh() });
    await add("Add box", async (form) => {
      expect(await options("Inside", form)).toEqual([
        "PDC",
        "SDC",
        "Office network",
      ]);
      await choose("TRM server", "SRV-CRM-01", form);
    });
    expect(production().boxes[0]).toMatchObject({
      label: "SRV-CRM-01",
      type: "server",
      server: { id: SRV_01.id },
      parentId: "primary-dc",
    });
    await add("Add box", async (form) => {
      await userEvent.click(
        within(form).getByRole("radio", { name: "Not in TRM: type the name" }),
      );
      await type("Name", "SRV-PRINT", form);
      await choose("Inside", "Office network", form);
    });
    expect(production().boxes[1]).toEqual(
      expect.objectContaining({
        label: "SRV-PRINT",
        type: "server",
        parentId: "office",
      }),
    );
    expect(production().boxes[1]).not.toHaveProperty("server");
    await add("Add box", async (form) => {
      await choose("Kind", "VPN gateway", form);
      expect(await options("Inside", form)).toEqual(["Office network"]);
      await type("Name", "Office VPN", form);
    });
    await add("Add box", async (form) => {
      await choose("Kind", "Azure service", form);
      expect(await options("Inside", form)).toEqual([
        "Southeast Asia",
        "East Asia",
      ]);
      await type("Name", "CRM DB", form);
      await userEvent.click(within(form).getByRole("button", { name: "Add" }));
      expect(
        within(form).getByText("Choose the Azure service"),
      ).toBeInTheDocument();
      await userEvent.type(
        within(form).getByRole("combobox", { name: "Azure service" }),
        "sql data",
      );
      await userEvent.click(
        await screen.findByText("SQL Database", { exact: true }),
      );
    });
    await add("Add box", async (form) => {
      await choose("Kind", "Business application", form);
      expect(
        within(form).queryByRole("combobox", { name: "Inside" }),
      ).not.toBeInTheDocument();
      await choose(
        "Business application on the solution diagram",
        "Policy Admin",
        form,
      );
    });
    expect(
      production()
        .boxes.slice(2)
        .map((box) => [
          box.label,
          box.type,
          box.parentId ?? null,
          box.application ?? null,
        ]),
    ).toEqual([
      ["Office VPN", "vpn", "office", null],
      ["CRM DB", "azure", "primary-region", null],
      ["Policy Admin", "business", null, POLICY.application],
    ]);
    await add("Add box", async (form) => {
      await choose("Kind", "External party", form);
      expect(
        within(form).getByText(
          "Nowhere to put it yet: add the zone it sits in first.",
        ),
      ).toBeInTheDocument();
      await type("Name", "Bank", form);
    });
    expect(production().boxes).toHaveLength(5);
    expect(
      within(table("Boxes")).getByRole("row", {
        name: "SRV-CRM-01 Server / VM · TRM PDC",
      }),
    ).toBeInTheDocument();
    expect(
      within(table("Boxes")).getByRole("row", {
        name: "CRM DB SQL Database Southeast Asia",
      }),
    ).toBeInTheDocument();
    expect(production().boxes[3].icon).toBe("sql-database");
  });

  describe("straight in a VNet, offered after the subnets", () => {
    const withVnet = () => {
      const content = fresh();
      content.diagrams[0].zones.push(
        {
          id: "vnet",
          label: "vnet-crm",
          kind: "vnet",
          parentId: "primary-region",
          x: 15,
          y: 35,
          width: 400,
          height: 300,
        },
        {
          id: "snet",
          label: "snet-app",
          kind: "subnet",
          parentId: "vnet",
          x: 20,
          y: 40,
          width: 300,
          height: 200,
        },
      );
      return content;
    };

    it("puts a server there", async () => {
      show({ initial: withVnet() });
      await add("Add box", async (form) => {
        expect(await options("Inside", form)).toEqual([
          "snet-app",
          "vnet-crm",
          "PDC",
          "SDC",
          "Office network",
        ]);
        await choose("TRM server", "SRV-CRM-01", form);
        await choose("Inside", "vnet-crm", form);
      });
      expect(production().boxes[0]).toMatchObject({
        label: "SRV-CRM-01",
        type: "server",
        parentId: "vnet",
      });
    });

    it("puts a network device there, but never a person", async () => {
      show({ initial: withVnet() });
      await add("Add box", async (form) => {
        await choose("Kind", "Firewall", form);
        expect(await options("Inside", form)).toEqual([
          "Office network",
          "vnet-crm",
        ]);
        await type("Name", "fw-hub", form);
        await choose("Inside", "vnet-crm", form);
      });
      expect(
        within(table("Boxes")).getByRole("row", {
          name: "fw-hub Firewall vnet-crm",
        }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Add box" }));
      const form = screen.getByRole("group", { name: "Add box" });
      await choose("Kind", "Person", form);
      expect(await options("Inside", form)).toEqual(["Office network"]);
    });

    it("puts an Azure service there", async () => {
      show({ initial: withVnet() });
      await add("Add box", async (form) => {
        await choose("Kind", "Azure service", form);
        expect(await options("Inside", form)).toEqual([
          "Southeast Asia",
          "East Asia",
          "snet-app",
          "vnet-crm",
        ]);
        await type("Name", "agw-crm", form);
        await userEvent.type(
          within(form).getByRole("combobox", { name: "Azure service" }),
          "application gateways",
        );
        await userEvent.click(
          await screen.findByText("Application Gateways", { exact: true }),
        );
        await choose("Inside", "vnet-crm", form);
      });
      expect(production().boxes[0]).toMatchObject({
        label: "agw-crm",
        type: "azure",
        icon: "application-gateways",
        parentId: "vnet",
      });
    });
  });

  it("moves a box straight into a VNet from the details panel", async () => {
    const content = fresh();
    content.diagrams[0].zones.push({
      id: "vnet",
      label: "vnet-crm",
      kind: "vnet",
      parentId: "primary-region",
      x: 15,
      y: 35,
      width: 200,
      height: 40,
    });
    content.diagrams[0].boxes = [
      {
        id: "box-1",
        label: "SRV-PRINT",
        type: "server",
        parentId: "office",
        x: 20,
        y: 40,
      },
    ];
    show({ initial: content });
    await userEvent.click(
      within(table("Boxes")).getByRole("button", { name: "SRV-PRINT" }),
    );
    expect(await options("Inside", details())).toEqual([
      "vnet-crm",
      "PDC",
      "SDC",
      "Office network",
    ]);
    await choose("Inside", "vnet-crm", details());
    expect(production().boxes[0]).toMatchObject({
      parentId: "vnet",
      x: 20,
      y: 40,
    });
  });

  it("puts a new or moved zone or box in its zone's first free slot, moving neighbours of a zone that grows", async () => {
    const content = fresh();
    const [diagram] = content.diagrams;
    content.diagrams[0] = autoFit({
      ...diagram,
      zones: [
        ...diagram.zones,
        {
          id: "vnet",
          label: "vnet-crm",
          kind: "vnet",
          parentId: "primary-region",
          x: 20,
          y: 40,
          width: 400,
          height: 300,
        },
        {
          id: "snet-a",
          label: "snet-app",
          kind: "subnet",
          parentId: "vnet",
          x: 20,
          y: 40,
          width: 300,
          height: 200,
        },
        {
          id: "snet-b",
          label: "snet-aks",
          kind: "subnet",
          parentId: "vnet",
          x: 266,
          y: 40,
          width: 300,
          height: 40,
        },
      ],
      boxes: [
        {
          id: "box-1",
          label: "vm-app",
          type: "server",
          parentId: "snet-a",
          x: 20,
          y: 40,
        },
        {
          id: "box-2",
          label: "SRV-PRINT",
          type: "server",
          parentId: "office",
          x: 20,
          y: 40,
        },
        {
          id: "box-3",
          label: "apim",
          type: "azure",
          icon: "api-management-services",
          parentId: "vnet",
          x: 20,
          y: 194,
        },
      ],
    });
    show({ initial: content });
    await add("Add box", async (form) => {
      await userEvent.click(
        within(form).getByRole("radio", { name: "Not in TRM: type the name" }),
      );
      await type("Name", "vm-hub", form);
      await choose("Inside", "snet-app", form);
    });
    const zone = (id: string) =>
      production().zones.find((item) => item.id === id)!;
    // Beside vm-app; the subnet widens, so the subnet beside it moves right and the box under it stays.
    expect(production().boxes[3]).toMatchObject({
      label: "vm-hub",
      parentId: "snet-a",
      x: 20 + BOX_WIDTH + 30,
      y: 40,
    });
    expect(zone("snet-b").x).toBe(zone("snet-a").x + zone("snet-a").width + 30);
    expect(production().boxes[2]).toMatchObject({ x: 20, y: 194 });
    await userEvent.click(
      within(table("Boxes")).getByRole("button", { name: "SRV-PRINT" }),
    );
    await choose("Inside", "vnet-crm", details());
    // Boxes go in the rows under the subnets: beside apim.
    expect(production().boxes[1]).toMatchObject({
      parentId: "vnet",
      x: 20 + BOX_WIDTH + 30,
      y: 194,
    });
    await add("Add zone", async (form) => {
      await choose("Kind", "Subnet", form);
      await type("Name", "snet-db", form);
    });
    // The first free slot among the subnets: under snet-aks, beside snet-app.
    expect(
      production().zones.find((item) => item.label === "snet-db"),
    ).toMatchObject({ parentId: "vnet", x: zone("snet-b").x, y: 40 + 40 + 30 });
  });

  it("adds business applications from TRM or typed, and says what each way still needs", async () => {
    show({ initial: fresh(), offered: [] });
    await userEvent.click(screen.getByRole("button", { name: "Add box" }));
    const form = screen.getByRole("group", { name: "Add box" });
    await userEvent.click(within(form).getByRole("button", { name: "Add" }));
    expect(within(form).getAllByText("Choose")).toHaveLength(2);
    await choose("Kind", "Business application", form);
    expect(
      within(form).queryByRole("radio", { name: "On the solution diagram" }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Add" }));
    expect(
      within(form).getByText("Choose an application from TRM"),
    ).toBeInTheDocument();
    await userEvent.type(
      within(form).getByRole("combobox", {
        name: "Business application in TRM",
      }),
      "bill",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Billing/ }),
    );
    await userEvent.click(within(form).getByRole("button", { name: "Add" }));
    expect(production().boxes[0]).toMatchObject({
      label: "Billing",
      type: "business",
      application: { id: BILLING.id, number: "APM-Billing" },
    });
    await add("Add box", async (typed) => {
      await choose("Kind", "Business application", typed);
      await userEvent.click(
        within(typed).getByRole("radio", { name: "Not in TRM: type the name" }),
      );
      await userEvent.click(within(typed).getByRole("button", { name: "Add" }));
      expect(within(typed).getByText("Enter a name")).toBeInTheDocument();
      await type("Name", "Old CRM", typed);
    });
    expect(production().boxes[1]).toEqual(
      expect.objectContaining({ label: "Old CRM", type: "business" }),
    );
  });

  it("asks for the solution diagram application to put on the diagram", async () => {
    show({ initial: fresh() });
    await userEvent.click(screen.getByRole("button", { name: "Add box" }));
    const form = screen.getByRole("group", { name: "Add box" });
    await choose("Kind", "Business application", form);
    expect(
      within(form).getByRole("radio", { name: "On the solution diagram" }),
    ).toBeChecked();
    await userEvent.click(within(form).getByRole("button", { name: "Add" }));
    expect(within(form).getAllByText("Choose")).toHaveLength(2);
    expect(latest).toBeUndefined();
  });

  it("edits boxes, zones and lines in the details panel", async () => {
    const content = fresh();
    const [diagram] = content.diagrams;
    content.diagrams[0] = {
      ...diagram,
      zones: [
        ...diagram.zones,
        {
          id: "zone-1",
          label: "vnet-crm",
          kind: "vnet",
          parentId: "primary-region",
          x: 15,
          y: 35,
          width: 200,
          height: 40,
        },
      ],
      boxes: [
        {
          id: "box-1",
          label: "SRV-CRM-01",
          type: "server",
          server: { id: SRV_01.id },
          parentId: "primary-dc",
          x: 20,
          y: 40,
        },
        {
          id: "box-2",
          label: "SRV-PRINT",
          type: "server",
          parentId: "office",
          x: 20,
          y: 40,
        },
        { ...POLICY, id: "box-3" },
      ],
      lines: [
        { id: "line-1", from: "box-1", to: "box-2", label: "Print file" },
      ],
    };
    show({ initial: content });
    await userEvent.click(
      within(table("Boxes")).getByRole("button", { name: "SRV-CRM-01" }),
    );
    expect(
      within(details()).getByText("From TRM: SRV-CRM-01"),
    ).toBeInTheDocument();
    await choose("Pick another TRM server", "SRV-CRM-02", details());
    expect(production().boxes[0]).toMatchObject({
      label: "SRV-CRM-02",
      server: { id: SRV_02.id },
    });
    await userEvent.click(
      within(details()).getByRole("button", {
        name: "Not in TRM: type the name instead",
      }),
    );
    expect(production().boxes[0]).not.toHaveProperty("server");
    await type("Name", "", details());
    expect(within(details()).getByText("Enter a name")).toBeInTheDocument();
    await type("Name", "SRV-NEW", details());
    expect(production().boxes[0].label).toBe("SRV-NEW");

    await userEvent.click(
      within(table("Boxes")).getByRole("button", { name: "SRV-PRINT" }),
    );
    await choose("Link to a TRM server", "SRV-CRM-01", details());
    await choose("Inside", "PDC", details());
    expect(production().boxes[1]).toMatchObject({
      label: "SRV-CRM-01",
      server: { id: SRV_01.id },
      parentId: "primary-dc",
    });

    await userEvent.click(
      within(table("Boxes")).getByRole("button", { name: "Policy Admin" }),
    );
    expect(
      within(details()).getByText("From TRM: Policy Admin (APM-0002)"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(details()).getByRole("button", {
        name: "Not in TRM: type the name instead",
      }),
    );
    expect(production().boxes[2]).not.toHaveProperty("application");
    await userEvent.type(
      within(details()).getByRole("combobox", { name: "Link to TRM" }),
      "bill",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Billing/ }),
    );
    expect(production().boxes[2]).toMatchObject({
      label: "Billing",
      application: { id: BILLING.id },
    });

    await userEvent.click(
      within(table("Zones")).getByRole("button", { name: "vnet-crm" }),
    );
    expect(within(details()).getByText("VNet")).toBeInTheDocument();
    await type("Name", "vnet-crm-sea", details());
    await choose("Inside", "East Asia", details());
    expect(production().zones[6]).toMatchObject({
      label: "vnet-crm-sea",
      parentId: "dr-region",
    });
    await type("Name", "", details());
    expect(within(details()).getByText("Enter a name")).toBeInTheDocument();
    await userEvent.click(
      within(details()).getByRole("button", { name: "Remove" }),
    );
    expect(production().zones).toHaveLength(6);

    await userEvent.click(
      within(table("Lines")).getByRole("button", {
        name: "SRV-NEW → SRV-CRM-01",
      }),
    );
    await type("Label", "Batch file", details());
    expect(production().lines[0].label).toBe("Batch file");
    await userEvent.click(
      within(details()).getByRole("button", { name: "Remove" }),
    );
    expect(production().lines).toEqual([]);
    await add("Add line", async (form) => {
      await choose("From", "SRV-NEW", form);
      await choose("To", "Billing", form);
    });
    expect(production().lines).toEqual([
      { id: "line-1", from: "box-1", to: "box-3" },
    ]);
  });

  it("turns a box drawn with a generic service shape into an Azure service when its service is picked", async () => {
    const content = fresh();
    content.diagrams[0].boxes = [
      {
        id: "box-1",
        label: "CRM web",
        type: "web",
        parentId: "primary-region",
        x: 20,
        y: 40,
      },
    ];
    show({ initial: content });
    await userEvent.click(
      within(table("Boxes")).getByRole("button", { name: "CRM web" }),
    );
    await userEvent.type(
      within(details()).getByRole("combobox", { name: "Azure service" }),
      "app serv",
    );
    await userEvent.click(
      await screen.findByText("App Services", { exact: true }),
    );
    expect(production().boxes[0]).toMatchObject({
      type: "azure",
      icon: "app-services",
    });
    expect(
      within(details()).queryByRole("button", { name: "Remove the icon" }),
    ).not.toBeInTheDocument();
  });

  it("renames a fixed zone for one diagram and goes back to the hosting setting; fixed zones stay", async () => {
    show({ initial: fresh() });
    await userEvent.click(
      within(table("Zones")).getByRole("button", { name: "PDC" }),
    );
    expect(
      within(details()).getByText("Named by the hosting settings."),
    ).toBeInTheDocument();
    expect(
      within(details()).queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
    expect(
      within(details()).queryByRole("combobox", { name: "Inside" }),
    ).not.toBeInTheDocument();
    await userEvent.type(
      within(details()).getByLabelText("Name"),
      " Cyberjaya",
    );
    expect(production().zones[3]).toMatchObject({
      label: "PDC Cyberjaya",
      ownName: true,
    });
    expect(
      within(details()).getByText("Changed for this diagram."),
    ).toBeInTheDocument();
    await type("Name", "", details());
    expect(within(details()).getByText("Enter a name")).toBeInTheDocument();
    await userEvent.click(
      within(details()).getByRole("button", {
        name: "Use the hosting settings' name",
      }),
    );
    expect(production().zones[3].label).toBe("PDC");
    expect(production().zones[3]).not.toHaveProperty("ownName");
  });

  it("sizes zones by hand from the keyboard: fixed zones and drawn ones", async () => {
    const content = fresh();
    const [diagram] = content.diagrams;
    content.diagrams[0] = {
      ...diagram,
      sizing: "manual",
      zones: [
        ...diagram.zones,
        {
          id: "zone-1",
          label: "vnet-crm",
          kind: "vnet",
          parentId: "primary-region",
          x: 15,
          y: 35,
          width: 200,
          height: 40,
        },
      ],
    };
    show({ initial: content });
    await userEvent.click(
      within(table("Zones")).getByRole("button", { name: "PDC" }),
    );
    await type("Width", "900", details());
    expect(
      production().zones.find((zone) => zone.label === "PDC"),
    ).toMatchObject({ width: 900 });
    await userEvent.click(
      within(table("Zones")).getByRole("button", { name: "vnet-crm" }),
    );
    await type("Height", "120", details());
    expect(
      production().zones.find((zone) => zone.id === "zone-1"),
    ).toMatchObject({ width: 200, height: 120 });
  });

  it("copies production to non-production, asking first when non-production already has something", async () => {
    const content = fresh();
    content.diagrams[0].boxes = [
      {
        id: "box-1",
        label: "SRV-CRM-01",
        type: "server",
        server: { id: SRV_01.id },
        parentId: "primary-dc",
        x: 20,
        y: 40,
      },
    ];
    show({ initial: content });
    expect(
      screen.queryByRole("button", { name: "Copy from production" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Non-production" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Copy from production" }),
    );
    expect(saved().diagrams[1].boxes).toEqual([
      {
        id: "box-1",
        label: "SRV-CRM-01",
        type: "server",
        parentId: "primary-dc",
        x: 20,
        y: 40,
      },
    ]);

    await userEvent.click(
      screen.getByRole("button", { name: "Copy from production" }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Replace Non-production?",
    });
    expect(dialog).toHaveTextContent(
      "Replace everything on Non-production with a copy of Production?",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Copy from production" }),
    );
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Copy",
      }),
    );
    expect(saved().diagrams[1].boxes).toHaveLength(1);
  });
});

describe("infrastructure diagram, read-only", () => {
  it("shows zones and boxes by kind, without the hosting settings or anything to change", async () => {
    const content = fresh();
    content.diagrams[0].boxes = [
      {
        id: "box-1",
        label: "Agent",
        type: "person",
        parentId: "office",
        x: 20,
        y: 40,
      },
    ];
    show({ initial: content, editable: false });
    expect(
      screen.queryByRole("group", { name: "Hosting settings" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add |Copy/ }),
    ).not.toBeInTheDocument();
    expect(
      within(table("Zones"))
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      "MY01Subscription—",
      "Southeast AsiaAzure regionMY01",
      "East AsiaAzure regionMY01",
      "PDCData centre—",
      "SDCData centre—",
      "Office networkOffice network—",
    ]);
    await userEvent.click(
      within(table("Boxes")).getByRole("button", { name: "Agent" }),
    );
    expect(within(details()).getByText("Person")).toBeInTheDocument();
    expect(within(details()).getByText("Office network")).toBeInTheDocument();
    await userEvent.click(
      within(table("Zones")).getByRole("button", { name: "PDC" }),
    );
    expect(
      within(details()).getByText("Not inside a zone"),
    ).toBeInTheDocument();
  });

  it("shows lines with their label and style", async () => {
    const content = fresh();
    content.diagrams[0].lines = [
      { id: "line-1", from: "primary-dc", to: "dr-dc", dashed: true },
    ];
    show({ initial: content, editable: false });
    expect(
      within(table("Lines")).getByRole("row", {
        name: "PDC → SDC — Dashed · One-way",
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(table("Lines")).getByRole("button", { name: "PDC → SDC" }),
    );
    expect(within(details()).getByText("Dashed · One-way")).toBeInTheDocument();
  });

  it("shows the default hosting settings for a diagram that has none yet", () => {
    const { diagrams } = fresh();
    show({ initial: { diagrams } });
    expect(
      within(
        screen.getByRole("group", { name: "Hosting settings" }),
      ).getByLabelText("Subscription"),
    ).toHaveValue("MY01");
  });
});
