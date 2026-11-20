import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { autosaveKey, modelFixture } from "./fixture.mjs";
import { until } from "./harness.mjs";

export function findingsFixture() {
  const model = modelFixture();
  const note = (id, title, description, patch = {}) => ({
    id, title, description, origin: "authored-threat", justification: "The recorded control does not explain the intended protection.",
    targetKind: "node", targetId: "n_api", scenarioIds: ["s_primary"], status: "Active", createdAt: 1, replies: [], ...patch,
  });
  model.doc.issues = [
    { ...note("i_auth", "Tool API rejects the flow authentication", "The target policy does not accept this flow's method."),
      origin: undefined, justification: undefined, kind: "Edge_auth_not_accepted", targetKind: "edge", targetId: "e_request" },
    note("i_trace", "Trace readers can access customer identifiers", "STRIDE: Information disclosure\nTrace access needs owner review."),
    note("i_cross", "Retrieved content crosses the intended customer boundary", "STRIDE: Tampering, Information disclosure\nRecord which customer content is permitted."),
    note("i_unclassified", "The owner has not supplied a retention decision", "No retention decision has been recorded.", { justification: "" }),
    note("i_resolved", "Archive reader scope was too broad", "STRIDE: Information disclosure", { status: "Resolved", scenarioIds: ["s_archive"] }),
    { ...note("i_unknown", "A saved review lacks original source metadata", "Preserve the recorded observation."),
      origin: undefined, justification: undefined },
  ];
  model.doc.deviations = [{
    id: "dv_scope", key: "synthetic:retrieval-scope", kind: "other", title: "Retrieval index is absent from the model",
    description: "The approved synthetic comparison identified a missing index.", explanation: "The saved service inventory and model do not describe the same resources.",
    evidenceIds: ["synthetic-inventory-1"], scenarioIds: [], status: "Active", createdAt: 1, updatedAt: 1,
    targetKind: "node", targetId: "n_api",
  }];
  return model;
}

export const findingsPanel = page => page.locator("#ps-inspector-panel-findings");
export const findingCard = (page, id) => findingsPanel(page).locator(`.ps-finding-card[data-finding-id="${id}"]`);
export const findingDetail = page => findingsPanel(page).locator("[data-finding-detail]");
export async function savedReviewState(page) {
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), autosaveKey);
}
async function load(page, model = findingsFixture()) {
  await page.locator("#ps-file-open-input").setInputFiles({
    name: "stride-review.tma", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(model)),
  });
  await page.getByRole("combobox", { name: "Scenario", exact: true }).selectOption("");
  await until(() => page.locator(".react-flow__node-process").count().then(count => count === 3), "all review nodes measured");
  await until(() => page.evaluate(key => {
    window.dispatchEvent(new Event("pagehide"));
    return JSON.parse(localStorage.getItem(key)).doc.nodes.every(node => {
      const element = document.querySelector(`[data-id="${node.id}"] .ps-node`);
      return element && node.size?.width === element.offsetWidth && node.size?.height === element.offsetHeight;
    });
  }, autosaveKey), "stable review geometry");
  await page.getByRole("tab", { name: /^Findings\b/ }).click();
}

