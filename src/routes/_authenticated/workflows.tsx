import { createFileRoute } from "@tanstack/react-router";
import { WorkflowsTab } from "@/components/mzizi/WorkflowsTab";

export const Route = createFileRoute("/_authenticated/workflows")({
  component: WorkflowsTab,
});
