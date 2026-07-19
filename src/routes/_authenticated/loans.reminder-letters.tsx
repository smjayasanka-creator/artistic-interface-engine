import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/mzizi/Card";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/loans/reminder-letters")({
  component: ReminderLetters,
});

function ReminderLetters() {
  return (
    <div className="animate-fadein">
      <Card className="p-8 text-center">
        <Mail size={32} className="mx-auto text-orange-500 mb-3" />
        <div className="font-semibold text-[15px]">Reminder Letters</div>
        <div className="text-[12.5px] text-muted-foreground mt-1">
          Coming soon — generate and dispatch reminder letters to borrowers.
        </div>
      </Card>
    </div>
  );
}
