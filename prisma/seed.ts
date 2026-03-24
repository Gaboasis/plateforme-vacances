import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const educators = [
  { id: "1", name: "Rana", email: "rana@garderie.fr", role: "educatrice" as const, seniorityRank: 1, isQualified: true },
  { id: "2", name: "Rafika", email: "rafika@garderie.fr", role: "educatrice" as const, seniorityRank: 2, isQualified: true },
  { id: "3", name: "Saliha", email: "saliha@garderie.fr", role: "educatrice" as const, seniorityRank: 3, isQualified: true },
  { id: "4", name: "Hanady", email: "hanady@garderie.fr", role: "educatrice" as const, seniorityRank: 4, isQualified: true },
  { id: "5", name: "Souhir", email: "souhir@garderie.fr", role: "educatrice" as const, seniorityRank: 5, isQualified: false },
  { id: "6", name: "Hajar", email: "hajar@garderie.fr", role: "educatrice" as const, seniorityRank: 6, isQualified: false },
  { id: "7", name: "Khira", email: "khira@garderie.fr", role: "educatrice" as const, seniorityRank: 7, isQualified: true },
  { id: "8", name: "Azza", email: "azza@garderie.fr", role: "educatrice" as const, seniorityRank: 8, isQualified: false },
  { id: "9", name: "Loubaba", email: "loubaba@garderie.fr", role: "educatrice" as const, seniorityRank: 9, isQualified: true },
  { id: "10", name: "Karima", email: "karima@garderie.fr", role: "educatrice" as const, seniorityRank: 10, isQualified: true },
  { id: "11", name: "Manal", email: "manal@garderie.fr", role: "educatrice" as const, seniorityRank: 11, isQualified: false },
  { id: "12", name: "Fatima", email: "fatima@garderie.fr", role: "educatrice" as const, seniorityRank: 12, isQualified: false },
  { id: "amineh", name: "Amineh", email: "amineh@garderie.fr", role: "cuisiniere" as const },
  { id: "zooka", name: "Zooka", email: "zooka@garderie.fr", role: "entretien" as const },
  { id: "kamar", name: "Kamar", email: "kamar@garderie.fr", role: "secretaire" as const },
  { id: "admin", name: "Admin", email: "admin@garderie.fr", role: "admin" as const },
];

const getPassword = (index: number): string => {
  if (educators[index].id === "admin") return "gabvac2026";
  return `garderie${101 + index * 3}`;
};

const defaultRules = {
  maxConcurrentVacations: 2,
  minAdvanceNoticeDays: 14,
  maxConsecutiveDays: 15,
  blackoutDates: [],
  maxRequestsPerMonth: 2,
  maxRequestsPerYear: 2,
  minQualifiedPresent: 1,
  minNonQualifiedPresent: 0,
  seniorityPriorityEnabled: true,
  biWeekRules: Array(52).fill(null),
};

async function main() {
  for (let i = 0; i < educators.length; i++) {
    const edu = educators[i];
    const existing = await prisma.educator.findUnique({
      where: { id: edu.id },
    });
    if (existing) {
      // Ne jamais modifier : préserve les conditions (ancienneté, qualifié, mot de passe)
      // déjà configurées par l'admin
      continue;
    }
    const password = getPassword(i);
    const passwordHash = bcrypt.hashSync(password, 10);
    await prisma.educator.create({
      data: {
        id: edu.id,
        name: edu.name,
        email: edu.email,
        role: edu.role,
        seniorityRank: "seniorityRank" in edu ? edu.seniorityRank : undefined,
        isQualified: "isQualified" in edu ? edu.isQualified : undefined,
        passwordHash,
      },
    });
  }

  // Règles : créer UNIQUEMENT si aucune n'existe.
  // Ne JAMAIS modifier les conditions déjà sauvegardées par l'admin.
  const existingRules = await prisma.vacationRulesConfig.findFirst();
  if (!existingRules) {
    await prisma.vacationRulesConfig.create({
      data: { rules: JSON.stringify(defaultRules) },
    });
    console.log("Règles par défaut créées (première fois)");
  } else {
    console.log("Règles existantes conservées (non modifiées)");
  }

  console.log("Seed terminé ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
