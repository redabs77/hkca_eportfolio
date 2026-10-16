/**
 * Surfaces and the roles that may enter them. Roles mirror the README vocabulary
 * (trainee, sot, assistant_sot, trainer, admin, boe_officer).
 *
 * TODO(auth): enforcement is NOT implemented. Wire HKAM OIDC (AI Development and Architectural
 * Strategy §3B) and replace `canEnter` with a server-side session check in each surface layout.
 */
export type Role = "trainee" | "sot" | "assistant_sot" | "trainer" | "admin" | "boe_officer";
export type Surface = "sot" | "trainee" | "trainer" | "admin";

export interface SurfaceDef {
  id: Surface;
  label: string;
  home: string;
  blurb: string;
  roles: readonly Role[];
}

export const SURFACES: readonly SurfaceDef[] = [
  { id: "sot", label: "Supervisor of Training", home: "/sot", blurb: "Roster triage, ITA synthesis, logbook verification, progression risk.", roles: ["sot", "assistant_sot", "boe_officer"] },
  { id: "trainee", label: "Trainee", home: "/trainee", blurb: "Progress against stage gates, assessments, logbook.", roles: ["trainee"] },
  { id: "trainer", label: "Trainer", home: "/trainer/ita", blurb: "Complete the 15-item ITA for the trainees you supervised.", roles: ["trainer", "sot", "assistant_sot"] },
  { id: "admin", label: "College Secretariat", home: "/admin/ingestion", blurb: "Bulk CSV ingestion, exit dossiers, document verification.", roles: ["admin", "boe_officer"] },
] as const;

export function canEnter(role: Role, surface: Surface): boolean {
  return SURFACES.find((s) => s.id === surface)?.roles.includes(role) ?? false;
}
