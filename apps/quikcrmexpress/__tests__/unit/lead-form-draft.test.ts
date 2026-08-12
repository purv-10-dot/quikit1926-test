// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildLeadSourcesSettingsHref,
  buildLeadStagesAddHref,
  buildLeadStatusesSettingsHref,
  buildSettingsHref,
  discardLeadFormDraft,
  draftScopeFromReturnTo,
  hasPendingSettingsReturn,
  markPendingSettingsReturn,
  returnToForDraftScope,
  saveLeadFormDraft,
} from "@/lib/leads/lead-form-draft";

describe("lead-form-draft", () => {
  it("maps draft scopes to return URLs", () => {
    expect(returnToForDraftScope("create")).toBe("/leads?addLead=1");
    expect(returnToForDraftScope("create:page")).toBe("/leads/create");
    expect(returnToForDraftScope("create:account:acc-1")).toBe("/accounts/acc-1?createLead=1");
  });

  it("parses returnTo back to draft scope", () => {
    expect(draftScopeFromReturnTo("/leads?addLead=1")).toBe("create");
    expect(draftScopeFromReturnTo("/leads/create")).toBe("create:page");
    expect(draftScopeFromReturnTo("/accounts/acc-1?createLead=1")).toBe("create:account:acc-1");
    expect(draftScopeFromReturnTo("/settings/sources")).toBeNull();
  });

  it("tracks pending return only after marking settings navigation", () => {
    discardLeadFormDraft("create");
    expect(hasPendingSettingsReturn("create")).toBe(false);
    markPendingSettingsReturn("create");
    expect(hasPendingSettingsReturn("create")).toBe(true);
    saveLeadFormDraft("create", {
      name: "Test",
      email: "a@b.com",
      company: "",
      phone: { countryCode: "+91", number: "" },
      mobile: { countryCode: "+91", number: "9876543210" },
      jobTitle: "",
      score: 0,
      industry: "",
      secondaryEmail: "",
      website: "",
      linkedinUrl: "",
      annualRevenueDisplay: "",
      descriptionInformation: "",
      source: "",
      status: "Open",
      stage: "New",
      country: "",
      addressLine1: "",
      addressLine2: "",
      cityName: "",
      stateName: "",
      postalCode: "",
      lat: "",
      long: "",
      addressOpen: false,
      ownerId: "",
      ownerNameRaw: "",
      followUp: "",
      accountId: "",
      accountQuery: "",
      dynValues: {},
    });
    discardLeadFormDraft("create");
    expect(hasPendingSettingsReturn("create")).toBe(false);
  });

  it("appends returnTo to settings links", () => {
    expect(buildLeadSourcesSettingsHref("/leads?addLead=1")).toBe(
      "/settings/sources?returnTo=%2Fleads%3FaddLead%3D1",
    );
    expect(buildLeadStagesAddHref("/leads/create")).toBe(
      "/settings/stages?focus=add-stage&returnTo=%2Fleads%2Fcreate",
    );
    expect(buildLeadStatusesSettingsHref("/leads?addLead=1", "Qualified")).toBe(
      "/settings/stages?focus=statuses&stage=Qualified&returnTo=%2Fleads%3FaddLead%3D1",
    );
    expect(buildSettingsHref("/settings/stages?focus=add-stage", "/leads/create")).toBe(
      "/settings/stages?focus=add-stage&returnTo=%2Fleads%2Fcreate",
    );
  });
});
