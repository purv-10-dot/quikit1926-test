"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { BoardFilterSelect } from "@/app/(dashboard)/spaces/[id]/board/_components/board-filter-select";
import { ProjectPreviewIllustration } from "@/components/illustrations/project-preview";
import { randomProjectIconKey } from "@/components/space-icon";
import {
  KanbanIllustration,
  ScrumIllustration,
  WebDesignIllustration,
} from "@/components/create-space/template-illustrations";

const TEMPLATES = {
  scrum: {
    title: "Scrum",
    description: "Plan, track, and execute work using sprints and a backlog.",
    Illustration: ScrumIllustration,
    product: "QuikTrack",
  },
  functional: {
    title: "Kanban",
    description: "Manage work on a backlog and an activity board — no sprints.",
    Illustration: KanbanIllustration,
    product: "QuikTrack",
  },
  discovery: {
    title: "Product discovery",
    description: "Prioritize ideas then connect them from discovery through to delivery.",
    Illustration: WebDesignIllustration,
    product: "QuikTrack",
  },
  "web-design": {
    title: "Web design process",
    description: "For designers and developers to track web design tasks and stay aligned.",
    Illustration: WebDesignIllustration,
    product: "QuikTrack",
  },
  kanban: {
    title: "Kanban",
    description: "Manage design projects effectively, visualize tasks, and see team workload.",
    Illustration: KanbanIllustration,
    product: "QuikTrack",
  },
} as const;

type TemplateKey = keyof typeof TEMPLATES;

function deriveKey(name: string): string {
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  return cleaned.length >= 2 ? cleaned : "";
}

export function CreateProjectForm() {
  const router = useRouter();
  const params = useSearchParams();
  const templateKey = (params.get("template") as TemplateKey) ?? "scrum";
  const template = TEMPLATES[templateKey] ?? TEMPLATES.scrum;

  const [name, setName] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [projectType, setProjectType] = useState<"team-managed" | "company-managed">("team-managed");
  const [showMore, setShowMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(v: string) {
    setName(v);
    setProjectKey(deriveKey(v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const finalKey = projectKey || deriveKey(name) || "QT";
    setSubmitting(true);
    try {
      // Only "scrum", "functional" and "discovery" are real backend templates;
      // any other preview key (web-design/kanban) falls back to scrum.
      const backendTemplate =
        templateKey === "functional"
          ? "functional"
          : templateKey === "discovery"
            ? "discovery"
            : "scrum";
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          projectKey: finalKey,
          projectType: backendTemplate === "discovery" ? "discovery" : "software",
          managementStyle: projectType,
          templateKey: backendTemplate,
          icon: randomProjectIconKey(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to create project");
        return;
      }
      // Discovery spaces land on their Ideas view; others on the backlog.
      const landing = backendTemplate === "discovery" ? "ideas" : "backlog";
      // Prefer the readable project key in the URL (the server echoes it back;
      // fall back to the key we submitted, then the id — server resolves any).
      const seg = json.data.projectKey ?? finalKey ?? json.data.id;
      router.push(`/spaces/${seg}/${landing}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white grid grid-cols-1 lg:grid-cols-2">
      <div className="relative flex flex-col px-10 lg:px-16 pt-6 pb-12">
        <Link
          href="/spaces/templates"
          className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to project template
        </Link>
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-[460px] mx-auto">
          <h1 className="text-[22px] font-semibold text-gray-900">Create project</h1>
          <p className="mt-2 text-[13px] text-gray-600 leading-relaxed">
            Explore what&apos;s possible when you collaborate with your team. Edit project
            details anytime in project settings.
          </p>
          <p className="mt-4 text-xs text-gray-500">
            Required fields are marked with an asterisk{" "}
            <span className="text-red-500">*</span>
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Try a team name, project goal, milestone..."
                required
                maxLength={120}
                className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700">Template</label>
                <Link
                  href="/spaces/templates"
                  className="text-xs text-blue-600 hover:underline"
                >
                  More templates
                </Link>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 flex items-center justify-center">
                  <template.Illustration className="h-14 w-14" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="inline-block text-[10px] font-semibold tracking-wider text-blue-700 uppercase mb-1">
                    Recommended
                  </span>
                  <div className="text-sm font-semibold text-gray-900">{template.title}</div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                    <span className="h-3 w-3 rounded-sm bg-blue-600 inline-flex items-center justify-center text-[7px] font-bold text-white">
                      Q
                    </span>
                    {template.product}
                  </div>
                  <p className="mt-1.5 text-xs text-gray-600 leading-snug">
                    {template.description}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
              </div>

              <button
                type="button"
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                onClick={() => setShowMore((v) => !v)}
              >
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${showMore ? "rotate-90" : ""}`}
                />
                Show more
              </button>
            </div>

            {showMore && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Project type
                  </label>
                  <BoardFilterSelect
                    value={projectType}
                    onChange={(v) => setProjectType(v as typeof projectType)}
                    options={[
                      { value: "team-managed", label: "Team-managed" },
                      { value: "company-managed", label: "Company-managed" },
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Key <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={projectKey}
                    onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                    maxLength={10}
                    pattern="[A-Z][A-Z0-9]{1,9}"
                    className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

              </>
            )}

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="h-9 px-5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 shadow-sm"
              >
                {submitting ? "Creating..." : "Create Project"}
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex items-center justify-center bg-white px-10">
        <ProjectPreviewIllustration className="w-full max-w-[640px] aspect-[649/554]" />
      </div>
    </div>
  );
}
