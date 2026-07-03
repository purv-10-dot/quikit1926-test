import { requireApiContext } from "@/lib/api/auth";
import { errorMessage, fail, ok } from "@/lib/api/responses";
import { processImportPayload } from "@/lib/imports/processors";

export const dynamic = "force-dynamic";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type ReconciliationAction =
  | {
      action: "import_statement";
      bank_account_id: string;
      payload_text: string;
    }
  | {
      action: "mark_status";
      bank_account_id: string;
      transaction_ids: string[];
      status: "matched" | "ignored" | "imported";
    }
  | {
      action: "reconcile";
      bank_account_id: string;
      statement_start: string;
      statement_end: string;
      statement_balance: number;
    };

export async function GET(request: Request) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const { searchParams } = new URL(request.url);
  const bankAccountId = searchParams.get("bank_account_id");
  if (!bankAccountId) {
    return fail(422, { code: "BANK_ACCOUNT_REQUIRED", message: "Choose a bank account to continue." });
  }

  const [{ data: bankAccount, error: bankError }, { data: transactions, error: transactionError }, { data: reconciliations, error: reconciliationError }] =
    await Promise.all([
      auth.context.db
        .from("bank_accounts")
        .select("id, name, institution_name, current_balance")
        .eq("org_id", auth.context.orgId)
        .eq("id", bankAccountId)
        .single(),
      auth.context.db
        .from("bank_transactions")
        .select("id, transaction_date, description, amount, reference, status")
        .eq("org_id", auth.context.orgId)
        .eq("bank_account_id", bankAccountId)
        .order("transaction_date", { ascending: false }),
      auth.context.db
        .from("reconciliations")
        .select("id, statement_start, statement_end, statement_balance, book_balance, difference, status, created_at")
        .eq("org_id", auth.context.orgId)
        .eq("bank_account_id", bankAccountId)
        .order("created_at", { ascending: false })
        .limit(5)
    ]);

  if (bankError || transactionError || reconciliationError) {
    return fail(500, {
      code: "RECONCILIATION_LOAD_FAILED",
      message: bankError?.message ?? transactionError?.message ?? reconciliationError?.message ?? "Bank reconciliation data could not be loaded."
    });
  }

  const rows = (transactions ?? []).map((row) => ({
    id: row.id,
    statement_date: row.transaction_date,
    description: row.description,
    statement_amount: row.amount,
    book_amount: row.status === "ignored" ? 0 : row.amount,
    status: row.status
  }));

  const statementBalance = rows.reduce((sum, row) => sum + Number(row.statement_amount ?? 0), 0);
  const bookBalance = typeof bankAccount?.current_balance === "number" ? bankAccount.current_balance : Number(bankAccount?.current_balance ?? 0);
  const latestReconciliation = (reconciliations ?? [])[0] ?? null;

  return ok({
    bank_account: bankAccount,
    summary: {
      statement_balance: statementBalance,
      book_balance: bookBalance,
      difference: Number((statementBalance - bookBalance).toFixed(2)),
      last_reconciled_at: latestReconciliation?.created_at ?? null
    },
    rows,
    recent_reconciliations: reconciliations ?? []
  });
}

export async function POST(request: Request) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  try {
    const body = (await request.json()) as ReconciliationAction;

    if (body.action === "import_statement") {
      const result = await processImportPayload(auth.context, "bank_statement", "bank_transactions", body.payload_text, body.bank_account_id);
      return ok(result, { imported: result.importedRows }, { status: 201 });
    }

    if (body.action === "mark_status") {
      if (!Array.isArray(body.transaction_ids) || body.transaction_ids.length === 0) {
        return fail(422, { code: "TRANSACTIONS_REQUIRED", message: "Select at least one transaction." });
      }

      const { data, error } = await auth.context.db
        .from("bank_transactions")
        .update({ status: body.status })
        .eq("org_id", auth.context.orgId)
        .eq("bank_account_id", body.bank_account_id)
        .in("id", body.transaction_ids)
        .select("id, status");

      if (error) {
        return fail(400, { code: "STATUS_UPDATE_FAILED", message: error.message });
      }

      return ok(data ?? []);
    }

    if (body.action === "reconcile") {
      const { data: rows, error: rowsError } = await auth.context.db
        .from("bank_transactions")
        .select("id, amount")
        .eq("org_id", auth.context.orgId)
        .eq("bank_account_id", body.bank_account_id)
        .gte("transaction_date", body.statement_start)
        .lte("transaction_date", body.statement_end)
        .neq("status", "ignored");

      if (rowsError) {
        return fail(400, { code: "RECONCILIATION_RANGE_FAILED", message: rowsError.message });
      }

      const bookBalance = Number((rows ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0).toFixed(2));
      const difference = Number((body.statement_balance - bookBalance).toFixed(2));

      const { data: reconciliation, error: reconciliationError } = await auth.context.db
        .from("reconciliations")
        .insert({
          org_id: auth.context.orgId,
          bank_account_id: body.bank_account_id,
          statement_start: body.statement_start,
          statement_end: body.statement_end,
          statement_balance: body.statement_balance,
          book_balance: bookBalance,
          difference,
          status: difference === 0 ? "completed" : "open",
          completed_by: difference === 0 ? auth.context.userId : null,
          completed_at: difference === 0 ? new Date().toISOString() : null
        })
        .select("id, statement_start, statement_end, statement_balance, book_balance, difference, status")
        .single();

      if (reconciliationError || !reconciliation) {
        return fail(400, { code: "RECONCILIATION_CREATE_FAILED", message: reconciliationError?.message ?? "Reconciliation could not be created." });
      }

      if ((rows ?? []).length > 0) {
        await auth.context.db
          .from("bank_transactions")
          .update({
            reconciliation_id: reconciliation.id,
            status: difference === 0 ? "reconciled" : "matched"
          })
          .eq("org_id", auth.context.orgId)
          .eq("bank_account_id", body.bank_account_id)
          .gte("transaction_date", body.statement_start)
          .lte("transaction_date", body.statement_end)
          .neq("status", "ignored");
      }

      await auth.context.db.from("audit_logs").insert({
        org_id: auth.context.orgId,
        user_id: auth.context.userId,
        entity_type: "reconciliation",
        entity_id: reconciliation.id,
        action: "create",
        new_values: {
          statement_start: body.statement_start,
          statement_end: body.statement_end,
          statement_balance: body.statement_balance,
          book_balance: bookBalance,
          difference
        }
      });

      return ok({
        ...reconciliation,
        reconciled_at: difference === 0 ? new Date().toISOString() : todayIso()
      });
    }

    return fail(405, { code: "METHOD_NOT_ALLOWED", message: "Unsupported reconciliation action." });
  } catch (error) {
    return fail(500, { code: "RECONCILIATION_FAILED", message: errorMessage(error) });
  }
}
