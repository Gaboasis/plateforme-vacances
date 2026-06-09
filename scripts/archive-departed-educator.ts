/**
 * Archive le compte d’un·e employé·e parti·e : transfère congés, maladie, échanges
 * et traces vers le compte admin (noms d’origine conservés), puis supprime le profil.
 *
 * Usage (simulation) :
 *   npm run archive-educator -- --from=6 --dry-run
 *
 * Usage (Hajar → admin) :
 *   npm run archive-educator -- --from=6
 */

import { archiveDepartedEducator } from "../src/lib/archive-departed-educator";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : undefined;
}

async function main() {
  const from = readArg("from") ?? "6";
  const to = readArg("to") ?? "admin";
  const dryRun = process.argv.includes("--dry-run");

  const summary = await archiveDepartedEducator({
    fromEducatorId: from,
    archiveToEducatorId: to,
    dryRun,
  });

  console.log(
    dryRun
      ? "Simulation (aucune modification en base) :"
      : "Archivage terminé :"
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
