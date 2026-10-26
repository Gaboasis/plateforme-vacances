import { prisma } from "./db";
import { DEFAULT_EMPLOYER_CONTRIBUTION_PERCENT } from "./default-hourly-rates";

/** Employé·es sans connexion — paie journalière et import PDF présences seulement. */
const PAYROLL_ONLY: {
  id: string;
  name: string;
  email: string;
  role: "secretaire" | "educatrice" | "cuisiniere" | "entretien";
  hourlyRateCents: number;
}[] = [
  {
    id: "ilhem",
    name: "Ilhem",
    email: "ilhem.fathallah@garderie.fr",
    role: "secretaire",
    hourlyRateCents: 2300,
  },
];

export async function ensurePayrollOnlyEducators(): Promise<void> {
  for (const edu of PAYROLL_ONLY) {
    await prisma.educator.upsert({
      where: { id: edu.id },
      create: {
        id: edu.id,
        name: edu.name,
        email: edu.email,
        role: edu.role,
        hourlyRateCents: edu.hourlyRateCents,
        employerContributionPercent: DEFAULT_EMPLOYER_CONTRIBUTION_PERCENT,
        vacationIndemnityPercent: 4,
        passwordHash: null,
      },
      update: {
        name: edu.name,
        email: edu.email,
        role: edu.role,
        hourlyRateCents: edu.hourlyRateCents,
      },
    });
  }
}
