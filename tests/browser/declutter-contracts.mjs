import assert from "node:assert/strict";
import { test } from "node:test";
import { autosaveKey, modelFixture } from "./fixture.mjs";
import { until } from "./harness.mjs";

const saved = page => page.evaluate(key => {
  window.dispatchEvent(new Event("pagehide"));
  const value = JSON.parse(localStorage.getItem(key));
  return { doc: value.doc, past: value.past, future: value.future };
}, autosaveKey);
const picker = page => page.getByRole("combobox", { name: "Scenario", exact: true });
const button = page => page.getByRole("button", { name: "Declutter diagram", exact: true });
const node = (page, id) => page.locator(`.react-flow__node-process[data-id="${id}"]`);
const fitReady = async page => {
  await until(() => button(page).getAttribute("aria-busy").then(value => value === "false"), "Declutter completes");
  await until(() => page.locator(".ps-edge-label-compact").count().then(count => count > 0),
    "Saved compact labels render");
  assert.equal(await page.locator(".ps-canvas-layout-status").count(), 0,
    "Successful declutter does not display a persistent explanatory message");
};
const semantics = doc => ({
  ...doc,
  nodes: doc.nodes.map(({ position, ...node }) => node),
  edges: doc.edges.map(({ sourceHandle, targetHandle, waypoints, compactLabel, ...edge }) => edge),
  boundaries: doc.boundaries.map(({ position, size, ...boundary }) => boundary),
  ...(doc.textAnnotations ? { textAnnotations: doc.textAnnotations.map(({ position, ...annotation }) => annotation) } : {}),
});

async function settledMeasurements(page) {
  await until(() => page.evaluate(key => {
    window.dispatchEvent(new Event("pagehide"));
    const doc = JSON.parse(localStorage.getItem(key)).doc;
    return [...document.querySelectorAll(".react-flow__node-process")].every(element => {
      const n = doc.nodes.find(n => n.id === element.getAttribute("data-id"));
      return n?.size?.width === element.offsetWidth && n?.size?.height === element.offsetHeight;
    });
  }, autosaveKey), "Authored measurements settle");
}

