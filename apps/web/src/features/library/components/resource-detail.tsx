import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceState } from "@/components/workspace-state";
import { DeleteResource } from "@/features/files/components/delete-resource";
import { FilePreview } from "@/features/files/components/file-preview";
import { ResultCard } from "@/features/files/components/result-card";
import type { ResultFile } from "@/features/files/types";
import { GoalDetailPanel } from "@/features/goals/components/goal-detail";
import { ScheduleForm } from "@/features/schedules/components/schedule-form";
import { ScheduleCard } from "@/features/schedules/components/schedule-panel";
import type { Schedule } from "@/features/schedules/types";
import { TaskCard } from "@/features/tasks/components/task-card";
import type { BackgroundTask } from "@/features/tasks/types";
import { ApiError, api } from "@/lib/api";
import { libraryCommand, useResourceSelection } from "../hooks/use-library";
import { kindLabels, type ResourceItem, type ResourceRef } from "../types";
import { useResourceContext } from "./resource-context";

interface ResourceDetail extends ResourceItem {
  content: string;
  truncated: boolean;
  content_available: boolean;
  current_revision?: number;
  file?: ResultFile;
}
export function ResourceDetailPanel({ refValue }: { refValue: ResourceRef }) {
  const context = useResourceContext();
  const { getToken, userId } = useAuth();
  const selected = useResourceSelection(context.threadId);
  const query = useQuery({
    queryKey: ["resource-detail", userId, refValue],
    queryFn: async ({ signal }) =>
      libraryCommand<ResourceDetail>("read", await getToken(), refValue, signal),
    refetchInterval: 10000,
    retry: false,
  });
  const data = query.data;
  if (query.isPending) return <WorkspaceState kind="loading" title="Membuka resource…" />;
  if (query.isError || !data)
    return (
      <WorkspaceState
        kind="error"
        title={
          query.error instanceof ApiError && query.error.status === 409
            ? "Item sudah berubah"
            : "Item belum dapat dibuka"
        }
        description="Item mungkin telah dihapus atau koneksi terganggu. Cari kembali untuk memilih versi terbaru."
        onRetry={() => {
          if (query.error instanceof ApiError && query.error.status === 409)
            context.open({ ...refValue, revision: null, revision_id: null });
          else void query.refetch();
        }}
      />
    );
  return (
    <section className="space-y-5 text-sm">
      <p className="text-xs text-muted-foreground">
        {kindLabels[refValue.kind]}
        {data.ref.revision ? ` · v${data.ref.revision}` : ""}
      </p>
      <h2 className="text-xl wrap-anywhere">{data.title}</h2>
      <div className="flex flex-wrap gap-2">
        {context.threadId ? (
          <Button
            disabled={selected.select.isPending}
            onClick={() =>
              selected.select.mutate(data.ref, {
                onSuccess: () => {
                  context.open(null);
                  context.discuss();
                },
              })
            }
          >
            Bicarakan di chat
          </Button>
        ) : null}
        {data.thread_id ? (
          <Button asChild variant="outline">
            <Link to="/" search={{ thread: data.thread_id }} onClick={() => context.open(null)}>
              Buka percakapan asal
            </Link>
          </Button>
        ) : null}
      </div>
      {selected.select.isError ? (
        <p role="alert" className="text-danger">
          Pilihan belum tersimpan. Coba kembali.
        </p>
      ) : null}
      {data.current_revision && data.current_revision !== data.ref.revision ? (
        <p className="text-xs text-muted-foreground">
          Versi terbaru v{data.current_revision} tersedia.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => context.open({ ...data.ref, revision: null, revision_id: null })}
          >
            Buka versi terbaru
          </button>
        </p>
      ) : null}
      {refValue.kind === "file" && data.file ? (
        <>
          <FilePreview file={data.file} />
          <DeleteResource path={`/files/${refValue.id}`} name={data.title} />
        </>
      ) : null}
      {refValue.kind === "result" ? (
        <ResultCard
          resultId={refValue.id}
          initialRevision={data.ref.revision ?? undefined}
          onRevisionChange={(revision) => context.open({ ...data.ref, revision })}
        />
      ) : null}
      {refValue.kind === "goal" ? <GoalDetailPanel id={refValue.id} /> : null}
      {refValue.kind === "task" ? <TaskResource id={refValue.id} /> : null}
      {refValue.kind === "schedule" ? <ScheduleResource id={refValue.id} /> : null}
      {refValue.kind === "thread" ? (
        <>
          <p className="whitespace-pre-wrap wrap-anywhere">{data.content}</p>
          {data.truncated ? (
            <p className="text-muted-foreground">
              Cuplikan dibatasi. Buka percakapan asal untuk melanjutkan.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
function TaskResource({ id }: { id: string }) {
  const { getToken, userId } = useAuth();
  const data = useQuery({
    queryKey: ["task", userId, id],
    queryFn: async () => api<BackgroundTask>(`/tasks/${id}`, await getToken()),
    refetchInterval: 5000,
    retry: false,
  });
  return data.data && !data.isError ? (
    <TaskCard task={data.data} />
  ) : (
    <WorkspaceState
      kind={data.isError ? "error" : "loading"}
      title={data.isError ? "Pekerjaan belum dapat dibuka" : "Memuat pekerjaan…"}
      onRetry={() => void data.refetch()}
    />
  );
}
function ScheduleResource({ id }: { id: string }) {
  const { getToken, userId } = useAuth();
  const [editing, setEditing] = useState(false);
  const data = useQuery({
    queryKey: ["schedule", userId, id],
    queryFn: async () => api<Schedule>(`/schedules/${id}`, await getToken()),
    refetchInterval: 5000,
    retry: false,
  });
  return data.data && !data.isError ? (
    editing ? (
      <ScheduleForm
        threadId={data.data.thread_id}
        schedule={data.data}
        onClose={() => {
          setEditing(false);
          void data.refetch();
        }}
      />
    ) : (
      <ScheduleCard schedule={data.data} onEdit={() => setEditing(true)} />
    )
  ) : (
    <WorkspaceState
      kind={data.isError ? "error" : "loading"}
      title={data.isError ? "Jadwal belum dapat dibuka" : "Memuat jadwal…"}
      onRetry={() => void data.refetch()}
    />
  );
}
export function ResourcePanelHeader() {
  const context = useResourceContext();
  return (
    <div className="flex items-center justify-between gap-3 border-b p-4">
      <p className="font-semibold">Detail pilihan</p>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Tutup resource"
        onClick={() => context.open(null)}
      >
        <X />
      </Button>
    </div>
  );
}
