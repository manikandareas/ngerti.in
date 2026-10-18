"""Read bounded metadata in a disposable process; never execute document content."""

import io
import json
import sys


def main():
    import resource

    from PIL import Image
    from pypdf import PdfReader

    resource.setrlimit(resource.RLIMIT_CPU, (4, 4))
    if sys.platform == "linux":
        resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
    data = sys.stdin.buffer.read(10 * 1024 * 1024 + 1)
    if len(data) > 10 * 1024 * 1024:
        raise ValueError("size")
    if sys.argv[1] == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise ValueError("signature")
        reader = PdfReader(io.BytesIO(data), strict=True)
        if reader.is_encrypted:
            raise ValueError("encrypted")
        pages = len(reader.pages)
        if not 1 <= pages <= 20:
            raise ValueError("pages")
    else:
        Image.MAX_IMAGE_PIXELS = 25000000
        with Image.open(io.BytesIO(data)) as image:
            expected = "PNG" if sys.argv[1] == ".png" else "JPEG"
            if image.format != expected or image.width * image.height > 25000000:
                raise ValueError("image")
            image.verify()
        pages = 1
    print(json.dumps({"pages": pages}))


if __name__ == "__main__":
    main()
