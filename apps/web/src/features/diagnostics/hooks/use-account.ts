import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "@/features/diagnostics/types";
import { api } from "@/lib/api";

export function useAccount() {
  const { getToken } = useAuth();
  const account = useQuery({
    queryKey: ["account"],
    queryFn: async () => api<Account>("/me", await getToken()),
  });
  return account;
}
