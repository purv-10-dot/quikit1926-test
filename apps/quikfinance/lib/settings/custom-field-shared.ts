import { z } from "zod";

export const DATA_TYPES = ["text", "multiline", "number", "amount", "percent", "date", "email", "phone", "url", "checkbox", "dropdown"] as const;
export type CustomFieldDataType = (typeof DATA_TYPES)[number];

export const DATA_TYPE_LABELS: Record<CustomFieldDataType, string> = {
  text: "Text",
  multiline: "Multi-line Text",
  number: "Number",
  amount: "Amount",
  percent: "Percent",
  date: "Date",
  email: "Email",
  phone: "Phone",
  url: "URL",
  checkbox: "Checkbox",
  dropdown: "Dropdown"
};

export const customFieldSchema = z.object({
  label: z.string().trim().min(1).max(80),
  data_type: z.enum(DATA_TYPES),
  is_mandatory: z.boolean().default(false),
  show_in_portal: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  entity: z.enum(["contacts"]).default("contacts")
});

export type CustomFieldInput = z.infer<typeof customFieldSchema>;

export const slugifyField = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "field";
