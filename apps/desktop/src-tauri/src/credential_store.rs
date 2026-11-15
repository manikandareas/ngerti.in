use anyhow::{Result, bail};

/// Only rotating renewal credentials enter this store. Access tokens stay in native memory.
pub trait CredentialStore: Send + Sync {
    fn read(&self) -> Result<Option<String>>;
    fn write(&self, value: &str) -> Result<()>;
    fn clear(&self) -> Result<()>;
}

pub struct OsStore {
    account: String,
}
impl OsStore {
    pub fn new(manager: &str, origin: &str) -> Self {
        Self {
            account: format!("{manager}@{origin}"),
        }
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Explicit native macOS Keychain probe; uses and removes a unique fixture entry."]
    fn native_keychain_is_private_persistent_and_origin_bound() {
        let manager = uuid::Uuid::new_v4().to_string();
        let first = OsStore::new(&manager, "https://nma081.fixture.invalid");
        let foreign = OsStore::new(&manager, "https://other.fixture.invalid");
        assert!(first.read().unwrap().is_none());
        first.write("ng_rt_nma081_disposable_fixture").unwrap();
        assert!(foreign.read().unwrap().is_none());
        assert!(
            OsStore::new(&manager, "https://nma081.fixture.invalid")
                .read()
                .unwrap()
                .is_some()
        );
        first.write("ng_rt_nma081_rotated_fixture").unwrap();
        assert_eq!(
            first.read().unwrap().as_deref(),
            Some("ng_rt_nma081_rotated_fixture")
        );
        first.clear().unwrap();
        assert!(first.read().unwrap().is_none());
    }
}

#[cfg(target_os = "macos")]
impl CredentialStore for OsStore {
    fn read(&self) -> Result<Option<String>> {
        match security_framework::passwords::generic_password(
            security_framework::passwords::PasswordOptions::new_generic_password(
                "app.ngertiin.tauri.remote",
                &self.account,
            ),
        ) {
            Ok(bytes) => Ok(Some(String::from_utf8(bytes)?)),
            Err(error) if error.code() == -25300 => Ok(None),
            Err(_) => bail!("Unlock the macOS credential store and try again."),
        }
    }
    fn write(&self, value: &str) -> Result<()> {
        security_framework::passwords::set_generic_password(
            "app.ngertiin.tauri.remote",
            &self.account,
            value.as_bytes(),
        )
        .map_err(|_| anyhow::anyhow!("The native credential could not be saved."))
    }
    fn clear(&self) -> Result<()> {
        match security_framework::passwords::delete_generic_password(
            "app.ngertiin.tauri.remote",
            &self.account,
        ) {
            Ok(()) => Ok(()),
            Err(error) if error.code() == -25300 => Ok(()),
            Err(_) => bail!("The native credential could not be removed."),
        }
    }
}

#[cfg(not(target_os = "macos"))]
impl CredentialStore for OsStore {
    fn read(&self) -> Result<Option<String>> {
        bail!("Remote secure storage is supported on macOS only.")
    }
    fn write(&self, _: &str) -> Result<()> {
        bail!("Remote secure storage is supported on macOS only.")
    }
    fn clear(&self) -> Result<()> {
        bail!("Remote secure storage is supported on macOS only.")
    }
}
