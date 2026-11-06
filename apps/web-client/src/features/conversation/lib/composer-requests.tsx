import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface ComposerRequest {
  id: string;
  scope: string;
  author: string;
  question: string;
  busy: boolean;
  locked: boolean;
  error: string;
  restoreText?: string;
  maxLength?: number;
  submit: (text: string) => Promise<boolean>;
  check?: () => Promise<unknown>;
}
interface Registry {
  scope: string | null;
  register: (request: ComposerRequest, owner: symbol) => () => void;
}
export const ComposerRequestContext = createContext<Registry | null>(null);

/** Only requests from the current conversation may take ownership of the composer. */
export function useComposerRequests(scope: string | null) {
  const [requests, setRequests] = useState<
    Map<string, { request: ComposerRequest; owner: symbol }>
  >(() => new Map());
  const register = useCallback((request: ComposerRequest, owner: symbol) => {
    setRequests((previous) => new Map(previous).set(request.id, { request, owner }));
    return () =>
      setRequests((previous) => {
        if (previous.get(request.id)?.owner !== owner) return previous;
        const next = new Map(previous);
        next.delete(request.id);
        return next;
      });
  }, []);
  const registry = useMemo(() => ({ scope, register }), [scope, register]);
  const active = [...requests.values()].find(({ request }) => request.scope === scope)?.request;
  return { registry, active };
}

/** Keep callback updates out of the registry while publishing changes to actionable state. */
export function useComposerRequest(request: ComposerRequest | null) {
  const registry = useContext(ComposerRequestContext);
  const latest = useRef(request);
  latest.current = request;
  const owner = useRef(Symbol("composer-request"));
  const { id, scope, author, question, busy, locked, error, restoreText, maxLength } =
    request ?? {};
  const canCheck = !!request?.check;
  const enabled = !!registry && registry.scope === scope;
  useEffect(() => {
    if (!registry || !enabled || !id || !scope || !author || question === undefined) return;
    return registry.register(
      {
        id,
        scope,
        author,
        question,
        busy: !!busy,
        locked: !!locked,
        error: error ?? "",
        restoreText,
        maxLength,
        submit: (text) => latest.current?.submit(text) ?? Promise.resolve(false),
        check: canCheck ? () => latest.current?.check?.() ?? Promise.resolve() : undefined,
      },
      owner.current,
    );
  }, [
    registry,
    enabled,
    id,
    scope,
    author,
    question,
    busy,
    locked,
    error,
    restoreText,
    maxLength,
    canCheck,
  ]);
  return enabled;
}

export function useComposerScope() {
  return useContext(ComposerRequestContext)?.scope ?? "";
}
