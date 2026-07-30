"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { LeadForm } from "@/components/leads/lead-form";
import { RelativeTime } from "@/components/shared/relative-time";
import { useToast } from "@/hooks/use-toast";
import { Table, THead, TBody, TR, TH, TD, TableScroll } from "@/components/ui/table";

/** One prospect row as sent from the server page. */
export interface ProspectRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  linkedinUrl: string | null;
  shortSummary: string | null;
  savedByName: string | null;
  status: string;
  convertedLeadId: string | null;
  createdAt: string; // ISO
}

export function ProspectsTable({
  prospects,
  defaultOwnerId,
  defaultOwnerName,
}: {
  prospects: ProspectRow[];
  defaultOwnerId: string;
  defaultOwnerName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  const selected = useMemo(
    () => prospects.find((p) => p.id === selectedId) ?? null,
    [prospects, selectedId],
  );
  const isConverted = (p: ProspectRow) => p.status === "Converted";

  // Pre-fill the lead form from the selected prospect. Name → name + a best-effort
  // first/last split (the lead form requires both); title → jobTitle; email; phone;
  // company; linkedinUrl. The rest is filled in manually by the user.
  const leadInitial = useMemo(() => {
    if (!selected) return undefined;
    const parts = selected.name.trim().split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
    return {
      name: selected.name,
      firstName,
      lastName,
      email: selected.email ?? "",
      jobTitle: selected.title ?? "",
      company: selected.company ?? "",
      phone: selected.phone ?? "",
      linkedinUrl: selected.linkedinUrl ?? "",
    };
  }, [selected]);

  function openConvert() {
    if (!selected || isConverted(selected)) return;
    setConvertOpen(true);
  }

  async function handleLeadSaved(lead: { id: string }) {
    // The lead is already created by LeadForm; now flip the prospect to Converted.
    if (!selected) return;
    try {
      const res = await fetch(`/api/settings/prospects/${selected.id}/convert`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "Failed to mark prospect converted");
      }
      toast.success("Prospect converted to lead");
    } catch (err) {
      // The lead exists even if linking failed — tell the user so they don't retry blindly.
      toast.error(
        err instanceof Error
          ? `Lead created, but: ${err.message}`
          : "Lead created, but marking the prospect converted failed",
      );
    } finally {
      setConvertOpen(false);
      setSelectedId(null);
      router.refresh();
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <Button
          type="button"
          onClick={openConvert}
          disabled={!selected || (selected && isConverted(selected)) || false}
        >
          <UserPlus size={15} aria-hidden />
          Convert to Lead
        </Button>
      </div>

      <div className="crm-card overflow-hidden">
        <TableScroll minWidth={980}>
          <Table>
            <THead>
              <TR>
                <TH className="w-10" aria-label="Select" />
                <TH>Name</TH>
                <TH hideBelow="md">Title</TH>
                <TH hideBelow="lg">Company</TH>
                <TH hideBelow="md">Email</TH>
                <TH>Status</TH>
                <TH>LinkedIn</TH>
                <TH hideBelow="lg">Saved By</TH>
                <TH>Saved</TH>
              </TR>
            </THead>
            <TBody>
              {prospects.length === 0 ? (
                <TR>
                  <TD colSpan={9} className="py-10 text-center text-crm-muted">
                    No prospects yet. Save a LinkedIn profile from the extension to
                    see it here.
                  </TD>
                </TR>
              ) : (
                prospects.map((p) => {
                  const converted = isConverted(p);
                  return (
                    <TR
                      key={p.id}
                      className={selectedId === p.id ? "bg-crm-blue-soft/40" : undefined}
                    >
                      <TD className="text-center">
                        <input
                          type="radio"
                          name="prospect-select"
                          className="h-4 w-4 accent-crm-blue disabled:opacity-40"
                          checked={selectedId === p.id}
                          disabled={converted}
                          onChange={() => setSelectedId(p.id)}
                          aria-label={`Select ${p.name}`}
                        />
                      </TD>
                      <TD className="font-medium text-crm-text">
                        <span className="block">{p.name}</span>
                        {p.shortSummary && (
                          <span className="mt-0.5 block max-w-[22rem] truncate text-xs text-crm-muted">
                            {p.shortSummary}
                          </span>
                        )}
                      </TD>
                      <TD hideBelow="md">{p.title || "—"}</TD>
                      <TD hideBelow="lg">{p.company || "—"}</TD>
                      <TD hideBelow="md">
                        {p.email ? (
                          <a href={`mailto:${p.email}`} className="text-crm-blue hover:underline">
                            {p.email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD>
                        {converted ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Converted
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            New
                          </span>
                        )}
                      </TD>
                      <TD>
                        {p.linkedinUrl ? (
                          <a
                            href={p.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-crm-blue hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD hideBelow="lg">
                        {converted && p.convertedLeadId ? (
                          <Link href={`/leads/${p.convertedLeadId}`} className="text-crm-blue hover:underline">
                            View lead
                          </Link>
                        ) : (
                          p.savedByName || "—"
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-crm-muted">
                        <RelativeTime iso={p.createdAt} />
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </TableScroll>
      </div>

      <Modal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        title={selected ? `Convert ${selected.name} to Lead` : "Convert to Lead"}
        width="max-w-3xl"
      >
        {selected && (
          <LeadForm
            initial={leadInitial}
            defaultOwnerId={defaultOwnerId}
            defaultOwnerName={defaultOwnerName}
            lockedSource="LinkedIn"
            submitLabel="Create lead"
            onSaved={handleLeadSaved}
            onCancel={() => setConvertOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
