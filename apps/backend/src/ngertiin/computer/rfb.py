"""Parse the RFB byte stream so view-only is enforced outside the browser."""


class ClientMessages:
    """Only RFB 3.8 / None authentication; reject unknown extensions closed."""

    def __init__(self):
        self.buffer = bytearray()
        self.handshake = 0
        self.blocked_inputs = 0

    def feed(self, data: bytes, human: bool) -> bytes:
        self.buffer.extend(data)
        if len(self.buffer) > 65536:
            raise ValueError("RFB frame terlalu besar.")
        output = bytearray()
        while self.buffer:
            if self.handshake < 3:
                handshake_size = 12 if self.handshake == 0 else 1
                if len(self.buffer) < handshake_size:
                    break
                packet = bytes(self.buffer[:handshake_size])
                if self.handshake == 0 and packet != b"RFB 003.008\n":
                    raise ValueError("Versi RFB tidak didukung.")
                if self.handshake == 1 and packet != b"\x01":
                    raise ValueError("Security type RFB tidak didukung.")
                output.extend(packet)
                del self.buffer[:handshake_size]
                self.handshake += 1
                continue
            kind = self.buffer[0]
            size = {0: 20, 3: 10, 4: 8, 5: 6, 150: 10, 255: 12}.get(kind)
            if kind == 2:
                if len(self.buffer) < 4:
                    break
                count = int.from_bytes(self.buffer[2:4], "big")
                if count > 256:
                    raise ValueError("Terlalu banyak RFB encodings.")
                size = 4 + count * 4
            elif kind == 6:
                if len(self.buffer) < 8:
                    break
                size = 8 + int.from_bytes(self.buffer[4:8], "big")
                if size > 65536:
                    raise ValueError("Clipboard melampaui batas.")
            elif kind == 248:
                if len(self.buffer) < 9:
                    break
                size = 9 + self.buffer[8]
            if size is None:
                raise ValueError("Ekstensi RFB tidak diizinkan.")
            if len(self.buffer) < size:
                break
            if kind == 255 and self.buffer[1] != 0:
                raise ValueError("Subtipe QEMU tidak diizinkan.")
            packet = bytes(self.buffer[:size])
            del self.buffer[:size]
            if kind in {4, 5, 6, 255} and not human:
                self.blocked_inputs += 1
            else:
                output.extend(packet)
        return bytes(output)
