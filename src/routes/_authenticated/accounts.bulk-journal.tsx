import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import {
  createJournalEntry,
  listCompanyBranches,
  listGlAccounts,
} from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts/bulk-journal")({
  component: BulkJournalPage,
});

type RawRow = {
  reference: string;
  entry_date: string;
  branch_code: string;
  description: string;
  account_code: string;
  debit: number;
  credit: number;
  _row: number;
};

type EntryGroup = {
  reference: string;
  entry_date: string;
  branch_code: string;
  description: string;
  rows: RawRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  errors: string[];
  status: "pending" | "posting" | "posted" | "failed";
  message?: string;
};

const SAMPLE_ROWS = [
  ["reference", "entry_date", "branch_code", "description", "account_code", "debit", "credit"],
  ["JE-1001", "2026-07-12", "HQ", "Petty cash top-up", "1001", 5000, 0],
  ["JE-1001", "2026-07-12", "HQ", "Petty cash top-up", "1010", 0, 5000],
  ["JE-1002", "2026-07-12", "BR2", "Office rent July", "5200", 25000, 0],
  ["JE-1002", "2026-07-12", "BR2", "Office rent July", "1010", 0, 25000],
];

function downloadSample() {
  const ws = XLSX.utils.aoa_to_sheet(SAMPLE_ROWS);
  ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Journal");
  XLSX.writeFile(wb, "journal-bulk-upload-sample.xlsx");
}

