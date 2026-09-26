import { afterEach, describe, expect, it } from "vitest";
import { main } from "./backend.mjs";

const originalContainer = process.env.BACKEND_CLONE_CONTAINER;
const originalPort = process.env.ET_TEST_POSTGRES_PORT;

afterEach(() => {
  if (originalContainer === undefined) delete process.env.BACKEND_CLONE_CONTAINER;
  else process.env.BACKEND_CLONE_CONTAINER = originalContainer;
  if (originalPort === undefined) delete process.env.ET_TEST_POSTGRES_PORT;
  else process.env.ET_TEST_POSTGRES_PORT = originalPort;
});

describe("ET-10.3 isolated backend check", () => {
  it("refuses the preserved Compose target before starting services", async () => {
    process.env.BACKEND_CLONE_CONTAINER = "electro-tutor-local-postgres-1";
    process.env.ET_TEST_POSTGRES_PORT = "55432";
    await expect(main("check", "clone")).rejects.toThrow(/disposable clone/);
  });

  it("refuses a named clone on the original or MathMorph port", async () => {
    process.env.BACKEND_CLONE_CONTAINER = "electro-tutor-et103-test-20260926";
    process.env.ET_TEST_POSTGRES_PORT = "55432";
    await expect(main("check", "clone")).rejects.toThrow(/non-55432 test port/);
  });
});
