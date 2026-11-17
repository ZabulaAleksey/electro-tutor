import type { Page } from "@playwright/test";
import { DEFAULT_NETWORK } from "../../../src/transient/network";

export async function useOpenLineDraft(page: Page) {
  await page.addInitScript((model) => {
    if (/^https?:$/.test(location.protocol) &&
        !localStorage.getItem("electrotutor-line-draft-v5")) {
      localStorage.setItem("electrotutor-line-draft-v5", JSON.stringify({ model }));
    }
  }, DEFAULT_NETWORK);
}
