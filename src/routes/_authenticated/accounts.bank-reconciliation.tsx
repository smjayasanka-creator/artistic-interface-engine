import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Link2, Unlink } from "lucide-react";
import * as XLSX from "xlsx";
import { getLedger } from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { FormField, FormGrid, btnPrimaryCls, btnSecondaryCls, inputCls, selectCls } from "@/components/mzizi/FormGrid";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts/bank-reconciliation")({
  component: BankReconciliationPage,
});

type StmtLine = {
  id: string;
  date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  matchedTo?: string;
};
type LedgerLine = {
  id: string;
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  matchedTo?: string;
};

const SAMPLE_STMT = [
  ["date", "description", "reference", "debit", "credit"],
  ["2026-07-01", "Opening deposit", "TRX001", 0, 100000],
  ["2026-07-03", "Cheque #4501", "CHQ4501", 25000, 0],
  ["2026-07-05", "Salary payment", "SAL-JUL", 45000, 0],
  ["2026-07-08", "Customer deposit", "TRX0088", 0, 60000],
];

function downloadSampleStatement() {
  const ws = XLSX.utils.aoa_to_sheet(SAMPLE_STMT);
  ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Statement");
  XLSX.writeFile(wb, "bank-statement-sample.xlsx");
}

function BankReconciliationPage() {
  const ledgerFn = useServerFn(getLedger);
  const { data: all } = useQuery({ queryKey: ["ledger", "all-for-recon"], queryFn: () => ledgerFn({ data: {} }) });
  const bankAccounts = useMemo(
    () => (all?.accounts ?? []).filter((a: any) => a.type === "asset" || String(a.code).startsWith("101") || /bank|cash/i.test(a.name)),
    [all],
  );

  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [stmtLines, setStmtLines] = useState<StmtLine[]>([]);
  const [ledgerLines, setLedgerLines] = useState<LedgerLine[]>([]);
  const [selectedStmt, setSelectedStmt] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  const acctFn = useServerFn(getLedger);
  const { data: acctData, refetch, isFetching } = useQuery({
    queryKey: ["ledger", accountId, from, to],
    queryFn: () => acctFn({ data: { account: accountId } }),
    enabled: !!accountId,
  });

  function loadLedger() {
    if (!accountId) {
      toast.error("Choose a bank/cash account first");
      return;
    }
    refetch().then((r) => {
      const rows = (r.data?.rows ?? []).filter((row: any) => {
        const d = row.entry?.entry_date;
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
      setLedgerLines(
        rows.map((row: any) => ({
          id: String(row.id),
          date: row.entry?.entry_date ?? "",
          reference: row.entry?.reference ?? "",
          description: row.entry?.description ?? "",
          debit: Number(row.debit) || 0,
          credit: Number(row.credit) || 0,
        })),
      );
      toast.success(`Loaded ${rows.length} ledger postings`);
    });
  }

  async function onFile(file: File) {
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const parsed: StmtLine[] = json.map((r, i) => ({
        id: `s${i}`,
        date: normDate(r.date),
        description: String(r.description ?? "").trim(),
        reference: String(r.reference ?? "").trim(),
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
      }));
      setStmtLines(parsed);
      toast.success(`Loaded ${parsed.length} statement lines`);
    } catch (e: any) {
      toast.error(`Failed to read file: ${e.message}`);
    }
  }

  function autoMatch() {
    let matches = 0;
    setStmtLines((prevS) => {
      setLedgerLines((prevL) => {
        const S = prevS.map((s) => ({ ...s }));
        const L = prevL.map((l) => ({ ...l }));
        for (const s of S) {
          if (s.matchedTo) continue;
          const cand = L.find(
            (l) =>
              !l.matchedTo &&
              Math.abs(l.debit - s.credit) < 0.01 &&
              Math.abs(l.credit - s.debit) < 0.01 &&
              (l.reference === s.reference || l.date === s.date),
          );
          if (cand) {
            s.matchedTo = cand.id;
            cand.matchedTo = s.id;
            matches++;
          }
        }
        return L;
      });
      return prevS.map((s) => ({ ...s })); // trigger with fresh copy after ledger callback
    });
    // Re-run: because setState is async, do it deterministically here:
    setStmtLines((S0) => {
      setLedgerLines((L0) => {
        const S = S0.map((s) => ({ ...s, matchedTo: undefined as string | undefined }));
        const L = L0.map((l) => ({ ...l, matchedTo: undefined as string | undefined }));
        let n = 0;
        for (const s of S) {
          const cand = L.find(
            (l) =>
              !l.matchedTo &&
              Math.abs(l.debit - s.credit) < 0.01 &&
              Math.abs(l.credit - s.debit) < 0.01 &&
              (l.reference === s.reference || l.date === s.date),
          );
          if (cand) {
            s.matchedTo = cand.id;
            cand.matchedTo = s.id;
            n++;
          }
        }
        matches = n;
        // side-effect: also set statement lines
        queueMicrotask(() => setStmtLines(S));
        return L;
      });
      return S0;
    });
    setTimeout(() => toast.success(`Auto-matched ${matches} pair(s)`), 50);
  }

  function toggleMatchLedger(ledgerId: string) {
    if (!selectedStmt) {
      toast.error("Select a statement line first");
      return;
    }
    setStmtLines((S) => S.map((s) => (s.id === selectedStmt ? { ...s, matchedTo: ledgerId } : s.matchedTo === ledgerId ? { ...s, matchedTo: undefined } : s)));
    setLedgerLines((L) =>
      L.map((l) =>
        l.id === ledgerId
          ? { ...l, matchedTo: selectedStmt }
          : l.matchedTo === selectedStmt
            ? { ...l, matchedTo: undefined }
            : l,
      ),
    );
    setSelectedStmt(null);
  }

  function unmatch(stmtId: string) {
    const s = stmtLines.find((x) => x.id === stmtId);
    if (!s?.matchedTo) return;
    const lid = s.matchedTo;
    setStmtLines((S) => S.map((x) => (x.id === stmtId ? { ...x, matchedTo: undefined } : x)));
    setLedgerLines((L) => L.map((x) => (x.id === lid ? { ...x, matchedTo: undefined } : x)));
  }

  const stmtDebit = stmtLines.reduce((s, r) => s + r.debit, 0);
  const stmtCredit = stmtLines.reduce((s, r) => s + r.credit, 0);
  const ledgerDebit = ledgerLines.reduce((s, r) => s + r.debit, 0);
  const ledgerCredit = ledgerLines.reduce((s, r) => s + r.credit, 0);
  const opening = Number(openingBalance) || 0;
  const stmtBalance = opening + stmtCredit - stmtDebit;
  const ledgerBalance = opening + ledgerDebit - ledgerCredit;
  const diff = stmtBalance - ledgerBalance;
  const unclearedStmt = stmtLines.filter((s) => !s.matchedTo).length;
  const unclearedLedger = ledgerLines.filter((l) => !l.matchedTo).length;

  function exportReconciliation() {
    const wb = XLSX.utils.book_new();
    const summary = [
      ["Bank Reconciliation"],
      ["Account", bankAccounts.find((a: any) => a.id === accountId)?.name ?? ""],
      ["Period", `${from || "—"} to ${to || "—"}`],
      [],
      ["Opening balance", opening],
      ["Statement debits", stmtDebit],
      ["Statement credits", stmtCredit],
      ["Statement closing", stmtBalance],
      [],
      ["Ledger debits", ledgerDebit],
      ["Ledger credits", ledgerCredit],
      ["Ledger closing", ledgerBalance],
      [],
      ["Difference", diff],
      ["Uncleared statement lines", unclearedStmt],
      ["Uncleared ledger lines", unclearedLedger],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        stmtLines.map((s) => ({ ...s, matched: s.matchedTo ? "yes" : "no" })),
      ),
      "Statement",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        ledgerLines.map((l) => ({ ...l, matched: l.matchedTo ? "yes" : "no" })),
      ),
      "Ledger",
    );
    XLSX.writeFile(wb, `bank-reconciliation-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/accounts" className="text-xs text-primary hover:underline">
        ← Back to Accounts
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Bank Reconciliation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Match your bank statement lines against ledger postings for a chosen bank/cash account and period.
        </p>
      </div>

      <Card>
        <CardTitle subtitle="Choose the ledger account and date range, then load ledger postings and upload the bank statement.">
          Step 1 · Setup
        </CardTitle>
        <FormGrid>
          <FormField label="Bank / cash account" required span={5}>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectCls}>
              <option value="">Select account…</option>
              {bankAccounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="From" span={2}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls + " font-mono"} />
          </FormField>
          <FormField label="To" span={2}>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls + " font-mono"} />
          </FormField>
          <FormField label="Opening balance" span={3}>
            <input
              inputMode="decimal"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value.replace(/[^\d.-]/g, ""))}
              className={inputCls + " font-mono text-right"}
            />
          </FormField>
        </FormGrid>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button onClick={loadLedger} disabled={!accountId || isFetching} className={btnSecondaryCls}>
            {isFetching ? "Loading…" : "Load ledger postings"}
          </button>
          <button onClick={downloadSampleStatement} className={btnSecondaryCls + " gap-1.5"}>
            <Download size={14} /> Statement template
          </button>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <span className={btnSecondaryCls + " gap-1.5"}>
              <FileSpreadsheet size={14} /> {fileName || "Upload statement"}
            </span>
          </label>
          <button onClick={autoMatch} disabled={!stmtLines.length || !ledgerLines.length} className={btnPrimaryCls + " gap-1.5"}>
            <Link2 size={14} /> Auto-match
          </button>
          <button onClick={exportReconciliation} disabled={!stmtLines.length && !ledgerLines.length} className={btnSecondaryCls + " gap-1.5 ml-auto"}>
            <Download size={14} /> Export
          </button>
        </div>
      </Card>

      {(stmtLines.length > 0 || ledgerLines.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Statement closing" value={money(stmtBalance)} mono />
          <Stat label="Ledger closing" value={money(ledgerBalance)} mono />
          <Stat
            label="Difference"
            value={money(diff)}
            mono
            tone={Math.abs(diff) < 0.01 ? "ok" : "err"}
          />
          <Stat label="Uncleared" value={`${unclearedStmt} stmt / ${unclearedLedger} led`} />
        </div>
      )}

      {(stmtLines.length > 0 || ledgerLines.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padded={false}>
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="text-sm font-semibold">Bank statement</div>
              <div className="text-[11px] text-faint">{stmtLines.length} lines · Click to select</div>
            </div>
            <Header cols={[".9fr", "1.8fr", ".8fr", ".8fr", "auto"]} labels={["Date", "Description", "Debit", "Credit", ""]} />
            {stmtLines.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStmt(selectedStmt === s.id ? null : s.id)}
                className={cn(
                  "w-full text-left grid items-center text-[12px] py-2 px-5 border-b border-row-divider hover:bg-secondary/40",
                  selectedStmt === s.id && "bg-primary/10",
                  s.matchedTo && "opacity-60",
                )}
                style={{ gridTemplateColumns: ".9fr 1.8fr .8fr .8fr auto" }}
              >
                <span className="text-muted-foreground">{s.date}</span>
                <span className="truncate">
                  {s.description}
                  {s.reference && <span className="font-mono text-faint ml-1.5">[{s.reference}]</span>}
                </span>
                <span className="text-right font-mono text-debit">{s.debit ? money(s.debit) : ""}</span>
                <span className="text-right font-mono text-primary">{s.credit ? money(s.credit) : ""}</span>
                <span className="pl-2">
                  {s.matchedTo && (
                    <span
                      className="text-faint hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        unmatch(s.id);
                      }}
                    >
                      <Unlink size={12} />
                    </span>
                  )}
                </span>
              </button>
            ))}
            {stmtLines.length === 0 && <div className="text-center text-faint text-sm py-8">Upload a statement file to begin.</div>}
          </Card>

          <Card padded={false}>
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="text-sm font-semibold">Ledger postings</div>
              <div className="text-[11px] text-faint">
                {ledgerLines.length} lines · {selectedStmt ? "Click to match selected" : "Select a statement line"}
              </div>
            </div>
            <Header cols={[".9fr", ".8fr", "1.6fr", ".8fr", ".8fr"]} labels={["Date", "Ref", "Description", "Debit", "Credit"]} />
            {ledgerLines.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleMatchLedger(l.id)}
                disabled={!selectedStmt && !l.matchedTo}
                className={cn(
                  "w-full text-left grid items-center text-[12px] py-2 px-5 border-b border-row-divider hover:bg-secondary/40",
                  l.matchedTo && "opacity-60",
                  !selectedStmt && !l.matchedTo && "cursor-default hover:bg-transparent",
                )}
                style={{ gridTemplateColumns: ".9fr .8fr 1.6fr .8fr .8fr" }}
              >
                <span className="text-muted-foreground">{shortDate(l.date)}</span>
                <span className="font-mono text-ledger-ref">{l.reference}</span>
                <span className="text-muted-foreground truncate">{l.description}</span>
                <span className="text-right font-mono text-debit">{l.debit ? money(l.debit) : ""}</span>
                <span className="text-right font-mono text-primary">{l.credit ? money(l.credit) : ""}</span>
              </button>
            ))}
            {ledgerLines.length === 0 && <div className="text-center text-faint text-sm py-8">Load ledger postings for the selected account.</div>}
          </Card>
        </div>
      )}
    </div>
  );
}

function Header({ cols, labels }: { cols: string[]; labels: string[] }) {
  return (
    <div
      className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-2.5 px-5 border-b border-border bg-secondary/40"
      style={{ gridTemplateColumns: cols.join(" ") }}
    >
      {labels.map((l, i) => (
        <div key={i} className={cn(i >= labels.length - 2 && labels.length > 3 && "text-right")}>
          {l}
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, mono, tone }: { label: string; value: string | number; mono?: boolean; tone?: "ok" | "err" }) {
  return (
    <Card>
      <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div
        className={cn(
          "text-xl font-semibold mt-1",
          mono && "font-mono",
          tone === "ok" && "text-primary",
          tone === "err" && "text-destructive",
        )}
      >
        {value}
      </div>
    </Card>
  );
}

function normDate(v: any): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}
