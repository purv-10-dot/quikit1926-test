import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import {
  createCustomProductField,
  listProductFields,
  ProductFieldDefError,
} from "@/lib/services/products/fields/repo";
import { fieldDefinitionCreateSchema } from "@/lib/validators/field-definition";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const customOnly = new URL(req.url).searchParams.get("customOnly") === "true";
    const items = await listProductFields(user.tenantId);
    return NextResponse.json({
      items: customOnly ? items.filter((f) => !f.isStandard) : items,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const parsed = fieldDefinitionCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid field definition", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const created = await createCustomProductField(user.tenantId, {
      ...parsed.data,
      isStandard: false,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof ProductFieldDefError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
