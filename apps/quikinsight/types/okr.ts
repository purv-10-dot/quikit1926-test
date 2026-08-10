export interface KeyResult {
  label: string;
  pct: number; // 0-100
}

export interface Objective {
  objective: string;
  keyResults: KeyResult[];
}

export interface MemberOkrs {
  memberId: string;
  name: string;
  role: string;
  initials: string;
  color: string;
  okrs: Objective[];
}
