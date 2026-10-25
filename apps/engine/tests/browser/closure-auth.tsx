import { useEffect, useState } from "react";

type Identity = { token: string; user_id: string; session_id: string; owner_id: string };
async function identity(): Promise<Identity> {
  const response = await fetch("/session?identity=0", { cache: "no-store" });
  if (!response.ok) throw new Error("Disposable Clerk session is unavailable");
  return response.json();
}
const getToken = async () => (await identity()).token;

export function useAuth() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    identity().then((value) => {
      if (active) setUserId(value.user_id);
    });
    return () => {
      active = false;
    };
  }, []);
  return { getToken, userId, isLoaded: userId !== null, isSignedIn: userId !== null };
}
export const useUser = () => ({ isSignedIn: true });
export const UserButton = () => <span>Acceptance account</span>;
