import { Suspense } from "react";
import { CreateProjectForm } from "./_components/create-project-form";

export const metadata = {
  title: "Create project · QuikTrack",
};

export default function CreateProjectPage() {
  return (
    <Suspense fallback={null}>
      <CreateProjectForm />
    </Suspense>
  );
}
