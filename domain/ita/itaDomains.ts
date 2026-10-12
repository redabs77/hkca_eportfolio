/**
 * HKCA NextGen ePortfolio — Domain Logic: official ITA feedback items.
 *
 * Source of truth: HKCA "In Training Assessment" form (Training-ITA-form.doc), 15 feedback items in two
 * groups, each with an explanatory note (behavioural anchor). Item wording is the College's — do not
 * paraphrase in UI copy. Anchors are shown to trainers while rating.
 *
 * Rating scale (relative to the trainee's level of experience):
 *   X = unable to assess · 1 = consistently exceeds expectation · 2 = occasionally exceeds expectation
 *   3 = usually meets expectation · 4 = unsatisfactory
 */

export type ItaGrade = 1 | 2 | 3 | 4 | "X";
export type ItaDomainGroup = "CLINICAL_PERFORMANCE" | "COMMUNICATION_TEAMWORK_INTERPERSONAL";

export interface ItaDomain {
  code: string; // stable key stored in domainRatingsJson
  no: number; // printed item number on the form (1–15)
  group: ItaDomainGroup;
  label: string;
  anchor: string;
}

export const ITA_GRADE_LABELS: Record<string, string> = {
  X: "Unable to assess",
  "1": "Consistently exceeds expectation",
  "2": "Occasionally exceeds expectation",
  "3": "Usually meets expectation",
  "4": "Unsatisfactory",
};

export const ITA_DOMAINS: readonly ItaDomain[] = [
  {
    code: "PATIENT_ASSESSMENT", no: 1, group: "CLINICAL_PERFORMANCE", label: "Patient assessment",
    anchor: "Able to gather clinical information from the patient (history taking, examination +/- investigations) or significant others, colleagues, medical records, etc., considering the nature and urgency of the intervention. Able to suggest appropriate investigation or means of further assessment if needed.",
  },
  {
    code: "CLINICAL_MANAGEMENT", no: 2, group: "CLINICAL_PERFORMANCE", label: "Clinical management",
    anchor: "Able to formulate and execute management plans, including anticipation of potential problems; resource planning (equipment and manpower), workplace organization, post-operative management.",
  },
  {
    code: "TECHNICAL_SKILLS", no: 3, group: "CLINICAL_PERFORMANCE", label: "Technical skills",
    anchor: "Able to perform clinical procedures efficiently, with working knowledge on equipment and anatomy, attention to patient safety and risk, procedural and situational awareness throughout the procedure.",
  },
  {
    code: "KNOWLEDGE_LEARNING", no: 4, group: "CLINICAL_PERFORMANCE", label: "Knowledge, ability to apply knowledge, and initiative to learn",
    anchor: "Adequate understanding of basic and clinical sciences appropriate to the level of training. Ability to apply the knowledge in clinical practice. Able to develop learning strategy for oneself, and takes an active interest in self-learning.",
  },
  {
    code: "TIME_MANAGEMENT", no: 5, group: "CLINICAL_PERFORMANCE", label: "Time management and prioritization",
    anchor: "Attend patients timely, efficiently runs theatre lists, allocates and prioritizes cases effectively, prioritizes tasks to match the workload and patient needs, multi-task when necessary.",
  },
  {
    code: "CRISIS_MANAGEMENT", no: 6, group: "CLINICAL_PERFORMANCE", label: "Crisis management",
    anchor: "Able to keep calm and function effectively in adverse and complex situations, effective utilization of internal (attention) and external resources.",
  },
  {
    code: "LEADERSHIP", no: 7, group: "CLINICAL_PERFORMANCE", label: "Leadership",
    anchor: "Able to form a team, align values and priorities, and provide directions when necessary.",
  },
  {
    code: "VIGILANCE", no: 8, group: "CLINICAL_PERFORMANCE", label: "Vigilance",
    anchor: "Situational awareness, being attentive to both patient's and the workplace condition, and be prepared for potential or un-expected changes and risks.",
  },
  {
    code: "INSIGHTFULNESS", no: 9, group: "CLINICAL_PERFORMANCE", label: "Insightfulness",
    anchor: "Recognizes his / her limits in expertise and experience, seeks advice from appropriate staff when required.",
  },
  {
    code: "COMM_PATIENTS", no: 10, group: "COMMUNICATION_TEAMWORK_INTERPERSONAL", label: "Communication with patients +/- relatives",
    anchor: "Present patients +/- relatives of the nature, risks and benefits of the peri-operative care in a language they can understand. Provides written information to facilitate understanding if needed. Active listening, encourages discussion and questions.",
  },
  {
    code: "COMM_COLLEAGUES", no: 11, group: "COMMUNICATION_TEAMWORK_INTERPERSONAL", label: "Communication with colleagues",
    anchor: "Synthesizes and communicates relevant information, conveys management plan to colleagues in all formats. Keeps clear, accurate, legible written or electronic records. Active listening. Demonstrates a respectful attitude to colleagues.",
  },
  {
    code: "INTEGRITY", no: 12, group: "COMMUNICATION_TEAMWORK_INTERPERSONAL", label: "Integrity",
    anchor: "Honest, answerable to one's decisions.",
  },
  {
    code: "TEAMWORK", no: 13, group: "COMMUNICATION_TEAMWORK_INTERPERSONAL", label: "Teamwork",
    anchor: "Participates in team approach for patient care, safely hands over patient care to others, works with others to prevent and resolve conflicts.",
  },
  {
    code: "RESPECTS_PATIENT_RIGHTS", no: 14, group: "COMMUNICATION_TEAMWORK_INTERPERSONAL", label: "Respects patient's right",
    anchor: "Respect patient confidentiality and privacy, ensure patient's right for access to information, fair treatment and autonomy over medical decisions.",
  },
  {
    code: "PROFESSIONAL_BEHAVIOUR", no: 15, group: "COMMUNICATION_TEAMWORK_INTERPERSONAL", label: "Professional behaviour",
    anchor: "Be fair and non-discriminative to patients and colleagues. Polite. Punctual. Maintains contact and be readily available at work.",
  },
] as const;

/** College compulsory courses recorded in the SOT-only section of the form. */
export const ITA_COMPULSORY_COURSES = ["EASE", "ADAM-A", "EMAC", "ECHO-A", "USRA-E"] as const;

/** "Overall assessment is unsatisfactory if, but not limited to, >= 4 of the 15 items are unsatisfactory." */
export const ITA_UNSATISFACTORY_ITEM_THRESHOLD = 4;
