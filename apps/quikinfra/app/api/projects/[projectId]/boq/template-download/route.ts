import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

/**
 * GET /api/projects/:projectId/boq/template-download?format=numeric|alphabetic
 *
 * Returns a blank-but-pre-headed .xlsx template the user can fill and
 * re-upload via the BOQ Import flow.
 *
 *   numeric    — QuikInfra 6-column format
 *                (BOQ No · SOR No · Description · Unit · Rate · Op. Undone Qty)
 *   alphabetic — Aakar/Govt 5-column SOR format
 *                (I/NO. · SOR Numbers · DESCRIPTION · TOTAL QUANTITY · UNIT)
 *
 * v2 permission gate: `construction.boq` + `import` (template is part
 * of the import workflow).
 */
const auth = withOrgAuthForResource("construction.boq");

export const GET = auth.importOrEdit<{ projectId: string }>(
  async (_authCtx, req: NextRequest) => {
    const format = (req.nextUrl.searchParams.get("format") ?? "numeric").toLowerCase();

    const wb = XLSX.utils.book_new();
    let aoa: (string | number | null)[][];
    let fileName: string;
    let sheetName: string;
    let colWidths: { wch: number }[];

    if (format === "alphabetic") {
      sheetName = "Civil";
      fileName = "BOQ_Template_Alphabetic.xlsx";
      aoa = [
        ["I/NO.", "SOR Numbers", "DESCRIPTION", "TOTAL QUANTITY", "UNIT"],
        ["A.1", "A.1.1", "SURFACE DRESSING by clearing land by uprooting vegetation, grass and small plants", 28500, "Sqm."],
        ["A.2.", "A.2.2", "EXCAVATION by any means up to a depth of 3.0 m. from NGL.", 0, ""],
        ["a.", "A.2.2.1", "For all kinds of soils, clayey, silty sandy, which can be excavated using JCB", "I.R.", "Cum."],
        ["b.", "A.2.2.2", "For Hard soil, murrum and soft rock which can be excavated by JCB without using breaker", 26897, "Cum."],
        ["c.", "A.2.2.3", "For rocks excavated by using breaker", "I.R.", "Cum."],
        ["d.", "A.2.2.4", "For rocks excavated by use of blasting", "I.R.", "Cum."],
        ["A.3.", "", "ADD EXTRA IN ITEM A2 ABOVE FOR EVERY ONE METER beyond 3.0 m. or part there of", 0, ""],
        ["a.", "A.3.1", "For all kinds of soils, clayey, silty sandy, which can be excavated using JCB", "I.R.", "Cum."],
        ["b.", "A.3.2", "For Hard soil, murrum and soft rock which can be excavated by JCB without using breaker", 332.5, "Cum."],
        ["A.4.", "A.4.1", "SHORING (using planks, boards and props) to uphold the excavated sides of pits", "I.R.", "Sqm."],
      ];
      colWidths = [{ wch: 8 }, { wch: 12 }, { wch: 80 }, { wch: 14 }, { wch: 8 }];
    } else {
      sheetName = "Civil";
      fileName = "BOQ_Template_QuikInfra.xlsx";
      aoa = [
        ["BOQ No", "SOR No", "Description", "Unit", "Rate", "Op. Undone Qty"],
        [1, "", "TRANSPORTATION BY MECHANICAL MEANS", "", "", ""],
        [1.1, "", "Transportation by mechanical means - Including loading, unloading and stacking.", "", "", ""],
        ["1.1.2a", "1.1.2a", "Earth (1 Km) - Earth", "Cum", 139.47, 15121.58],
        [2, "", "EARTHWORK & SITE PREPARATION", "", "", ""],
        [2.2, "2.2", "Jungle clearing - Clearing jungle including uprooting of rank vegetation, grass, brush wood", "100 sqm", 414, 194.75],
        [2.6, "2.6", "Excavation soil - Earth work in excavation by mechanical means (Hydraulic excavator)", "cum", 129, 19707.47],
        [2.7, "", "Excavation rock - Earth work in excavation by mechanical means (Hydraulic Excavator)", "", "", ""],
        [2.7, "2.7.1", "OR - Ordinary rock", "cum", 287, 2740.91],
        [2.24, "2.24", "Filling available excavated earth - Filling available excavated earth in trenches, plinth", "cum", 72, 13439.73],
      ];
      colWidths = [{ wch: 10 }, { wch: 10 }, { wch: 80 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  },
);
