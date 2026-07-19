import { createFileRoute } from "@tanstack/react-router";
import { User2, Wallet, PiggyBank, Landmark, ReceiptText, FileText, Search } from "lucide-react";
import { ClientSearchBar } from "@/components/mzizi/ClientSearchBar";
import { Card } from "@/components/mzizi/Card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsBlank,
});

const TABS = [
  { key: "overview", label: "Overview", icon: User2 },
  { key: "loans", label: "Loans", icon: Wallet },
  { key: "savings", label: "Savings", icon: PiggyBank },
  { key: "fd", label: "Fixed Deposits", icon: Landmark },
  { key: "transactions", label: "Transactions", icon: ReceiptText },
  { key: "documents", label: "Documents", icon: FileText },
];

function ClientsBlank() {
  return (
    <div className="animate-fadein flex flex-col gap-4">
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-0 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="w-full max-w-md">
            <ClientSearchBar autoFocus />
          </div>
        </div>
        <div className="overflow-x-auto mt-2">
          <div className="flex gap-1 min-w-max">
            {TABS.map((t, i) => {
              const Icon = t.icon;
              const active = i === 0;
              return (
                <div
                  key={t.key}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-2.5 text-[12.5px] font-medium border-b-2 -mb-px whitespace-nowrap",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  <Icon size={14} />
                  {t.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4 min-w-0">
          <Card padded={false}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
              {["Outstanding loans", "Savings balance", "Fixed deposits", "On-time rate"].map(
                (label) => (
                  <div key={label} className="bg-card px-5 py-4">
                    <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                      {label}
                    </div>
                    <div className="font-mono text-lg font-semibold mt-1 text-faint">—</div>
                  </div>
                ),
              )}
            </div>
          </Card>
          <Card>
            <EmptyHint />
          </Card>
          <Card>
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-3">
              Recent activity
            </div>
            <div className="text-sm text-muted-foreground">Select a customer to view activity.</div>
          </Card>
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          {["Personal", "Contact", "Bank accounts"].map((title) => (
            <Card key={title}>
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-3">
                {title}
              </div>
              <div className="text-sm text-muted-foreground">—</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="text-center py-8">
      <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-primary/10 text-primary">
        <Search size={22} />
      </div>
      <div className="text-[14px] font-semibold text-foreground">Search a customer to begin</div>
      <p className="text-[12.5px] text-muted-foreground mt-1">
        Use the search bar above (customer code, NIC or phone) to open the 360° profile.
      </p>
    </div>
  );
}
