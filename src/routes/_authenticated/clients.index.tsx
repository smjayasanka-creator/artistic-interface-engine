import { createFileRoute } from "@tanstack/react-router";
import { User2 } from "lucide-react";
import { ClientSearchBar } from "@/components/mzizi/ClientSearchBar";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsSearch,
});

function ClientsSearch() {
  return (
    <div className="animate-fadein max-w-3xl mx-auto">
      <ClientSearchBar autoFocus />
      <div className="text-center mt-16">
        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-primary/10 text-primary">
          <User2 size={26} />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Find a client</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter a customer code, NIC or phone number above to open the 360° profile.
        </p>
      </div>
    </div>
  );
}