export function registerFindingsContracts({ getHarness }) {
  test("regression: Findings cards match Issues actions and focus exact targets without action bubbling", async () => {
    await getHarness().run("regression: Findings card action parity", async ({ page, observations }) => {
      const model = findingsFixture();
      model.doc.nodes[0].title = model.doc.nodes[1].title = "Repeated service";
      model.doc.issues.find(issue => issue.id === "i_unknown").title = model.doc.issues.find(issue => issue.id === "i_trace").title;
      model.doc.issues.find(issue => issue.id === "i_trace").replies = [{ id: "reply_card", text: "Keep until explicitly deleted.", createdAt: 1 }];
      const target = { kind: "node", id: "n_client", label: "Repeated service" };
      model.doc.findings = [{
        id: "ai_card", title: "Caller identity has not been verified", category: "Spoofing", severity: "high", status: "Active",
        rationale: "The synthetic caller's identity is not established by the recorded control.",
        recommendation: "Confirm the receiver validates the intended caller.",
        references: [target], focusReference: target, issueReference: target,
      }];
      model.doc.findingAnalysis = { id: "fa_cards", scenarioId: "s_primary", scenarioName: "Primary",
        createdAt: 1234, answer: "Synthetic card interaction review." };
      await load(page, model);
      const panel = findingsPanel(page);
      for (const id of ["ai_card", "i_auth", "i_trace"]) {
        assert.deepEqual(await findingCard(page, id).locator(".ps-finding-card-actions button").allTextContents(),
          ["Details", "Resolve", "Delete"], "AI, analyzer and saved issue cards use the same action row");
      }
      assert.deepEqual(await findingCard(page, "dv_scope").locator(".ps-finding-card-actions button").allTextContents(),
        ["Details", "Explain"], "Deviation source capabilities stay explanation-only");
      await page.getByRole("button", { name: "Pin inspector tab", exact: true }).click();
      const beforeFocus = await savedReviewState(page);
      const ai = findingCard(page, "ai_card");
      await ai.getByText(/^Why:/).click();
      await until(() => page.locator('.react-flow__node-process[data-id="n_client"]').getAttribute("class").then(value => /\bselected\b/.test(value)),
        "Clicking the card body focuses the exact target, not its identically named twin");
      assert.equal(await page.getByRole("tab", { name: /^Findings\b/ }).getAttribute("aria-selected"), "true");
      assert.equal(await ai.getByRole("button", { name: /^Focus finding:/ }).getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator(".ps-review-return").count(), 0, "Pinned card focus has no competing detail route");
      const details = ai.getByRole("button", { name: "Details", exact: true });
      await details.click();
      await findingDetail(page).getByRole("heading", { name: "What was found", exact: true }).waitFor();
      await page.getByRole("button", { name: "Back to Findings", exact: true }).click();
      await until(() => details.evaluate(control => control === control.ownerDocument.activeElement), "Details returns to its own card action");
      const afterFocus = await savedReviewState(page);
      for (const field of ["doc", "past", "future"]) assert.deepEqual(afterFocus[field], beforeFocus[field], field);
      await panel.getByRole("button", { name: "Collapse", exact: true }).click();
      await ai.scrollIntoViewIfNeeded();
      if (process.env.SDS_TEST_OUTPUT_DIR) {
        observations.cardScreenshot = "findings-card-actions.png";
        await page.screenshot({ path: resolve(process.env.SDS_TEST_OUTPUT_DIR, observations.cardScreenshot) });
      }

      await page.getByRole("button", { name: "Unpin inspector tab", exact: true }).click();
      const issue = findingCard(page, "i_trace");
      const issueFocus = issue.getByRole("button", { name: /^Focus finding:/ });
      await issueFocus.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Back to Findings", exact: true }).waitFor();
      assert.equal(await page.getByRole("tab", { name: "Properties", exact: true }).getAttribute("aria-selected"), "true");
      await until(() => page.locator('.react-flow__node-process[data-id="n_api"]').getAttribute("class").then(value => /\bselected\b/.test(value)),
        "Unpinned selection follows Properties just like Issues");
      await page.getByRole("button", { name: "Back to Findings", exact: true }).click();
      const beforeResolve = await savedReviewState(page);
      await issue.getByRole("button", { name: "Resolve", exact: true }).click();
      await issue.waitFor({ state: "detached" });
      const resolved = await savedReviewState(page);
      assert.deepEqual(resolved.doc, { ...beforeResolve.doc, issues: beforeResolve.doc.issues.map(item =>
        item.id === "i_trace" ? { ...item, status: "Resolved" } : item) });
      assert.deepEqual(resolved.view, beforeResolve.view, "Resolve never acts like a card-focus click");
      assert.equal(resolved.past.length, beforeResolve.past.length + 1);
      await until(() => findingCard(page, "i_cross").getByRole("button", { name: /^Focus finding:/ })
        .evaluate(control => control === control.ownerDocument.activeElement), "A filtered-out card leaves focus on the next record");
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      assert.deepEqual((await savedReviewState(page)).doc, beforeResolve.doc);
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      assert.deepEqual((await savedReviewState(page)).doc, resolved.doc);
      await page.getByRole("tab", { name: /^Findings\b/ }).click();
      await panel.getByLabel("Findings status").selectOption("all");
      await issue.getByRole("button", { name: "Reopen", exact: true }).click();
      assert.deepEqual((await savedReviewState(page)).doc, beforeResolve.doc);

      let confirm = false;
      const dialogs = [], unexpected = [];
      page.removeAllListeners("dialog");
      page.on("dialog", async dialog => {
        if (dialog.type() !== "confirm" || !/^Delete this (finding|issue)/.test(dialog.message())) {
          unexpected.push(dialog.message()); await dialog.dismiss(); return;
        }
        dialogs.push(dialog.message());
        await (confirm ? dialog.accept() : dialog.dismiss());
      });
      const beforeCancel = await savedReviewState(page);
      await ai.getByRole("button", { name: "Delete", exact: true }).click();
      const afterCancel = await savedReviewState(page);
      for (const field of ["doc", "past", "future", "view"]) assert.deepEqual(afterCancel[field], beforeCancel[field]);
      confirm = true;
      await ai.getByRole("button", { name: "Delete", exact: true }).click();
      await ai.waitFor({ state: "detached" });
      const deletedAi = await savedReviewState(page);
      assert.deepEqual(deletedAi.doc, { ...beforeCancel.doc, findings: [] }, "Deleting AI preserves model targets, issues and work");
      await issue.getByRole("button", { name: "Delete", exact: true }).click();
      await issue.waitFor({ state: "detached" });
      const deletedIssue = await savedReviewState(page);
      assert.deepEqual(deletedIssue.doc, { ...deletedAi.doc, issues: deletedAi.doc.issues.filter(item => item.id !== "i_trace") });
      assert.ok(deletedIssue.doc.issues.some(item => item.id === "i_unknown"), "A same-title issue is never substituted or deleted");
      assert.deepEqual(deletedIssue.view, beforeCancel.view);
      assert.equal(dialogs.length, 3);
      assert.deepEqual(unexpected, []);
      observations.actions = "Card-body exact focus; independent Details/Resolve/Delete; cancel/Undo/Redo; source capability parity.";
    });
  });

  test("regression: STRIDE Findings cells filter the one shared list without model or history changes", async () => {
    await getHarness().run("regression: STRIDE Findings counts and filters", async ({ page }) => {
      await load(page);
      const before = await savedReviewState(page);
      const panel = findingsPanel(page);
      assert.equal(await panel.getByLabel("Findings scope").inputValue(), "all");
      assert.equal(await panel.getByLabel("Findings status").inputValue(), "attention");
      assert.equal(await panel.locator("tbody tr").count(), 7);
      assert.equal(await panel.locator(".ps-finding-card").count(), 6);
      assert.equal(await panel.getByRole("columnheader", { name: "Service-model deviations", exact: true }).count(), 1);
      assert.equal(await panel.getByRole("columnheader", { name: /OWASP|CRA/ }).count(), 0);
      assert.match(await panel.innerText(), /A zero is not a security pass/);
      assert.match(await panel.innerText(), /No AI analysis is retained/);
      const cell = panel.getByRole("button", { name: "STRIDE Information disclosure, Saved notes / issues: 2 findings", exact: true });
      await cell.click();
      assert.deepEqual((await panel.locator(".ps-finding-card").evaluateAll(rows => rows.map(row => row.dataset.findingId))).sort(), ["i_cross", "i_trace"]);
      assert.equal(await cell.getAttribute("aria-pressed"), "true");
      await panel.getByLabel("Search findings", { exact: true }).fill("Trace");
      await panel.getByRole("button", { name: "STRIDE Information disclosure, Saved notes / issues: 1 finding", exact: true }).click();
      await panel.getByRole("button", { name: "Clear selected evidence count", exact: true }).click();
      assert.equal(await panel.getByLabel("Search findings", { exact: true }).inputValue(), "Trace");
      assert.equal(await panel.getByLabel("Findings status").inputValue(), "attention");
      assert.equal(await panel.locator(".ps-finding-card").count(), 1);
      await panel.getByLabel("Search findings", { exact: true }).fill("");
      await panel.getByRole("button", { name: "Hide zero rows", exact: true }).click();
      assert.equal(await panel.locator("tbody tr").count(), 4);
      await panel.getByRole("button", { name: "Show all category rows", exact: true }).click();
      assert.equal(await panel.locator("tbody tr").count(), 7);
      await panel.getByRole("button", { name: "Collapse", exact: true }).click();
      assert.equal(await panel.getByRole("table").isVisible(), false);
      assert.equal(await panel.locator(".ps-finding-card").count(), 6);
      await panel.getByRole("button", { name: "Show STRIDE evidence", exact: true }).click();
      await panel.getByLabel("Findings scope").selectOption("current");
      assert.equal(await panel.locator(".ps-finding-card").count(), 0);
      await panel.getByRole("status").filter({ hasText: "No current scenario is selected" }).waitFor();
      await panel.getByLabel("Findings scope").selectOption("scenario:s_archive");
      await panel.getByLabel("Findings status").selectOption("all");
      assert.equal(await panel.locator(".ps-finding-card").count(), 2, "Model-wide deviation plus the saved Archive finding");
      await panel.getByLabel("Findings source").selectOption("service");
      assert.equal(await panel.locator(".ps-finding-card").count(), 1);
      await panel.getByRole("button", { name: "STRIDE Unclassified, Service-model deviations: 1 finding", exact: true }).click();
      await findingCard(page, "dv_scope").getByRole("button", { name: "Details", exact: true }).click();
      await findingDetail(page).getByRole("heading", { name: "What was found", exact: true }).waitFor();
      assert.match(await findingDetail(page).innerText(), /Unclassified/);
      for (const action of ["Resolve", "Reopen", "Delete"]) {
        assert.equal(await findingDetail(page).getByRole("button", { name: action, exact: true }).count(), 0,
          "The common detail must preserve the deviation explanation-only workflow");
      }
      await findingDetail(page).getByRole("button", { name: "Explain and view source details", exact: true }).waitFor();
      const after = await savedReviewState(page);
      assert.deepEqual(after.doc, before.doc);
      assert.deepEqual(after.past, before.past);
      assert.deepEqual(after.future, before.future);
      assert.deepEqual(after.view, before.view);
    });
  });

  test("regression: STRIDE Findings detail and nested Back restore exact scope, filters, focus and scroll", async () => {
    await getHarness().run("regression: STRIDE Findings nested Back", async ({ page }) => {
      const model = findingsFixture();
      model.doc.nodes[0].title = model.doc.nodes[1].title = "Repeated service";
      await load(page, model);
      const scenario = page.getByRole("combobox", { name: "Scenario", exact: true });
      await scenario.selectOption("s_archive");
      await page.locator('.react-flow__node-process[data-id="n_archive"]').click();
      await page.locator('button[aria-controls="ps-command-menu-filter"]').click();
      await page.getByLabel("Search", { exact: true }).fill("Archive");
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await page.getByRole("tab", { name: /^Findings\b/ }).click();
      const panel = findingsPanel(page);
      await panel.getByLabel("Search findings", { exact: true }).fill("Trace");
      await panel.getByRole("button", { name: "STRIDE Information disclosure, Saved notes / issues: 1 finding", exact: true }).click();
      const title = findingCard(page, "i_trace").getByRole("button", { name: "Details", exact: true });
      await title.focus();
      const scroll = await panel.locator(".ps-findings").evaluate(element => element.scrollTop);
      const before = await savedReviewState(page);
      await title.click();
      const detail = findingDetail(page);
      for (const section of ["What was found", "Why it matters", "What to do next", "STRIDE classification"]) {
        await detail.getByRole("heading", { name: section, exact: true }).waitFor();
      }
      const target = detail.getByRole("button", { name: /^View affected element:/ });
      await target.click();
      await until(() => page.locator('.react-flow__node-process[data-id="n_api"]').getAttribute("class").then(value => /\bselected\b/.test(value)), "exact target not its title twin");
      assert.equal(await scenario.inputValue(), "s_primary");
      await page.getByRole("button", { name: "Back to finding", exact: true }).click();
      await until(() => target.evaluate(element => element === element.ownerDocument.activeElement), "common-detail target focus restored");
      assert.equal(await scenario.inputValue(), "s_archive");
      await page.getByRole("button", { name: "Back to Findings", exact: true }).click();
      await until(() => title.evaluate(element => element === element.ownerDocument.activeElement), "original list control focus restored");
      assert.equal(await panel.getByLabel("Search findings", { exact: true }).inputValue(), "Trace");
      assert.equal(await panel.getByRole("button", { name: "STRIDE Information disclosure, Saved notes / issues: 1 finding", exact: true }).getAttribute("aria-pressed"), "true");
      assert.ok(Math.abs(await panel.locator(".ps-findings").evaluate(element => element.scrollTop) - scroll) <= 2);
      const after = await savedReviewState(page);
      for (const field of ["doc", "past", "future", "view"]) assert.deepEqual(after[field], before[field], field);
      await title.click();
      await detail.getByRole("button", { name: "Edit issue and replies", exact: true }).click();
      const row = page.locator('#ps-inspector-panel-issues [data-review-id="i_trace"]');
      await row.getByPlaceholder("Reply…").fill("Unsent exact issue reply");
      await page.getByRole("button", { name: "Back to finding", exact: true }).click();
      await detail.getByRole("button", { name: "Edit issue and replies", exact: true }).click();
      assert.equal(await row.getByPlaceholder("Reply…").inputValue(), "Unsent exact issue reply");
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      await row.getByLabel("Title", { exact: true }).fill("Revised trace finding");
      await row.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("button", { name: "Back to finding", exact: true }).click();
      await detail.getByRole("heading", { name: "Revised trace finding", exact: true }).waitFor();
      await detail.getByRole("button", { name: "Resolve", exact: true }).click();
      assert.equal((await savedReviewState(page)).doc.issues.find(issue => issue.id === "i_trace").status, "Resolved");
      await detail.getByRole("button", { name: "Findings list", exact: true }).click();
      await panel.getByLabel("Search findings", { exact: true }).fill("");
      await findingCard(page, "dv_scope").getByRole("button", { name: "Details", exact: true }).click();
      await detail.getByRole("button", { name: "Explain and view source details", exact: true }).click();
      const deviation = page.locator('#ps-inspector-panel-deviations [data-review-id="dv_scope"]');
      await deviation.getByRole("button", { name: "Explain", exact: true }).click();
      await deviation.getByLabel(/^Explanation/).fill("Retain this unsent explanation.");
      await page.getByRole("button", { name: "Back to finding", exact: true }).click();
      await detail.getByRole("button", { name: "Explain and view source details", exact: true }).click();
      assert.equal(await deviation.getByLabel(/^Explanation/).inputValue(), "Retain this unsent explanation.");
    });
  });

  test("usability: STRIDE Findings retain one mounted list in narrow, floating and popup inspectors", async () => {
    await getHarness().run("usability: STRIDE Findings presentations", async ({ page, context, observations }) => {
      await load(page);
      const panel = findingsPanel(page);
      await panel.getByLabel("Search findings", { exact: true }).fill("Trace");
      await panel.evaluate(element => { element.dataset.identity = "same-findings"; });
      await page.getByRole("combobox", { name: "Inspector display", exact: true }).selectOption("floating");
      assert.equal(await panel.getAttribute("data-identity"), "same-findings");
      const pending = context.waitForEvent("page");
      await page.getByRole("combobox", { name: "Inspector display", exact: true }).selectOption("window");
      const child = await pending;
      assert.equal(await findingsPanel(child).getByLabel("Search findings", { exact: true }).inputValue(), "Trace");
      const title = findingCard(child, "i_trace").getByRole("button", { name: "Details", exact: true });
      await title.focus();
      await child.keyboard.press("Enter");
      await findingDetail(child).getByRole("button", { name: /^View affected element:/ }).click();
      await child.getByRole("button", { name: "Back to finding", exact: true }).click();
      await child.getByRole("button", { name: "Back to Findings", exact: true }).click();
      await until(() => title.evaluate(element => element === element.ownerDocument.activeElement), "popup Back focus");
      await child.close();
      assert.equal(await panel.getAttribute("data-identity"), "same-findings");
      for (const viewport of [{ width: 1366, height: 900 }, { width: 768, height: 600 }, { width: 320, height: 480 }]) {
        await page.setViewportSize(viewport);
        await panel.getByLabel("Search findings", { exact: true }).fill("");
        const headers = await panel.getByRole("columnheader").allTextContents();
        assert.ok(headers.includes("Service-model deviations"));
        await panel.getByRole("button", { name: "Hide zero rows", exact: true }).focus();
        await page.keyboard.press("Enter");
        await panel.getByRole("button", { name: "Show all category rows", exact: true }).click();
        await panel.getByRole("button", { name: /^Findings \(\d+\)$/ }).click();
        await findingCard(page, "i_trace").getByRole("button", { name: "Details", exact: true }).focus();
        await page.keyboard.press("Enter");
        const detail = findingDetail(page);
        await detail.getByRole("heading", { name: "What to do next", exact: true }).scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.getByRole("button", { name: "Back to Findings", exact: true }).click();
        if (process.env.SDS_TEST_OUTPUT_DIR) {
          const name = `stride-findings-${viewport.width}x${viewport.height}.png`;
          await page.screenshot({ path: resolve(process.env.SDS_TEST_OUTPUT_DIR, name) });
          observations[`${viewport.width}x${viewport.height}`] = name;
        }
      }
    });
  });
}
