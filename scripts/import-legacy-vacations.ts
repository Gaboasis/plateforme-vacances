/**
 * Import ponctuel de congés déjà approuvés hors plateforme (sans validation : périodes
 * éventuellement hors normes historiques). Ensuite, ils comptent comme tout congé accepté
 * pour les nouvelles demandes. Repère d’affichage « Avant plateforme ».
 *
 * Usage :
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/import-legacy-vacations.ts chemin/vers/donnees.json
 *
 * Format JSON (tableau) :
 * [
 *   {
 *     "educatorId": "1",
 *     "educatorName": "Rana",
 *     "startDate": "2026-07-01",
 *     "endDate": "2026-07-20",
 *     "reason": "optionnel",
 *     "createdAt": "2026-01-10T12:00:00.000Z",
 *     "reviewedAt": "2026-01-12T12:00:00.000Z"
 *   }
 * ]
 */

import * as fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Row = {
  educatorId: string;
  educatorName: string;
  startDate: string;
  endDate: string;
  reason?: string;
  createdAt?: string;
  reviewedAt?: string;
};

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error(
      "Indiquez le fichier JSON : scripts/import-legacy-vacations.ts <fichier.json>"
    );
    process.exit(1);
  }
  const raw = fs.readFileSync(path, "utf8");
  const rows = JSON.parse(raw) as Row[];
  if (!Array.isArray(rows)) {
    console.error("Le fichier doit contenir un tableau JSON.");
    process.exit(1);
  }

  for (const row of rows) {
    if (
      !row.educatorId ||
      !row.educatorName ||
      !row.startDate ||
      !row.endDate
    ) {
      console.error("Ligne invalide (champs requis):", row);
      process.exit(1);
    }
    const back = row.createdAt ?? row.reviewedAt ?? row.startDate;
    await prisma.vacationRequest.create({
      data: {
        educatorId: row.educatorId,
        educatorName: row.educatorName,
        startDate: new Date(row.startDate),
        endDate: new Date(row.endDate),
        reason: row.reason ?? "Congé approuvé avant la plateforme",
        status: "accepted",
        legacyImport: true,
        createdAt: new Date(back),
        reviewedAt: new Date(row.reviewedAt ?? back),
      },
    });
  }

  console.log(`Importé ${rows.length} congé(s) historique(s) (legacyImport).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
