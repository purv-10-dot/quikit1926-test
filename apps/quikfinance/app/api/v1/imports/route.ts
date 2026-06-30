import { requireApiContext } from "@/lib/api/auth";
import { errorMessage, fail, ok } from "@/lib/api/responses";
import { processImportPayload } from "@/lib/imports/processors";
import { importJobSchema } from "@/lib/validations/automation.schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const { data, error } = await auth.context.db
    .from("import_jobs")
    .select("id, created_at, source_type, entity_type, imported_rows, failed_rows, status")
    .eq("org_id", auth.context.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return fail(500, { code: "IMPORT_LIST_FAILED", message: error.message });
  }

  return ok(data ?? []);
}

export async function POST(request: Request) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  try {
    const json = (await request.json()) as Record<string, unknown>;
    const parsed = importJobSchema.safeParse(json);
    if (!parsed.success) {
      return fail(422, {
        code: "VALIDATION_FAILED",
        message: "The import request is invalid.",
        details: parsed.error.flatten()
      });
    }

    if ((parsed.data.source_type === "bank_statement" || parsed.data.entity_type === "bank_transactions") && !parsed.data.bank_account_id) {
      return fail(422, {
        code: "BANK_ACCOUNT_REQUIRED",
        message: "Choose a bank account before importing a statement."
      });
    }

    const { data: job, error: jobError } = await auth.context.db
      .from("import_jobs")
      .insert({
        org_id: auth.context.orgId,
        source_type: parsed.data.source_type,
        entity_type: parsed.data.entity_type,
        file_name: parsed.data.file_name ?? null,
        bank_account_id: parsed.data.bank_account_id ?? null,
        raw_payload: parsed.data.payload_text,
        status: "processing",
        notes: parsed.data.notes ?? null,
        created_by: auth.context.userId
      })
      .select("id")
      .single();

    if (jobError || !job?.id) {
      return fail(400, { code: "IMPORT_JOB_CREATE_FAILED", message: jobError?.message ?? "Import job could not be created." });
    }

    const result = await processImportPayload(
      auth.context,
      parsed.data.source_type,
      parsed.data.entity_type,
      parsed.data.payload_text,
      parsed.data.bank_account_id ?? null
    );

    const summary = {
      preview: result.preview,
      notes: result.notes
    };

    const { data: updatedJob, error: updateError } = await auth.context.db
      .from("import_jobs")
      .update({
        status: result.failedRows > 0 ? "completed_with_warnings" : "completed",
        total_rows: result.totalRows,
        imported_rows: result.importedRows,
        failed_rows: result.failedRows,
        summary
      })
      .eq("id", job.id)
      .eq("org_id", auth.context.orgId)
      .select("id, created_at, source_type, entity_type, imported_rows, failed_rows, status")
      .single();

    if (updateError) {
      return fail(400, { code: "IMPORT_JOB_UPDATE_FAILED", message: updateError.message });
    }

    await auth.context.db.from("audit_logs").insert({
      org_id: auth.context.orgId,
      user_id: auth.context.userId,
      entity_type: "import_job",
      entity_id: job.id,
      action: "create",
      new_values: summary
    });

    return ok(updatedJob, { notes: result.notes }, { status: 201 });
  } catch (error) {
    return fail(500, { code: "IMPORT_FAILED", message: errorMessage(error) });
  }
}
