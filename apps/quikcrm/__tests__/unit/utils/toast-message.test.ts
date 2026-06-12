import { describe, expect, it } from "vitest";
import { actionFailedMessage, actionSuccessMessage } from "@/lib/utils/toast-message";

describe("toast-message", () => {
  it("builds success copy", () => {
    expect(actionSuccessMessage("Task", "create")).toBe("Task created successfully");
    expect(actionSuccessMessage("Scoring rule", "remove")).toBe(
      "Scoring rule removed successfully",
    );
  });

  it("builds failure copy", () => {
    expect(actionFailedMessage("Task", "create")).toBe("Failed to create task");
    expect(actionFailedMessage("Task", "update", "Subject required")).toBe(
      "Failed to update task: Subject required",
    );
  });
});
