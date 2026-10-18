import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { Run } from "@/features/diagnostics/types";
import { api } from "@/lib/api";

export function useRunAccess() {
  const { getToken } = useAuth();
  const [id, setId] = useState("");
  const lookup = useMutation({
    mutationFn: async () =>
      api<Run>(`/dev/runs/${encodeURIComponent(id.trim())}`, await getToken()),
  });
  return { id, setId, lookup };
}
