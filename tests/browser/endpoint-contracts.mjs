import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "./harness.mjs";
import { autosaveKey, modelFixture } from "./fixture.mjs";

export async function openEndpointDialog(page, route = "model") {
  await page.locator(`button[aria-controls="ps-command-menu-${route}"]`).click();
  await page.getByRole("menuitem", { name: route === "model" ? /^Endpoint matching/ : /^Endpoints text/ }).click();
  return page.getByRole("dialog", { name: "Import nodes from Endpoints", exact: true });
}

export function registerEndpointContracts({ getHarness, exportModel, configured = false }) {
  test(`usability: endpoint importer ${configured ? "configured help" : "generic help"} stays keyboard accessible`, async () => {
    await getHarness().run(`usability: endpoint help ${configured ? "configured" : "unconfigured"}`, async ({ page }) => {
      let dialog = await openEndpointDialog(page);
      await until(() => dialog.getByRole("button", { name: "Close", exact: true }).evaluate(el => el === document.activeElement), "endpoint dialog focus");
      const example = dialog.getByRole("textbox", { name: "Endpoint import example", exact: true });
      if (configured) {
        assert.equal(await example.inputValue(), "https://example.invalid/service\nhttps://example.invalid/other");
        assert.match(await dialog.innerText(), /Example review library \(example @ 1.0.0\)/);
        await page.evaluate(() => {
          Object.defineProperty(navigator, "clipboard", { configurable: true,
            value: { writeText: async text => { window.endpointCopied = text; } } });
        });
        await dialog.getByRole("button", { name: "Copy to clipboard" }).click();
        await dialog.getByRole("status").getByText("Copied to clipboard.", { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.endpointCopied), await example.inputValue());
        await page.evaluate(() => {
          Object.defineProperty(navigator, "clipboard", { configurable: true,
            value: { writeText: async () => { throw new Error("Synthetic clipboard denial"); } } });
        });
        await dialog.getByRole("button", { name: "Copy to clipboard" }).click();
        await dialog.getByRole("status").filter({ hasText: "Clipboard access was unavailable" }).waitFor();
        assert.equal(await example.evaluate(el => el.selectionStart === 0 && el.selectionEnd === el.value.length
          && el === document.activeElement), true);
      } else {
        assert.equal(await example.count(), 0);
        assert.equal(await dialog.getByRole("button", { name: "Copy to clipboard" }).count(), 0);
        assert.match(await dialog.innerText(), /No optional endpoint guidance is configured/);
      }
      await dialog.getByRole("button", { name: "Close", exact: true }).focus();
      await page.keyboard.press("Shift+Tab");
      assert.equal(await dialog.getByRole("button", { name: "Choose file…" }).evaluate(el => el === document.activeElement), true);
      await page.setViewportSize({ width: 320, height: 640 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
      await page.keyboard.press("Escape");
      await until(() => page.locator('button[aria-controls="ps-command-menu-model"]').evaluate(el => el === document.activeElement), "endpoint dialog return focus");
      await page.setViewportSize({ width: 1366, height: 900 });
      dialog = await openEndpointDialog(page, "file");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await until(() => page.locator('button[aria-controls="ps-command-menu-file"]').evaluate(el => el === document.activeElement), "file route return focus");
    });
  });

  test(`regression: endpoint text matching remains local and idempotent ${configured ? "with" : "without"} help`, async () => {
    await getHarness().run(`regression: endpoint matching ${configured ? "configured" : "unconfigured"}`, async ({ page }) => {
      const model = modelFixture();
      for (const [id, suffix] of [["EndpointGeneral", ""], ["EndpointSpecific", "specific"]]) {
        model.doc.nodeTypes.push({ id, label: id, definition: {
          serviceTreeId: "", endpointRegex: `^https://endpoint-import\\.example\\.invalid/${suffix}`,
          allowedAuthMethods: [], allowedDataTypes: [{ id: "*", retention: "*", action: "Allow" }],
        } });
      }
      await page.locator("#ps-file-open-input").setInputFiles({
        name: "endpoint-fixture.tma", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(model)),
      });
      const before = await exportModel(page);
      await page.evaluate(() => { window.endpointAlerts = []; window.alert = message => window.endpointAlerts.push(message); });
      const content = "\nGET https://endpoint-import.example.invalid/specific HTTP/1.1\r\nhttps://endpoint-import.example.invalid/specific\nhttps://unmatched.example.invalid\n";
      const upload = async () => {
        const dialog = await openEndpointDialog(page);
        const chooser = page.waitForEvent("filechooser");
        await dialog.getByRole("button", { name: "Choose file…" }).click();
        const download = page.waitForEvent("download");
        await (await chooser).setFiles({ name: "endpoints.txt", mimeType: "text/plain", buffer: Buffer.from(content) });
        const unknown = await download;
        assert.equal(unknown.suggestedFilename(), "endpoints_unknown.txt");
        const chunks = [];
        for await (const chunk of await unknown.createReadStream()) chunks.push(chunk);
        assert.equal(Buffer.concat(chunks).toString("utf8"), "https://unmatched.example.invalid\n");
        const results = page.getByRole("dialog", { name: "Endpoint import results", exact: true });
        await results.waitFor();
        assert.equal(await results.locator("tbody tr").count(), 3);
        assert.match(await results.innerText(), /EndpointSpecific/);
        assert.match(await results.innerText(), /No matching type/);
        assert.equal(await results.getByRole("combobox").first().inputValue(), "");
        await results.getByRole("button", { name: "Done", exact: true }).click();
      };
      await upload();
      const imported = await exportModel(page);
      const created = imported.doc.nodes.filter(node => !before.doc.nodes.some(old => old.id === node.id));
      assert.equal(created.length, 1);
      assert.equal(created[0].type, "EndpointSpecific");
      assert.ok(imported.doc.scenarios[0].nodeIds.includes(created[0].id));
      assert.deepEqual(imported.doc.edges, before.doc.edges);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      assert.deepEqual((await exportModel(page)).doc.nodes, before.doc.nodes);
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      assert.deepEqual((await exportModel(page)).doc.nodes, imported.doc.nodes);
      await upload();
      assert.deepEqual((await exportModel(page)).doc, imported.doc);
      const alerts = await page.evaluate(() => window.endpointAlerts);
      assert.deepEqual(alerts, []);
    });
  });

  test(`regression: explicit node endpoints retain asset identity, history and recovery ${configured ? "configured" : "core"}`, async () => {
    await getHarness().run("regression: node endpoint assignments", async ({ page, context, observations }) => {
      const model = modelFixture();
      model.doc.nodes.forEach((node, index) => {
        node.title = ["Support web", "Support API", "Case store"][index];
        node.type = index < 2 ? "support-app" : "support-store";
      });
      model.doc.scenarios[0].nodeIds.push("n_archive");
      for (const [id, label, pattern] of [
        ["support-app", "App Service app", "^https://support-(web|api)\\.example\\.com(/|$)"],
        ["support-store", "Storage account", "^https://case-store\\.example\\.com(/|$)"],
      ]) model.doc.nodeTypes.push({ id, label, definition: { serviceTreeId: "", endpointRegex: pattern,
        allowedAuthMethods: [], allowedDataTypes: [], policyStatus: "Unspecified" } });
      await page.locator("#ps-file-open-input").setInputFiles({
        name: "support.tma", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(model)),
      });
      const before = await exportModel(page);
      await context.setOffline(true);
      const addresses = ["https://support-web.example.com/", "https://support-api.example.com/cases",
        "https://case-store.example.com/cases", "https://unmatched.example.invalid/"];
      const dialog = await openEndpointDialog(page);
      const chooser = page.waitForEvent("filechooser");
      await dialog.getByRole("button", { name: "Choose file…" }).click();
      const downloaded = page.waitForEvent("download");
      await (await chooser).setFiles({ name: "support-endpoints.txt", mimeType: "text/plain",
        buffer: Buffer.from([...addresses, addresses[0]].join("\n")) });
      await downloaded;
      const results = page.getByRole("dialog", { name: "Endpoint import results", exact: true });
      await results.waitFor();
      await until(() => results.getByRole("button", { name: "Close", exact: true })
        .evaluate(el => el === document.activeElement), "results focus");
      assert.match(await results.innerText(), /Imported 0 new node types \(2 matched in total\)/);
      assert.equal(await results.locator("tbody tr").count(), 5);
      assert.equal(await results.getByText("Type already exists", { exact: true }).count(), 4);
      assert.equal(await results.getByText("Not assigned", { exact: true }).count(), 5);
      await page.setViewportSize({ width: 320, height: 560 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      for (const [index, id] of ["n_client", "n_api", "n_archive", "n_api", "n_client"].entries()) {
        const row = results.locator("tbody tr").nth(index);
        await row.getByRole("combobox").selectOption(id);
        if (index === 4) {
          assert.equal(await row.getByRole("button", { name: "Assign", exact: true }).isDisabled(), true);
        } else {
          await row.getByRole("button", { name: "Assign", exact: true }).click();
          await row.getByText(/^Assigned to:/).waitFor();
        }
      }
      await results.getByRole("button", { name: "Done", exact: true }).focus();
      await page.keyboard.press("Tab");
      assert.equal(await results.getByRole("button", { name: "Close", exact: true })
        .evaluate(el => el === document.activeElement), true);
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1366, height: 900 });
      const assigned = await exportModel(page);
      assert.deepEqual(assigned.doc.nodes.map(node => node.endpoints), [
        [addresses[0]], [addresses[1], addresses[3]], [addresses[2]],
      ]);
      assert.deepEqual(assigned.doc.edges, before.doc.edges, "addresses never create flows");
      assert.deepEqual(assigned.doc.scenarios, before.doc.scenarios);
      assert.deepEqual(assigned.doc.nodes.map(({ endpoints, ...node }) => node), before.doc.nodes);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      const undone = await exportModel(page);
      assert.deepEqual(undone.doc.nodes[1].endpoints, [addresses[1]]);
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      assert.deepEqual((await exportModel(page)).doc, assigned.doc);
      await page.locator('.react-flow__node-process[data-id="n_client"] .ps-node-title').click();
      await page.getByRole("tab", { name: "Endpoints", exact: true }).click();
      const endpointPanel = page.getByRole("region", { name: "Assigned endpoints" });
      await endpointPanel.getByText(addresses[0], { exact: true }).waitFor();
      assert.equal(await endpointPanel.getByText(addresses[1], { exact: true }).count(), 0);
      await endpointPanel.getByRole("button", { name: `Remove ${addresses[0]}`, exact: true }).click();
      await endpointPanel.getByText("No endpoints assigned to this node.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await page.locator('.react-flow__node-process[data-id="n_client"] .ps-node-title').click();
      await page.getByRole("tab", { name: "Endpoints", exact: true }).click();
      await endpointPanel.getByText(addresses[0], { exact: true }).waitFor();
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      await until(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).doc.nodes[0].endpoints?.length === 1,
        autosaveKey), "assigned endpoints autosaved");
      await context.setOffline(false);
      await page.reload();
      assert.deepEqual((await exportModel(page)).doc.nodes.map(node => node.endpoints),
        assigned.doc.nodes.map(node => node.endpoints));
      await page.locator("#ps-file-open-input").setInputFiles({
        name: "assigned.tma", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(assigned)),
      });
      assert.deepEqual((await exportModel(page)).doc, assigned.doc);
      await page.locator('.react-flow__node-process[data-id="n_client"] .ps-node-title').click();
      await page.getByRole("tab", { name: "Endpoints", exact: true }).click();
      await page.getByRole("combobox", { name: "Inspector display", exact: true }).selectOption("floating");
      await page.getByRole("region", { name: "Assigned endpoints" }).getByText(addresses[0], { exact: true }).waitFor();
      const popupEvent = context.waitForEvent("page");
      await page.getByRole("combobox", { name: "Inspector display", exact: true }).selectOption("window");
      const popup = await popupEvent;
      const popupPanel = popup.getByRole("region", { name: "Assigned endpoints" });
      await popupPanel.getByText(addresses[0], { exact: true }).waitFor();
      await popupPanel.getByRole("button", { name: `Remove ${addresses[0]}`, exact: true }).click();
      await popupPanel.getByText("No endpoints assigned to this node.", { exact: true }).waitFor();
      assert.equal(await popupPanel.locator("p").first().evaluate(el => el === document.activeElement), true);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await page.locator('.react-flow__node-process[data-id="n_client"] .ps-node-title').click();
      await popup.getByRole("tab", { name: "Endpoints", exact: true }).click();
      await popupPanel.getByText(addresses[0], { exact: true }).waitFor();
      await popup.close();
      await page.getByRole("region", { name: "Assigned endpoints" }).getByText(addresses[0], { exact: true }).waitFor();
      await page.locator('.ps-edge-label[data-edge-id="e_request"] .ps-edge-num').click();
      assert.equal(await page.getByRole("tab", { name: "Endpoints", exact: true }).count(), 0);
      assert.equal(await page.getByRole("tab", { name: /^General \/ Security/ }).getAttribute("aria-selected"), "true");
      observations.assignedEndpoints = assigned.doc.nodes.map(node => ({ id: node.id, endpoints: node.endpoints }));
    });
  });

  test(`regression: endpoint results preserve unresolved duplicate-line choices ${configured ? "configured" : "core"}`, async () => {
    await getHarness().run("regression: unresolved endpoint rows", async ({ page }) => {
      const model = modelFixture();
      model.doc.nodes[0].endpoints = Array.from({ length: 1000 }, (_, index) => `/existing/${index}`);
      for (const id of ["EndpointCandidateA", "EndpointCandidateB"]) {
        model.doc.nodeTypes.push({ id, label: id, definition: { serviceTreeId: "",
          endpointRegex: "^https://ambiguous\\.example\\.invalid/", allowedAuthMethods: [],
          allowedDataTypes: [], policyStatus: "Unspecified" } });
      }
      await page.locator("#ps-file-open-input").setInputFiles({
        name: "ambiguous.tma", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(model)),
      });
      await page.evaluate(() => {
        window.endpointPromptAnswers = [null, "2"];
        window.prompt = () => window.endpointPromptAnswers.shift();
      });
      const dialog = await openEndpointDialog(page);
      const chooser = page.waitForEvent("filechooser");
      await dialog.getByRole("button", { name: "Choose file…" }).click();
      const unknownEvent = page.waitForEvent("download");
      await (await chooser).setFiles({ name: "ambiguous.txt", mimeType: "text/plain",
        buffer: Buffer.from(Array(3).fill("https://ambiguous.example.invalid/").join("\n")) });
      const unknown = await unknownEvent;
      const chunks = [];
      for await (const chunk of await unknown.createReadStream()) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).toString("utf8"), "https://ambiguous.example.invalid/\n");
      const results = page.getByRole("dialog", { name: "Endpoint import results", exact: true });
      await results.waitFor();
      assert.equal(await results.locator("tbody tr").count(), 3);
      assert.equal(await results.locator("tbody tr").nth(0).getByText("Unmatched", { exact: true }).count(), 1);
      for (const index of [1, 2]) {
        const row = results.locator("tbody tr").nth(index);
        assert.equal(await row.getByText("EndpointCandidateB", { exact: true }).count(), 1);
        assert.equal(await row.getByText("Node added", { exact: true }).count(), 1);
        assert.equal(await row.getByRole("combobox").inputValue(), "");
      }
      const unresolved = results.locator("tbody tr").nth(0);
      await unresolved.getByRole("combobox").selectOption("n_client");
      await unresolved.getByRole("button", { name: "Assign", exact: true }).click();
      const error = results.getByRole("alert").filter({ hasText: "at most 1000 addresses" });
      await error.waitFor();
      await until(() => error.evaluate(el => el === document.activeElement), "assignment error focus");
      await results.getByRole("button", { name: "Done", exact: true }).click();
      const saved = await exportModel(page);
      assert.equal(saved.doc.nodes.filter(node => node.type === "EndpointCandidateB").length, 1);
      assert.equal(saved.doc.nodes.filter(node => node.type === "EndpointCandidateA").length, 0);
      assert.deepEqual(saved.doc.nodes[0].endpoints, model.doc.nodes[0].endpoints);
      assert.ok(saved.doc.nodes.slice(1).every(node => !node.endpoints?.length));
    });
  });
}
