/**
 * Labour / trade types used on Labour-only work orders.
 * Mirrors the DPR manpower trade grid so site reporting stays consistent.
 */
export const LABOUR_TYPE_OPTIONS = [
  { value: "messan", label: "Messan" },
  { value: "maleHelper", label: "Male Helper" },
  { value: "femaleHelper", label: "Female Helper" },
  { value: "carpenter", label: "Carpenter" },
  { value: "fitter", label: "Fitter" },
  { value: "painter", label: "Painter" },
  { value: "plumber", label: "Plumber" },
  { value: "electrician", label: "Electrician" },
  { value: "operator", label: "Operator" },
] as const;

export type LabourTypeValue = (typeof LABOUR_TYPE_OPTIONS)[number]["value"];
