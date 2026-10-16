import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useObjectDownload() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await api<{ url: string }>(`/dev/objects/${id}/download`, await getToken());
      window.location.assign(result.url);
    },
  });
}
