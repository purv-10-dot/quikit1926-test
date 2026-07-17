/**
 * Constants and row factories for the DPR form.
 *
 * Extracted verbatim from DPRForm.tsx as part of the god-file decomposition.
 */

import type {
  WorkItem,
  MaterialRow,
  ManpowerRow,
  StaffRow,
  MachineryRow,
} from "./types";

/** The fixed trade columns rendered in the manpower grid, in order. */
export const MANPOWER_TRADES = [
  { key: "messan", label: "Messan" },
  { key: "maleHelper", label: "Male H." },
  { key: "femaleHelper", label: "Female H." },
  { key: "carpenter", label: "Carp." },
  { key: "fitter", label: "Fitter" },
  { key: "painter", label: "Painter" },
  { key: "plumber", label: "Plumber" },
  { key: "electrician", label: "Elec." },
  { key: "operator", label: "Operator" },
] as const;

export const newWorkItem = (): WorkItem => ({
  boqItemId: "",
  boqNo: "",
  description: "",
  unit: "",
  totalTarget: 0,
  prevQty: 0,
  balanceQty: 0,
  contractorWO: "",
  todayQty: "",
  location: "",
  remarks: "",
  images: [],
  imageKeys: [],
});

export const newMaterial = (): MaterialRow => ({
  itemId: "",
  consumedQty: "0",
  remarks: "",
});

export const newManpower = (): ManpowerRow => ({
  contractorId: "",
  workingArea: "",
  messan: "0",
  maleHelper: "0",
  femaleHelper: "0",
  carpenter: "0",
  fitter: "0",
  painter: "0",
  plumber: "0",
  electrician: "0",
  operator: "0",
});

export const newStaff = (): StaffRow => ({
  name: "",
  designation: "",
  present: true,
  reason: "",
});

export const newMachinery = (): MachineryRow => ({
  description: "",
  condition: "Running",
  requiredQty: "1",
  actualQty: "1",
  remarks: "",
});