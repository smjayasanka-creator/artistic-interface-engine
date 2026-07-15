import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/mzizi/Card";
import { Truck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/transactions/supplier-payment")({
  component: SupplierPaymentPage,
});

function SupplierPaymentPage() {
  return (
    <div className="animate-fadein flex flex-col gap-5">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/15 to-orange-500/0 text-orange-600 flex items-center justify-center">
            <Truck size={20} />
          </div>
          <div>
            <div className="font-semibold text-[15px]">Supplier Payment</div>
            <div className="text-[12px] text-muted-foreground">
              Pay vehicle / asset suppliers against approved loans. Content coming soon.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
