import { config as loadDotenv } from "dotenv";
loadDotenv();

import { runAudit, formatReport } from "./security/audit.js";

async function main() {
  const report = await runAudit();
  process.stdout.write(formatReport(report));
  process.exit(report.summary.fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(2);
});
