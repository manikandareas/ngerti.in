import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { StoredObject } from "@/features/diagnostics/types";
import { api } from "@/lib/api";
import { useObjectDownload } from "./use-object-download";

export function useFiles() {
  const { getToken } = useAuth();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const files = useQuery({
    queryKey: ["files"],
    queryFn: async () => api<StoredObject[]>("/dev/objects", await getToken()),
    refetchInterval: 5000,
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || file.size === 0 || file.size > 5 * 1024 * 1024)
        throw new Error("Pilih file berukuran 1 byte sampai 5 MB.");
      const body = new FormData();
      body.append("file", file);
      return api("/dev/objects", await getToken(), { method: "POST", body });
    },
    onSuccess: () => {
      setFile(null);
      if (input.current) input.current.value = "";
      client.invalidateQueries({ queryKey: ["files"] });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      api(`/dev/objects/${id}`, await getToken(), { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["files"] }),
  });
  const download = useObjectDownload();

  function selectExample(): void {
    if (input.current) input.current.value = "";
    setFile(
      new File(
        ["Ngertiin task #02: manual browser upload.\nDisposable development data.\n"],
        "foundation-example.txt",
        { type: "text/plain" },
      ),
    );
  }

  return { input, file, setFile, files, upload, remove, download, selectExample };
}
