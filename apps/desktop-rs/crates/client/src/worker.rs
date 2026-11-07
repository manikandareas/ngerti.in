use crate::{ClientError, ReadOnlyClient, Snapshot};
use futures_channel::oneshot;
use std::sync::mpsc::{SyncSender, sync_channel};
use uuid::Uuid;

type Reply = oneshot::Sender<Result<Snapshot, ClientError>>;
struct Read {
    client: ReadOnlyClient,
    thread: Uuid,
    reply: Reply,
}

/// One active read and one queued read, with an explicitly sized stack.
/// Contract compilation is recursive and must not run on a small AppKit dispatch worker.
pub struct SnapshotWorker {
    requests: SyncSender<Read>,
}
impl SnapshotWorker {
    pub fn new() -> std::io::Result<Self> {
        let (requests, receiver) = sync_channel::<Read>(1);
        std::thread::Builder::new()
            .name("ngertiin-snapshot-reader".into())
            .stack_size(8 * 1024 * 1024)
            .spawn(move || {
                for read in receiver {
                    // Retired views cancel queued work before network dispatch. Active
                    // reads finish within transport bounds; their cancelled reply is discarded.
                    if read.reply.is_canceled() {
                        continue;
                    }
                    let result = read.client.snapshot(read.thread);
                    let _ = read.reply.send(result);
                }
            })?;
        Ok(Self { requests })
    }
    pub fn read(
        &self,
        client: ReadOnlyClient,
        thread: Uuid,
    ) -> Result<oneshot::Receiver<Result<Snapshot, ClientError>>, ClientError> {
        let (reply, result) = oneshot::channel();
        self.requests
            .try_send(Read {
                client,
                thread,
                reply,
            })
            .map_err(|_| ClientError::Busy)?;
        Ok(result)
    }
}
