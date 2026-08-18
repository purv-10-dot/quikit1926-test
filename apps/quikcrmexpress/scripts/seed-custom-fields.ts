/**
 * seed-custom-fields.ts
 *
 * One-time seed of the client's custom lead fields into a target org's
 * QceOrgWorkspaceSettings.settings.leadFieldDefinitions.
 *
 * WHAT / WHY:
 *   - Source of truth: the client's "Lead Field Names & Data Type" requirement
 *     sheet (union of the All-Lead-Fields + Most-Used blocks), classified into
 *     CUSTOM-SEED / MAP-TO-STANDARD / MEDIA. Only CUSTOM-SEED + MEDIA are seeded
 *     here (193 fields). MAP-TO-STANDARD fields are NOT seeded — they map to real
 *     standard columns (email, stage, status, leadQuality, country, …) and the
 *     repo would (correctly) reject a custom field colliding with a standard key.
 *   - Types are taken VERBATIM from the sheet (client chose them deliberately).
 *     All date variants -> CrmExpress "Date". Media fields (Payment Proof, etc.) ->
 *     "Text" (no File type yet; real upload is a post-launch enhancement).
 *   - Advanced filters work on this data post-import because the bulk importer
 *     coerces each value to its declared type (Number->numeric, Date->ISO, Select
 *     option-checked) via validateDynamicFields.
 *
 * SAFETY:
 *   - Routed through the REAL createCustomField() from lib/services/fields/repo,
 *     so it uses the exact same validation + storage path as the settings UI:
 *     key regex, standard-key-collision guard, duplicate guard, isStandard:false.
 *   - IDEMPOTENT: a field whose key already exists is skipped (not duplicated,
 *     not errored). Safe to re-run.
 *   - READ-MODIFY-WRITE per field via the repo, which appends to
 *     leadFieldDefinitions and preserves leadPipelineConfig (the cascade/pipeline
 *     already seeded on the same settings row is never clobbered).
 *   - DRY-RUN by default. Prints exactly what it WOULD create (and any skips /
 *     collisions). Pass --commit to actually write.
 *
 * USAGE (from apps/quikcrmexpress) — targets whatever DB your .env.local points at:
 *   # dry run — see what would happen, writes NOTHING:
 *   npx tsx scripts/seed-custom-fields.ts --org <ORG_ID>
 *   # commit — actually seed:
 *   npx tsx scripts/seed-custom-fields.ts --org <ORG_ID> --commit
 *
 *   Local dev org (MoreYeahs, DB quikit_rohit_db): --org cmpgz253x00019660d7d4qkzq
 *
 *   DB-target note: packages/database/.env can OVERRIDE apps/quikcrmexpress/.env.local
 *   (the override trap hit earlier this project). If the run targets the wrong DB,
 *   pin it for the command:
 *     $env:DATABASE_URL="<the DB url you intend>"; npx tsx scripts/seed-custom-fields.ts --org <ORG_ID> --commit
 *   For any DB other than local dev, verify the org id against that DB first:
 *     SELECT id, name FROM quikit."Org" WHERE id = '<ORG_ID>';
 *
 * The org id is never hardcoded — always passed via --org.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import type { LeadFieldDefinition } from "../types/field-definition";

const FIELDS = [
  { "key": "account_type_id", "label": "Account Type Id", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "account_id", "label": "Account Id", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "is_primary_contact", "label": "Is Primary Contact", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "account_owner_id", "label": "Account Owner Id", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "prospect_id", "label": "Prospect ID", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "lead_number", "label": "Lead Number", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "source_referrer", "label": "Source Referrer", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "last_notable_activity", "label": "Last Notable Activity", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "last_notable_activity_date", "label": "Last Notable Activity Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "last_visit_date", "label": "Last Visit Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "related_landing_page_id", "label": "Related Landing Page Id", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "first_landing_page_submission_id", "label": "First Landing Page Submission Id", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "first_landing_page_submission_date", "label": "First Landing Page Submission Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "last_activity", "label": "Last Activity", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "last_activity_date", "label": "Last Activity Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "first_activity_date", "label": "First Activity Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "web_referrer", "label": "Web Referrer", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "web_referrer_keyword", "label": "Web Referrer Keyword", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "recently_modified_on", "label": "Recently Modified On", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "conversion_referrer_url", "label": "Conversion Referrer URL", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "source_referrer_url", "label": "Source Referrer URL", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "source_ip_address", "label": "Source IP Address", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "latitude", "label": "Latitude", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "longitude", "label": "Longitude", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "do_not_email", "label": "Do Not Email", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "do_not_track", "label": "Do Not Track", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "do_not_sms", "label": "Do Not SMS", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "do_not_call", "label": "Do Not Call", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "alternative_phone_number", "label": "Alternative phone number", "fieldType": "Phone", "requirement": "Optional", "visible": true },
  { "key": "source_campaign", "label": "Source Campaign", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "source_medium", "label": "Source Medium", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "source_content", "label": "Source Content", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "engagement_score", "label": "Engagement Score", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "order_value", "label": "Order Value", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "created_by", "label": "Created By", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "created_on", "label": "Created On", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "prospect_creation_date", "label": "Prospect Creation Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "modified_by", "label": "Modified By", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "modified_on", "label": "Modified On", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "time_zone", "label": "Time Zone", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "totalvisits", "label": "TotalVisits", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "page_views_per_visit", "label": "Page Views Per Visit", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "average_time_per_visit", "label": "Average Time Per Visit", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "address_1", "label": "Address 1", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "address_2", "label": "Address 2", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "zip", "label": "Zip", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "owner_email", "label": "Owner Email", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "account", "label": "Account", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "account_type", "label": "Account Type", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "account_type_plural_name", "label": "Account Type Plural Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "lead_origin", "label": "Lead Origin", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "mailing_preferences", "label": "Mailing Preferences", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "twitter", "label": "Twitter", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "photo_url", "label": "Photo Url", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "facebook", "label": "Facebook", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "linkedin", "label": "LinkedIn", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "skype_name", "label": "Skype Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "gtalk_user", "label": "Gtalk User", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "google_plus", "label": "Google Plus", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "current_opt_in_status", "label": "Current Opt In Status", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "opt_in_date", "label": "Opt In Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "opt_in_details", "label": "Opt In Details", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "last_opt_in_email_sent_date", "label": "Last Opt In Email Sent Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "lead_age", "label": "Lead Age", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "business_name", "label": "Business name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "poc_2_name", "label": "Poc 2 Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "poc_3_name", "label": "Poc 3 Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "poc_3_email", "label": "Poc 3 Email", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "poc_2_phone_number", "label": "Poc 2 Phone Number", "fieldType": "Phone", "requirement": "Optional", "visible": true },
  { "key": "poc_3_phone_number", "label": "Poc 3 Phone Number", "fieldType": "Phone", "requirement": "Optional", "visible": true },
  { "key": "type_of_business", "label": "Type of Business", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "gender", "label": "Gender", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "product_variant_info_1_plan_name", "label": "Product Variant Info 1 Plan Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "product_variant_info_2_validity", "label": "Product Variant Info 2_Validity", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "no_of_users", "label": "No of users", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "accounting_software", "label": "Accounting Software", "fieldType": "Select", "requirement": "Optional", "visible": true, "options": ["Tally", "Busy", "Marg", "Others"] },
  { "key": "source_2", "label": "Source", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "designation", "label": "Designation", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "state", "label": "State", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "number_of_company", "label": "Number of company", "fieldType": "Phone", "requirement": "Optional", "visible": true },
  { "key": "follow_up_date_time", "label": "Follow Up Date Time", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "demo_date_time", "label": "Demo Date Time", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "ad_set_name", "label": "Ad Set name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "ad_name", "label": "Ad Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "platform", "label": "Platform", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "subscription_expiry_date", "label": "Subscription Expiry Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "partner_sales_exec_name", "label": "Partner_Sales Exec Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "created_at_date", "label": "Created_at Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "interested_followup", "label": "Interested Followup", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "not_interested", "label": "Not Interested", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "reason", "label": "Reason", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "follow_up_date_and_time", "label": "Follow Up Date and Time", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "utm_medium", "label": "utm_medium", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "should_delete", "label": "Should Delete", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "not_connected_counter", "label": "Not Connected Counter", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "not_connected_follow_up_counter", "label": "Not Connected Follow Up Counter", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "are_you_an_accountant_or_owner", "label": "Are you an Accountant or Owner", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "do_you_sell_on_credit", "label": "Do you sell on Credit", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "how_many_customers_you_have", "label": "How many customers you have", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "turnover_in_crore", "label": "Turnover in Crore", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "integration_of_tally_or_busy", "label": "Integration of Tally or Busy", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "demo_completed_date_and_time", "label": "Demo Completed Date and Time", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "payment_done_date", "label": "Payment Done Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "demo_scheduled_on", "label": "Demo Scheduled On", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "demo_scheduled_by", "label": "Demo Scheduled By", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "demo_done_by", "label": "Demo Done by", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "payment_done_by", "label": "Payment Done By", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "demo_rescheduled", "label": "Demo Rescheduled", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "could_not_connect_counter", "label": "Could Not Connect Counter", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "customer_name", "label": "Customer Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "contact_person_name", "label": "Contact Person Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "sales_person_2_mail_id", "label": "Sales Person 2 Mail ID", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "tl_name", "label": "TL Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "payment_received_by", "label": "Payment Received by", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "client_gst_number", "label": "Client GST Number", "fieldType": "Phone", "requirement": "Optional", "visible": true },
  { "key": "reason_for_payment_not_from_website", "label": "Reason for Payment Not from Website", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "industry_business", "label": "Industry Business", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "revenue_excluding_gst", "label": "Revenue Excluding GST", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "payment_date", "label": "Payment Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "other_details", "label": "Other Details", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "plan_start_date_in_case_of_activation", "label": "Plan Start Date in case of activation", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "registered_email_for_plan_activation_or_a", "label": "Registered Email for plan activation or add on fe", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "plan_end_date_in_case_of_activation", "label": "Plan End Date in case of activation", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "documents_upload_status", "label": "Documents Upload - Status", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "payment_for", "label": "Payment For", "fieldType": "Select", "requirement": "Optional", "visible": true, "options": ["Fresh Demo", "Upgrade", "Top Up (Credit Purchase)", "Top Up (Add on user Purchase)", "Referral", "Renewal", "WhatsApp Automation", "Tally Backup", "Partner Restocking Unit", "Kuberx-Unlimited report", "Kuberx-Legal Notice"] },
  { "key": "plan_activated_in_case_of_upgrade_select", "label": "Plan Activated in case of upgrade select the plan", "fieldType": "Select", "requirement": "Optional", "visible": true, "options": ["Lite New (1 year)", "Lite New (2 year)", "Lite New (4 year)", "Saver New (1 year)", "Saver New (2 year)", "Saver New (4 year)", "BVP (1 year)", "BVP (2 year)", "BVP (4 year)", "Add-on (eg. WA", "extra credit/user)", "Lifetime", "Busy Basic (1 year)", "Busy Basic (2 year)", "Busy Basic (4 year)", "Busy Pro (1 year)", "Busy Pro (2 year)", "Busy Pro (4 year)", "Busy Premium (1 year)", "Busy Premium (2 year)", "Busy Premium (4 year)", "Unit Restocking", "KuberX Unlimited Report", "KuberX Legal Notice"] },
  { "key": "client_company_name", "label": "Client Company Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "details_for_top_up_or_add_on_for_invoice", "label": "Details for Top up or Add on for Invoice details", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "registered_email_for_plan_activation_or_2", "label": "Registered Email for plan activation or add on", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "plan_start_date", "label": "Plan Start Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "plan_end_date", "label": "Plan End Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "sales_agent_1", "label": "Sales Agent 1", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "sales_agent_2", "label": "Sales Agent 2", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "contact_person_phone", "label": "Contact Person Phone", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "additional_payment_date", "label": "Additional Payment Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "additional_payment_amount_excluding_gst", "label": "Additional Payment Amount Excluding GST", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "renewal_payment_date", "label": "Renewal Payment Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "upgrade_payment_date", "label": "Upgrade Payment Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "referral_payment_date", "label": "Referral Payment Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "renewal_payment_amount_excluding_gst", "label": "Renewal Payment Amount Excluding GST", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "upgrade_payment_amount_excluding_gst", "label": "Upgrade Payment Amount Excluding GST", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "referral_payment_amount_excluding_gst", "label": "Referral Payment Amount Excluding GST", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "lending_leads", "label": "Lending Leads", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "payment_verification_date", "label": "Payment Verification Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "payment_verification_failed_date", "label": "Payment Verification Failed Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "plan_activation_done_date", "label": "Plan Activation Done Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "plan_activation_failed_date", "label": "Plan Activation Failed Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "paid_customer_demo_completed_date", "label": "Paid Customer Demo Completed Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "customer_onboarding_done_date", "label": "Customer Onboarding Done Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "renewal_payment_verification_date", "label": "Renewal Payment verification Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "additional_payment_verification_date", "label": "Additional Payment Verification Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "upgrade_payment_verification_date", "label": "Upgrade Payment Verification Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "renewal_activation_done_date", "label": "Renewal Activation Done Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "additional_activation_done_date", "label": "Additional Activation Done Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "upgrade_activation_date", "label": "Upgrade Activation Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "paid_customer_demo_failed_date", "label": "Paid Customer Demo Failed Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "lead_transfer_date", "label": "Lead Transfer Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "paid_customer_demo_to_be_done_date", "label": "Paid Customer Demo to be done Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "multiple_additional_payment", "label": "Multiple Additional Payment", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "payment_3_for", "label": "Payment 3 for", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "payment_3_revenue", "label": "Payment 3 Revenue", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "payment_3_date", "label": "Payment 3 Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "payment_3_proof_status", "label": "Payment 3 Proof - Status", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "payment_3_invoice_status", "label": "Payment 3 Invoice - Status", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "payment_3", "label": "Payment 3", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "referred_by", "label": "Referred By", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "verified_revenue_amount", "label": "Verified Revenue amount", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "verified_additional_revenue", "label": "Verified Additional Revenue", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "verified_upgrade_revenue", "label": "Verified Upgrade Revenue", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "verified_renewal_revenue", "label": "Verified Renewal Revenue", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "verified_referral_revenue", "label": "Verified Referral Revenue", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "verified_payment_3_revenue", "label": "Verified Payment 3 Revenue", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "payment_3_verification_date", "label": "Payment 3 Verification Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "lead_tagging", "label": "Lead Tagging", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "renewal_due_date", "label": "Renewal Due Date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "islendingflag", "label": "IsLendingFlag", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "gst_turnover", "label": "GST Turnover", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "upload_date", "label": "upload date", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "first_call_disposition_demo_activity", "label": "First Call Disposition Demo Activity", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "ad_id", "label": "Ad Id", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "ad_set_id", "label": "Ad Set Id", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "referralcode", "label": "referralCode", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "channel_partner_name", "label": "Channel Partner Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "kuberx_revenue_excluding_gst", "label": "KuberX Revenue Excluding GST", "fieldType": "Number", "requirement": "Optional", "visible": true },
  { "key": "distributor_name", "label": "Distributor Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "lead_name", "label": "Lead Name", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "recapture_date_time", "label": "Recapture Date Time", "fieldType": "Date", "requirement": "Optional", "visible": true },
  { "key": "sales_group", "label": "Sales Group", "fieldType": "Select", "requirement": "Optional", "visible": true, "options": ["Aayush Gupta Sales Group", "Sandeep Kumar Sales Group", "Vinay Pareek Sales Group", "Naman Jain Fresh Sales Group", "Naman Jain Renewal/Upsell Sales Group", "Abhishek Yadav Sales Manager", "Md.Shahnawaz Alam Sales Group"] },
  { "key": "payment_proof", "label": "Payment Proof", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "upgrade_payment_proof", "label": "Upgrade Payment Proof", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "renewal_payment_proof", "label": "Renewal Payment Proof", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "additional_payment_proof", "label": "Additional Payment Proof", "fieldType": "Text", "requirement": "Optional", "visible": true },
  { "key": "referral_payment_proof", "label": "Referral Payment Proof", "fieldType": "Text", "requirement": "Optional", "visible": true }
] ;

type SeedField = Pick<LeadFieldDefinition, "key" | "label" | "fieldType" | "requirement" | "visible" | "options">;

function parseArgs(argv: string[]): { orgId: string | null; commit: boolean } {
  let orgId: string | null = null;
  let commit = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--org") orgId = argv[i + 1] ?? null;
    if (argv[i] === "--commit") commit = true;
  }
  return { orgId, commit };
}

async function main() {
  // tsx does not resolve the "@/" alias for standalone scripts, so import the
  // repo via a RELATIVE path at runtime (matches seed-pipeline-config.ts).
  const { createCustomField, listCustomFields, FieldDefError } = await import(
    "../lib/services/fields/repo"
  );

  const { orgId, commit } = parseArgs(process.argv.slice(2));
  if (!orgId) {
    console.error("ERROR: --org <ORG_ID> is required.");
    console.error("Usage: npx tsx scripts/seed-custom-fields.ts --org <ORG_ID> [--commit]");
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log(`CrmExpress custom-field seed  |  org=${orgId}  |  mode=${commit ? "COMMIT" : "DRY-RUN"}`);
  console.log("=".repeat(70));

  // Snapshot existing custom fields so we can report idempotent skips clearly.
  const existing = await listCustomFields(orgId);
  const existingKeys = new Set(existing.map((f) => f.key));
  console.log(`Existing custom fields on this org: ${existing.length}`);
  console.log(`Fields in seed set: ${FIELDS.length}`);
  console.log("-".repeat(70));

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const failures: Array<{ key: string; error: string }> = [];

  for (const f of FIELDS as SeedField[]) {
    if (existingKeys.has(f.key)) {
      skipped++;
      console.log(`  SKIP    ${f.key.padEnd(42)} (already exists)`);
      continue;
    }

    if (!commit) {
      // Dry run: report intent, write nothing.
      const opt = f.options ? `  [${f.options.length} options]` : "";
      created++;
      console.log(`  WOULD +  ${f.key.padEnd(42)} ${String(f.fieldType).padEnd(10)} ${f.label}${opt}`);
      continue;
    }

    try {
      await createCustomField(orgId, {
        key: f.key,
        label: f.label,
        fieldType: f.fieldType,
        requirement: f.requirement ?? "Optional",
        visible: f.visible ?? true,
        isStandard: false,
        ...(f.options ? { options: f.options } : {}),
      });
      created++;
      console.log(`  CREATE  ${f.key.padEnd(42)} ${String(f.fieldType).padEnd(10)} ${f.label}`);
    } catch (e) {
      failed++;
      const msg = e instanceof FieldDefError ? e.message : e instanceof Error ? e.message : String(e);
      failures.push({ key: f.key, error: msg });
      console.log(`  FAIL    ${f.key.padEnd(42)} ${msg}`);
    }
  }

  console.log("-".repeat(70));
  console.log(`${commit ? "CREATED" : "WOULD CREATE"}: ${created}   SKIPPED (already exist): ${skipped}   FAILED: ${failed}`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f.key}: ${f.error}`);
  }
  if (!commit) {
    console.log("\nDRY-RUN only — nothing was written. Re-run with --commit to apply.");
  } else {
    const after = await listCustomFields(orgId);
    console.log(`\nCustom fields on org after seed: ${after.length}`);
  }
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  });
