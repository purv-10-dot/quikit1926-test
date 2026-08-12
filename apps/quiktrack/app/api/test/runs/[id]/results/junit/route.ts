import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { fromParsed, ingestResults, IngestError } from "@/lib/services/testIngest";
import { gateProject, serverError } from "@/lib/test/gate";
import {
  ResultParseError,
  selectParser,
  type ParseOptions,
} from "@/lib/test/resultParser";

/**
 * POST /api/test/runs/{id}/results/junit — framework output upload.
 *
 * Accepts JUnit/xUnit XML either as multipart (`results.xml`) or as a raw
 * `text/xml` body, because CI clients differ in which is easier to produce.
 *
 * Parsing goes through the pluggable `ResultParser` interface and insertion
 * reuses `ingestResults`, so this endpoint adds a FORMAT, not a second store —
 * which is what lets TAP/NUnit/Allure be added later without touching the trail.
 */

type Params = { id: string };

/** 10 MB — a large suite's XML is a few hundred KB; this is a sanity bound. */
const MAX_XML_BYTES = 10 * 1024 * 1024;

/** Reads the XML from multipart or a raw body. */
async function readXml(
  req: NextRequest,
): Promise<{ xml: string; build: string | null; ciUrl: string | null } | NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("results.xml") ?? form.get("file") ?? form.get("results");
    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Attach the report as a `results.xml` form field.",
        },
        { status: 400 },
      );
    }
    if (file.size > MAX_XML_BYTES) {
      return NextResponse.json(
        { success: false, error: "Report exceeds the 10 MB limit." },
        { status: 413 },
      );
    }
    return {
      xml: await file.text(),
      build: (form.get("build") as string | null) ?? null,
      ciUrl: (form.get("ciUrl") as string | null) ?? null,
    };
  }

  const url = new URL(req.url);
  const raw = await req.text();
  if (raw.length > MAX_XML_BYTES) {
    return NextResponse.json(
      { success: false, error: "Report exceeds the 10 MB limit." },
      { status: 413 },
    );
  }
  return {
    xml: raw,
    build: url.searchParams.get("build"),
    ciUrl: url.searchParams.get("ciUrl"),
  };
}

export const POST = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const run = await db.qtTestRun.findFirst({
        where: { id: params.id, orgId, isDeleted: false },
        select: { projectId: true },
      });
      if (!run) {
        return NextResponse.json(
          { success: false, error: "Run not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(
        orgId,
        userId,
        run.projectId,
        "TestResult",
        "create",
      );
      if (denied) return denied;

      const read = await readXml(req);
      if (read instanceof NextResponse) return read;

      if (read.xml.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "The report was empty." },
          { status: 400 },
        );
      }

      const url = new URL(req.url);
      const format = url.searchParams.get("format") ?? undefined;
      const opts: ParseOptions = {};
      const idFormat = url.searchParams.get("automationIdFormat");
      if (
        idFormat === "classname::name" ||
        idFormat === "classname.name" ||
        idFormat === "name"
      ) {
        opts.automationIdFormat = idFormat;
      }
      const skipped = url.searchParams.get("skippedStatus");
      if (skipped === "Blocked" || skipped === "Skipped") {
        opts.skippedStatus = skipped;
      }

      let items;
      try {
        const parser = selectParser(read.xml, format);
        const parsed = parser.parse(read.xml, opts);
        items = fromParsed(parsed, { build: read.build, ciUrl: read.ciUrl });
      } catch (error: unknown) {
        // Malformed XML answers 400 WITH the position, per TM-6.1 — a generic
        // "parse failed" would leave CI operators guessing.
        if (error instanceof ResultParseError) {
          return NextResponse.json(
            {
              success: false,
              error: error.message,
              data: { line: error.line, column: error.column },
            },
            { status: 400 },
          );
        }
        throw error;
      }

      if (items.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            inserted: 0,
            unmatched: [],
            materialised: 0,
            duplicates: [],
            note: "The report parsed cleanly but contained no test cases.",
          },
        });
      }

      const summary = await ingestResults(orgId, userId, params.id, items);
      return NextResponse.json({
        success: true,
        data: { ...summary, parsed: items.length },
      });
    } catch (error: unknown) {
      if (error instanceof IngestError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      return serverError(error);
    }
  },
);
