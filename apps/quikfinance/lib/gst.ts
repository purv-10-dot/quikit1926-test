/** GST is an India-only feature. Normalise common country representations. */
export function isIndia(country: string | null | undefined): boolean {
  const c = (country ?? "").trim().toLowerCase();
  return c === "in" || c === "ind" || c === "india";
}

export const GST_REGISTRATION_TYPES = [
  { value: "registered_regular", label: "Registered Business - Regular", hint: "Business that is registered under GST." },
  { value: "registered_composition", label: "Registered Business - Composition", hint: "Registered under the composition scheme in GST." },
  { value: "isd", label: "Input Service Distributor (ISD)", hint: "Distributes input tax credit (ITC) to its locations." }
] as const;
