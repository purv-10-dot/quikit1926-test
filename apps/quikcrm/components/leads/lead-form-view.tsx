"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LeadOwnerPicker } from "@/components/leads/lead-owner-picker";
import { PhoneField, type PhoneValue } from "@/components/leads/phone-field";
import { LeadFormSettingsLink } from "@/components/leads/lead-form-settings-link";
import { LeadAddressSection, type LeadAddressValues } from "@/components/leads/lead-address-section";
import { LeadFormSection, LeadFormRow } from "@/components/leads/lead-form-section";
import { LeadRequirementFields } from "@/components/leads/lead-requirement-fields";
import { DynamicFieldInput } from "@/components/leads/dynamic-field-input";
import type { LeadFieldDefinition } from "@/types/field-definition";
import { LEAD_TYPE_OPTIONS } from "@/lib/leads/lead-type-config";
import type { LeadFormDraftScope, LeadFormDraftValues } from "@/lib/leads/lead-form-draft";
import type { RequirementDetails } from "@/lib/leads/lead-type-config";

function Field({
  label,
  help,
  action,
  error,
  children,
}: {
  label: string;
  help?: string;
  action?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  // When an `action` (e.g. "+ Add Status" button) is present, the wrapper MUST
  // be a <div> — not a <label>. A <label>'s associated control is its first
  // labelable descendant, and <button> is a labelable element. If the button
  // comes before the <select> in the DOM, every click anywhere on the label
  // block (including on the select itself) causes the browser to forward the
  // click to the button, triggering unintended navigation.
  // Fields without an action keep <label> so clicking the text still focuses
  // the input.
  const Wrapper = action ? "div" : "label";
  return (
    <Wrapper className="block">
      <span className="mb-1 flex items-center justify-between text-sm font-medium text-crm-text">
        <span>{label}</span>
        {action}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-red-600">{error}</span>}
      {!error && help && <span className="mt-1 block text-[11px] text-crm-muted">{help}</span>}
    </Wrapper>
  );
}

export interface LeadFormViewProps {
  /** Wizard step index (0–3). Omit to show all sections (edit mode). */
  step?: number;
  errors: Record<string, string>;
  settingsReturnTo: string | null;
  draftScope?: LeadFormDraftScope;
  isEdit: boolean;
  collectDraft: () => LeadFormDraftValues;
  name: string;
  setName: (v: string) => void;
  ownerId: string;
  setOwnerId: (v: string) => void;
  ownerNameRaw: string;
  setOwnerNameRaw: (v: string) => void;
  ownersLoading: boolean;
  owners: { id: string; name: string; email: string }[];
  status: string;
  setStatus: (v: string) => void;
  visibleStatuses: string[];
  source: string;
  setSource: (v: string) => void;
  sourcesLoading: boolean;
  sources: { id: string; name: string }[];
  /** When true, the Lead Source is fixed (e.g. forced "LinkedIn") and rendered read-only. */
  sourceLocked?: boolean;
  stage: string;
  setStage: (v: string) => void;
  visibleStages: string[];
  score: number;
  setScore: (v: number) => void;
  autoScoreLocked: boolean;
  leadType: string;
  setLeadType: (v: string) => void;
  company: string;
  setCompany: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  industryOptions: readonly string[];
  annualRevenueDisplay: string;
  setAnnualRevenueDisplay: (v: string) => void;
  website: string;
  setWebsite: (v: string) => void;
  linkedinUrl: string;
  setLinkedinUrl: (v: string) => void;
  numberOfEmployees: string;
  setNumberOfEmployees: (v: string) => void;
  rating: string;
  setRating: (v: string) => void;
  addressOpen: boolean;
  setAddressOpen: (v: boolean) => void;
  addressValues: LeadAddressValues;
  onAddressChange: (key: keyof LeadAddressValues, value: string) => void;
  accountQuery: string;
  setAccountQuery: (v: string) => void;
  accountId: string;
  setAccountId: (v: string) => void;
  accountListOpen: boolean;
  setAccountListOpen: (v: boolean) => void;
  accountHits: { id: string; name: string; segment: string }[];
  pickAccount: (hit: { id: string; name: string; segment: string }) => void;
  clearAccount: () => void;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  jobTitle: string;
  setJobTitle: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  secondaryEmail: string;
  setSecondaryEmail: (v: string) => void;
  phone: PhoneValue;
  setPhone: (v: PhoneValue) => void;
  mobile: PhoneValue;
  setMobile: (v: PhoneValue) => void;
  contactLinkedinUrl: string;
  setContactLinkedinUrl: (v: string) => void;
  requirementDetails: RequirementDetails;
  setRequirementField: (key: string, value: unknown) => void;
  defsLoading: boolean;
  additionalFieldDefs: LeadFieldDefinition[];
  dynValues: Record<string, unknown>;
  setDyn: (key: string, value: unknown) => void;
}

export function LeadFormView(props: LeadFormViewProps) {
  const p = props;
  const draftScope = p.draftScope && !p.isEdit ? p.draftScope : undefined;

  const sourceField = (
    <Field
      label="Lead Source *"
      error={p.errors.source}
      action={
        p.sourceLocked ? undefined : (
          <LeadFormSettingsLink
            settingsPath="/settings/sources"
            returnTo={p.settingsReturnTo}
            draftScope={draftScope}
            getDraft={p.collectDraft}
          >
            + Lead sources
          </LeadFormSettingsLink>
        )
      }
    >
      {p.sourceLocked ? (
        // Fixed source (e.g. prospect → lead forces "LinkedIn"). Read-only: the
        // value is set programmatically and submitted with no user input.
        <Select value={p.source} disabled aria-readonly="true">
          <option value={p.source}>{p.source}</option>
        </Select>
      ) : p.sourcesLoading ? (
        <Select value="" disabled>
          <option value="">Loading sources…</option>
        </Select>
      ) : p.sources.length > 0 ? (
        <Select value={p.source} onChange={(e) => p.setSource(e.target.value)} required>
          <option value="">— Select source —</option>
          {p.sources.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </Select>
      ) : (
        <Input value={p.source} onChange={(e) => p.setSource(e.target.value)} required />
      )}
    </Field>
  );

  const leadTypeField = (
    <Field label="Type of Lead *" error={p.errors.leadType}>
      <Select value={p.leadType} onChange={(e) => p.setLeadType(e.target.value)} required>
        <option value="">— Select type —</option>
        {LEAD_TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
    </Field>
  );

  const showAll = p.step === undefined;
  const show = (index: number) => showAll || p.step === index;

  const section1 = (
    <LeadFormSection title="Lead Information" description="Ownership, pipeline, and lead classification.">
        {/* Row 1: Lead Name | Lead Owner */}
        <LeadFormRow>
          <Field label="Lead Name *" error={p.errors.name}>
            <Input value={p.name} onChange={(e) => p.setName(e.target.value)} required />
          </Field>
          <Field label="Lead Owner *" error={p.errors.ownerId}>
            <LeadOwnerPicker
              owners={p.owners}
              ownersLoading={p.ownersLoading}
              value={p.ownerId}
              onChange={p.setOwnerId}
              ownerNameRaw={p.ownerNameRaw}
              onOwnerNameRawChange={p.setOwnerNameRaw}
              error={p.errors.ownerId}
            />
          </Field>
        </LeadFormRow>

        {/* Row 2: Lead Source | Lead Stage */}
        <LeadFormRow>
          {sourceField}
          <Field
            label="Lead Stage *"
            error={p.errors.stage}
            action={
              <LeadFormSettingsLink
                settingsPath="/settings/stages?focus=add-stage"
                returnTo={p.settingsReturnTo}
                draftScope={draftScope}
                getDraft={p.collectDraft}
              >
                + Add Stage
              </LeadFormSettingsLink>
            }
          >
            <Select value={p.stage} onChange={(e) => p.setStage(e.target.value)} required>
              {p.visibleStages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        </LeadFormRow>

        {/* Row 3: Lead Status | Lead Score */}
        <LeadFormRow>
          <Field
            label="Lead Status"
            error={p.errors.status}
            action={
              <LeadFormSettingsLink
                settingsPath={`/settings/stages?focus=statuses${p.stage ? `&stage=${encodeURIComponent(p.stage)}` : ""}`}
                returnTo={p.settingsReturnTo}
                draftScope={draftScope}
                getDraft={p.collectDraft}
              >
                + Add Status
              </LeadFormSettingsLink>
            }
          >
            <Select value={p.status} onChange={(e) => p.setStatus(e.target.value)}>
              {p.visibleStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Lead Score"
            help={
              p.autoScoreLocked
                ? "Calculated automatically from fit, engagement, and scoring rules."
                : undefined
            }
          >
            <Input
              type="number"
              min={0}
              max={100}
              value={p.score}
              readOnly={p.autoScoreLocked}
              disabled={p.autoScoreLocked}
              onChange={(e) => p.setScore(Number(e.target.value))}
              className={p.autoScoreLocked ? "bg-crm-panel text-crm-muted" : undefined}
            />
          </Field>
        </LeadFormRow>

        {/* Row 4: Title | Rating */}
        <LeadFormRow>
          <Field label="Title">
            <Input
              value={p.jobTitle}
              onChange={(e) => p.setJobTitle(e.target.value)}
              placeholder="e.g. CEO, Marketing Manager"
            />
          </Field>
          <Field label="Rating">
            <Select value={p.rating} onChange={(e) => p.setRating(e.target.value)}>
              <option value="">None</option>
              <option value="Acquired">Acquired</option>
              <option value="Active">Active</option>
              <option value="Market Failed">Market Failed</option>
              <option value="Project Cancelled">Project Cancelled</option>
              <option value="Shut Down">Shut Down</option>
            </Select>
          </Field>
        </LeadFormRow>

        {/* Row 5: No. of Employees | Link Account */}
        <LeadFormRow>
          <Field label="No. of Employees">
            <Input
              type="number"
              min={0}
              value={p.numberOfEmployees}
              onChange={(e) => p.setNumberOfEmployees(e.target.value)}
              placeholder="Enter number of employees"
            />
          </Field>
          <Field label="Link Account">
            <div className="relative">
              <Input
                value={p.accountQuery}
                placeholder="Search accounts by name…"
                onChange={(e) => {
                  p.setAccountQuery(e.target.value);
                  if (p.accountId) p.setAccountId("");
                  p.setAccountListOpen(true);
                }}
                onFocus={() => p.setAccountListOpen(true)}
                onBlur={() => setTimeout(() => p.setAccountListOpen(false), 150)}
              />
              {p.accountId && (
                <button
                  type="button"
                  onClick={p.clearAccount}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-crm-muted hover:text-crm-text"
                >
                  Clear
                </button>
              )}
              {p.accountListOpen && p.accountHits.length > 0 && (
                <ul className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded border border-crm-border bg-white text-sm shadow-crm-dropdown">
                  {p.accountHits.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          p.pickAccount(a);
                        }}
                        className="flex w-full px-3 py-2 text-left hover:bg-crm-panel"
                      >
                        {a.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
        </LeadFormRow>
    </LeadFormSection>
  );

  const section2 = (
    <LeadFormSection title="Company Information">
        <LeadFormRow>
          <Field label="Company Name *" error={p.errors.company}>
            <Input value={p.company} onChange={(e) => p.setCompany(e.target.value)} required />
          </Field>
          <Field label="Industry">
            <Select value={p.industry} onChange={(e) => p.setIndustry(e.target.value)}>
              <option value="">— Select industry —</option>
              {p.industryOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
        </LeadFormRow>
        <LeadFormRow>
          <Field label="Annual Revenue">
            <Input
              value={p.annualRevenueDisplay}
              onChange={(e) => p.setAnnualRevenueDisplay(e.target.value)}
              placeholder="e.g. ₹5 Cr, $2M"
            />
          </Field>
          <Field label="Website" error={p.errors.website}>
            <Input
              value={p.website}
              onChange={(e) => p.setWebsite(e.target.value)}
              placeholder="https://company.com"
            />
          </Field>
        </LeadFormRow>
        <LeadFormRow>
          <Field label="LinkedIn Profile" error={p.errors.linkedinUrl}>
            <Input
              value={p.linkedinUrl}
              onChange={(e) => p.setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/company/…"
            />
          </Field>
          <div aria-hidden />
        </LeadFormRow>
        <LeadAddressSection
          open={p.addressOpen}
          onOpenChange={p.setAddressOpen}
          values={p.addressValues}
          onChange={p.onAddressChange}
          errors={{ lat: p.errors.lat, long: p.errors.long }}
        />
    </LeadFormSection>
  );

  const section3 = (
    <LeadFormSection title="Contact Information">
        <LeadFormRow>
          <Field label="First Name" error={p.errors.firstName}>
            <Input value={p.firstName} onChange={(e) => p.setFirstName(e.target.value)} />
          </Field>
          <Field label="Last Name" error={p.errors.lastName}>
            <Input value={p.lastName} onChange={(e) => p.setLastName(e.target.value)} />
          </Field>
        </LeadFormRow>
        <LeadFormRow>
          <Field label="Email" error={p.errors.email}>
            <Input type="email" value={p.email} onChange={(e) => p.setEmail(e.target.value)} />
          </Field>
          <Field label="Secondary Email" error={p.errors.secondaryEmail}>
            <Input type="email" value={p.secondaryEmail} onChange={(e) => p.setSecondaryEmail(e.target.value)} />
          </Field>
        </LeadFormRow>
        <LeadFormRow>
          <Field label="Phone" error={p.errors.phone}>
            <PhoneField value={p.phone} onChange={p.setPhone} invalid={!!p.errors.phone} ariaLabel="Phone" />
          </Field>
          <Field label="Mobile" error={p.errors.mobile}>
            <PhoneField value={p.mobile} onChange={p.setMobile} invalid={!!p.errors.mobile} ariaLabel="Mobile" />
          </Field>
        </LeadFormRow>
        <LeadFormRow>
          <Field label="LinkedIn Account" error={p.errors.contactLinkedinUrl}>
            <Input
              value={p.contactLinkedinUrl}
              onChange={(e) => p.setContactLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/…"
            />
          </Field>
        </LeadFormRow>
    </LeadFormSection>
  );


  // "Other Information" — shown as step 3 in wizard mode (only when custom fields
  // exist) and always shown in edit mode (showAll). This keeps the layout clean:
  // custom fields have their own dedicated section rather than being embedded in
  // Company Information.
  const section4 =
    p.defsLoading || p.additionalFieldDefs.length > 0 ? (
      <LeadFormSection
        title="Other Information"
        description="Additional details configured for your organisation."
      >
        {p.defsLoading ? (
          <div className="h-9 animate-pulse rounded bg-crm-panel" aria-busy="true" />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {p.additionalFieldDefs.map((def) => (
              <Field
                key={def.key}
                label={`${def.label}${def.requirement === "Required" ? " *" : ""}`}
                error={p.errors[def.key]}
              >
                <DynamicFieldInput
                  def={def}
                  value={p.dynValues[def.key]}
                  onChange={(v) => p.setDyn(def.key, v)}
                />
              </Field>
            ))}
          </div>
        )}
      </LeadFormSection>
    ) : null;

  return (
    <div className="space-y-6">
      {show(0) && section1}
      {show(1) && section2}
      {show(2) && section3}
      {/* Step 3 — "Other Information". In wizard mode only renders when the
          parent computed hasCustomFields=true and advanced the step count.
          In edit mode (showAll) it always renders when custom fields exist. */}
      {show(3) && section4}
    </div>
  );
}
