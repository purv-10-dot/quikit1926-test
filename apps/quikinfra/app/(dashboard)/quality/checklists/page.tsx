"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ChecklistsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/quality?tab=checklists");
  }, [router]);
  return null;
}
