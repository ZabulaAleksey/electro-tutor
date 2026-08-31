import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { validatePagesWorkflow } from "./ci-workflow-contract.mjs";
import { fullVerifySteps } from "./full-verify.mjs";

const source = await readFile(".github/workflows/pages.yml", "utf8");

function mutateWorkflow(mutator) {
  const workflow = validatePagesWorkflow(source);
  mutator(workflow);
  return stringify(workflow);
}

describe("GitHub Pages pre-deploy contract", () => {
  it("accepts the production workflow", () => {
    expect(() => validatePagesWorkflow(source)).not.toThrow();
  });

  it.each([
    ["type/static", "check"],
    ["unit/integration/component", "test"],
    ["full live E2E", "test:e2e:root"],
    ["production artifact E2E smoke", "test:e2e:production-smoke"],
  ])("blocks upload when the %s gate is removed", (_name, missingScript) => {
    // Simulate a production launcher mutation while validating the unchanged
    // production workflow path that calls that launcher before artifact upload.
    const brokenSteps = fullVerifySteps.filter(
      (args) => !(args[0] === "run" && args[1] === missingScript),
    );
    expect(() => validatePagesWorkflow(source, brokenSteps)).toThrow(/gate order/);
  });

  it("blocks upload when CI bypasses the real full-verify entrypoint", () => {
    const broken = mutateWorkflow((workflow) => {
      const step = workflow.jobs.verify.steps.find(
        (candidate) => candidate.run === "pnpm run verify:full -- --skip-install",
      );
      step.run = "pnpm run build";
    });
    expect(() => validatePagesWorkflow(broken)).toThrow(/verify:full/);
  });

  it("blocks deploy when its verify dependency is removed", () => {
    const broken = mutateWorkflow((workflow) => {
      delete workflow.jobs.deploy.needs;
    });
    expect(() => validatePagesWorkflow(broken)).toThrow(/depend directly on verify/);
  });

  it("blocks CI when the Playwright Chromium prerequisite is removed", () => {
    const broken = mutateWorkflow((workflow) => {
      workflow.jobs.verify.steps = workflow.jobs.verify.steps.filter(
        (step) => step.run !== "pnpm exec playwright install --with-deps chromium",
      );
    });
    expect(() => validatePagesWorkflow(broken)).toThrow(/playwright install/);
  });

  it("blocks deploy-side rebuilds", () => {
    const broken = mutateWorkflow((workflow) => {
      workflow.jobs.deploy.steps.unshift({ name: "Rebuild", run: "pnpm run build" });
    });
    expect(() => validatePagesWorkflow(broken)).toThrow(/must contain only deploy-pages/);
  });
});
