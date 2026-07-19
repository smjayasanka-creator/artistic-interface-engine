import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Plus, Pencil, Trash2, ArrowLeft, Building2 } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Modal } from "@/components/mzizi/Modal";
import { Badge } from "@/components/mzizi/Badge";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { getSession } from "@/lib/mzizi.functions";
import {
  listBanks,
  upsertBank,
  deleteBank,
  listBankBranches,
  upsertBankBranch,
  deleteBankBranch,
  type Bank,
  type BankBranch,
} from "@/lib/bank-directory.functions";
import { cn } from "@/lib/utils";

export function BankDirectoryTab() {
  const sessionFn = useServerFn(getSession);
  const { data: session } = useQuery({ queryKey: ["session"], queryFn: () => sessionFn() });
  const isPlatformAdmin = (session?.roles ?? []).includes("platform_admin");

  const listFn = useServerFn(listBanks);
  const { data: banks = [], isLoading } = useQuery({
    queryKey: ["bank-directory"],
    queryFn: () => listFn(),
  });

  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Bank | "new" | null>(null);
  const [openBranchesFor, setOpenBranchesFor] = useState<Bank | null>(null);

  const rows = useMemo(() => {
    if (!q.trim()) return banks;
    const s = q.trim().toLowerCase();
    return banks.filter(
      (b) => b.name.toLowerCase().includes(s) || b.code.toLowerCase().includes(s),
    );
  }, [banks, q]);

  if (openBranchesFor) {
    return (
      <BranchesPanel
        bank={openBranchesFor}
        onBack={() => setOpenBranchesFor(null)}
        canEdit={isPlatformAdmin}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card padded={false}>
        <div className="p-4 flex items-center gap-3 border-b border-border">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-[12.5px] flex-1 max-w-md">
            <Search size={14} className="text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search banks by name or code…"
              className="bg-transparent outline-none flex-1"
            />
          </div>
          <div className="ml-auto text-[11.5px] text-muted-foreground">{rows.length} banks</div>
          {isPlatformAdmin && (
            <button className={btnPrimaryCls} onClick={() => setEditing("new")}>
              <Plus size={14} /> New bank
            </button>
          )}
        </div>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
          style={{ gridTemplateColumns: "0.6fr 2fr 0.6fr 0.6fr 0.6fr 0.8fr" }}
        >
          <div>Code</div>
          <div>Bank name</div>
          <div className="text-center">CEFTS</div>
          <div className="text-center">SLIPS</div>
          <div className="text-center">Status</div>
          <div className="text-right">Actions</div>
        </div>
        {isLoading && <div className="text-center text-faint text-sm py-8">Loading…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="text-center text-faint text-sm py-8">No banks match.</div>
        )}
        {rows.map((b) => (
          <div
            key={b.id}
            className="grid items-center text-[13px] py-2.5 px-5 border-b border-row-divider last:border-b-0 hover:bg-muted/40"
            style={{ gridTemplateColumns: "0.6fr 2fr 0.6fr 0.6fr 0.6fr 0.8fr" }}
          >
            <div className="font-mono text-[12px]">{b.code}</div>
            <div className="font-medium truncate">{b.name}</div>
            <div className="text-center">
              <Badge
                className={
                  b.cefts_enabled
                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                    : "bg-muted text-muted-foreground border-border"
                }
              >
                {b.cefts_enabled ? "Enabled" : "—"}
              </Badge>
            </div>
            <div className="text-center">
              <Badge
                className={
                  b.slips_enabled
                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                    : "bg-muted text-muted-foreground border-border"
                }
              >
                {b.slips_enabled ? "Enabled" : "—"}
              </Badge>
            </div>
            <div className="text-center">
              <Badge
                className={
                  b.active
                    ? "bg-sky-500/10 text-sky-700 border-sky-500/30"
                    : "bg-muted text-muted-foreground border-border"
                }
              >
                {b.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex justify-end gap-1.5">
              <button
                onClick={() => setOpenBranchesFor(b)}
                className="inline-flex items-center gap-1 text-primary text-[12px] font-semibold hover:underline px-2 py-1"
                title="Manage branches"
              >
                <Building2 size={13} /> Branches
              </button>
              {isPlatformAdmin && (
                <button
                  onClick={() => setEditing(b)}
                  className="p-1.5 rounded hover:bg-muted"
                  title="Edit"
                >
                  <Pencil size={14} className="text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        ))}
      </Card>

      {editing && (
        <BankEditModal bank={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function BankEditModal({ bank, onClose }: { bank: Bank | null; onClose: () => void }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertBank);
  const delFn = useServerFn(deleteBank);
  const [code, setCode] = useState(bank?.code ?? "");
  const [name, setName] = useState(bank?.name ?? "");
  const [cefts, setCefts] = useState(bank?.cefts_enabled ?? false);
  const [slips, setSlips] = useState(bank?.slips_enabled ?? false);
  const [active, setActive] = useState(bank?.active ?? true);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: bank?.id ?? null,
          code,
          name,
          cefts_enabled: cefts,
          slips_enabled: slips,
          active,
        },
      }),
    onSuccess: () => {
      toast.success("Bank saved");
      qc.invalidateQueries({ queryKey: ["bank-directory"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => delFn({ data: { id: bank!.id } }),
    onSuccess: () => {
      toast.success("Bank removed");
      qc.invalidateQueries({ queryKey: ["bank-directory"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open onClose={onClose} title={bank ? `Edit — ${bank.name}` : "New bank"}>
      <FormGrid>
        <FormField label="Bank code" required span={3}>
          <input
            className={inputCls + " font-mono"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 7010"
          />
        </FormField>
        <FormField label="Bank name" required span={9}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="CEFTS enabled" span={4}>
          <label className="flex items-center gap-2 text-[13px] pt-2">
            <input type="checkbox" checked={cefts} onChange={(e) => setCefts(e.target.checked)} />
            <span>Participates in CEFTS real-time transfers</span>
          </label>
        </FormField>
        <FormField label="SLIPS enabled" span={4}>
          <label className="flex items-center gap-2 text-[13px] pt-2">
            <input type="checkbox" checked={slips} onChange={(e) => setSlips(e.target.checked)} />
            <span>Participates in SLIPS batch clearing</span>
          </label>
        </FormField>
        <FormField label="Status" span={4}>
          <label className="flex items-center gap-2 text-[13px] pt-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Active</span>
          </label>
        </FormField>
      </FormGrid>
      <FormActions>
        {bank && (
          <button
            className={cn(btnSecondaryCls, "text-rose-600 mr-auto")}
            disabled={remove.isPending}
            onClick={() => {
              if (confirm("Remove bank and all its branches?")) remove.mutate();
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        )}
        <button className={btnSecondaryCls} onClick={onClose}>
          Cancel
        </button>
        <button
          className={btnPrimaryCls}
          disabled={save.isPending || !code || !name}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </FormActions>
    </Modal>
  );
}

function BranchesPanel({
  bank,
  onBack,
  canEdit,
}: {
  bank: Bank;
  onBack: () => void;
  canEdit: boolean;
}) {
  const listFn = useServerFn(listBankBranches);
  const { data: branches = [], isLoading } = useQuery({
    queryKey: ["bank-branches", bank.id],
    queryFn: () => listFn({ data: { bank_id: bank.id } }),
  });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<BankBranch | "new" | null>(null);

  const rows = useMemo(() => {
    if (!q.trim()) return branches;
    const s = q.trim().toLowerCase();
    return branches.filter(
      (b) =>
        b.name.toLowerCase().includes(s) ||
        b.code.toLowerCase().includes(s) ||
        (b.city ?? "").toLowerCase().includes(s),
    );
  }, [branches, q]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5"
        >
          <ArrowLeft size={14} /> All banks
        </button>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Branches of
          </div>
          <div className="text-[15px] font-semibold">
            {bank.name}{" "}
            <span className="text-muted-foreground font-mono text-[12px]">({bank.code})</span>
          </div>
        </div>
      </div>

      <Card padded={false}>
        <div className="p-4 flex items-center gap-3 border-b border-border">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-[12.5px] flex-1 max-w-md">
            <Search size={14} className="text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search branches…"
              className="bg-transparent outline-none flex-1"
            />
          </div>
          <div className="ml-auto text-[11.5px] text-muted-foreground">{rows.length} branches</div>
          {canEdit && (
            <button className={btnPrimaryCls} onClick={() => setEditing("new")}>
              <Plus size={14} /> New branch
            </button>
          )}
        </div>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
          style={{ gridTemplateColumns: "0.6fr 1.4fr 1.4fr 0.8fr 0.6fr 0.5fr" }}
        >
          <div>Code</div>
          <div>Branch name</div>
          <div>Address</div>
          <div>City</div>
          <div className="text-center">Status</div>
          <div className="text-right">Edit</div>
        </div>
        {isLoading && <div className="text-center text-faint text-sm py-8">Loading…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="text-center text-faint text-sm py-8">
            No branches yet.{canEdit && " Click New branch to add one."}
          </div>
        )}
        {rows.map((br) => (
          <div
            key={br.id}
            className="grid items-center text-[13px] py-2.5 px-5 border-b border-row-divider last:border-b-0 hover:bg-muted/40"
            style={{ gridTemplateColumns: "0.6fr 1.4fr 1.4fr 0.8fr 0.6fr 0.5fr" }}
          >
            <div className="font-mono text-[12px]">{br.code}</div>
            <div className="font-medium truncate">{br.name}</div>
            <div className="text-muted-foreground truncate">{br.address ?? "—"}</div>
            <div>{br.city ?? "—"}</div>
            <div className="text-center">
              <Badge
                className={
                  br.active
                    ? "bg-sky-500/10 text-sky-700 border-sky-500/30"
                    : "bg-muted text-muted-foreground border-border"
                }
              >
                {br.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="text-right">
              {canEdit && (
                <button
                  onClick={() => setEditing(br)}
                  className="p-1.5 rounded hover:bg-muted"
                  title="Edit"
                >
                  <Pencil size={14} className="text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        ))}
      </Card>

      {editing && (
        <BranchEditModal
          bankId={bank.id}
          branch={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function BranchEditModal({
  bankId,
  branch,
  onClose,
}: {
  bankId: string;
  branch: BankBranch | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertBankBranch);
  const delFn = useServerFn(deleteBankBranch);
  const [code, setCode] = useState(branch?.code ?? "");
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [city, setCity] = useState(branch?.city ?? "");
  const [active, setActive] = useState(branch?.active ?? true);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: branch?.id ?? null,
          bank_id: bankId,
          code,
          name,
          address: address || null,
          city: city || null,
          active,
        },
      }),
    onSuccess: () => {
      toast.success("Branch saved");
      qc.invalidateQueries({ queryKey: ["bank-branches", bankId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => delFn({ data: { id: branch!.id } }),
    onSuccess: () => {
      toast.success("Branch removed");
      qc.invalidateQueries({ queryKey: ["bank-branches", bankId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open onClose={onClose} title={branch ? `Edit — ${branch.name}` : "New branch"}>
      <FormGrid>
        <FormField label="Branch code" required span={3}>
          <input
            className={inputCls + " font-mono"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 001"
          />
        </FormField>
        <FormField label="Branch name" required span={9}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Address" span={8}>
          <input
            className={inputCls}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </FormField>
        <FormField label="City" span={4}>
          <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
        </FormField>
        <FormField label="Status" span={4}>
          <label className="flex items-center gap-2 text-[13px] pt-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Active</span>
          </label>
        </FormField>
      </FormGrid>
      <FormActions>
        {branch && (
          <button
            className={cn(btnSecondaryCls, "text-rose-600 mr-auto")}
            disabled={remove.isPending}
            onClick={() => {
              if (confirm("Remove this branch?")) remove.mutate();
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        )}
        <button className={btnSecondaryCls} onClick={onClose}>
          Cancel
        </button>
        <button
          className={btnPrimaryCls}
          disabled={save.isPending || !code || !name}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </FormActions>
    </Modal>
  );
}
