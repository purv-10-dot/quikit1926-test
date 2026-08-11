"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Drawer } from "@/components/ui/drawer";
import { ProspectPosts } from "@/components/settings/prospect-posts";
import { ProspectCompany } from "@/components/settings/prospect-company";
import { ProspectExperience } from "@/components/settings/prospect-experience";
import type { LinkedInCompany } from "@/lib/services/prospects/linkedin-company";
import type { LinkedInExperience } from "@/lib/services/prospects/linkedin-experience";
import {
  summarizeLinkedInPosts,
  type LinkedInPost,
} from "@/lib/services/prospects/linkedin-posts";
import { LeadForm } from "@/components/leads/lead-form";
import { RelativeTime } from "@/components/shared/relative-time";
import { Pagination } from "@/components/shared/pagination";
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
  /**
   * Recent LinkedIn activity scraped by the extension, already normalized by
   * parseLinkedInPosts on the server. Empty when nothing was captured.
   */
  posts: LinkedInPost[];
  /** ICP chosen in the extension. Null for prospects saved before ICP existed. */
  icpId: string | null;
  /** Joined for display only — the prospect stores just `icpId`. */
  icp: { id: string; name: string; isActive: boolean } | null;
  /**
   * Company details captured by the extension's company scraper, already
   * normalized by parseLinkedInCompany on the server. Null when the prospect
   * was saved without visiting the company page.
   */
  companyDetails: LinkedInCompany | null;
  /**
   * Work history captured by the extension's profile scraper, already
   * normalized by parseLinkedInExperiences on the server. Empty when the
   * profile had no Experience section or was saved by an older build.
   */
  experiences: LinkedInExperience[];
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
  // Prospect whose LinkedIn posts are open in the drawer. Independent of
  // `selectedId` (the convert radio) so viewing posts never changes what is
  // queued for conversion.
  const [postsForId, setPostsForId] = useState<string | null>(null);
  // Prospect whose COMPANY details are open. Independent of `selectedId` and
  // `postsForId`, so opening it never changes what is queued for conversion.
  const [companyForId, setCompanyForId] = useState<string | null>(null);

  // Filters. The server page ships the whole in-scope set (capped at 500), so
  // filtering and paging both happen here — no refetch, results are instant.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterIcp, setFilterIcp] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const selected = useMemo(
    () => prospects.find((p) => p.id === selectedId) ?? null,
    [prospects, selectedId],
  );
  const isConverted = (p: ProspectRow) => p.status === "Converted";

  const postsProspect = useMemo(
    () => prospects.find((p) => p.id === postsForId) ?? null,
    [prospects, postsForId],
  );

  const companyProspect = useMemo(
    () => prospects.find((p) => p.id === companyForId) ?? null,
    [prospects, companyForId],
  );
  const postsSummary = useMemo(
    () => (postsProspect ? summarizeLinkedInPosts(postsProspect.posts) : null),
    [postsProspect],
  );

  // Dropdown options come from the rows actually on screen, so a user never
  // picks a filter that can return nothing. "__none__" targets prospects saved
  // before ICP existed (or saved without one).
  const icpOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of prospects) if (p.icp) seen.set(p.icp.id, p.icp.name);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [prospects]);

  const companyOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of prospects) if (p.company?.trim()) seen.add(p.company.trim());
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [prospects]);

  const filtered = useMemo(() => {
    return prospects.filter((p) => {
      if (debouncedSearch) {
        // Name-led search, widened to the fields a user would reasonably type:
        // title, company, email and the extension's short summary.
        const haystack = [p.name, p.title, p.company, p.email, p.shortSummary]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(debouncedSearch)) return false;
      }
      if (filterIcp) {
        if (filterIcp === "__none__") {
          if (p.icp) return false;
        } else if (p.icp?.id !== filterIcp) {
          return false;
        }
      }
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterCompany && (p.company?.trim() ?? "") !== filterCompany) return false;
      return true;
    });
  }, [prospects, debouncedSearch, filterIcp, filterStatus, filterCompany]);

  const hasFilters = Boolean(search || filterIcp || filterStatus || filterCompany);

  // Any filter change invalidates the current page offset.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterIcp, filterStatus, filterCompany, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  function clearFilters() {
    setSearch("");
    setFilterIcp("");
    setFilterStatus("");
    setFilterCompany("");
  }

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
      // Carry the prospect's ICP straight onto the new lead. The form has no ICP
      // control, so the user is never asked to choose again; when the prospect
      // has none this is null and conversion proceeds exactly as before.
      icpId: selected.icpId,
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
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search
              size={16}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted"
              aria-hidden
            />
            <Input
              className="pl-9"
              placeholder="Search name, title, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search prospects"
            />
          </div>

          <Select
            value={filterIcp}
            onChange={(e) => setFilterIcp(e.target.value)}
            aria-label="ICP filter"
            className="w-auto min-w-[150px]"
          >
            <option value="">All ICPs</option>
            {icpOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value="__none__">No ICP</option>
          </Select>

          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Status filter"
            className="w-auto min-w-[130px]"
          >
            <option value="">All status</option>
            <option value="New">New</option>
            <option value="Converted">Converted</option>
          </Select>

          <Select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            aria-label="Company filter"
            className="w-auto min-w-[150px]"
          >
            <option value="">All companies</option>
            {companyOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs text-crm-muted transition hover:bg-crm-panel hover:text-crm-text"
            >
              <X size={14} aria-hidden />
              Clear
            </button>
          )}
        </div>

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
        <TableScroll minWidth={1100}>
          <Table>
            <THead>
              <TR>
                <TH className="w-10" aria-label="Select" />
                <TH>Name</TH>
                <TH hideBelow="md">Title</TH>
                <TH hideBelow="lg">Company</TH>
                <TH hideBelow="md">ICP</TH>
                <TH hideBelow="md">Email</TH>
                <TH>Status</TH>
                <TH hideBelow="md">Posts</TH>
                <TH>LinkedIn</TH>
                <TH hideBelow="lg">Saved By</TH>
                <TH>Saved</TH>
              </TR>
            </THead>
            <TBody>
              {pageRows.length === 0 ? (
                <TR>
                  <TD colSpan={11} className="py-10 text-center text-crm-muted">
                    {prospects.length === 0
                      ? "No prospects yet. Save a LinkedIn profile from the extension to see it here."
                      : "No prospects match these filters."}
                  </TD>
                </TR>
              ) : (
                pageRows.map((p) => {
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
                      {/* Company — clickable when the extension captured full
                          company details, opening them in a drawer. Falls back
                          to plain text so prospects saved without a company
                          visit render exactly as before. */}
                      <TD hideBelow="lg">
                        {p.companyDetails || p.experiences.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setCompanyForId(p.id)}
                            className="text-left font-medium text-accent-600 hover:underline"
                            title={
                              p.companyDetails
                                ? "View company details and work experience"
                                : "View work experience"
                            }
                          >
                            {p.company || p.companyDetails?.name || "View details"}
                          </button>
                        ) : (
                          p.company || "—"
                        )}
                      </TD>
                      <TD hideBelow="md">
                        {p.icp ? (
                          <span
                            className="inline-flex items-center rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-700"
                            title={
                              p.icp.isActive
                                ? p.icp.name
                                : `${p.icp.name} (this ICP is no longer active)`
                            }
                          >
                            {p.icp.name}
                            {!p.icp.isActive && (
                              <span className="ml-1 text-accent-500" aria-hidden>
                                •
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-crm-muted">—</span>
                        )}
                      </TD>
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
                      <TD hideBelow="md">
                        {p.posts.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setPostsForId(p.id)}
                            className="inline-flex items-center gap-1 text-crm-blue hover:underline"
                            aria-label={`View ${p.posts.length} LinkedIn posts for ${p.name}`}
                          >
                            <FileText size={13} aria-hidden />
                            {p.posts.length}
                          </button>
                        ) : (
                          <span className="text-crm-muted">—</span>
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

        {filtered.length > 0 && (
          <Pagination
            page={safePage}
            pageSize={pageSize}
            total={filtered.length}
            onPage={setPage}
            pageSizeOptions={[10, 25, 50, 100]}
            onPageSizeChange={setPageSize}
            showPageNumbers
          />
        )}
      </div>

      <Drawer
        open={Boolean(postsProspect)}
        onClose={() => setPostsForId(null)}
        title={postsProspect ? `${postsProspect.name} — LinkedIn posts` : "LinkedIn posts"}
        description={
          postsSummary
            ? `${postsSummary.count} post${postsSummary.count === 1 ? "" : "s"} · ` +
              `${postsSummary.totalReactions.toLocaleString()} reactions · ` +
              `${postsSummary.totalComments.toLocaleString()} comments`
            : undefined
        }
        width="md:max-w-2xl"
      >
        {postsProspect && <ProspectPosts posts={postsProspect.posts} />}
      </Drawer>

      {/* Company + experience. Opens when EITHER was captured, so a prospect
          with work history but no company visit still has a viewable record. */}
      <Drawer
        open={Boolean(
          companyProspect &&
            (companyProspect.companyDetails || companyProspect.experiences.length > 0),
        )}
        onClose={() => setCompanyForId(null)}
        title={
          companyProspect?.companyDetails
            ? `${companyProspect.companyDetails.name || companyProspect.company || "Company"} — company details`
            : companyProspect
              ? `${companyProspect.name} — experience`
              : "Prospect details"
        }
        description={
          companyProspect
            ? `Captured from LinkedIn when ${companyProspect.name} was saved.`
            : undefined
        }
        width="md:max-w-2xl"
      >
        {companyProspect && (
          <div className="space-y-6">
            {companyProspect.companyDetails && (
              <ProspectCompany company={companyProspect.companyDetails} />
            )}
            {/* Divider only when both sections are present. */}
            {companyProspect.companyDetails && companyProspect.experiences.length > 0 && (
              <hr className="border-[var(--color-border)]" />
            )}
            <ProspectExperience experiences={companyProspect.experiences} />
          </div>
        )}
      </Drawer>

      <Modal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        title={selected ? `Convert ${selected.name} to Lead` : "Convert to Lead"}
        width="max-w-3xl"
      >
        {selected && (
          <>
            {/* Read-only confirmation of the inherited ICP. The requirement is not
                to re-ask, but the user should still see what is being carried
                over — silently copying a field is worse than showing it. */}
            {selected.icp && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-crm-border bg-crm-panel/40 px-3 py-2 text-sm">
                <span className="text-crm-muted">ICP</span>
                <span className="font-medium text-crm-text">{selected.icp.name}</span>
                <span className="ml-auto text-xs text-crm-muted">
                  carried over from the prospect
                </span>
              </div>
            )}
            <LeadForm
              initial={leadInitial}
              defaultOwnerId={defaultOwnerId}
              defaultOwnerName={defaultOwnerName}
              lockedSource="LinkedIn"
              submitLabel="Create lead"
              onSaved={handleLeadSaved}
              onCancel={() => setConvertOpen(false)}
            />
          </>
        )}
      </Modal>
    </>
  );
}
