"use client";

import { useEffect, useState } from "react";
import { Briefcase, Calendar, CheckCircle, Clock, XCircle, LogIn } from "lucide-react";
import { clsx } from "clsx";

interface Interview { id: string; scheduledAt: string; type: string; status: string; round: number; meetingLink: string | null; location: string | null; }
interface Offer { status: string; offeredCTC: string | number; joiningDate: string; sentAt: string | null; }
interface Application {
  id: string; status: string; currentStage: string | null; appliedDate: string;
  requisition: { id: string; title: string };
  interviews: Interview[]; offer: Offer | null;
}
interface PortalData {
  candidate: { id: string; firstName: string; lastName: string; email: string; phone: string | null };
  applications: Application[];
}

export default function CandidatePortalPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/v1/hrms/candidate-portal/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
        else setError(res.error?.message ?? "Access denied");
      })
      .catch(() => setError("Failed to load portal"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center max-w-md">
          <XCircle className="text-red-500 mx-auto mb-3" size={48} />
          <h2 className="font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-sm text-gray-600">{error ?? "Invalid or expired token"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
            {data.candidate.firstName[0]}{data.candidate.lastName[0]}
          </div>
          <div>
            <h1 className="text-xl font-bold">Hello, {data.candidate.firstName}</h1>
            <p className="text-sm text-blue-100">{data.candidate.email}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <LogIn size={14} /> QuikIT Candidate Portal
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-lg">My Applications ({data.applications.length})</h2>

        {data.applications.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            No applications yet
          </div>
        ) : data.applications.map((app) => (
          <div key={app.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Briefcase size={16} className="text-blue-600" />
                  <h3 className="font-semibold text-gray-900">{app.requisition.title}</h3>
                </div>
                <div className="text-xs text-gray-500">
                  Applied {new Date(app.appliedDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  {app.currentStage && <> • Stage: {app.currentStage}</>}
                </div>
              </div>
              <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium",
                app.status === "AppHired" ? "bg-green-100 text-green-700" :
                app.status === "AppRejected" ? "bg-red-100 text-red-700" :
                app.status === "AppOffered" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")}>
                {app.status.replace("App", "")}
              </span>
            </div>

            {app.interviews.length > 0 && (
              <div className="border-t border-gray-100 pt-3 mt-3">
                <div className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-1">
                  <Calendar size={14} /> Interviews
                </div>
                <div className="space-y-2">
                  {app.interviews.map((iv) => (
                    <div key={iv.id} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-2">
                      <div>
                        <span className="font-medium">Round {iv.round} — {iv.type}</span>
                        <div className="text-xs text-gray-500">{new Date(iv.scheduledAt).toLocaleString("en-IN")}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={clsx("px-2 py-0.5 rounded-full text-xs",
                          iv.status === "IntCompleted" ? "bg-green-100 text-green-700" :
                          iv.status === "IntScheduled" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")}>
                          {iv.status.replace("Int", "")}
                        </span>
                        {iv.meetingLink && <a href={iv.meetingLink} target="_blank" rel="noreferrer" className="text-blue-600 text-xs hover:underline">Join →</a>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {app.offer && (
              <div className="border-t border-gray-100 pt-3 mt-3 bg-blue-50 -mx-5 -mb-5 px-5 pb-5 rounded-b-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-blue-600" />
                  <h4 className="font-semibold text-blue-900">Offer</h4>
                  <span className="ml-auto px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs">{app.offer.status.replace("Offer", "")}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-blue-700">CTC</div><div className="font-semibold">₹{Number(app.offer.offeredCTC).toLocaleString("en-IN")}</div></div>
                  <div><div className="text-xs text-blue-700">Joining</div><div className="font-semibold">{new Date(app.offer.joiningDate).toLocaleDateString("en-IN")}</div></div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