function BulkJournalPage() {
  const qc = useQueryClient();
  const branchesFn = useServerFn(listCompanyBranches);
  const accountsFn = useServerFn(listGlAccounts);
  const { data: branches } = useQuery({ queryKey: ["company-branches"], queryFn: () => branchesFn() });
  const { data: accounts } = useQuery({ queryKey: ["gl-accounts"], queryFn: () => accountsFn() });

  const [fileName, setFileName] = useState<string>("");
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [groups, setGroups] = useState<EntryGroup[]>([]);

  const branchByCode = useMemo(() => {
    const m = new Map<string, any>();
    (branches ?? []).forEach((b: any) => b.code && m.set(String(b.code).toLowerCase(), b));
    return m;
  }, [branches]);
  const accountByCode = useMemo(() => {
    const m = new Map<string, any>();
    (accounts ?? []).forEach((a: any) => a.code && m.set(String(a.code).toLowerCase(), a));
    return m;
  }, [accounts]);

  function toGroups(rows: RawRow[]): EntryGroup[] {
    const map = new Map<string, EntryGroup>();
    for (const r of rows) {
      const key = r.reference || `__row${r._row}`;
      let g = map.get(key);
      if (!g) {
        g = {
          reference: r.reference,
          entry_date: r.entry_date,
          branch_code: r.branch_code,
          description: r.description,
          rows: [],
          totalDebit: 0,
          totalCredit: 0,
          balanced: false,
          errors: [],
          status: "pending",
        };
        map.set(key, g);
      }
      g.rows.push(r);
      g.totalDebit += r.debit;
      g.totalCredit += r.credit;
    }
    for (const g of map.values()) {
      g.balanced = Math.abs(g.totalDebit - g.totalCredit) < 0.01 && g.totalDebit > 0;
      if (!g.reference) g.errors.push("Missing reference");
      if (!g.entry_date) g.errors.push("Missing entry_date");
      if (!g.branch_code) g.errors.push("Missing branch_code");
      else if (!branchByCode.get(g.branch_code.toLowerCase())) g.errors.push(`Unknown branch code '${g.branch_code}'`);
      if (g.rows.length < 2) g.errors.push("Needs at least 2 lines");
      if (!g.balanced) g.errors.push(`Not balanced (DR ${g.totalDebit} / CR ${g.totalCredit})`);
      for (const r of g.rows) {
        if (!r.account_code) g.errors.push(`Row ${r._row}: missing account_code`);
        else if (!accountByCode.get(r.account_code.toLowerCase()))
          g.errors.push(`Row ${r._row}: unknown account '${r.account_code}'`);
        if (r.debit > 0 && r.credit > 0) g.errors.push(`Row ${r._row}: has both debit and credit`);
        if (r.debit === 0 && r.credit === 0) g.errors.push(`Row ${r._row}: no amount`);
      }
    }
    return Array.from(map.values());
  }

  async function onFile(file: File) {
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const parsed: RawRow[] = json.map((r, i) => ({
        reference: String(r.reference ?? "").trim(),
        entry_date: normDate(r.entry_date),
        branch_code: String(r.branch_code ?? "").trim(),
        description: String(r.description ?? "").trim(),
        account_code: String(r.account_code ?? "").trim(),
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
        _row: i + 2, // header is row 1
      }));
      setRawRows(parsed);
      setGroups(toGroups(parsed));
      toast.success(`Parsed ${parsed.length} rows into ${new Set(parsed.map((r) => r.reference)).size} entries`);
    } catch (e: any) {
      toast.error(`Failed to read file: ${e.message}`);
    }
  }

  const createFn = useServerFn(createJournalEntry);
  const post = useMutation({
    mutationFn: async () => {
      const valid = groups.filter((g) => g.errors.length === 0 && g.status !== "posted");
      let ok = 0;
      let fail = 0;
      for (const g of valid) {
        setGroups((prev) => prev.map((x) => (x.reference === g.reference ? { ...x, status: "posting" } : x)));
        try {
          const branch = branchByCode.get(g.branch_code.toLowerCase());
          const lines = g.rows.map((r) => ({
            account_id: accountByCode.get(r.account_code.toLowerCase()).id,
            debit: r.debit,
            credit: r.credit,
          }));
          await createFn({
            data: {
              branch_id: branch.id,
              entry_date: g.entry_date,
              reference: g.reference,
              description: g.description || undefined,
              lines,
            },
          });
          ok++;
          setGroups((prev) =>
            prev.map((x) => (x.reference === g.reference ? { ...x, status: "posted" } : x)),
          );
        } catch (e: any) {
          fail++;
          setGroups((prev) =>
            prev.map((x) =>
              x.reference === g.reference ? { ...x, status: "failed", message: e.message } : x,
            ),
          );
        }
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      if (fail === 0) toast.success(`Posted ${ok} journal entries`);
      else toast.warning(`Posted ${ok}, failed ${fail}`);
    },
  });

  const totalGroups = groups.length;
  const validGroups = groups.filter((g) => g.errors.length === 0).length;
  const invalidGroups = totalGroups - validGroups;
  const postedGroups = groups.filter((g) => g.status === "posted").length;

  function reset() {
    setFileName("");
    setRawRows([]);
    setGroups([]);
  }

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/accounts" className="text-xs text-primary hover:underline">
        ← Back to Accounts
      </Link>

      <Card>
        <CardTitle
          right={
            <button onClick={downloadSample} className={btnSecondaryCls + " gap-1.5"}>
              <Download size={14} /> Sample template
            </button>
          }
          subtitle="Required columns: reference, entry_date (YYYY-MM-DD), branch_code, description, account_code, debit, credit"
        >
          Step 1 · Choose file
        </CardTitle>

        <label className="block cursor-pointer">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <div className="border-2 border-dashed border-border rounded-lg py-8 px-6 text-center hover:border-primary/50 transition-colors">
            <FileSpreadsheet size={28} className="mx-auto text-muted-foreground mb-2" />
            <div className="text-sm font-medium">
              {fileName || "Click to upload .xlsx, .xls or .csv"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {rawRows.length > 0 ? `${rawRows.length} rows parsed` : "Max 5,000 rows"}
            </div>
          </div>
        </label>
      </Card>

      {groups.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Entries" value={totalGroups} />
            <Stat label="Valid" value={validGroups} tone="ok" />
            <Stat label="Invalid" value={invalidGroups} tone={invalidGroups > 0 ? "err" : undefined} />
            <Stat label="Posted" value={postedGroups} tone={postedGroups > 0 ? "ok" : undefined} />
          </div>

          <Card padded={false}>
            <div
              className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
              style={{ gridTemplateColumns: ".8fr .8fr .6fr 1.5fr .5fr .8fr .8fr 1fr" }}
            >
              <div>Reference</div>
              <div>Date</div>
              <div>Branch</div>
              <div>Description</div>
              <div className="text-right">Lines</div>
              <div className="text-right">Debit</div>
              <div className="text-right">Credit</div>
              <div>Status</div>
            </div>
            {groups.map((g) => (
              <div
                key={g.reference || `bad-${g.rows[0]?._row}`}
                className="grid items-center text-[12.5px] py-2.5 px-5 border-b border-row-divider"
                style={{ gridTemplateColumns: ".8fr .8fr .6fr 1.5fr .5fr .8fr .8fr 1fr" }}
              >
                <div className="font-mono text-ledger-ref">{g.reference || "—"}</div>
                <div className="text-muted-foreground">{g.entry_date}</div>
                <div className="font-mono text-faint">{g.branch_code}</div>
                <div className="text-muted-foreground truncate" title={g.errors.join(" · ")}>
                  {g.errors.length > 0 ? (
                    <span className="text-destructive">{g.errors[0]}{g.errors.length > 1 ? ` (+${g.errors.length - 1})` : ""}</span>
                  ) : (
                    g.description || <span className="text-faint">—</span>
                  )}
                </div>
                <div className="text-right font-mono">{g.rows.length}</div>
                <div className="text-right font-mono text-debit">{money(g.totalDebit)}</div>
                <div className="text-right font-mono text-primary">{money(g.totalCredit)}</div>
                <div className="text-[11.5px]">
                  {g.status === "posted" ? (
                    <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 size={12} /> Posted</span>
                  ) : g.status === "posting" ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Posting…</span>
                  ) : g.status === "failed" ? (
                    <span className="inline-flex items-center gap-1 text-destructive" title={g.message}><AlertCircle size={12} /> Failed</span>
                  ) : g.errors.length > 0 ? (
                    <span className="text-destructive">Invalid</span>
                  ) : (
                    <span className={cn(g.balanced ? "text-primary" : "text-destructive")}>
                      {g.balanced ? "Ready" : "Unbalanced"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </Card>

          <div className="flex items-center justify-end gap-2">
            <button onClick={reset} className={btnSecondaryCls}>Clear</button>
            <button
              onClick={() => post.mutate()}
              disabled={validGroups === 0 || post.isPending}
              className={btnPrimaryCls + " gap-1.5"}
            >
              <Upload size={14} /> {post.isPending ? "Posting…" : `Post ${validGroups} entries`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "err" }) {
  return (
    <Card>
      <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={cn("text-2xl font-semibold mt-1", tone === "ok" && "text-primary", tone === "err" && "text-destructive")}>
        {value}
      </div>
    </Card>
  );
}

function normDate(v: any): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}
