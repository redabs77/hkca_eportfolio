import type { Stage } from "@/lib/curriculum";

/** ITA lifecycle as persisted by the Prisma enum (note: differs from domain ItaStatus names). */
export type ItaDbStatus =
  | "SOT_SYNTHESIS"
  | "AWAITING_TRAINEE_SIGNATURE"
  | "CONTESTED"
  | "PENDING_BOE_REVIEW"
  | string;

export interface TraineeRow {
  id: string;
  name: string;
  hkcaNumber: string;
  stage: Stage;
  hospital: string;
  accreditedMonths: number;
  vopCases: number;
  wbaCount: number;
  itaStatus: ItaDbStatus | null;
  itaContested: boolean;
  lifetimeUnsatIta: number;
  /** Blocking reasons for the *next* gate, produced by the domain engine. */
  nextGateBlockers: string[];
  nextGateLabel: string;
}

/**
 * Data-access boundary. The skeleton ships a seed-backed implementation; the Prisma/Postgres one
 * replaces it behind the same interface so no page changes.
 */
export interface PortfolioRepository {
  listTrainees(): Promise<TraineeRow[]>;
}
