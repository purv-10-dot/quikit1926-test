import { Construction } from "lucide-react";

/**
 * Shared placeholder rendered by every Phase-0 stub page.
 * Each module gets ported in sequence (see docs/engineering/QUIKCONSTRUCTION_MIGRATION.md).
 */
export function ModuleStub({ name, phase }: { name: string; phase: string }) {
  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
          <Construction className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold text-gray-900">{name}</h1>
        <span className="text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
          {phase}
        </span>
      </div>
      <p className="text-sm text-gray-600">
        Module not ported yet. See{" "}
        <code className="bg-gray-100 px-1 rounded text-xs">docs/engineering/QUIKCONSTRUCTION_MIGRATION.md</code>{" "}
        for the porting schedule. Standalone QuikConstruction (port 3010) still
        owns this module in production until cutover.
      </p>
    </div>
  );
}
