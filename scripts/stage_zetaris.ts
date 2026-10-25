// Copies the four RecallGuard CSVs into the Zetaris Freemium file store so
// they can be registered as tables in the `recallguard` Lightning database.
// Run: npm run zetaris:stage -- [path-to-zetaris-freemium] [org-folder]
import fs from "node:fs";
import path from "node:path";
import { TABLES } from "../src/data/dataLayer.ts";

const freemium = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "..", "zetaris-freemium"));
const store = path.join(freemium, "customer_data");
const org = process.argv[3] ?? fs.readdirSync(store).find((d) => fs.existsSync(path.join(store, d, "file-store")));
if (!org) throw new Error(`No <org>/file-store folder found under ${store}`);

const dest = path.join(store, org, "file-store", "recallguard");
fs.mkdirSync(dest, { recursive: true });
for (const t of TABLES) {
  fs.copyFileSync(path.join(import.meta.dirname, "..", "data", "sample", `${t}.csv`), path.join(dest, `${t}.csv`));
  console.log(`staged ${t}.csv -> ${dest}`);
}
console.log(`\nInside the zetaris-server container these are at /home/zetaris/data/${org}/file-store/recallguard/`);
console.log("Next: register each CSV as a file-store table in Lightning database 'recallguard' (see docs/ZETARIS_SETUP.md).");
