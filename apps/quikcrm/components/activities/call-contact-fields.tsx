"use client";

/**
 * Call-specific Contact Name + Phone Number inputs, shown at the TOP of the
 * "Call fields" section when the selected activity type is a Call.
 *
 * These two fields are real activity custom-fields (`contact_name` and
 * `phone_number`, both Text — see activity-types-defaults.ts). They are NOT
 * rendered by the generic ActivityFieldInputs (the form filters those two keys
 * out and mounts this instead), so their VALUES still flow through the exact
 * same fieldValues map → POST /api/activities → writeActivityFieldValues
 * pipeline. No new write path, no schema change.
 *
 * Behaviour:
 *   - Contact Name is a searchable dropdown of people related to the linked
 *     record (GET /api/activities/call-contacts). Picking one auto-fills Phone
 *     Number; Phone stays editable afterwards.
 *   - When no related contacts exist (or the activity is standalone), Contact
 *     Name falls back to a plain text input so manual entry always works.
 *   - Phone Number is a free-text input (international numbers supported); the
 *     Phone *field type* is unsupported for activities, so Text is intentional.
 */

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/activities/log-activity/searchable-select";

export interface CallContactItem {
  id: string;
  name: string;
  phone: string | null;
}

interface Props {
  /** The record kind the activity is linked to (Lead/Contact/Account/Opportunity/None). */
  relatedKind: string;
  /** The linked record id, if any. */
  relatedObjectId: string;
  /** Current Contact Name value. */
  contactName: string;
  /** Current Phone Number value. */
  phoneNumber: string;
  onContactNameChange: (v: string) => void;
  onPhoneNumberChange: (v: string) => void;
}

export function CallContactFields({
  relatedKind,
  relatedObjectId,
  contactName,
  phoneNumber,
  onContactNameChange,
  onPhoneNumberChange,
}: Props) {
  const [items, setItems] = useState<CallContactItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  // Fetch the related people whenever the linked record changes. A standalone
  // activity (no kind/id) resolves to an empty list → manual entry only.
  useEffect(() => {
    if (!relatedKind || relatedKind === "None" || !relatedObjectId) {
      setItems([]);
      setSelectedId("");
      return;
    }
    let ignore = false;
    setLoading(true);
    const params = new URLSearchParams({ relatedKind, relatedObjectId });
    void fetch(`/api/activities/call-contacts?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (ignore) return;
        const next: CallContactItem[] = Array.isArray(body?.data?.items) ? body.data.items : [];
        setItems(next);
      })
      .catch(() => {
        if (!ignore) setItems([]);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [relatedKind, relatedObjectId]);

  const options = useMemo(() => items.map((it) => ({ id: it.id, label: it.name })), [items]);

  // Offer the searchable picker only when there is at least one related person;
  // otherwise a plain text input guarantees manual entry always works.
  const usePicker = options.length > 0;

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-crm-text">Contact Name</span>
        {usePicker ? (
          <>
            <SearchableSelect
              label=""
              placeholder={loading ? "Loading…" : "Search related contacts…"}
              value={selectedId}
              loading={loading}
              options={options}
              onChange={(id, opt) => {
                setSelectedId(id);
                if (opt) {
                  onContactNameChange(opt.label);
                  const match = items.find((it) => it.id === id);
                  // Auto-fill phone from the picked contact; leave it editable.
                  if (match?.phone) onPhoneNumberChange(match.phone);
                }
              }}
            />
            {/* Manual override — lets the user type a name not in the list. */}
            <Input
              className="mt-2"
              value={contactName}
              onChange={(e) => {
                onContactNameChange(e.target.value);
                setSelectedId("");
              }}
              placeholder="…or type a name"
            />
          </>
        ) : (
          <Input
            value={contactName}
            onChange={(e) => onContactNameChange(e.target.value)}
            placeholder="Person called"
          />
        )}
        <span className="mt-1 block text-[11px] text-crm-muted">Person called.</span>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-crm-text">Phone Number</span>
        <Input
          type="tel"
          value={phoneNumber}
          onChange={(e) => onPhoneNumberChange(e.target.value)}
          placeholder="+1 555 010 1234"
        />
        <span className="mt-1 block text-[11px] text-crm-muted">
          Auto-filled from the selected contact; editable. Supports international numbers.
        </span>
      </label>
    </div>
  );
}
