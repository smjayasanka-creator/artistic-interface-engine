import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { createClient } from "@/lib/mzizi.functions";

export function NewClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nid, setNid] = useState("");
  const qc = useQueryClient();
  const createFn = useServerFn(createClient);
  const post = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Client registered · pending KYC");
      qc.invalidateQueries();
      onClose();
      setName(""); setPhone(""); setNid("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="New client · KYC" width={460}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254…" className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">National ID</label>
            <input value={nid} onChange={(e) => setNid(e.target.value)} className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background font-mono" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-sm px-4 py-2 border border-input rounded-md hover:bg-muted">Cancel</button>
          <button
            disabled={!name || post.isPending}
            onClick={() => post.mutate({ data: { full_name: name, phone, national_id: nid } })}
            className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary-hover disabled:opacity-50"
          >
            {post.isPending ? "Saving…" : "Register client"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
