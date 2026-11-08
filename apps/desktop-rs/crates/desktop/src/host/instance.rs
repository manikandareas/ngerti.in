//! Per-profile single-instance focus without a renderer command bridge.
use anyhow::Context;
use fs2::FileExt;
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    io::{Read, Write},
    os::unix::{
        ffi::OsStrExt,
        fs::OpenOptionsExt,
        net::{UnixListener, UnixStream},
    },
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
pub(crate) struct Instance {
    _lock: File,
    pub focus: Arc<AtomicBool>,
    alive: Arc<AtomicBool>,
    socket: PathBuf,
}
impl Instance {
    pub fn acquire(home: &Path) -> anyhow::Result<Option<Self>> {
        let path = home.join("desktop.lock");
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW)
            .open(path)?;
        // macOS limits Unix socket paths to 104 bytes. Long profile names must
        // still work, so put the socket in a short owner-private directory.
        let runtime = PathBuf::from(format!("/tmp/ngertiin-rs-{}", unsafe { libc::geteuid() }));
        super::profile::prepare_home(&runtime)?;
        let digest = format!("{:x}", Sha256::digest(home.as_os_str().as_bytes()));
        let socket = runtime.join(format!("{}.sock", &digest[..32]));
        if lock.try_lock_exclusive().is_err() {
            let mut stream=UnixStream::connect(socket).context("The native workspace is already open but cannot be focused. Reopen it from the Dock.")?;
            stream.write_all(b"focus")?;
            return Ok(None);
        }
        let _ = std::fs::remove_file(&socket);
        let listener = UnixListener::bind(&socket)?;
        listener.set_nonblocking(true)?;
        let focus = Arc::new(AtomicBool::new(false));
        let requested = focus.clone();
        let alive = Arc::new(AtomicBool::new(true));
        let running = alive.clone();
        std::thread::spawn(move || {
            while running.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(1)));
                        let mut bytes = [0; 5];
                        if stream.read_exact(&mut bytes).is_ok() && &bytes == b"focus" {
                            requested.store(true, Ordering::Release);
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(std::time::Duration::from_millis(20))
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Some(Self {
            _lock: lock,
            focus,
            alive,
            socket,
        }))
    }
}
impl Drop for Instance {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::Release);
        let _ = std::fs::remove_file(&self.socket);
    }
}
