use crate::ClientError;
use serde_json::Value;

/// Buffer bytes until a whole SSE frame exists, so split UTF-8 and CRLF never
/// become replacement characters or an acknowledged partial domain event.
#[derive(Default)]
pub struct SseDecoder {
    pending: Vec<u8>,
}
impl SseDecoder {
    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<Value>, ClientError> {
        if self.pending.len() + bytes.len() > 16 * 1024 * 1024 {
            return Err(ClientError::TooLarge);
        }
        self.pending.extend_from_slice(bytes);
        let mut events = vec![];
        loop {
            let boundary = self
                .pending
                .windows(2)
                .position(|x| x == b"\n\n")
                .map(|i| (i, 2))
                .into_iter()
                .chain(
                    self.pending
                        .windows(4)
                        .position(|x| x == b"\r\n\r\n")
                        .map(|i| (i, 4)),
                )
                .min_by_key(|(i, _)| *i);
            let Some((end, width)) = boundary else {
                break;
            };
            let frame =
                std::str::from_utf8(&self.pending[..end]).map_err(|_| ClientError::Malformed)?;
            let mut kind = "";
            let mut id = None;
            let mut data = vec![];
            for line in frame.lines() {
                if let Some(v) = line.strip_prefix("event:") {
                    kind = v.trim();
                }
                if let Some(v) = line.strip_prefix("id:") {
                    id = v.trim().parse::<u64>().ok();
                }
                if let Some(v) = line.strip_prefix("data:") {
                    data.push(v.strip_prefix(' ').unwrap_or(v));
                }
            }
            if kind == "domain" {
                let event: Value =
                    serde_json::from_str(&data.join("\n")).map_err(|_| ClientError::Malformed)?;
                if id.is_none() || id != event["cursor"].as_u64() {
                    return Err(ClientError::ShapeMismatch);
                }
                events.push(event);
            }
            self.pending.drain(..end + width);
        }
        Ok(events)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_utf8_and_crlf_boundary_waits_for_a_complete_frame() {
        let input=": heartbeat\r\n\r\nretry: 1000\r\n\r\nid: 42\r\nevent: domain\r\ndata: {\"cursor\":42,\"text\":\"Hello 😀 日本語\"}\r\n\r\n".as_bytes();
        for split in 0..input.len() {
            let mut decoder = SseDecoder::default();
            let mut values = decoder.push(&input[..split]).unwrap();
            values.extend(decoder.push(&input[split..]).unwrap());
            assert_eq!(values.len(), 1);
            assert_eq!(values[0]["text"], "Hello 😀 日本語");
        }
        let mut decoder = SseDecoder::default();
        let mut values = vec![];
        for byte in input {
            values.extend(decoder.push(&[*byte]).unwrap());
        }
        assert_eq!(values.len(), 1);
        assert!(
            SseDecoder::default()
                .push(b"id: 1\nevent: domain\ndata: {\"cursor\":2}\n\n")
                .is_err()
        );
    }
}
