/**
 * Workflow trigger entry points.
 * Called from leads route handlers (and elsewhere) after a state-change event.
 *
 * Automations are DISABLED: they required the BullMQ/Redis queue backend, which
 * has been removed. These triggers now no-op so lead writes stay unaffected.
 */

let warnedDisabled = false;

async function fireTrigger(_orgId: string, _leadId: string, _triggerType: string) {
  if (!warnedDisabled) {
    warnedDisabled = true;
    console.info(
      "[automation] Workflow automations are disabled (queue backend removed) — triggers will not fire.",
    );
  }
  return;
}

export async function onLeadCreated(orgId: string, leadId: string, _ownerName: string): Promise<void> {
  await fireTrigger(orgId, leadId, "trigger_lead_created");
}

export async function onLeadUpdated(orgId: string, leadId: string): Promise<void> {
  await fireTrigger(orgId, leadId, "trigger_lead_updated");
}
