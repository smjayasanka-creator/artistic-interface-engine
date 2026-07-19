import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZES = [10, 25, 50, 100];

type Props = {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  label?: string;
};

const btnCls =
  "h-8 min-w-8 px-2 rounded-md border border-border bg-card text-[12.5px] flex items-center justify-center gap-1 hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed";

export function TablePagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  label = "rows",
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center gap-3 mt-2">
      <div className="flex items-center gap-2 text-[12px] text-faint">
        <label>Rows per page</label>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 px-2 rounded-md border border-border bg-card text-[12.5px] focus:outline-none focus:border-primary"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="text-[12px] text-faint">
        {totalCount === 0
          ? `0 ${label}`
          : `${rangeFrom.toLocaleString()}–${rangeTo.toLocaleString()} of ${totalCount.toLocaleString()} ${label}`}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[12px] text-faint">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className={btnCls}
          aria-label="First page"
        >
          «
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className={btnCls}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className={btnCls}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className={btnCls}
          aria-label="Last page"
        >
          »
        </button>
      </div>
    </div>
  );
}