async function openDenseFixture(page) {
  const fixture = modelFixture();
  fixture.doc.edges.push(...Array.from({ length: 12 }, (_, i) => ({
    ...structuredClone(fixture.doc.edges[0]), id: `dense-${i}`, title: `Synthetic parallel operation ${i} with a long title`,
    waypoints: [{ id: `w-${i}`, x: 200 + i, y: -100 - i }],
  })));
  fixture.doc.edges.push({ ...structuredClone(fixture.doc.edges[0]), id: "self",
    source: "n_api", target: "n_api", title: "Synthetic self call" });
  const scenario = fixture.doc.scenarios[0];
  for (const edge of fixture.doc.edges.filter(edge => edge.id.startsWith("dense-") || edge.id === "self")) {
    scenario.edgeIds.push(edge.id);
    scenario.edgeNumbers[edge.id] = 100 + scenario.edgeIds.length;
  }
  await page.locator("#ps-file-open-input").setInputFiles({
    name: "declutter.tma", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await until(() => node(page, "n_client").count().then(count => count === 1), "Dense fixture imported");
  await picker(page).selectOption("");
  await settledMeasurements(page);
  await picker(page).selectOption("s_primary");
}

export function registerDeclutterContracts({ getHarness, exportModel }) {
  test("regression: declutter saves an editable layout in one history step and preserves model semantics", async () => {
    await getHarness().run("regression: saved editable declutter", async ({ page, observations }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await openDenseFixture(page);
      const before = await saved(page);
      await button(page).click();
      await fitReady(page);
      await until(() => page.evaluate(() => {
        const canvas = document.querySelector(".react-flow").getBoundingClientRect();
        return [...document.querySelectorAll(".ps-edge-label-compact, .react-flow__node-process")].every(element => {
          const box = element.getBoundingClientRect();
          return box.left >= canvas.left && box.top >= canvas.top && box.right <= canvas.right && box.bottom <= canvas.bottom;
        });
      }), "One click fits every node and flow label into the available canvas");
      const geometry = await page.locator(".ps-edge-label-compact").evaluateAll(labels => {
        const nodes = [...document.querySelectorAll(".react-flow__node-process")].map(node => node.getBoundingClientRect());
        const rects = labels.map(label => label.getBoundingClientRect());
        const overlaps = (a, b) => a.left < b.right - 0.1 && a.right > b.left + 0.1 &&
          a.top < b.bottom - 0.1 && a.bottom > b.top + 0.1;
        return { count: labels.length,
          collisions: rects.flatMap((rect, i) => [...rects.slice(i + 1), ...nodes].filter(other => overlaps(rect, other))).length };
      });
      assert.deepEqual(geometry, { count: 15, collisions: 0 });
      const arranged = await saved(page);
      assert.deepEqual(semantics(arranged.doc), semantics(before.doc));
      assert.notDeepEqual(arranged.doc.nodes, before.doc.nodes);
      assert.equal(arranged.past.length, before.past.length + 1);
      assert.deepEqual(arranged.past.at(-1), before.doc, "One coherent predecessor is saved for Undo");
      assert.deepEqual(arranged.doc.nodes.find(n => n.id === "n_store"), before.doc.nodes.find(n => n.id === "n_store"),
        "Nodes outside the visible scenario are not rearranged");
      const box = await node(page, "n_client").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20, { steps: 4 });
      await page.mouse.up();
      await until(async () => {
        const after = await saved(page);
        return JSON.stringify(after.doc.nodes.find(n => n.id === "n_client").position) !==
          JSON.stringify(arranged.doc.nodes.find(n => n.id === "n_client").position);
      }, "Objects remain draggable immediately after Declutter");
      const dragged = await saved(page);
      assert.deepEqual(dragged.doc.edges, arranged.doc.edges, "Dragging does not rerun layout or move flow labels");
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      assert.deepEqual((await saved(page)).doc, arranged.doc);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      assert.deepEqual((await saved(page)).doc, before.doc, "One Undo restores the whole previous layout");
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      assert.deepEqual((await saved(page)).doc, arranged.doc);
      const label = page.locator('.ps-edge-label[data-edge-id="e_request"]');
      await label.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("tab", { name: /^Properties/ }).waitFor();
      await label.locator(".ps-edge-title").dblclick({ delay: 100 });
      const titleEditor = page.locator('[data-editing-edge-id="e_request"]');
      await titleEditor.press("End");
      await titleEditor.press("Space");
      await titleEditor.pressSequentially("edited");
      await titleEditor.press("Control+Enter");
      assert.equal((await saved(page)).doc.edges.find(edge => edge.id === "e_request").title, "Request payload edited",
        "Compact labels retain normal inline editing, including spaces");
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      assert.deepEqual((await saved(page)).doc, arranged.doc);
      await label.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("tab", { name: /^Properties/ }).waitFor();
      assert.match(await label.locator(".ps-edge-title").getAttribute("title"), /#7 Request payload.*Authentication/s);
      const native = await exportModel(page);
      assert.deepEqual(native.doc, arranged.doc, "Native Save includes arranged positions, routes and compact labels");
      await page.reload();
      await fitReady(page);
      assert.deepEqual((await saved(page)).doc, arranged.doc, "Autosave recovery preserves editable declutter");
      await page.locator("#ps-file-open-input").setInputFiles({
        name: "reopened.tma", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(native)),
      });
      await page.getByLabel("Document status").getByText("reopened.tma", { exact: true }).waitFor();
      await fitReady(page);
      assert.deepEqual((await exportModel(page)).doc, arranged.doc);
      await page.getByRole("button", { name: "Export", exact: true }).click();
      const imageEvent = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: /Diagram image \(\.png\)/ }).click();
      const chunks = [];
      for await (const chunk of await (await imageEvent).createReadStream()) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).subarray(1, 4).toString(), "PNG");
      observations.declutter = "15 dense flows have no label/node collisions; layout saves, reloads, supports dragging and has a single-step Undo.";
    });
  });

  test("usability: declutter stays beside zoom controls without a banner and remains keyboard accessible", async () => {
    await getHarness().run("usability: compact declutter controls", async ({ page }) => {
      await openDenseFixture(page);
      await page.locator('button[aria-controls="ps-command-menu-view"]').click();
      await page.getByRole("menuitem", { name: "Declutter diagram", exact: true }).click();
      await fitReady(page);
      const arranged = await saved(page);
      await page.getByRole("button", { name: "Sequence", exact: true }).click();
      await page.getByRole("button", { name: "Diagram", exact: true }).click();
      await fitReady(page);
      assert.deepEqual(await saved(page), arranged, "Switching views must not apply layout again");
      await picker(page).selectOption("s_archive");
      assert.equal(await page.locator(".ps-edge-label-compact").count(), 0);
      await picker(page).selectOption("s_primary");
      await fitReady(page);
      assert.deepEqual(await saved(page), arranged, "Scenario changes must not automatically rearrange shared nodes");
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("menuitemcheckbox", { name: /Dark Theme/ }).click();
      await page.keyboard.press("Escape");
      for (const width of [320, 768, 1366]) {
        await page.setViewportSize({ width, height: 900 });
        const box = await button(page).boundingBox();
        const zoomBox = await page.getByRole("button", { name: "Zoom in", exact: true }).boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 900);
        assert.ok(zoomBox && box.x > zoomBox.x && Math.abs(box.y - zoomBox.y) < 1,
          `Declutter stays beside zoom at ${width}px`);
      }
      await button(page).focus();
      await page.keyboard.press("Space");
      await fitReady(page);
      assert.equal(await page.getByRole("button", { name: "Restore layout", exact: true }).count(), 0);
      await page.locator("#ps-file-open-input").setInputFiles({
        name: "replacement.tma", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(modelFixture())),
      });
      await page.getByLabel("Document status").getByText("replacement.tma", { exact: true }).waitFor();
      assert.equal(await page.locator(".ps-edge-label-compact").count(), 0);
    });
  });

  test("regression: declutter does not rearrange or change history when filters change", async () => {
    await getHarness().run("regression: filtered saved declutter", async ({ page }) => {
      await openDenseFixture(page);
      await button(page).click();
      await fitReady(page);
      const arranged = await saved(page);
      const filterButton = page.locator('button[aria-controls="ps-command-menu-filter"]');
      await filterButton.click();
      await page.getByRole("searchbox", { name: "Search", exact: true }).fill("no-synthetic-node-matches-this");
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await until(() => page.locator(".react-flow__node-process").count().then(count => count === 0), "Empty filtered layout");
      assert.deepEqual(await saved(page), arranged);
      assert.equal(await button(page).isDisabled(), true);
      await filterButton.click();
      await page.getByRole("button", { name: "Clear all", exact: true }).click();
      await page.keyboard.press("Escape");
      await fitReady(page);
      assert.deepEqual(await saved(page), arranged);
    });
  });

  test("regression: declutter retains boundary memberships and leaves annotations editable", async () => {
    await getHarness().run("regression: editable declutter boundaries", async ({ page }) => {
      const fixture = modelFixture();
      fixture.doc.boundaries = [
        { id: "outer", type: "security", title: "Synthetic outer", nodeIds: ["n_client", "n_api"],
          position: { x: 50, y: 50 }, size: { width: 650, height: 300 } },
        { id: "inner", type: "privacy", title: "Synthetic inner", nodeIds: ["n_api"],
          position: { x: 420, y: 90 }, size: { width: 260, height: 210 } },
      ];
      fixture.doc.textAnnotations = [{ id: "note", text: "Synthetic annotation",
        position: { x: 300, y: 400 }, size: { width: 240, height: 80 } }];
      fixture.doc.scenarios[0].boundaryIds = ["outer", "inner"];
      fixture.doc.scenarios[0].textAnnotationIds = ["note"];
      await page.locator("#ps-file-open-input").setInputFiles({
        name: "declutter-boundaries.tma", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)),
      });
      await until(() => page.locator('.react-flow__node-boundary[data-id="outer"]').count().then(count => count === 1),
        "Boundary fixture imported");
      await settledMeasurements(page);
      const before = await saved(page);
      await button(page).click();
      await fitReady(page);
      const arranged = await saved(page);
      assert.deepEqual(semantics(arranged.doc), semantics(before.doc));
      const containment = await page.evaluate(() => {
        const rect = id => document.querySelector(`.react-flow__node[data-id="${id}"]`).getBoundingClientRect();
        const contains = (a, b) => b.left >= a.left && b.top >= a.top && b.right <= a.right && b.bottom <= a.bottom;
        return { apiInside: contains(rect("inner"), rect("n_api")), clientOutside: !contains(rect("inner"), rect("n_client")),
          innerInside: contains(rect("outer"), rect("inner")) };
      });
      assert.deepEqual(containment, { apiInside: true, clientOutside: true, innerInside: true });
      const annotation = page.locator('.react-flow__node-annotation[data-id="note"] .ps-text-annotation');
      await annotation.focus();
      await annotation.press("ArrowRight");
      assert.equal((await saved(page)).doc.textAnnotations[0].position.x, arranged.doc.textAnnotations[0].position.x + 1);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      assert.deepEqual((await saved(page)).doc, arranged.doc);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      assert.deepEqual((await saved(page)).doc, before.doc);
    });
  });
}
