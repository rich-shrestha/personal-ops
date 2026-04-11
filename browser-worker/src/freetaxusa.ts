import { chromium } from "playwright";
import { config } from "./config.js";
import { TaxWorkflowPayload } from "./types.js";

export async function runFreeTaxUsaSession(payload: TaxWorkflowPayload) {
  const browser = await chromium.launch({ headless: config.playwrightHeadless });
  const page = await browser.newPage();

  try {
    await page.goto("https://www.freetaxusa.com/", { waitUntil: "domcontentloaded" });

    return {
      log: [
        "Opened FreeTaxUSA home page.",
        `Prepared to follow ${payload.browserHandoffPlan.length} stored browser handoff steps.`,
        "Execution is still scaffolded: no login, data entry, or submission was attempted.",
      ],
      completed: false,
    };
  } finally {
    await browser.close();
  }
}
