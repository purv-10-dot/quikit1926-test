"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, MapPin, Clock, Loader2, AlertTriangle, Building2 } from "lucide-react";
import { withBasePath } from "@/lib/utils/base-path";

interface Job {
  id: string;
  title: string;
  jobLocation: string | null;
  employmentType: string;
  workLocation: string;
  experienceMin: string | number | null;
  experienceMax: string | number | null;
  raisedAt: string | null;
  department: { name: string } | null;
}

interface CareerPageData {
  company: { name: string; logo: string | null; intro: string | null };
  jobs: Job[];
}

function expLabel(min: Job["experienceMin"], max: Job["experienceMax"]): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} yrs`;
  if (min != null) return `${min}+ yrs`;
  return `Up to ${max} yrs`;
}

export default function CareerListingPage({ params }: { params: { orgSlug: string } }) {
  const { orgSlug } = params;
  const [data, setData] = useState<CareerPageData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(withBasePath(`/api/v1/hrms/careers/${orgSlug}`))
      .then((r) => r.json())
      .then((res) => { if (res.success) setData(res.data); else setNotFound(true); })
      .catch(() => setNotFound(true));
  }, [orgSlug]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle size={38} className="text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900 mb-1">Career page not found</h1>
          <p className="text-sm text-gray-500">This link is invalid, or the page isn&apos;t published yet.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={30} className="text-green-600 animate-spin" />
      </div>
    );
  }

  const { company, jobs } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-8 text-center">
          {company.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={withBasePath(company.logo)} alt={company.name} className="h-14 mx-auto mb-4 object-contain" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-green-50 text-green-700 mx-auto mb-4 flex items-center justify-center">
              <Building2 size={26} />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Open Positions</p>
          {company.intro && <p className="text-sm text-gray-600 mt-4 max-w-xl mx-auto leading-relaxed">{company.intro}</p>}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {jobs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Briefcase size={32} className="mx-auto mb-3" />
            <p className="text-sm">No open positions right now. Please check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/careers/${orgSlug}/${job.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-green-300 hover:shadow-sm transition"
              >
                <h2 className="text-[15px] font-semibold text-gray-900">{job.title}</h2>
                <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-gray-500">
                  {job.department?.name && <span className="inline-flex items-center gap-1"><Building2 size={12} /> {job.department.name}</span>}
                  {job.jobLocation && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {job.jobLocation}</span>}
                  <span className="inline-flex items-center gap-1"><Clock size={12} /> {job.employmentType === "FullTime" ? "Full Time" : job.employmentType === "PartTime" ? "Part Time" : job.employmentType}</span>
                  {expLabel(job.experienceMin, job.experienceMax) && <span>{expLabel(job.experienceMin, job.experienceMax)} experience</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
