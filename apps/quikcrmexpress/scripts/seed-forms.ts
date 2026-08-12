/**
 * Step C — port the UAT FR-RE disposition form (published version 10) into the
 * monorepo, under ONE org. Faithful copy of UAT's call_disposition form set:
 * 1 set + 1 version + 3 tabs + 24 fields + 70 options + 3 rules(+conds+acts).
 *
 *   $env:DATABASE_URL="...quikit_rohit_db"; npx tsx scripts/seed-forms.ts <orgId>
 *
 * - Preserves UAT ids (local form tables are empty -> no collision -> internal
 *   FKs stay intact). Only transforms: FormSet.orgId -> <orgId>, and
 *   createdByUserId -> null on tabs/rules (UAT user ids don't exist locally).
 * - Single transaction; bails if a call_disposition set already exists for the org.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient, Prisma } from "@prisma/client";
const prisma = new PrismaClient({ log: ["error"] });

const ORG_ID = process.env.SEED_ORG_ID ?? process.argv[2];
if (!ORG_ID) {
  console.error("\u274c  orgId required. Usage: npx tsx scripts/seed-forms.ts <orgId>");
  process.exit(1);
}

const PAYLOAD = {
  "formSet": [
    {
      "id": "cmqs1nwjh00ul5y4r41y1358j",
      "tenantId": "cmpzc0bn70000a1xp642kgwmf",
      "surface": "call_disposition",
      "name": "Call Disposition Form",
      "isDefault": true,
      "isActive": true,
      "currentVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "createdAt": "2026-06-24T12:23:18.654Z",
      "updatedAt": "2026-08-06T09:30:59.131Z"
    }
  ],
  "version": [
    {
      "id": "cmshbbpv700xazz7wb7wi5r72",
      "formSetId": "cmqs1nwjh00ul5y4r41y1358j",
      "versionNumber": 10,
      "status": "published",
      "publishedAt": "2026-08-06T09:30:59.127Z",
      "createdAt": "2026-08-06T09:27:43.027Z",
      "updatedAt": "2026-08-06T09:30:59.129Z"
    }
  ],
  "tabs": [
    {
      "id": "cmshbbpvc00xczz7w2hnyqpw8",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "name": "Call Disposition",
      "sortOrder": 0,
      "visibility": "always",
      "isProtected": true,
      "createdByUserId": "cmpzc0bo9000da1xp5v9cb5yz",
      "createdAt": "2026-08-06T09:27:43.032Z",
      "updatedAt": "2026-08-06T09:27:43.032Z"
    },
    {
      "id": "cmshbbpve00xezz7w31v2dkgf",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "name": "Payment Form",
      "sortOrder": 2,
      "visibility": "rule_driven",
      "isProtected": false,
      "createdByUserId": "cmpzc0bo9000da1xp5v9cb5yz",
      "createdAt": "2026-08-06T09:27:43.034Z",
      "updatedAt": "2026-08-06T09:27:43.034Z"
    },
    {
      "id": "cmshbbpvg00xgzz7w1e8t6pnm",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "name": "Demo Schedule",
      "sortOrder": 3,
      "visibility": "rule_driven",
      "isProtected": false,
      "createdByUserId": "cmpzc0bo9000da1xp5v9cb5yz",
      "createdAt": "2026-08-06T09:27:43.036Z",
      "updatedAt": "2026-08-06T09:27:43.036Z"
    }
  ],
  "fields": [
    {
      "id": "cmshbbpvu00xizz7w39bi0os3",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "contact_stage",
      "label": "Contact Stage",
      "fieldType": "dropdown",
      "isProtected": true,
      "requiredLevel": "soft",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.050Z",
      "updatedAt": "2026-08-06T09:27:43.050Z",
      "formTabId": "cmshbbpvc00xczz7w2hnyqpw8",
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpw700xkzz7w0n5c1drj",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "status",
      "label": "Status",
      "fieldType": "dropdown",
      "isProtected": true,
      "requiredLevel": "hard",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.063Z",
      "updatedAt": "2026-08-06T09:27:43.063Z",
      "formTabId": "cmshbbpvc00xczz7w2hnyqpw8",
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpw900xmzz7wd4rt4skk",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "sub_stage",
      "label": "Sub-Stage",
      "fieldType": "dropdown",
      "isProtected": true,
      "requiredLevel": "soft",
      "sortOrder": 2,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.065Z",
      "updatedAt": "2026-08-06T09:27:43.065Z",
      "formTabId": "cmshbbpvc00xczz7w2hnyqpw8",
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpwg00xozz7wsxysl5fy",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "notes",
      "label": "Notes",
      "fieldType": "text",
      "isProtected": true,
      "requiredLevel": "soft",
      "sortOrder": 3,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.073Z",
      "updatedAt": "2026-08-06T09:27:43.073Z",
      "formTabId": "cmshbbpvc00xczz7w2hnyqpw8",
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpwn00xqzz7wm1z8ga26",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "business_type",
      "label": "business type",
      "fieldType": "dropdown",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 5,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.076Z",
      "updatedAt": "2026-08-06T09:27:43.076Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpwp00xszz7wbuzm79pl",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "amount_exluding_gst",
      "label": "Amount exluding GST",
      "fieldType": "number",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 6,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.082Z",
      "updatedAt": "2026-08-06T09:27:43.082Z",
      "formTabId": "cmshbbpve00xezz7w31v2dkgf",
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpwr00xuzz7w18vkoxkp",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "first_name",
      "label": "First name",
      "fieldType": "text",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 7,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.084Z",
      "updatedAt": "2026-08-06T09:27:43.084Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpww00xwzz7w8nuybesk",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "email",
      "label": "Email",
      "fieldType": "text",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 8,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.088Z",
      "updatedAt": "2026-08-06T09:27:43.088Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpwy00xyzz7wu0knm889",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "mobile_number",
      "label": "Mobile Number",
      "fieldType": "number",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 9,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.090Z",
      "updatedAt": "2026-08-06T09:27:43.090Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpx400y0zz7wlhodbbby",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "company_name",
      "label": "Company Name",
      "fieldType": "text",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 10,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.092Z",
      "updatedAt": "2026-08-06T09:27:43.092Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpxa00y2zz7w0jknqgvg",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "product_variant_info_1_plan_name",
      "label": "Product Variant Info 1 Plan Name",
      "fieldType": "dropdown",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 11,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.102Z",
      "updatedAt": "2026-08-06T09:27:43.102Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpxb00y4zz7wzh8lzj0d",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "product_variant_info_2_additional_feature",
      "label": "Product Variant Info 2 Additional Feature",
      "fieldType": "dropdown",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 12,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.104Z",
      "updatedAt": "2026-08-06T09:27:43.104Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpxd00y6zz7wxl92nya6",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "accounting_software",
      "label": "Accounting Software",
      "fieldType": "dropdown",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 13,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.105Z",
      "updatedAt": "2026-08-06T09:27:43.105Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpxi00y8zz7wgwfb9gyx",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "are_you_an_accountant_or_owner",
      "label": "Are you an Accountant or Owner",
      "fieldType": "dropdown",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 14,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.111Z",
      "updatedAt": "2026-08-06T09:27:43.111Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpxk00yazz7w6vumqgxv",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "how_many_customers_you_have",
      "label": "How many customers you have",
      "fieldType": "dropdown",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 15,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.113Z",
      "updatedAt": "2026-08-06T09:27:43.113Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpxr00yczz7wqbx6a3jf",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "tally_on_cloud_pitched",
      "label": "Tally on cloud pitched",
      "fieldType": "dropdown",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 16,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.119Z",
      "updatedAt": "2026-08-06T09:27:43.119Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpxt00yezz7wwqjs1axw",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "ewei_pitched",
      "label": "EWEI Pitched",
      "fieldType": "dropdown",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 17,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.121Z",
      "updatedAt": "2026-08-06T09:27:43.121Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpxz00ygzz7wlgjvppss",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "whatsapp_white_label",
      "label": "WhatsApp White Label",
      "fieldType": "dropdown",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 18,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.127Z",
      "updatedAt": "2026-08-06T09:27:43.127Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpy000yizz7wt7hmtort",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "loan_pitched",
      "label": "Loan Pitched",
      "fieldType": "dropdown",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 19,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.129Z",
      "updatedAt": "2026-08-06T09:27:43.129Z",
      "formTabId": null,
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpy600ykzz7wu2wyoo4s",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "demo_scheduled_by",
      "label": "Demo Scheduled By",
      "fieldType": "user_picker",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 20,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.134Z",
      "updatedAt": "2026-08-06T09:27:43.134Z",
      "formTabId": "cmshbbpvg00xgzz7w1e8t6pnm",
      "formSectionId": null,
      "userPickerMode": "single",
      "userPickerScope": "team",
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpy900ymzz7wpnpihzkb",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "demo_scheduled_on",
      "label": "Demo Scheduled On",
      "fieldType": "datetime",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 21,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.137Z",
      "updatedAt": "2026-08-06T09:27:43.137Z",
      "formTabId": "cmshbbpvg00xgzz7w1e8t6pnm",
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpye00yozz7w5gt6qq73",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "follow_up_date_and_time",
      "label": "Follow Up Date and Time",
      "fieldType": "datetime",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 22,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.143Z",
      "updatedAt": "2026-08-06T09:27:43.143Z",
      "formTabId": "cmshbbpvg00xgzz7w1e8t6pnm",
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbbpyg00yqzz7w5v1hvyur",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "demo_date_time",
      "label": "Demo Date Time",
      "fieldType": "datetime",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 23,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.145Z",
      "updatedAt": "2026-08-06T09:27:43.145Z",
      "formTabId": "cmshbbpvg00xgzz7w1e8t6pnm",
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    },
    {
      "id": "cmshbfhgk012yzz7w9j4fq9uu",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "tab": "call_disposition",
      "fieldKey": "integration_of_tally_or_busy",
      "label": "Integration of Tally or Busy",
      "fieldType": "dropdown",
      "isProtected": false,
      "requiredLevel": "soft",
      "sortOrder": 24,
      "isActive": true,
      "createdAt": "2026-08-06T09:30:38.756Z",
      "updatedAt": "2026-08-06T09:30:38.756Z",
      "formTabId": "cmshbbpvg00xgzz7w1e8t6pnm",
      "formSectionId": null,
      "userPickerMode": null,
      "userPickerScope": null,
      "defaultVisibility": "visible"
    }
  ],
  "options": [
    {
      "id": "cmshbbpyv00yszz7wt58d7zwj",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_payment_done_gold_1_year",
      "label": "Yes-Payment Done Gold 1 year",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.159Z",
      "updatedAt": "2026-08-06T09:27:43.159Z"
    },
    {
      "id": "cmshbbpyx00yuzz7w3pnddfrr",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "not_connected",
      "label": "Not Connected",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.161Z",
      "updatedAt": "2026-08-06T09:27:43.161Z"
    },
    {
      "id": "cmshbbpz300ywzz7wqz0pnu5j",
      "formFieldId": "cmshbbpxd00y6zz7wxl92nya6",
      "valueKey": "tally",
      "label": "Tally",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.167Z",
      "updatedAt": "2026-08-06T09:27:43.167Z"
    },
    {
      "id": "cmshbbpz500yyzz7wehn8lxld",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "not_connected",
      "label": "Not Connected",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.169Z",
      "updatedAt": "2026-08-06T09:27:43.169Z"
    },
    {
      "id": "cmshbbpza00z0zz7ww20xz3fz",
      "formFieldId": "cmshbbpxa00y2zz7w0jknqgvg",
      "valueKey": "lite",
      "label": "Lite",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.174Z",
      "updatedAt": "2026-08-06T09:27:43.174Z"
    },
    {
      "id": "cmshbbpzb00z2zz7w2y977u04",
      "formFieldId": "cmshbbpy000yizz7wt7hmtort",
      "valueKey": "yes",
      "label": "Yes",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.175Z",
      "updatedAt": "2026-08-06T09:27:43.175Z"
    },
    {
      "id": "cmshbbpzc00z4zz7w236rs9gc",
      "formFieldId": "cmshbbpwn00xqzz7wm1z8ga26",
      "valueKey": "manufucturing",
      "label": "manufucturing",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.177Z",
      "updatedAt": "2026-08-06T09:27:43.177Z"
    },
    {
      "id": "cmshbbpzi00z6zz7wdr1x1s0q",
      "formFieldId": "cmshbbpxi00y8zz7wgwfb9gyx",
      "valueKey": "owner",
      "label": "Owner",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.182Z",
      "updatedAt": "2026-08-06T09:27:43.182Z"
    },
    {
      "id": "cmshbbpzj00z8zz7wu31x7tbc",
      "formFieldId": "cmshbbpxb00y4zz7wzh8lzj0d",
      "valueKey": "1_year",
      "label": "1 Year",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.183Z",
      "updatedAt": "2026-08-06T09:27:43.183Z"
    },
    {
      "id": "cmshbbpzl00zazz7wihvqt4nf",
      "formFieldId": "cmshbbpxk00yazz7w6vumqgxv",
      "valueKey": "30",
      "label": "<30",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.185Z",
      "updatedAt": "2026-08-06T09:27:43.185Z"
    },
    {
      "id": "cmshbbpzm00zczz7wnhc3t8w7",
      "formFieldId": "cmshbbpxb00y4zz7wzh8lzj0d",
      "valueKey": "2_year",
      "label": "2 Year",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.186Z",
      "updatedAt": "2026-08-06T09:27:43.186Z"
    },
    {
      "id": "cmshbbpzn00zezz7wawk33901",
      "formFieldId": "cmshbbpxa00y2zz7w0jknqgvg",
      "valueKey": "saver",
      "label": "Saver",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.187Z",
      "updatedAt": "2026-08-06T09:27:43.187Z"
    },
    {
      "id": "cmshbbpzo00zgzz7wrkcd8ooz",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_discussion_pending",
      "label": "Yes-Discussion Pending",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.189Z",
      "updatedAt": "2026-08-06T09:27:43.189Z"
    },
    {
      "id": "cmshbbpzq00zizz7w5ygz05l6",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_discussion_pending",
      "label": "Yes-Discussion Pending",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.190Z",
      "updatedAt": "2026-08-06T09:27:43.190Z"
    },
    {
      "id": "cmshbbpzr00zkzz7wnor2lz8i",
      "formFieldId": "cmshbbpwn00xqzz7wm1z8ga26",
      "valueKey": "trading",
      "label": "trading",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.191Z",
      "updatedAt": "2026-08-06T09:27:43.191Z"
    },
    {
      "id": "cmshbbpzu00zmzz7w6r40hide",
      "formFieldId": "cmshbbpy000yizz7wt7hmtort",
      "valueKey": "no",
      "label": "No",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.194Z",
      "updatedAt": "2026-08-06T09:27:43.194Z"
    },
    {
      "id": "cmshbbpzw00zozz7wz1c1qw6u",
      "formFieldId": "cmshbbpxk00yazz7w6vumqgxv",
      "valueKey": "30_and_60",
      "label": ">30 and <60",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.196Z",
      "updatedAt": "2026-08-06T09:27:43.196Z"
    },
    {
      "id": "cmshbbpzx00zqzz7wwmhl9viy",
      "formFieldId": "cmshbbpxd00y6zz7wxl92nya6",
      "valueKey": "busy",
      "label": "Busy",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.197Z",
      "updatedAt": "2026-08-06T09:27:43.197Z"
    },
    {
      "id": "cmshbbpzy00zszz7wz1ih2kbx",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_payment_done_silver_1_year",
      "label": "Yes-Payment Done Silver 1 year",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.199Z",
      "updatedAt": "2026-08-06T09:27:43.199Z"
    },
    {
      "id": "cmshbbq0300zuzz7wavvriw97",
      "formFieldId": "cmshbbpxi00y8zz7wgwfb9gyx",
      "valueKey": "accountant",
      "label": "Accountant",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.204Z",
      "updatedAt": "2026-08-06T09:27:43.204Z"
    },
    {
      "id": "cmshbbq0b00zwzz7wunpi1qjv",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_interested_followup",
      "label": "Yes-Interested Followup",
      "sortOrder": 2,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.212Z",
      "updatedAt": "2026-08-06T09:27:43.212Z"
    },
    {
      "id": "cmshbbq0d00zyzz7wf6004oov",
      "formFieldId": "cmshbbpxa00y2zz7w0jknqgvg",
      "valueKey": "best_value_pack",
      "label": "Best Value Pack",
      "sortOrder": 2,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.213Z",
      "updatedAt": "2026-08-06T09:27:43.213Z"
    },
    {
      "id": "cmshbbq0j0100zz7w59hypc40",
      "formFieldId": "cmshbbpxb00y4zz7wzh8lzj0d",
      "valueKey": "4_year",
      "label": "4 Year",
      "sortOrder": 2,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.219Z",
      "updatedAt": "2026-08-06T09:27:43.219Z"
    },
    {
      "id": "cmshbbq0l0102zz7wbndx160y",
      "formFieldId": "cmshbbpxd00y6zz7wxl92nya6",
      "valueKey": "marg",
      "label": "Marg",
      "sortOrder": 2,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.221Z",
      "updatedAt": "2026-08-06T09:27:43.221Z"
    },
    {
      "id": "cmshbbq0m0104zz7wcmephab0",
      "formFieldId": "cmshbbpxk00yazz7w6vumqgxv",
      "valueKey": "60",
      "label": ">60",
      "sortOrder": 2,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.222Z",
      "updatedAt": "2026-08-06T09:27:43.222Z"
    },
    {
      "id": "cmshbbq0n0106zz7wcbqt6fch",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_interested_followup",
      "label": "Yes-Interested Followup",
      "sortOrder": 2,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.224Z",
      "updatedAt": "2026-08-06T09:27:43.224Z"
    },
    {
      "id": "cmshbbq0p0108zz7wuieb9d0z",
      "formFieldId": "cmshbbpwn00xqzz7wm1z8ga26",
      "valueKey": "sales",
      "label": "sales",
      "sortOrder": 2,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.225Z",
      "updatedAt": "2026-08-06T09:27:43.225Z"
    },
    {
      "id": "cmshbbq0q010azz7wa85ytzs6",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_payment_done_platinum_1_year",
      "label": "Yes-Payment Done Platinum 1 Year",
      "sortOrder": 2,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.226Z",
      "updatedAt": "2026-08-06T09:27:43.226Z"
    },
    {
      "id": "cmshbbq0r010czz7w6o3ejniw",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_payment_done_gold_2_year",
      "label": "Yes-Payment Done Gold 2 year",
      "sortOrder": 3,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.227Z",
      "updatedAt": "2026-08-06T09:27:43.227Z"
    },
    {
      "id": "cmshbbq0s010ezz7wuyuql8ha",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_demo_scheduled",
      "label": "Yes-Demo Scheduled",
      "sortOrder": 3,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.228Z",
      "updatedAt": "2026-08-06T09:27:43.228Z"
    },
    {
      "id": "cmshbbq0x010gzz7wi9si630a",
      "formFieldId": "cmshbbpxd00y6zz7wxl92nya6",
      "valueKey": "others",
      "label": "Others",
      "sortOrder": 3,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.234Z",
      "updatedAt": "2026-08-06T09:27:43.234Z"
    },
    {
      "id": "cmshbbq0y010izz7wsi88rz6b",
      "formFieldId": "cmshbbpxa00y2zz7w0jknqgvg",
      "valueKey": "basic",
      "label": "Basic",
      "sortOrder": 3,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.235Z",
      "updatedAt": "2026-08-06T09:27:43.235Z"
    },
    {
      "id": "cmshbbq0z010kzz7wmaohs6n9",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_demo_scheduled",
      "label": "Yes-Demo Scheduled",
      "sortOrder": 3,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.236Z",
      "updatedAt": "2026-08-06T09:27:43.236Z"
    },
    {
      "id": "cmshbbq15010mzz7wthrugpiy",
      "formFieldId": "cmshbbpxd00y6zz7wxl92nya6",
      "valueKey": "other",
      "label": "Other",
      "sortOrder": 4,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.241Z",
      "updatedAt": "2026-08-06T09:27:43.241Z"
    },
    {
      "id": "cmshbbq16010ozz7wtntuhxfn",
      "formFieldId": "cmshbbpxa00y2zz7w0jknqgvg",
      "valueKey": "pro",
      "label": "Pro",
      "sortOrder": 4,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.242Z",
      "updatedAt": "2026-08-06T09:27:43.242Z"
    },
    {
      "id": "cmshbbq17010qzz7wodms6s8r",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_demo_done",
      "label": "Yes-Demo Done",
      "sortOrder": 4,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.243Z",
      "updatedAt": "2026-08-06T09:27:43.243Z"
    },
    {
      "id": "cmshbbq18010szz7w81j916eu",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_demo_done",
      "label": "Yes-Demo Done",
      "sortOrder": 4,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.244Z",
      "updatedAt": "2026-08-06T09:27:43.244Z"
    },
    {
      "id": "cmshbbq1a010uzz7w12n21zcz",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_payment_done_silver_2_year",
      "label": "Yes-Payment Done Silver 2 year",
      "sortOrder": 4,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.246Z",
      "updatedAt": "2026-08-06T09:27:43.246Z"
    },
    {
      "id": "cmshbbq1b010wzz7w4xphliz3",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_payment_done_platinum_2_year",
      "label": "Yes-Payment Done Platinum 2 Year",
      "sortOrder": 5,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.248Z",
      "updatedAt": "2026-08-06T09:27:43.248Z"
    },
    {
      "id": "cmshbbq1d010yzz7w7vz2d7k3",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_negotiation",
      "label": "Yes-Negotiation",
      "sortOrder": 5,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.249Z",
      "updatedAt": "2026-08-06T09:27:43.249Z"
    },
    {
      "id": "cmshbbq1e0110zz7wwzarvexx",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_negotiation",
      "label": "Yes-Negotiation",
      "sortOrder": 5,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.250Z",
      "updatedAt": "2026-08-06T09:27:43.250Z"
    },
    {
      "id": "cmshbbq1f0112zz7wf6ol03o4",
      "formFieldId": "cmshbbpxa00y2zz7w0jknqgvg",
      "valueKey": "premium",
      "label": "Premium",
      "sortOrder": 5,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.251Z",
      "updatedAt": "2026-08-06T09:27:43.251Z"
    },
    {
      "id": "cmshbbq1g0114zz7w3856hzf1",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_payment_done",
      "label": "Yes-Payment Done",
      "sortOrder": 6,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.252Z",
      "updatedAt": "2026-08-06T09:27:43.252Z"
    },
    {
      "id": "cmshbbq1h0116zz7wb0w30x4d",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_payment_done",
      "label": "Yes-Payment Done",
      "sortOrder": 6,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.254Z",
      "updatedAt": "2026-08-06T09:27:43.254Z"
    },
    {
      "id": "cmshbbq1i0118zz7wh58rjkc5",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_payment_done_gold_4_year",
      "label": "Yes-Payment Done Gold 4 year",
      "sortOrder": 6,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.255Z",
      "updatedAt": "2026-08-06T09:27:43.255Z"
    },
    {
      "id": "cmshbbq1l011azz7wakneb7nu",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_payment_done_platinum_4_year",
      "label": "Yes-Payment Done Platinum 4 Year",
      "sortOrder": 7,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.257Z",
      "updatedAt": "2026-08-06T09:27:43.257Z"
    },
    {
      "id": "cmshbbq1m011czz7wh810eqzt",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_ni_storage_issue",
      "label": "Yes-NI Storage Issue",
      "sortOrder": 7,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.259Z",
      "updatedAt": "2026-08-06T09:27:43.259Z"
    },
    {
      "id": "cmshbbq1o011ezz7w0yh82by8",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_ni_storage_issue",
      "label": "Yes-NI Storage Issue",
      "sortOrder": 7,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.260Z",
      "updatedAt": "2026-08-06T09:27:43.260Z"
    },
    {
      "id": "cmshbbq1t011gzz7w29qelqc1",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_system_not_compatible",
      "label": "Yes-System not Compatible",
      "sortOrder": 8,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.265Z",
      "updatedAt": "2026-08-06T09:27:43.265Z"
    },
    {
      "id": "cmshbbq1u011izz7wi9ni8vci",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_system_not_compatible",
      "label": "Yes-System not Compatible",
      "sortOrder": 8,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.266Z",
      "updatedAt": "2026-08-06T09:27:43.266Z"
    },
    {
      "id": "cmshbbq1z011kzz7w78sum2pt",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_payment_done_silver_4_year",
      "label": "Yes-Payment Done Silver 4 year",
      "sortOrder": 8,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.271Z",
      "updatedAt": "2026-08-06T09:27:43.271Z"
    },
    {
      "id": "cmshbbq20011mzz7wav0y8gi9",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_service_issue",
      "label": "Yes-Service Issue",
      "sortOrder": 9,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.273Z",
      "updatedAt": "2026-08-06T09:27:43.273Z"
    },
    {
      "id": "cmshbbq26011ozz7wqdyal3zu",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_service_issue",
      "label": "Yes-Service Issue",
      "sortOrder": 9,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.275Z",
      "updatedAt": "2026-08-06T09:27:43.275Z"
    },
    {
      "id": "cmshbbq27011qzz7wp6n0avtm",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "not_connected",
      "label": "Not Connected",
      "sortOrder": 9,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.280Z",
      "updatedAt": "2026-08-06T09:27:43.280Z"
    },
    {
      "id": "cmshbbq29011szz7wj1ycznft",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_ni_data_security_issue",
      "label": "Yes-NI Data security Issue",
      "sortOrder": 10,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.281Z",
      "updatedAt": "2026-08-06T09:27:43.281Z"
    },
    {
      "id": "cmshbbq2e011uzz7wx16xfk11",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_ni_data_security_issue",
      "label": "Yes-NI Data security Issue",
      "sortOrder": 10,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.286Z",
      "updatedAt": "2026-08-06T09:27:43.286Z"
    },
    {
      "id": "cmshbbq2f011wzz7wum4jjbvk",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_interested_follow_up",
      "label": "Yes-Interested Follow up",
      "sortOrder": 10,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.287Z",
      "updatedAt": "2026-08-06T09:27:43.287Z"
    },
    {
      "id": "cmshbbq2g011yzz7w9l9osf4c",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_demo_done",
      "label": "Yes-Demo Done",
      "sortOrder": 11,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.288Z",
      "updatedAt": "2026-08-06T09:27:43.288Z"
    },
    {
      "id": "cmshbbq2l0120zz7w2o9oauxf",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_ni_need_field_demo",
      "label": "Yes-NI Need field Demo",
      "sortOrder": 11,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.293Z",
      "updatedAt": "2026-08-06T09:27:43.293Z"
    },
    {
      "id": "cmshbbq2m0122zz7wg0svtbak",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_ni_need_field_demo",
      "label": "Yes-NI Need field Demo",
      "sortOrder": 11,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.294Z",
      "updatedAt": "2026-08-06T09:27:43.294Z"
    },
    {
      "id": "cmshbbq2n0124zz7w7431antt",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_ni_less_turnover",
      "label": "Yes-NI Less Turnover",
      "sortOrder": 12,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.296Z",
      "updatedAt": "2026-08-06T09:27:43.296Z"
    },
    {
      "id": "cmshbbq2s0126zz7wwye7vvel",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_demo_scheduled",
      "label": "Yes-Demo Scheduled",
      "sortOrder": 12,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.301Z",
      "updatedAt": "2026-08-06T09:27:43.301Z"
    },
    {
      "id": "cmshbbq2u0128zz7wacoke27t",
      "formFieldId": "cmshbbpxr00yczz7wqbx6a3jf",
      "valueKey": "yes_no_need",
      "label": "Yes-No Need",
      "sortOrder": 12,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.302Z",
      "updatedAt": "2026-08-06T09:27:43.302Z"
    },
    {
      "id": "cmshbbq2z012azz7wqtsd9x4r",
      "formFieldId": "cmshbbpxt00yezz7wwqjs1axw",
      "valueKey": "yes_no_need",
      "label": "Yes-No Need",
      "sortOrder": 13,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.307Z",
      "updatedAt": "2026-08-06T09:27:43.307Z"
    },
    {
      "id": "cmshbbq30012czz7wmrqkr4ip",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_negotiation",
      "label": "Yes-Negotiation",
      "sortOrder": 13,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.308Z",
      "updatedAt": "2026-08-06T09:27:43.308Z"
    },
    {
      "id": "cmshbbq31012ezz7we68u8941",
      "formFieldId": "cmshbbpxz00ygzz7wlgjvppss",
      "valueKey": "yes_no_need",
      "label": "Yes-No Need",
      "sortOrder": 14,
      "isActive": true,
      "createdAt": "2026-08-06T09:27:43.310Z",
      "updatedAt": "2026-08-06T09:27:43.310Z"
    },
    {
      "id": "cmshbfhgw012zzz7wde44k9xn",
      "formFieldId": "cmshbfhgk012yzz7w9j4fq9uu",
      "valueKey": "using_tally_busy_plugins",
      "label": "Using Tally/Busy Plugins",
      "sortOrder": 0,
      "isActive": true,
      "createdAt": "2026-08-06T09:30:38.769Z",
      "updatedAt": "2026-08-06T09:30:38.769Z"
    },
    {
      "id": "cmshbfhgw0130zz7wi1bbf5nq",
      "formFieldId": "cmshbfhgk012yzz7w9j4fq9uu",
      "valueKey": "existing_biz_user",
      "label": "Existing Biz user",
      "sortOrder": 1,
      "isActive": true,
      "createdAt": "2026-08-06T09:30:38.769Z",
      "updatedAt": "2026-08-06T09:30:38.769Z"
    },
    {
      "id": "cmshbfhgw0131zz7wkxntp9qt",
      "formFieldId": "cmshbfhgk012yzz7w9j4fq9uu",
      "valueKey": "knows_about_biz",
      "label": "Knows about Biz",
      "sortOrder": 2,
      "isActive": true,
      "createdAt": "2026-08-06T09:30:38.769Z",
      "updatedAt": "2026-08-06T09:30:38.769Z"
    },
    {
      "id": "cmshbfhgx0132zz7w6sy5vmki",
      "formFieldId": "cmshbfhgk012yzz7w9j4fq9uu",
      "valueKey": "no_integrations_so_far",
      "label": "No Integrations so far",
      "sortOrder": 3,
      "isActive": true,
      "createdAt": "2026-08-06T09:30:38.769Z",
      "updatedAt": "2026-08-06T09:30:38.769Z"
    }
  ],
  "rules": [
    {
      "id": "cmshbbq39012gzz7wl2ly3iti",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "name": "test",
      "matchType": "all",
      "sortOrder": 0,
      "isActive": true,
      "createdByUserId": "cmpzc0bo9000da1xp5v9cb5yz",
      "createdAt": "2026-08-06T09:27:43.317Z",
      "updatedAt": "2026-08-06T09:27:43.317Z"
    },
    {
      "id": "cmshbbq3e012izz7wzarngy2q",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "name": "test 2",
      "matchType": "all",
      "sortOrder": 1,
      "isActive": true,
      "createdByUserId": "cmpzc0bo9000da1xp5v9cb5yz",
      "createdAt": "2026-08-06T09:27:43.323Z",
      "updatedAt": "2026-08-06T09:27:43.323Z"
    },
    {
      "id": "cmshbbq3g012kzz7wjywj5hn1",
      "formSetVersionId": "cmshbbpv700xazz7wb7wi5r72",
      "name": "Demo Schedule",
      "matchType": "all",
      "sortOrder": 2,
      "isActive": true,
      "createdByUserId": "cmpzc0bo9000da1xp5v9cb5yz",
      "createdAt": "2026-08-06T09:27:43.324Z",
      "updatedAt": "2026-08-06T09:27:43.324Z"
    }
  ],
  "conds": [
    {
      "id": "cmshbbq3n012mzz7wop5rh27d",
      "formRuleId": "cmshbbq39012gzz7wl2ly3iti",
      "subjectKind": "status",
      "subjectFieldKey": null,
      "operator": "is",
      "valueKeys": [
        "Interested Followup Counselling"
      ],
      "sortOrder": 0,
      "createdAt": "2026-08-06T09:27:43.331Z",
      "updatedAt": "2026-08-06T09:27:43.331Z"
    },
    {
      "id": "cmshbbq3s012ozz7wfuk92c4u",
      "formRuleId": "cmshbbq3e012izz7wzarngy2q",
      "subjectKind": "status",
      "subjectFieldKey": null,
      "operator": "is",
      "valueKeys": [
        "Negotiation"
      ],
      "sortOrder": 0,
      "createdAt": "2026-08-06T09:27:43.337Z",
      "updatedAt": "2026-08-06T09:27:43.337Z"
    },
    {
      "id": "cmshbbq3u012qzz7w4zw0jz9l",
      "formRuleId": "cmshbbq3g012kzz7wjywj5hn1",
      "subjectKind": "status",
      "subjectFieldKey": null,
      "operator": "is",
      "valueKeys": [
        "Demo Scheduled"
      ],
      "sortOrder": 0,
      "createdAt": "2026-08-06T09:27:43.338Z",
      "updatedAt": "2026-08-06T09:27:43.338Z"
    }
  ],
  "acts": [
    {
      "id": "cmshbbq41012szz7wt7bmrlrr",
      "formRuleId": "cmshbbq39012gzz7wl2ly3iti",
      "actionType": "show_tab",
      "targetKind": "tab",
      "targetFieldKey": null,
      "targetTabId": "cmshbbpve00xezz7w31v2dkgf",
      "setStatusId": null,
      "setSubStatusId": null,
      "sortOrder": 0,
      "createdAt": "2026-08-06T09:27:43.345Z",
      "updatedAt": "2026-08-06T09:27:43.345Z"
    },
    {
      "id": "cmshbbq47012uzz7wslz0bany",
      "formRuleId": "cmshbbq3e012izz7wzarngy2q",
      "actionType": "set_stage",
      "targetKind": "stage",
      "targetFieldKey": null,
      "targetTabId": null,
      "setStatusId": "Negotiation",
      "setSubStatusId": null,
      "sortOrder": 0,
      "createdAt": "2026-08-06T09:27:43.351Z",
      "updatedAt": "2026-08-06T09:27:43.351Z"
    },
    {
      "id": "cmshbbq48012wzz7wmnqnkb1a",
      "formRuleId": "cmshbbq3g012kzz7wjywj5hn1",
      "actionType": "show_tab",
      "targetKind": "tab",
      "targetFieldKey": null,
      "targetTabId": "cmshbbpvg00xgzz7w1e8t6pnm",
      "setStatusId": null,
      "setSubStatusId": null,
      "sortOrder": 0,
      "createdAt": "2026-08-06T09:27:43.353Z",
      "updatedAt": "2026-08-06T09:27:43.353Z"
    }
  ]
} as const;

async function main() {
  const set = PAYLOAD.formSet[0];
  const ver = PAYLOAD.version[0];

  const existing = await prisma.qceFormSet.findFirst({
    where: { orgId: ORG_ID, surface: "call_disposition" },
    select: { id: true },
  });
  if (existing) {
    console.error(`\u26a0\ufe0f  A call_disposition form set already exists for this org (${existing.id}). Aborting to avoid duplicates.`);
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    // 1. form set (currentVersionId null first — avoids the set<->version circular FK)
    await tx.qceFormSet.create({
      data: {
        id: set.id, orgId: ORG_ID, surface: set.surface, name: set.name,
        isDefault: set.isDefault, isActive: set.isActive, currentVersionId: null,
      },
    });
    // 2. version
    await tx.qceFormSetVersion.create({
      data: {
        id: ver.id, formSetId: ver.formSetId, versionNumber: ver.versionNumber,
        status: ver.status, publishedAt: ver.publishedAt ? new Date(ver.publishedAt) : null,
      },
    });
    // 3. point the set at the version
    await tx.qceFormSet.update({ where: { id: set.id }, data: { currentVersionId: ver.id } });
    // 4. tabs (createdByUserId nulled)
    for (const t of PAYLOAD.tabs) {
      await tx.qceFormTab.create({
        data: {
          id: t.id, formSetVersionId: t.formSetVersionId, name: t.name, sortOrder: t.sortOrder,
          visibility: t.visibility, isProtected: t.isProtected, createdByUserId: null,
        },
      });
    }
    // 5. fields
    for (const f of PAYLOAD.fields) {
      await tx.qceFormField.create({
        data: {
          id: f.id, formSetVersionId: f.formSetVersionId, tab: f.tab,
          formTabId: f.formTabId ?? null, formSectionId: f.formSectionId ?? null,
          fieldKey: f.fieldKey, label: f.label, fieldType: f.fieldType,
          requiredLevel: f.requiredLevel, sortOrder: f.sortOrder, isProtected: f.isProtected,
          defaultVisibility: f.defaultVisibility, isActive: f.isActive,
          userPickerMode: f.userPickerMode ?? null, userPickerScope: f.userPickerScope ?? null,
        },
      });
    }
    // 6. field options
    for (const o of PAYLOAD.options) {
      await tx.qceFormFieldOption.create({
        data: { id: o.id, formFieldId: o.formFieldId, valueKey: o.valueKey, label: o.label, sortOrder: o.sortOrder },
      });
    }
    // 7. rules (createdByUserId nulled)
    for (const r of PAYLOAD.rules) {
      await tx.qceFormRule.create({
        data: {
          id: r.id, formSetVersionId: r.formSetVersionId, name: r.name, matchType: r.matchType,
          sortOrder: r.sortOrder, isActive: r.isActive, createdByUserId: null,
        },
      });
    }
    // 8. conditions
    for (const c of PAYLOAD.conds) {
      await tx.qceFormRuleCondition.create({
        data: {
          id: c.id, formRuleId: c.formRuleId, subjectKind: c.subjectKind,
          subjectFieldKey: c.subjectFieldKey ?? null, operator: c.operator,
          valueKeys: (c.valueKeys ?? undefined) as Prisma.InputJsonValue ?? Prisma.DbNull,
          sortOrder: c.sortOrder,
        },
      });
    }
    // 9. actions
    for (const a of PAYLOAD.acts) {
      await tx.qceFormRuleAction.create({
        data: {
          id: a.id, formRuleId: a.formRuleId, actionType: a.actionType, targetKind: a.targetKind,
          targetFieldKey: a.targetFieldKey ?? null, targetTabId: a.targetTabId ?? null,
          setStatusId: a.setStatusId ?? null, setSubStatusId: a.setSubStatusId ?? null,
          sortOrder: a.sortOrder,
        },
      });
    }
  }, { timeout: 30_000 });

  console.log("\u2705  Ported call_disposition form for org", ORG_ID);
  console.log(`   set=${set.id} version=${ver.id} (v${ver.versionNumber}, ${ver.status})`);
  console.log(`   tabs=${PAYLOAD.tabs.length} fields=${PAYLOAD.fields.length} options=${PAYLOAD.options.length} rules=${PAYLOAD.rules.length}`);
  console.log("   Restart the app to pick it up.");
}

main()
  .catch((e: unknown) => { console.error("\u274c  failed:", e instanceof Error ? e.message : e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });