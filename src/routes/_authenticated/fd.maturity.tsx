import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listMaturingDeposits, processMaturity } from "@/lib/fd.functions";
import { Card } from "@/components/mzizi/Card";
import { btnPrimaryCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fd/maturity")({
  component: MaturityDue,
});

function MaturityDue() {
  const [win, setWin] = useState<7 | 30 | 60>(30);
  const qc = useQueryClient();
  const listFn = useServerFn(listMaturingDeposits);
  const matureFn = useServerFn(processMaturity);
  const { data: rows } = useQuery({ queryKey: ["fd-maturity", win], queryFn: () => listFn({ data: { window: win } }) });

  const matureM = useMutation({
    mutationFn: (id: string) => matureFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(r.action === "renewed" ? `Renewed as ${r.new_certificate}` : `Payout ${money(r.settlement ?? 0)}`);
      qc.invalidateQueries({ queryKey: ["fd-maturity"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="flex gap-2">
        {([7, 30, 60] as const).map((w) => (
          <button
            key={w}
            onClick={() => setWin(w)}
            className={cn(
              "px-4 py-2 rounded-md text-[13px] font-medium border",
              win === w ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted",
            )}
          >
            Next {w} days
          </button>
        ))}
      </div>
      <Card>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-faint font-semibold border-b border-border">
              <th className="py-2 pr-3">Certificate</th>
              <th className="py-2 pr-3">Client</th>
              <th className="py-2 pr-3">Product</th>
              <th className="py-2 pr-3 text-right">Principal</th>
              <th className="py-2 pr-3">Maturity</th>
              <th className="py-2 pr-3">Instruction</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((d) => (
              <tr key={d.id} className="border-b border-border/50">
                <td className="py-2 pr-3 font-mono">
                  <Link to="/fd/$id" params={{ id: d.id }} className="text-primary hover:underline">
                    {d.certificate_no}
                  </Link>
                </td>
                <td className="py-2 pr-3">{d.client?.full_name}</td>
                <td className="py-2 pr-3">{d.product?.name}</td>
                <td className="py-2 pr-3 text-right font-mono">{money(Number(d.principal))}</td>
                <td className="py-2 pr-3">{d.maturity_date}</td>
                <td className="py-2 pr-3 capitalize">{d.maturity_instruction.replace(/_/g, " ")}</td>
                <td className="py-2 pr-3 text-right">
                  <button className={btnPrimaryCls} onClick={() => matureM.mutate(d.id)} disabled={matureM.isPending}>
                    Process
                  </button>
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">No deposits maturing in this window.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
